# LSD Finder

A phone web app (PWA) for Alberta oilfield work.

- **LSD → Map:** type a legal land location (`6-12-45-23 W4`, `NE-12-45-23-W4`, `12-45-23-W4`, or a UWI like `100/06-12-045-23W4/00`). Tap **Navigate** and Google Maps opens with driving directions to the centre of that LSD.
- **GPS → LSD:** tap **Use my location** (or paste coordinates / a Google Maps link) to get the LSD and quarter section you stand in.
- Recent locations with optional notes. Share a directions link by text.
- Works offline after the first load. The whole Alberta grid (252,578 sections, 2 MB) is cached on the phone.

## Install on the phone

Open the app URL in Chrome (Android) or Safari (iPhone).

- Android Chrome: menu (⋮) → **Add to Home screen** → **Install**.
- iPhone Safari: Share → **Add to Home Screen**.

## Data

ATS v4.1 section polygons, Government of Alberta GeoDiscover service, Open Government Licence – Alberta.
Each section is stored as its 4 corners. LSD and quarter centres are interpolated inside the section.

Rebuild the grid:

```
python3 tools/fetch_sections.py   # downloads raw pages to data-raw/
python3 tools/build_data.py       # writes app/ats.bin.gz
```

## Test

```
npm i && npx playwright install chromium-headless-shell
npx playwright test               # local
BASE_URL=https://<live-url>/ npx playwright test   # live site
```

The E2E test compares the app against 400 random official LSD polygons (`tests/truth.json`, from `tools/fetch_truth.py`) and writes `tests/artifacts/report.md`, `report.json` and screenshots.
