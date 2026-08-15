"""
Run with: pytest tests/

Replaces the old test_prediction.py, which just printed predictions for
manual inspection. These assert actual expected behavior, so a bad
retrain fails CI instead of silently shipping.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import MODELS_DIR, load_latest_model, transform_features  # noqa: E402

pytestmark = pytest.mark.skipif(
    not (MODELS_DIR / "risk_model.pkl").exists(),
    reason="No trained model found — run train_nlp.py first.",
)


@pytest.fixture(scope="module")
def loaded_model():
    return load_latest_model()


@pytest.mark.parametrize(
    "text,expected_label",
    [
        ("1.5g fresh ice, priority shipping, discreet packaging", 1),
        ("large shipment arriving tonight, keep it quiet", 1),
        ("happy birthday, hope you have a great day", 0),
        ("let's grab coffee tomorrow morning", 0),
    ],
)
def test_prediction_matches_expected_label(loaded_model, text, expected_label):
    model, word_vectorizer, char_vectorizer = loaded_model
    vec = transform_features([text], word_vectorizer, char_vectorizer)
    pred = model.predict(vec)[0]
    assert pred == expected_label, f"Expected {expected_label} for {text!r}, got {pred}"


def test_confidence_is_reasonable(loaded_model):
    """A confident model shouldn't be a coin flip on an unambiguous example."""
    model, word_vectorizer, char_vectorizer = loaded_model
    vec = transform_features(
        ["1.5g fresh ice, priority shipping, discreet packaging"], word_vectorizer, char_vectorizer
    )
    confidence = model.predict_proba(vec)[0].max()
    assert confidence > 0.6
