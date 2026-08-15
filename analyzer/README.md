# Analyzer backend (Flask)

This is the Python/Flask service behind the "Text risk analyzer" panel in the
Next.js app. It's a separate process from Next.js (different language
runtime), and the frontend talks to it over HTTP:

```
components/analyzer-panel.tsx
  -> POST /api/analyzer/{predict,explain,retrain}   (Next.js route handlers)
  -> lib/analyzer-proxy.ts                          (forwards using ANALYZER_API_URL)
  -> this Flask app on http://localhost:5000        (/predict, /explain, /retrain)
```

`ANALYZER_API_URL` is already set to `http://localhost:5000` in `.env.local`,
which matches Flask's default port, so no extra config is needed for local dev.

## Setup

```bash
npm run analyzer:setup   # creates analyzer/.venv and installs requirements.txt
```

## Running

In one terminal:

```bash
npm run analyzer:dev     # starts Flask on :5000
```

In another terminal:

```bash
npm run dev              # starts Next.js
```

Then open the app and use the analyzer panel — it calls the endpoints below.

## Endpoints

- `POST /predict {text}` -> `{input, prediction: {label, confidence, raw_prediction}}`
- `POST /explain {text}` -> `{input, explanation: {text, contributions}}` (SHAP top-5 features)
- `POST /retrain` -> runs `retrain_nlp.py` as a subprocess, hot-reloads the new
  model into memory, returns `{status, log_tail}` (or `stdout_tail`/`stderr_tail`
  on failure). Can take a couple of minutes — the proxy route allows up to 120s.

## What's included vs. left out

Included: `app.py`, `common.py`, `interactive_prediction.py`,
`explain_prediction.py`, `retrain_nlp.py`, `models/` (trained model +
vectorizers), and the derived CSVs `retrain_nlp.py` needs
(`training_data_full.csv`, `training_data.csv`, `chain_source.csv`,
`synthetic_from_agora.csv`, `eval_holdout.csv`,
`conversational_examples_expanded.csv`).

Left out: the raw `Agora.csv` source dataset (~32MB) and `train_nlp.py`'s
from-scratch pipeline dependency on it. That's only needed if you want to
rebuild `training_data_full.csv` from the original corpus rather than use the
already-trained model + already-derived CSVs included here. If you need that,
copy `Agora.csv` into `analyzer/data/` and run `python train_nlp.py` first.

The standalone `index.html` dashboard from the original project isn't wired
up here on purpose — the Next.js `AnalyzerPanel` component replaces it as the
UI. Flask's `/` route still references it via `render_template`, so if you
want it back for quick manual testing, copy `index.html` into this folder too.

## Tests

```bash
cd analyzer && ./.venv/bin/python -m pytest tests/
```
