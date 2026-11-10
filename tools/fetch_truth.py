"""Build tests/truth.json: random official ATS v4.1 LSD polygons (Government of Alberta,
layer 5) with their true area centroid. Used as ground truth by the E2E test."""
import json, os, random, urllib.parse, urllib.request

URL = "https://geospatial.alberta.ca/titan/rest/services/base/alberta_township_system/MapServer/5/query"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tests", os.environ.get("OUT", "truth.json"))

def q(**p):
    p["f"] = "json"
    with urllib.request.urlopen(URL + "?" + urllib.parse.urlencode(p), timeout=120) as r:
        return json.load(r)

def centroid(rings):
    A = cx = cy = 0.0
    for ring in rings:
        for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
            c = x0 * y1 - x1 * y0
            A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c
    return cy / (3 * A), cx / (3 * A)

random.seed(int(os.environ.get("SEED", "20261109")))
mx = q(where="1=1", outStatistics=json.dumps([{"statisticType": "max", "onStatisticField": "OBJECTID", "outStatisticFieldName": "m"}]))
top = mx["features"][0]["attributes"]["m"]
rows = []
while len(rows) < 400:
    ids = ",".join(str(random.randint(1, top)) for _ in range(150))
    d = q(objectIds=ids, where="RA=' '", outFields="M,RGE,TWP,SEC,LS", outSR=4326, geometryPrecision=7)
    for f in d["features"]:
        a = f["attributes"]
        lat, lng = centroid(f["geometry"]["rings"])
        rows.append({"lsd": a["LS"], "sec": a["SEC"], "twp": a["TWP"], "rge": a["RGE"], "mer": a["M"], "lat": lat, "lng": lng})
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(rows[:400], open(OUT, "w"), indent=0)
print("truth rows", len(rows[:400]), "max objectid", top)
