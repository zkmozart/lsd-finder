"""For irregular sections (data-raw/irregular.json), download the official LSD
polygons (layer 5) and save their area centroids to data-raw/irregular_lsd.json."""
import json, os, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
URL = "https://geospatial.alberta.ca/titan/rest/services/base/alberta_township_system/MapServer/5/query"
secs = json.load(open(os.path.join(HERE, "..", "data-raw", "irregular.json")))
def centroid(rings):
    A = cx = cy = 0.0
    for ring in rings:
        for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
            c = x0 * y1 - x1 * y0; A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c
    return [cy / (3 * A), cx / (3 * A)] if A else None
def post(where):
    data = urllib.parse.urlencode({"where": where, "outFields": "M,RGE,TWP,SEC,LS", "outSR": 4326,
                                   "geometryPrecision": 7, "resultRecordCount": 2000, "f": "json"}).encode()
    for i in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(URL, data=data), timeout=180) as r:
                d = json.load(r)
            if "error" in d: raise RuntimeError(d["error"])
            return d
        except Exception as e:
            err = e; time.sleep(2 ** i)
    raise err
def batch(chunk):
    w = "RA=' ' AND (" + " OR ".join(f"(M={m} AND RGE={r} AND TWP={t} AND SEC={s})" for m, r, t, s in chunk) + ")"
    d = post(w)
    if d.get("exceededTransferLimit"): raise RuntimeError("transfer limit hit")
    out = []
    for f in d["features"]:
        a = f["attributes"]; c = centroid(f["geometry"]["rings"])
        if c: out.append([a["M"], a["RGE"], a["TWP"], a["SEC"], a["LS"], c[0], c[1]])
    return out
if __name__ == "__main__":
    chunks = [secs[i:i + 50] for i in range(0, len(secs), 50)]
    with ThreadPoolExecutor(4) as ex:
        res = [x for part in ex.map(batch, chunks) for x in part]
    json.dump(res, open(os.path.join(HERE, "..", "data-raw", "irregular_lsd.json"), "w"))
    print("sections", len(secs), "lsd polygons", len(res))
