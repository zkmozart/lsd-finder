// E2E: drive the real app in a phone-sized browser and check it against the
// official Government of Alberta LSD polygons (tests/truth.json).
// Artifact: tests/artifacts/report.json, report.md and screenshots.
import { test, expect, devices } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// 400 random LSDs + 400 hold-out random LSDs + 1,316 LSDs next to meridians / the BC border
const truth = ['truth.json', 'truth_holdout.json', 'truth_edge.json']
  .flatMap((f) => JSON.parse(readFileSync(new URL(`./${f}`, import.meta.url))));
const ART = new URL('./artifacts/', import.meta.url);
mkdirSync(ART, { recursive: true });
const report = { when: new Date().toISOString(), base: process.env.BASE_URL || 'http://localhost:4173/' };

test.use({ ...devices['Pixel 7'], permissions: ['geolocation'] });

async function open(page, q = '') {
  await page.goto(report.base + q);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
}

test('LSD to GPS and GPS to LSD match official ATS v4.1 LSD polygons', async ({ page }) => {
  await open(page);
  const r = await page.evaluate((rows) => {
    const hav = (a, b, c, d) => { const R = 6371000, t = Math.PI / 180, x = Math.sin((c - a) * t / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin((d - b) * t / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
    const errs = [], revMiss = [];
    for (const t of rows) {
      const p = ATS.parse(`${t.lsd}-${t.sec}-${t.twp}-${t.rge} W${t.mer}`);
      const g = ATS.toLatLng(p);
      errs.push({ label: p.label, m: g.error ? 1e9 : hav(t.lat, t.lng, g.lat, g.lng) });
      const back = ATS.fromLatLng(t.lat, t.lng);
      if (back.label !== p.label) revMiss.push({ want: p.label, got: back.label || back.error });
    }
    return { errs, revMiss };
  }, truth);
  const m = r.errs.map((e) => e.m).sort((a, b) => a - b);
  const q = (f) => +m[Math.floor(f * (m.length - 1))].toFixed(1);
  report.forward = { samples: m.length, p50_m: q(0.5), p95_m: q(0.95), p99_m: q(0.99), max_m: q(1), worst: r.errs.sort((a, b) => b.m - a.m).slice(0, 5) };
  report.reverse = { samples: truth.length, misses: r.revMiss.length, examples: r.revMiss.slice(0, 10) };
  expect(report.forward.max_m).toBeLessThan(25);
  expect(r.revMiss.length).toBeLessThanOrEqual(2); // centroid sits deep inside the LSD; allow only grid-edge oddities
  // a section cut short by the 5th/6th meridian has only LSDs 13-16
  const cut = await page.evaluate(() => [ATS.toLatLng(ATS.parse('1-35-36-25 W5')).error, ATS.toLatLng(ATS.parse('14-35-36-25 W5')).lat]);
  expect(cut[0]).toContain('does not exist');
  expect(cut[1]).toBeGreaterThan(52);
});

test('parser accepts the common field formats', async ({ page }) => {
  await open(page);
  const inputs = ['6-12-45-23 W4', '06-12-045-23W4M', '6/12/45/23/4', '6 12 45 23 4', 'LSD 6 SEC 12 TWP 45 RGE 23 W4M',
    '100/06-12-045-23W4/00', '100061204523W400', '  06-12-045-23-W4  '];
  const labels = await page.evaluate((xs) => xs.map((x) => ATS.parse(x).label || ATS.parse(x).error), inputs);
  report.parser = Object.fromEntries(inputs.map((x, i) => [x, labels[i]]));
  for (const l of labels) expect(l).toBe('06-12-045-23 W4M');
  const other = await page.evaluate(() => [ATS.parse('NE-12-45-23-W4').label, ATS.parse('ne 12-45-23 w4').label, ATS.parse('12-45-23-W4').label, ATS.parse('17-12-45-23 W4').error, ATS.parse('6-12-45-23 W3').error]);
  report.parser_other = other;
  expect(other.slice(0, 3)).toEqual(['NE-12-045-23 W4M', 'NE-12-045-23 W4M', '12-045-23 W4M']);
  expect(other[3]).toContain('LSD must be 1 to 16');
  expect(other[4]).toContain('W4, W5 or W6');
});

test('phone UI: type an LSD, get a Google Maps directions link; GPS tab finds current LSD', async ({ page, context }) => {
  await open(page);
  await page.fill('#q', '6-12-45-23 W4');
  await expect(page.locator('#qLabel')).toHaveText('06-12-045-23 W4M');
  const href = await page.getAttribute('#qGo', 'href');
  const t = await page.evaluate(() => ATS.toLatLng(ATS.parse('6-12-45-23 W4')));
  expect(href).toBe(`https://www.google.com/maps/dir/?api=1&destination=${t.lat},${t.lng}&travelmode=driving`);
  report.ui = { lsd: '06-12-045-23 W4M', directions: href };
  await page.screenshot({ path: fileURLToPath(new URL('lsd-to-map.png', ART)) });

  const spot = truth[7];
  await context.setGeolocation({ latitude: spot.lat, longitude: spot.lng, accuracy: 5 });
  await page.click('#tabGps');
  await page.click('#gpsBtn');
  const want = await page.evaluate((s) => ATS.parse(`${s.lsd}-${s.sec}-${s.twp}-${s.rge} W${s.mer}`).label, spot);
  await expect(page.locator('#gLabel')).toHaveText(want);
  report.ui.gps = { at: [spot.lat, spot.lng], lsd: want };
  await page.screenshot({ path: fileURLToPath(new URL('gps-to-lsd.png', ART)) });

  // deep link ?q= opens straight to the result
  await open(page, '?q=NE-12-45-23-W4');
  await expect(page.locator('#qLabel')).toHaveText('NE-12-045-23 W4M');
});

test('works offline after first load (service worker)', async ({ page, context }) => {
  await open(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(async () => (await caches.keys()).length > 0 && !!(await caches.match('ats.bin.gz')), null, { timeout: 30000 });
  await context.setOffline(true);
  await open(page, '?q=10-36-42-3-W5');
  await expect(page.locator('#qLabel')).toHaveText('10-36-042-03 W5M');
  report.offline = 'ok';
  await context.setOffline(false);
});

test.afterAll(() => {
  writeFileSync(new URL('report.json', ART), JSON.stringify(report, null, 2));
  const f = report.forward || {}, rv = report.reverse || {};
  writeFileSync(new URL('report.md', ART), `# LSD Finder E2E report\n\nRun: ${report.when}\nTarget: ${report.base}\n\n` +
    `Ground truth: ${f.samples} official ATS v4.1 LSD polygons (Government of Alberta), area centroid: 800 random + 1,316 next to meridians and the BC border.\n\n` +
    `| Check | Result |\n|---|---|\n| LSD -> GPS error p50 | ${f.p50_m} m |\n| p95 | ${f.p95_m} m |\n| p99 | ${f.p99_m} m |\n| max | ${f.max_m} m |\n` +
    `| GPS -> LSD round trip | ${rv.samples - rv.misses}/${rv.samples} correct |\n| Offline reload | ${report.offline || 'not run'} |\n` +
    `| Directions link | ${report.ui?.directions || ''} |\n`);
});
