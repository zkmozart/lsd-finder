"""Hold-out truth for the hard cases: official LSD centroids for random sections in
the ranges next to a meridian or the BC border that the shape check did NOT flag,
plus random flagged ones. Writes tests/truth_edge.json."""
import glob, json, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_irregular_lsd import batch  # noqa: E402  (reuses the POST query)
HERE = os.path.dirname(os.path.abspath(__file__))
flag = set(map(tuple, json.load(open(os.path.join(HERE, "..", "data-raw", "irregular.json")))))
edge = []
for f in sorted(glob.glob(os.path.join(HERE, "..", "data-raw", "p*.json"))):
    for m, r, t, s, _ in json.load(open(f)):
        if (m in (4, 5) and r >= 24) or (m == 6 and r >= 9):
            edge.append((m, r, t, s))
random.seed(4242)
unf = [x for x in edge if x not in flag]
pick = random.sample(unf, 60) + random.sample(sorted(flag), 30)
rows = batch(pick[:45]) + batch(pick[45:])
out = [{"lsd": ls, "sec": s, "twp": t, "rge": r, "mer": m, "lat": la, "lng": lo, "flagged": (m, r, t, s) in flag} for m, r, t, s, ls, la, lo in rows]
json.dump(out, open(os.path.join(HERE, "..", "tests", "truth_edge.json"), "w"), indent=0)
print("edge sections", len(edge), "unflagged", len(unf), "truth rows", len(out))
