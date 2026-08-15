# Data sources

- `ncrb-seizures.csv`, `trafficking-routes.csv`, `state-coordinates.csv`, `route-point-coordinates.csv` —
  based on real NCRB (National Crime Records Bureau) state/drug-type seizure figures, used by the forecast module.
- `conversational_examples_large.csv`, `synthetic_from_agora.csv` — labeled text examples for training the
  text-risk analyzer. Synthetic/sourced for model training, not real case data.
- `india-case-records.csv` — **synthetic** case records used by the case-correlation (DBSCAN) module.
  Real, incident-level, geocoded narcotics case data is not publicly available for India (unlike some
  US cities' open-data portals) for legitimate privacy and operational-security reasons. This file
  generates plausible case reports around real Indian localities/coordinates known as documented
  NCB/NCRB narcotics hotspots (e.g. Dharavi, Paharganj, Amritsar border belt, Aizawl, Mundra port belt),
  with NDPS Act offense categories. It exists purely to demonstrate the clustering pipeline end-to-end —
  swap it out with real case data (via the correlation panel's CSV upload, or by reseeding this file)
  once you have an authorized source.
