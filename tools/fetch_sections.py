"""Download every ATS v4.1 section polygon (no road allowance) from the
Government of Alberta GeoDiscover service and save raw pages to data-raw/.
Licence: Open Government Licence - Alberta."""
import json, os, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

URL = "https://geospatial.alberta.ca/titan/rest/services/base/alberta_township_system/MapServer/1/query"
OUT = os.path.join(os.path.dirname(__file__), "..", "data-raw")
PAGE = 1000

def get(params, tries=6):
    q = urllib.parse.urlencode(params)
    for i in range(tries):
        try:
            with urllib.request.urlopen(URL + "?" + q, timeout=120) as r:
                d = json.load(r)
            if "error" in d:
                raise RuntimeError(d["error"])
            return d
        except Exception as e:
            time.sleep(2 ** i)
            err = e
    raise err

def page(i):
    path = os.path.join(OUT, f"p{i:04d}.json")
    if os.path.exists(path):
        return 0
    d = get({"where": "RA=' '", "outFields": "M,RGE,TWP,SEC", "outSR": 4326,
             "geometryPrecision": 6, "orderByFields": "OBJECTID",
             "resultOffset": i * PAGE, "resultRecordCount": PAGE, "f": "json"})
    feats = [[f["attributes"]["M"], f["attributes"]["RGE"], f["attributes"]["TWP"],
              f["attributes"]["SEC"], f["geometry"]["rings"]] for f in d["features"]]
    with open(path, "w") as fh:
        json.dump(feats, fh)
    return len(feats)

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    total = get({"where": "RA=' '", "returnCountOnly": "true", "f": "json"})["count"]
    pages = (total + PAGE - 1) // PAGE
    print("features", total, "pages", pages, flush=True)
    with ThreadPoolExecutor(6) as ex:
        n = sum(ex.map(page, range(pages)))
    print("fetched", n)
