"""Build app/ats.bin from the raw section pages.

Each ATS section is reduced to its 4 corners (SW, SE, NE, NW).
LSD / quarter centres are then interpolated inside that quadrilateral by the app.

Binary layout (little endian, columnar so gzip/brotli compress it well):
  magic  'ATS3' (4 bytes)
  count  uint32
  keys   int32[count]    key = ((M*100 + RGE)*1000 + TWP)*100 + SEC, sorted,
                         stored as difference from the previous key
  swLat  int32[count]    micro-degrees, difference from previous record
  swLng  int32[count]    micro-degrees, difference from previous record
  d      int16[count*6]  per record: seLat,seLng,neLat,neLng,nwLat,nwLng
                         as micro-degree offsets from SW, divided by 2
  then the exception table for irregular sections (next to meridians, the BC
  border, etc.) where LSDs are not an even 4x4 split. Official LSD centroids:
  xn     uint32
  xkey   int32[xn]  (section index*16 + LSD-1), sorted, difference from previous
  xlat   int32[xn]  micro-degrees, difference from previous
  xlng   int32[xn]  micro-degrees, difference from previous
"""
import glob, gzip, json, math, os, struct, sys
from array import array

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "..", "data-raw")
OUT = os.path.join(HERE, "..", "app", "ats.bin.gz")

pts = {}
for f in sorted(glob.glob(os.path.join(RAW, "p*.json"))):
    for m, rge, twp, sec, rings in json.load(open(f)):
        key = ((m * 100 + rge) * 1000 + twp) * 100 + sec
        lst = pts.setdefault(key, [])
        for ring in rings:
            lst.extend(ring)

keys = sorted(pts)
print("sections", len(keys))
K = array("I"); LA = array("i"); LO = array("i"); D = array("h")
worst = 0
for key in keys:
    p = pts[key]
    lat0 = sum(y for _, y in p) / len(p)
    c = math.cos(math.radians(lat0))
    # corner = extreme point along each diagonal direction (local metric)
    sw = min(p, key=lambda q: q[0] * c + q[1])
    ne = max(p, key=lambda q: q[0] * c + q[1])
    se = max(p, key=lambda q: q[0] * c - q[1])
    nw = min(p, key=lambda q: q[0] * c - q[1])
    b = (round(sw[1] * 1e6), round(sw[0] * 1e6))
    K.append(key); LA.append(b[0]); LO.append(b[1])
    for q in (se, ne, nw):
        for v, base in ((q[1], b[0]), (q[0], b[1])):
            dv = round((round(v * 1e6) - base) / 2)
            worst = max(worst, abs(dv))
            if abs(dv) > 32767:
                sys.exit(f"delta overflow at key {key}: {dv}")
            D.append(dv)
print("max |delta|/2 micro-deg", worst)
def delta(a):
    return array("i", [a[0]] + [a[i] - a[i - 1] for i in range(1, len(a))])
parts = [delta(K), delta(LA), delta(LO), D]
IRR = os.path.join(RAW, "irregular_lsd.json")
pos = {k: i for i, k in enumerate(keys)}
ex = sorted((pos[((m * 100 + r) * 1000 + t) * 100 + sc] * 16 + ls - 1, round(la * 1e6), round(lo * 1e6))
            for m, r, t, sc, ls, la, lo in (json.load(open(IRR)) if os.path.exists(IRR) else []))
print("irregular LSD centroids", len(ex))
blob = b"ATS3" + struct.pack("<I", len(keys))
parts += [array("I", [len(ex)]), delta(array("i", [x[0] for x in ex])) if ex else array("i"),
          delta(array("i", [x[1] for x in ex])) if ex else array("i"), delta(array("i", [x[2] for x in ex])) if ex else array("i")]
for a in parts:
    if sys.byteorder != "little":
        a.byteswap()
    blob += a.tobytes()
with open(OUT, "wb") as fh:
    fh.write(gzip.compress(blob, 9, mtime=0))
print("wrote", OUT, os.path.getsize(OUT), "bytes")
