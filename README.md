# Viento Parapente

Single-page wind forecast tool for paragliding, showing a 72h/3-day outlook per flying site.

## What it does

- Fetches hourly wind data (speed/direction at 10m, 80m, 120m, 180m, gusts, boundary layer height) from the [Open-Meteo](https://open-meteo.com/) forecast API, with optional weather model selection.
- Scores each hour as flyable/marginal/no-go based on wind speed, gust limits, and wind direction, with configurable thresholds.
- Lets you search sites via Open-Meteo's geocoding API, or pick from preloaded paragliding sites (Spain/Portugal, sourced from [ParaglidingEarth](https://www.paraglidingearth.com/)) plus custom external places.
- Includes a direction filter and a detail view breaking down why a given hour scored the way it did.

## Files

- `index.html` — markup; `styles.css` — styles; `app.js` — logic (no build step; open directly in a browser).
- `paraglidingEarth*.csv` / `.json` — site data for Spain and Portugal.
- `zonasVuelo.json`, `response.json` — additional site/flying-zone data and a sample API response.

## Running

The app loads `data/*.json` with `fetch`, so serve the folder over HTTP (e.g. `python3 -m http.server`) and open `http://localhost:8000`; `file://` won't work. It calls the Open-Meteo APIs directly (no backend, no API key required).

## Regions

`scripts/add_regions.py` adds `region`, `regionCode`, `province` and `provinceCode` to each site in `data/paraglidingEarth{Spain,Portugal}.json` via OpenStreetMap Nominatim reverse geocoding (≈1 req/s, cached in `scripts/.region-cache.json`). Spain gets comunidad autónoma + provincia; mainland Portugal gets its distrito; the Azores and Madeira are their own regions. Re-run with `--force` to recompute.
