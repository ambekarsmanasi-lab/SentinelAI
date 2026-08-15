"""
Run with: pytest tests/

Replaces the old test1.py, which trained on a 10-row fake dataset and
just printed a classification report for eyeballing. This keeps the
same tiny fake dataset but as an actual smoke test: it doesn't need any
trained model or data files on disk, so it can run in CI on a bare
checkout to sanity-check the feature/train/predict code path still works.
"""
import sys
from pathlib import Path

from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import build_vectorizers, fit_features, transform_features  # noqa: E402

TEXTS = [
    "large shipment arriving tonight, keep it quiet",
    "meet me at the usual spot, bring cash only",
    "product ready for pickup, discreet delivery",
    "party at my place this weekend, bring snacks",
    "can you help me with my homework tonight",
    "let's grab coffee tomorrow morning",
    "huge batch coming in, don't tell anyone",
    "happy birthday! hope you have a great day",
    "the weather is really nice today",
    "urgent, need the package moved before midnight",
]
LABELS = [1, 1, 1, 0, 0, 0, 1, 0, 0, 1]


def test_pipeline_smoke():
    X_train, X_test, y_train, y_test = train_test_split(
        TEXTS, LABELS, test_size=0.3, random_state=42
    )

    # min_df=1: this toy dataset is only 7 training rows after the split,
    # far below common.py's real-corpus default of min_df=10 — the
    # default would make TfidfVectorizer raise ValueError here.
    word_vectorizer, char_vectorizer = build_vectorizers(min_df=1)
    X_train_vec = fit_features(X_train, word_vectorizer, char_vectorizer)
    X_test_vec = transform_features(X_test, word_vectorizer, char_vectorizer)

    model = LogisticRegression()
    model.fit(X_train_vec, y_train)
    preds = model.predict(X_test_vec)

    assert len(preds) == len(y_test)
    assert set(preds).issubset({0, 1})
