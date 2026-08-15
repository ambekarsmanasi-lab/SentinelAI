"""
Importable prediction/explanation module used by app.py.

Added reload_model(): app.py's /retrain endpoint runs retrain_nlp.py as a
subprocess, which writes a new models/risk_model.pkl. Without a way to
refresh the model/vectorizers/explainer globals below, the Flask process
would keep serving predictions from the OLD in-memory model until it was
restarted. reload_model() re-runs the same load-and-build-explainer logic
that happens at import time, so /predict and /explain pick up the new
model right after a successful retrain.
"""
import shap
import numpy as np
import pandas as pd
from common import DATA_DIR, MODELS_DIR, load_latest_model, transform_features

model = word_vectorizer = char_vectorizer = explainer = feature_names = None


def reload_model():
    """(Re)loads the latest model/vectorizers and rebuilds the SHAP
    explainer + background sample. Called once at import time, and again
    by app.py after a successful /retrain."""
    global model, word_vectorizer, char_vectorizer, explainer, feature_names

    try:
        model, word_vectorizer, char_vectorizer = load_latest_model()
    except FileNotFoundError:
        raise SystemExit(
            f"No trained model found in {MODELS_DIR}/. Run train_nlp.py "
            "then retrain_nlp.py first."
        )

    df = pd.read_csv(DATA_DIR / "training_data_full.csv")
    background_sample = df["text"].sample(min(100, len(df)), random_state=42)
    background_vec = transform_features(background_sample, word_vectorizer, char_vectorizer)
    explainer = shap.LinearExplainer(model, background_vec)

    feature_names = np.concatenate([
        word_vectorizer.get_feature_names_out(),
        char_vectorizer.get_feature_names_out()
    ])


reload_model()


def predict_text(text: str) -> dict:
    """Computes prediction label and confidence score."""
    text_vec = transform_features([text], word_vectorizer, char_vectorizer)
    prediction = int(model.predict(text_vec)[0])
    confidence = float(model.predict_proba(text_vec)[0].max() * 100)

    return {
        "label": "RISKY" if prediction == 1 else "NORMAL",
        "confidence": f"{confidence:.1f}%",
        "raw_prediction": prediction
    }


def get_explanation(text: str) -> dict:
    """Computes SHAP feature contributions for the input text."""
    text_vec = transform_features([text], word_vectorizer, char_vectorizer)
    shap_values = explainer.shap_values(text_vec)
    text_array = text_vec.toarray()[0]

    # Handle SHAP output shapes: LinearExplainer on a binary
    # LogisticRegression normally returns a plain (n_samples, n_features)
    # array, but guard for the (n_samples, n_features, n_classes) shape
    # some SHAP versions return.
    shap_array = shap_values[0]
    if hasattr(shap_array, "shape") and len(shap_array.shape) > 1:
        shap_array = shap_array[:, 1]  # positive ("RISKY") class column

    present_indices = np.where(text_array > 0)[0]

    contributions = []
    if len(present_indices) > 0:
        raw_contribs = [(feature_names[i], float(shap_array[i])) for i in present_indices]
        raw_contribs.sort(key=lambda x: abs(x[1]), reverse=True)

        for feature, value in raw_contribs[:5]:
            contributions.append({
                "feature": feature,
                "score": round(value, 4),
                "impact": "RISKY" if value > 0 else "NORMAL"
            })

    return {
        "text": text,
        "contributions": contributions if contributions else "No recognized vocabulary features."
    }
