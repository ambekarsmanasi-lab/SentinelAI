# Sentinel AI

A network-intelligence workspace for analyzing narcotics trafficking patterns in India, built as a decision-support tool that combines real crime statistics with machine learning.
Sentinel AI brings together four modules in a single dashboard:
- **Network forecasts** — trend forecasting over real NCRB (National Crime Records Bureau) seizure data, broken down by state and drug type.
- **Text analyzer** — an NLP risk classifier (with SHAP-based explainability) that scores text for trafficking-related risk, plus a retraining pipeline you can trigger from the UI.
- **Case correlation** — a DBSCAN clustering module that groups case records by location and pattern to surface potential links between incidents.
- **Datasets** — a panel for ingesting, seeding, and browsing the underlying data that powers the other three modules.
> **Decision support only.** Model outputs are meant to support human analysts, not replace them — always validate against primary intelligence before acting on anything the app surfaces.
## How it's built
Sentinel AI is two separate services that talk to each other over HTTP:
```
Next.js app (frontend + API routes)
  → app/api/analyzer/{predict,explain,retrain}   (Next.js route handlers)
  → lib/analyzer-proxy.ts                         (forwards requests)
  → Flask analyzer service on localhost:5000      (/predict, /explain, /retrain)
```
- **Frontend/API**: Next.js 16, React 19, Tailwind, shadcn/ui components, Leaflet for mapping, Recharts for charts.
- **Analyzer backend**: a Python/Flask service (`analyzer/`) that owns the trained scikit-learn model, vectorizers, and SHAP explanations. It's kept as a separate process because it's a different language runtime from the rest of the app.
- **Database**: Postgres (developed against [Neon](https://neon.tech)) for storing uploaded training examples and case records — see `lib/schema.ts` for the tables.
## Getting started
You'll need **Node.js**, a package manager (npm or pnpm — both lockfiles are present), **Python 3**, and a **Postgres database** (a free Neon instance works well).
### 1. Clone and install frontend dependencies
```bash
git clone https://github.com/YOUR_USERNAME/SentinelAI.git
cd SentinelAI
npm install
```
### 2. Configure environment variables
Create a `.env.local` file in the project root:
```bash
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
ANALYZER_API_URL="http://localhost:5000"
```
`DATABASE_URL` should point at your Postgres instance. `ANALYZER_API_URL` should stay as `http://localhost:5000` unless you run the Flask service elsewhere.
### 3. Set up the analyzer backend
```bash
npm run analyzer:setup
```
This creates a Python virtual environment at `analyzer/.venv` and installs the backend's dependencies (pandas, scikit-learn, scipy, shap, flask, and a few others — see `analyzer/requirements.txt`).
### 4. Seed the database
The Datasets, Case correlation, and Text analyzer panels all read from Postgres tables that start out empty. Before using the app, seed them from the bundled CSVs in `data/`:
```bash
curl -X POST http://localhost:3000/api/datasets/seed
```
Run this once after `npm run dev` is up. There's currently no button for this in the UI, so it has to be triggered manually — re-run it any time you want to reset back to the bundled sample data.
### 5. Run both services
In one terminal, start the Flask analyzer:
```bash
npm run analyzer:dev
```
In another terminal, start the Next.js app:

```bash
npm run dev
```
Then open [http://localhost:3000](http://localhost:3000), and seed the database (step 4) if you haven't already. The Text analyzer panel won't return predictions until the Flask service is also running.
## Windows notes & troubleshooting
The `analyzer:setup` and `analyzer:dev` npm scripts use Mac/Linux-style paths (`.venv/bin/...`) and will fail on Windows with an error like `'.' is not recognized as an internal or external command`. Run these steps manually instead:
```powershell
cd analyzer
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python app.py
```
If `python` isn't recognized either, install Python from [python.org](https://python.org) (3.11 or 3.12) and check **"Add Python to PATH"** during setup. After the first-time setup, you only need to re-run `.venv\Scripts\python app.py` to start the analyzer again.
A few other things that trip people up:
- **Port 3000 already in use**: Next.js will automatically fall back to port 3001 (or the next free port) and print a warning like `Port 3000 is in use... using available port 3001 instead.` Check your terminal output for the actual port and use that in your browser and in any `curl`/API calls — it won't always be 3000.
- **`curl -X POST ...` fails in PowerShell** with `A parameter cannot be found that matches parameter name 'X'`: PowerShell aliases `curl` to its own `Invoke-WebRequest` cmdlet, which doesn't support `-X`. Use PowerShell's own syntax instead:
```powershell
  Invoke-WebRequest -Method POST -Uri http://localhost:3000/api/datasets/seed
```
  (adjust the port if yours isn't 3000 — see above). If this errors with a `500`, wrap it to see the actual error message returned by the server:
```powershell
  try {
    Invoke-WebRequest -Method POST -Uri http://localhost:3000/api/datasets/seed
  } catch {
    $_.ErrorDetails.Message
  }
```
- **`npm run analyzer:setup`/`analyzer:dev` scripts must be run from the project root**, not from inside `analyzer/` — they `cd analyzer` internally as part of the script.

## A note on the data

- `data/ncrb-seizures.csv`, `data/trafficking-routes.csv`, and related files are based on **real NCRB seizure figures**, used to power the forecast module.
- `data/india-case-records.csv` is **synthetic**. Real, incident-level geocoded narcotics case data isn't publicly available for India for legitimate privacy and operational-security reasons, so this file generates plausible case reports around real, documented NCB/NCRB hotspot localities, purely to demonstrate the correlation/clustering pipeline end-to-end. Swap it for real, authorized case data via the correlation panel's CSV upload once you have a legitimate source.
- The text-analyzer training data (`analyzer/data/`) is a mix of synthetic and sourced examples for training the risk classifier — not real case data.

See `data/README.md` and `analyzer/README.md` for further detail on each dataset and service.

## Extending to other regions

Sentinel AI ships with Indian data by default, but the pipeline itself isn't India-specific — every module has an upload path for bringing in your own data:

- **Forecast module**: upload seizure/trend data for another region via the forecast panel's CSV uploader (`forecast-uploader.tsx` → `/api/forecast/upload`), in the same shape as `data/ncrb-seizures.csv`.
- **Case correlation**: upload your own case records via the correlation panel's uploader (`correlation-uploader.tsx` → `/api/correlation/upload`), matching the schema in `lib/schema.ts` (`case_records` table).
- **Text analyzer**: add new labeled examples through the Datasets panel, then trigger `/api/analyzer/retrain` to retrain the risk classifier on the expanded dataset.
- **Datasets panel**: general ingest/seed endpoints (`/api/datasets/ingest`, `/api/datasets/seed`) for bulk-loading new data.

Swap in seizure, route, or case data for a different country in the same CSV/table shapes, and the forecasting, correlation, and analyzer modules work the same way — no code changes required for a new dataset alone.

## Data sources & credits

- **Forecasting (routes/corridors)**: seizure and trend figures are based on real data published by the **[National Crime Records Bureau (NCRB), Government of India](https://www.data.gov.in/ministrydepartment/national-crime-records-bureau-ncrb)**.
- **Agora dataset**: text-analyzer training draws on the **[Dark Net Marketplace Drug Data (Agora, 2014–2015)](https://www.kaggle.com/datasets/philipjames11/dark-net-marketplace-drug-data-agora-20142015/data)** dataset from Kaggle.
- **Multi-site drug listing dataset**: additional text-analyzer training data, including listings from about 8 different sites, comes from the **[Drug Listing Dataset](https://www.kaggle.com/datasets/mhwong2007/drug-listing-dataset)** on Kaggle.
- Case-correlation demo data (`data/india-case-records.csv`) is **synthetic**, generated around real, documented NCB/NCRB narcotics hotspot localities — it exists to demonstrate the clustering pipeline, not as real incident data. See `data/README.md` for the full breakdown of what's real vs. synthetic across every file.
- Text-analyzer training data overall is a mix of the sourced datasets above and synthetic conversational examples used purely for model training — see `analyzer/README.md`.

## License

See [LICENSE](./LICENSE).
