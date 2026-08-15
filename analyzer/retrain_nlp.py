import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report
import time

from common import DATA_DIR, build_vectorizers, fit_features, transform_features, save_model_version

start = time.time()

# THIS IS THE CANONICAL FINAL TRAINER. It's the only script that combines
# all three real data sources (Agora, training_data.csv, conversational)
# plus the Markov-synthetic augmentation. Previously trained_predictive.py
# and retrain_nlp.py were two separate scripts that each produced a
# different "final" model and silently overwrote the same models/
# risk_model.pkl depending on which you ran last — that ambiguity is
# gone now; trained_predictive.py has been retired (see its file).
main_path = DATA_DIR / "training_data_full.csv"        # train_nlp.py
extra_path = DATA_DIR / "training_data.csv"             # your separate 10k-row dataset
chain_source_path = DATA_DIR / "chain_source.csv"        # generate_synthetic.py
synthetic_path = DATA_DIR / "synthetic_from_agora.csv"    # generate_synthetic.py
main_holdout_path = DATA_DIR / "eval_holdout.csv"         # generate_synthetic.py
conv_path = DATA_DIR / "conversational_examples_expanded.csv"  # generate_hard_conversational.py

required = {
    main_path: "train_nlp.py",
    extra_path: "(place training_data.csv in data/ manually)",
    chain_source_path: "generate_synthetic.py",
    synthetic_path: "generate_synthetic.py",
    main_holdout_path: "generate_synthetic.py",
    conv_path: "generate_hard_conversational.py",
}
missing = [f"{p} (produced by {script})" for p, script in required.items() if not p.exists()]
if missing:
    raise FileNotFoundError("Missing required files:\n  " + "\n  ".join(missing))

extra_df = pd.read_csv(extra_path)
chain_source_df = pd.read_csv(chain_source_path)
synthetic_df = pd.read_csv(synthetic_path)
main_holdout_df = pd.read_csv(main_holdout_path)
conv_df = pd.read_csv(conv_path)

# LEAKAGE GUARD: extra_path (training_data.csv) is documented as "your
# separate 10k-row dataset" — i.e. NOT derived from Agora.csv. But
# nothing enforced that. If it ever turns out to overlap with
# main_holdout_df (e.g. someone accidentally saves the same file under
# both names), those "held out" rows would get trained on here, and the
# honest-holdout metrics below would silently stop being honest. Strip
# any such overlap before combining, and say so loudly if it happens.
extra_overlap = extra_df["text"].isin(set(main_holdout_df["text"]))
if extra_overlap.any():
    print(
        f"\nWARNING: {extra_overlap.sum()} of {len(extra_df)} rows in "
        f"{extra_path.name} also appear in {main_holdout_path.name} "
        "(the supposedly untouched holdout). Dropping them from "
        "training so the holdout metrics stay honest — but this means "
        f"{extra_path.name} is not the independent dataset it's "
        "supposed to be; check where it came from.\n"
    )
    extra_df = extra_df[~extra_overlap]

print(f"Real (Agora, chain-source slice): {len(chain_source_df)} rows")
print(f"Real (training_data.csv):         {len(extra_df)} rows")
print(f"Synthetic (Markov):               {len(synthetic_df)} rows")
print(f"Conversational (all):             {len(conv_df)} rows")
print(f"Main eval holdout (untouched):    {len(main_holdout_df)} rows")

# Conversational holdout — carved out before boosting, same reasoning as
# the main eval_holdout: never trained on, so it's an honest check on
# conversational-domain generalization specifically.
conv_train, conv_holdout = train_test_split(
    conv_df, test_size=0.2, random_state=42, stratify=conv_df["label"]
)
conv_holdout.to_csv(DATA_DIR / "conversational_holdout.csv", index=False)
print(f"  -> conv_train: {len(conv_train)}, conv_holdout (eval-only): {len(conv_holdout)}")

# Dedupe the real-listing sources against each other and against synthetic
# BEFORE boosting the conversational set. Boosting happens last and is
# concatenated without a further global dedupe pass — deduping after
# boosting collapses identical repeated rows back to one and silently
# cancels the boost (this bit trained_predictive.py in the original code).
real_and_synthetic = pd.concat(
    [chain_source_df, extra_df, synthetic_df], ignore_index=True
).drop_duplicates(subset="text")

conv_train = conv_train.drop_duplicates(subset="text")
conv_boosted = pd.concat([conv_train] * 15, ignore_index=True)
print(f"Conversational (train slice) boosted 15x: {len(conv_train)} -> {len(conv_boosted)}")

df = pd.concat([real_and_synthetic, conv_boosted], ignore_index=True)
print(f"\nFinal combined training set: {len(df)} rows")
print(f"  Risky: {(df['label'] == 1).sum()}")
print(f"  Normal: {(df['label'] == 0).sum()}")

df.to_csv(DATA_DIR / "training_data_combined.csv", index=False)

# Reference-only random split of the full combined set (mostly listing text)
X_train, X_test, y_train, y_test = train_test_split(
    df["text"], df["label"], test_size=0.2, random_state=42
)

word_vectorizer, char_vectorizer = build_vectorizers()
X_train_vec = fit_features(X_train, word_vectorizer, char_vectorizer)
X_test_vec = transform_features(X_test, word_vectorizer, char_vectorizer)

model = LogisticRegression(max_iter=1000, class_weight="balanced")
model.fit(X_train_vec, y_train)

preds = model.predict(X_test_vec)
report_split = classification_report(y_test, preds, output_dict=True)
print("\n=== Metrics on random split of combined data (reference only, mostly listing text) ===")
print(classification_report(y_test, preds))

# Honest check #1: real listings the model never trained on at all.
main_holdout_vec = transform_features(main_holdout_df["text"], word_vectorizer, char_vectorizer)
main_holdout_preds = model.predict(main_holdout_vec)
report_main_holdout = classification_report(
    main_holdout_df["label"], main_holdout_preds, output_dict=True
)
print("\n=== Metrics on real-listing holdout (never in chain or training) ===")
print(classification_report(main_holdout_df["label"], main_holdout_preds))

# Honest check #2: conversational text the model never trained on at all.
conv_holdout_vec = transform_features(conv_holdout["text"], word_vectorizer, char_vectorizer)
conv_holdout_preds = model.predict(conv_holdout_vec)
report_conv_holdout = classification_report(conv_holdout["label"], conv_holdout_preds, output_dict=True)
print("\n=== Metrics on conversational holdout (never in training) ===")
print(classification_report(conv_holdout["label"], conv_holdout_preds))

save_model_version(
    model,
    word_vectorizer,
    char_vectorizer,
    metrics={
        "split_f1_macro": report_split["macro avg"]["f1-score"],
        "main_holdout_f1_macro": report_main_holdout["macro avg"]["f1-score"],
        "main_holdout_accuracy": report_main_holdout["accuracy"],
        "conv_holdout_f1_macro": report_conv_holdout["macro avg"]["f1-score"],
        "conv_holdout_accuracy": report_conv_holdout["accuracy"],
    },
    tag="retrain_nlp_final",
    notes=(
        f"Combined chain_source+{extra_path.name}+synthetic+boosted conversational, "
        f"{len(df)} rows. This is the canonical final model."
    ),
)

elapsed = time.time() - start
print(f"\nDone in {elapsed:.1f} seconds.")
