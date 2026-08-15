"""
Flask backend for the Sentinel AI dashboard (index.html).

Fixes vs. the previous version:
  - There were TWO `handle_predict` functions both routed to POST /predict.
    Flask raises `AssertionError: View function mapping is overwriting an
    existing endpoint function` for that at import time — the app couldn't
    even start.
  - Imported `predict_text` / `get_explanation` from explain_prediction.py,
    but that file is a one-shot script (it only prints a single hardcoded
    example) — it doesn't define those functions at all, so the import
    itself would raise ImportError. interactive_prediction.py is the
    module that actually defines predict_text()/get_explanation() as
    reusable functions with the model loaded once at import time, so we
    use that instead.
  - Imported `retrain` from retrain_nlp.py, but retrain_nlp.py has no such
    function — it's a top-level script. `import retrain_nlp` would run
    the ENTIRE retrain pipeline immediately (and crash without Agora.csv
    etc.) the moment app.py is imported, before any request is served.
    /retrain now shells out to `python retrain_nlp.py` as a subprocess on
    demand, then asks interactive_prediction to reload the newly-saved
    model into memory.
  - index.html calls POST /retrain, which never existed in the old
    app.py — added it here.
"""
import subprocess
import sys
from pathlib import Path

from flask import Flask, request, jsonify, render_template
from flask_cors import CORS

import interactive_prediction as ip

PROJECT_ROOT = Path(__file__).resolve().parent

app = Flask(__name__, template_folder='.')
CORS(app)


@app.route('/')
def home():
    return render_template('index.html')


@app.route('/predict', methods=['POST'])
def handle_predict():
    data = request.get_json(silent=True)
    if not data or 'text' not in data:
        return jsonify({"error": "Missing 'text' in request body"}), 400

    result = ip.predict_text(data['text'])
    return jsonify({"input": data['text'], "prediction": result}), 200


@app.route('/explain', methods=['POST'])
def handle_explain():
    data = request.get_json(silent=True)
    if not data or 'text' not in data:
        return jsonify({"error": "Missing 'text' in request body"}), 400

    explanation = ip.get_explanation(data['text'])
    return jsonify({"input": data['text'], "explanation": explanation}), 200


@app.route('/retrain', methods=['POST'])
def handle_retrain():
    """Runs retrain_nlp.py as a subprocess (it's a script, not an
    importable function) and hot-reloads the model this process holds
    in memory afterward, so the very next /predict uses the new model
    without restarting the Flask process."""
    result = subprocess.run(
        [sys.executable, "retrain_nlp.py"],
        capture_output=True,
        text=True,
        cwd=str(PROJECT_ROOT),
    )

    if result.returncode != 0:
        return jsonify({
            "status": "failed",
            "stdout_tail": result.stdout[-3000:],
            "stderr_tail": result.stderr[-3000:],
        }), 500

    ip.reload_model()
    return jsonify({"status": "ok", "log_tail": result.stdout[-2000:]}), 200


if __name__ == '__main__':
    app.run(debug=True)
