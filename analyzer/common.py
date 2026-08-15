"""
Shared utilities for the Sentinel AI risk-scoring pipeline.

Fixes three cross-cutting problems that existed when each script rolled
its own logic:
  1. Feature building was inconsistent (some scripts used word n-grams
     only). We now combine word-level + character-level TF-IDF, which
     makes the model much harder to dodge with simple obfuscation
     (e.g. "d.r.u.g.s", "1ce" for "ice").
  2. Every training script overwrote models/risk_model.pkl in place with
     no history. We now save a timestamped version alongside the
     "latest" copy, and log metadata to models/registry.jsonl so you can
     see what data/script produced which model.
  3. Different scripts pointed at different (sometimes nonexistent)
     data filenames. All scripts should now import DATA_DIR / MODELS_DIR
     from here instead of hardcoding relative paths.
"""
import json
import time
from pathlib import Path

import joblib
from scipy.sparse import hstack
from sklearn.feature_extraction.text import TfidfVectorizer

DATA_DIR = Path("data")
MODELS_DIR = Path("models")
MODELS_DIR.mkdir(exist_ok=True)
DATA_DIR.mkdir(exist_ok=True)

REGISTRY_PATH = MODELS_DIR / "registry.jsonl"


def build_vectorizers(min_df=10):
    """min_df=10 is right for the real Agora-scale corpus (tens of
    thousands of rows) that train_nlp.py/retrain_nlp.py fit on — it
    filters rare subword noise. But it's a HARD FLOOR: TfidfVectorizer
    raises ValueError if min_df exceeds the number of documents you fit
    on. test_smoke.py intentionally fits on a 10-row toy dataset with no
    real data files, so it must pass a smaller min_df explicitly."""
    word_vectorizer = TfidfVectorizer(
        max_features=3000, 
        ngram_range=(1, 2), 
        stop_words="english"
    )
    char_vectorizer = TfidfVectorizer(
        max_features=2000, 
        ngram_range=(3, 5), 
        analyzer="char_wb", 
        min_df=min_df
    )
    return word_vectorizer, char_vectorizer


def fit_features(texts, word_vectorizer, char_vectorizer):
    word_vec = word_vectorizer.fit_transform(texts)
    char_vec = char_vectorizer.fit_transform(texts)
    return hstack([word_vec, char_vec]).tocsr()


def transform_features(texts, word_vectorizer, char_vectorizer):
    word_vec = word_vectorizer.transform(texts)
    char_vec = char_vectorizer.transform(texts)
    return hstack([word_vec, char_vec]).tocsr()


def save_model_version(model, word_vectorizer, char_vectorizer, metrics, tag, notes=""):
    """Save a timestamped model version + overwrite the 'latest' pointer
    files that inference scripts read, and log a registry entry."""
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    version_dir = MODELS_DIR / f"{tag}_{timestamp}"
    version_dir.mkdir(exist_ok=True)

    joblib.dump(model, version_dir / "risk_model.pkl")
    joblib.dump(word_vectorizer, version_dir / "word_vectorizer.pkl")
    joblib.dump(char_vectorizer, version_dir / "char_vectorizer.pkl")

    # "latest" copies — this is what interactive_prediction.py,
    # explain_prediction.py and test_prediction.py load by default.
    joblib.dump(model, MODELS_DIR / "risk_model.pkl")
    joblib.dump(word_vectorizer, MODELS_DIR / "word_vectorizer.pkl")
    joblib.dump(char_vectorizer, MODELS_DIR / "char_vectorizer.pkl")

    entry = {
        "timestamp": timestamp,
        "tag": tag,
        "version_dir": str(version_dir),
        "metrics": metrics,
        "notes": notes,
    }
    with open(REGISTRY_PATH, "a") as f:
        f.write(json.dumps(entry) + "\n")

    print(f"Saved model version: {version_dir}")
    print(f"Updated 'latest' pointer: {MODELS_DIR / 'risk_model.pkl'}")
    return version_dir


def load_latest_model():
    model = joblib.load(MODELS_DIR / "risk_model.pkl")
    word_vectorizer = joblib.load(MODELS_DIR / "word_vectorizer.pkl")
    char_vectorizer = joblib.load(MODELS_DIR / "char_vectorizer.pkl")
    return model, word_vectorizer, char_vectorizer


def print_registry():
    if not REGISTRY_PATH.exists():
        print("No models trained yet.")
        return
    with open(REGISTRY_PATH) as f:
        for line in f:
            entry = json.loads(line)
            print(f"[{entry['timestamp']}] {entry['tag']} -> {entry['version_dir']}")
            print(f"    metrics: {entry['metrics']}")
