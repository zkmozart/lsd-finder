# LSD Finder E2E report

Run: 2026-11-10T00:50:28.724Z
Target: http://localhost:4173/

Ground truth: 2116 official ATS v4.1 LSD polygons (Government of Alberta), area centroid: 800 random + 1,316 next to meridians and the BC border.

| Check | Result |
|---|---|
| LSD -> GPS error p50 | 0.3 m |
| p95 | 7.2 m |
| p99 | 8.8 m |
| max | 14.2 m |
| GPS -> LSD round trip | 2116/2116 correct |
| Offline reload | ok |
| Directions link | https://www.google.com/maps/dir/?api=1&destination=52.863365,-113.211871&travelmode=driving |
