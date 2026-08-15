import pandas as pd
import random
import re
from collections import defaultdict
from sklearn.model_selection import train_test_split

from common import DATA_DIR

df = pd.read_csv(DATA_DIR / "training_data_full.csv")

# LEAKAGE FIX: the Markov chain below is built from real risky listings.
# If we train on chain_source AND evaluate on a random split of the same
# pool, the "synthetic" examples share exact phrases with rows the
# model already saw for evaluation, e.g. "discreet packaging" or
# "priority shipping" — so reported accuracy overstates real-world
# generalization. Instead, we carve off a holdout slice BEFORE building
# the chain. This holdout never feeds the chain and never gets trained
# on; retrain_nlp.py evaluates on it separately as an honest check.
chain_source_df, holdout_df = train_test_split(
    df, test_size=0.2, random_state=42, stratify=df["label"]
)
holdout_path = DATA_DIR / "eval_holdout.csv"
holdout_df.to_csv(holdout_path, index=False)
print(f"Held out {len(holdout_df)} rows (never used for chain-building or training) -> {holdout_path}")

risky_texts = chain_source_df[chain_source_df["label"] == 1]["text"].tolist()
print(f"Building Markov chain from {len(risky_texts)} real risky listings (holdout excluded)...")


def clean_text(text):
    text = str(text).lower()
    text = re.sub(r"[^a-z0-9\s.,!?$%-]", " ", text)  # strip weird symbols/encoding artifacts
    text = re.sub(r"\s+", " ", text)  # collapse multiple spaces into one
    return text.strip()


def build_markov_chain(texts, order=2):
    chain = defaultdict(list)
    for text in texts:
        text = clean_text(text)
        words = text.split(" ")  # split on actual spaces, keep them as separators
        words = [w for w in words if w]  # drop only truly empty strings
        for i in range(len(words) - order):
            key = tuple(words[i:i + order])
            next_word = words[i + order]
            chain[key].append(next_word)
    return chain


chain = build_markov_chain(risky_texts, order=2)
print(f"Chain built with {len(chain)} unique word-pair keys")


def generate_sentence(chain, max_words=15):
    start_key = random.choice(list(chain.keys()))
    result = list(start_key)
    for _ in range(max_words):
        key = tuple(result[-2:])
        if key not in chain:
            break
        next_word = random.choice(chain[key])
        result.append(next_word)
    return " ".join(result).strip()  # join with actual spaces now


synthetic_rows = []
attempts = 0
while len(synthetic_rows) < 150 and attempts < 500:
    sentence = generate_sentence(chain)
    word_count = len(sentence.split())
    if word_count >= 5:  # skip too-short/broken generations
        synthetic_rows.append((sentence, 1))
    attempts += 1

synthetic_df = pd.DataFrame(synthetic_rows, columns=["text", "label"])
synthetic_path = DATA_DIR / "synthetic_from_agora.csv"
synthetic_df.to_csv(synthetic_path, index=False)

# Also persist which real rows fed the chain, so retrain_nlp.py trains
# only on chain_source_df + synthetic, never on holdout_df.
chain_source_df.to_csv(DATA_DIR / "chain_source.csv", index=False)

print(f"\nGenerated {len(synthetic_rows)} synthetic examples -> {synthetic_path}")
print("\nSample outputs:")
for t in synthetic_df["text"].head(10):
    print(" -", t)
