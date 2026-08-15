import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report
import time

from common import DATA_DIR, build_vectorizers, fit_features, transform_features, save_model_version

start = time.time()

df = pd.read_csv(DATA_DIR / "Agora.csv", encoding="latin1")
df.columns = [c.strip() for c in df.columns]

df["text"] = (df["Item"].fillna("") + ". " + df["Item Description"].fillna("")).str.strip()
df = df[df["text"].str.len() > 15]
df["label"] = df["Category"].str.contains("Drugs", na=False).astype(int)

print(f"Loaded {len(df)} total rows")
print(f"  Drug-related: {(df['label'] == 1).sum()}")
print(f"  Non-drug: {(df['label'] == 0).sum()}")

# NOTE on label quality: this labels a row risky only if its Category
# string contains "Drugs". That's a coarse proxy — it'll miss
# drug-related listings filed under other categories, and won't catch
# other categories of risk this dataset contains (weapons, stolen data,
# fraud services...). Worth spot-checking a sample before trusting this
# label wholesale, and revisiting if "risky" should mean more than drugs.

# Save the PROCESSED file (this is what other scripts read — keep this
# filename consistent everywhere: data/training_data_full.csv)
processed_path = DATA_DIR / "training_data_full.csv"
df[["text", "label"]].to_csv(processed_path, index=False)
print(f"Saved processed data to {processed_path}")

X_train, X_test, y_train, y_test = train_test_split(
    df["text"], df["label"], test_size=0.2, random_state=42
)

# Word + char TF-IDF (char n-grams add resilience to obfuscated spelling)
word_vectorizer, char_vectorizer = build_vectorizers()
X_train_vec = fit_features(X_train, word_vectorizer, char_vectorizer)
X_test_vec = transform_features(X_test, word_vectorizer, char_vectorizer)

model = LogisticRegression(max_iter=1000, class_weight="balanced")
model.fit(X_train_vec, y_train)

preds = model.predict(X_test_vec)
report = classification_report(y_test, preds, output_dict=True)
print()
print(classification_report(y_test, preds))

# Save (versioned + updates the 'latest' models/risk_model.pkl pointer)
save_model_version(
    model,
    word_vectorizer,
    char_vectorizer,
    metrics={"f1_macro": report["macro avg"]["f1-score"], "accuracy": report["accuracy"]},
    tag="train_nlp",
    notes=f"Trained from raw {processed_path.name}, {len(df)} rows",
)

elapsed = time.time() - start
print(f"\nDone in {elapsed:.1f} seconds.")
