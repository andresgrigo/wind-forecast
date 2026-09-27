# Viento Parapente

Single-page wind forecast tool for paragliding, showing a 72h/3-day outlook per flying site.

## What it does

- Fetches hourly wind data (speed/direction at 10m, 80m, 120m, 180m, gusts, boundary layer height) from the [Open-Meteo](https://open-meteo.com/) forecast API, with optional weather model selection.
- Scores each hour as flyable/marginal/no-go based on wind speed, gust limits, and wind direction, with configurable thresholds.
- Lets you search sites via Open-Meteo's geocoding API, or pick from preloaded paragliding sites (Spain/Portugal, sourced from [ParaglidingEarth](https://www.paraglidingearth.com/)) plus custom external places.
- Includes a direction filter and a detail view breaking down why a given hour scored the way it did.

## Files

- `index.html` — the entire app (HTML/CSS/JS, no build step; open directly in a browser).
- `paraglidingEarth*.csv` / `.json` — site data for Spain and Portugal.
- `zonasVuelo.json`, `response.json` — additional site/flying-zone data and a sample API response.

## Running

Just open `index.html` in a browser. It calls the Open-Meteo APIs directly (no backend, no API key required).
