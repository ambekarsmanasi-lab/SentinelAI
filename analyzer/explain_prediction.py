import shap
import numpy as np
import pandas as pd

from common import DATA_DIR, load_latest_model, transform_features

# ORIGINAL BUG: this loaded 'Agora.csv' and then did df['text'] — but
# Agora.csv has no 'text' column (it has Item / Item Description /
# etc.), so this crashed with a KeyError. Fixed to load the processed
# dataset, which is what the model was actually trained on.
model, word_vectorizer, char_vectorizer = load_latest_model()

df = pd.read_csv(DATA_DIR / "training_data_full.csv")
background_sample = df["text"].sample(100, random_state=42)
background_vec = transform_features(background_sample, word_vectorizer, char_vectorizer)

test_text = "1.5g fresh ice, priority shipping, discreet packaging"
text_vec = transform_features([test_text], word_vectorizer, char_vectorizer)

explainer = shap.LinearExplainer(model, background_vec)
shap_values = explainer.shap_values(text_vec)

# Feature names now span word features + char features, in that order
feature_names = np.concatenate(
    [word_vectorizer.get_feature_names_out(), char_vectorizer.get_feature_names_out()]
)
text_array = text_vec.toarray()[0]
shap_array = shap_values[0]

present_indices = np.where(text_array > 0)[0]
contributions = [(feature_names[i], shap_array[i]) for i in present_indices]
contributions.sort(key=lambda x: abs(x[1]), reverse=True)

prediction = model.predict(text_vec)[0]
confidence = model.predict_proba(text_vec)[0].max() * 100

print(f"Text: {test_text}")
print(f"Prediction: {'RISKY' if prediction == 1 else 'NORMAL'} ({confidence:.1f}% confidence)")
print()
print("Top features driving this prediction (word or char n-gram):")
for feature, value in contributions[:8]:
    direction = "-> pushes RISKY" if value > 0 else "-> pushes NORMAL"
    print(f"  '{feature}': {value:.4f} {direction}")
