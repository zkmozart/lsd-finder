"""List sections whose shape is not a regular ~1 mile square; their LSDs are
not an even 4x4 split, so the app stores their official LSD centres instead."""
import glob, json, math, os, statistics
HERE = os.path.dirname(os.path.abspath(__file__))
def corners(p):
    lat0 = sum(y for _, y in p) / len(p); c = math.cos(math.radians(lat0))
    sw = min(p, key=lambda q: q[0]*c + q[1]); ne = max(p, key=lambda q: q[0]*c + q[1])
    se = max(p, key=lambda q: q[0]*c - q[1]); nw = min(p, key=lambda q: q[0]*c - q[1])
    return sw, se, ne, nw, c
def dist(a, b, c):
    return math.hypot((a[0]-b[0])*c*111320, (a[1]-b[1])*110950)
def area(ring, c):
    s = 0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:]): s += x0*y1 - x1*y0
    return abs(s)/2 * c*111320*110950
rows = []
for f in sorted(glob.glob(os.path.join(HERE, '..', 'data-raw', 'p*.json'))):
    for m, r, t, s, rings in json.load(open(f)):
        p = [q for ring in rings for q in ring]
        sw, se, ne, nw, c = corners(p)
        S, N, W, E = dist(sw, se, c), dist(nw, ne, c), dist(sw, nw, c), dist(se, ne, c)
        quad = 0.5*abs((se[0]-nw[0])*(ne[1]-sw[1]) - (ne[0]-sw[0])*(se[1]-nw[1])) * c*111320*110950
        A = sum(area(ring, c) for ring in rings)
        rows.append(((m, r, t, s), S, N, W, E, A / quad if quad else 0, len(rings)))
med = statistics.median(x[1] for x in rows)
flag = [x for x in rows if any(abs(v/med - 1) > 0.03 for v in x[1:5]) or abs(x[5]-1) > 0.01 or x[6] > 1]
print('median side', round(med), 'sections', len(rows), 'flagged', len(flag))
json.dump([list(x[0]) for x in flag], open(os.path.join(HERE, '..', 'data-raw', 'irregular.json'), 'w'))
import collections; print(collections.Counter((x[0][0], x[0][1]) for x in flag).most_common(12))
