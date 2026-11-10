(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const HKEY = 'lsdfinder.recent.v1';
  let current = null; // last forward result

  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 1600); }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); } catch (e) {
      const a = document.createElement('textarea'); a.value = text; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove();
    }
    toast('Copied');
  }
  async function share(title, text, url) {
    if (navigator.share) { try { await navigator.share({ title, text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    copy(url ? `${text}\n${url}` : text);
  }

  // ---------- recent ----------
  function getRecent() { try { return JSON.parse(localStorage.getItem(HKEY)) || []; } catch (e) { return []; } }
  function saveRecent(list) { localStorage.setItem(HKEY, JSON.stringify(list.slice(0, 30))); renderRecent(); }
  function remember(r, note) {
    const list = getRecent().filter((x) => x.label !== r.label);
    list.unshift({ label: r.label, lat: r.lat, lng: r.lng, note: note || '', t: Date.now() });
    saveRecent(list);
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function renderRecent() {
    const list = getRecent(), el = $('recent');
    if (!list.length) { el.classList.add('hide'); return; }
    el.classList.remove('hide');
    // safe: every stored string passes through esc(); lat/lng are numbers
    el.innerHTML = '<h2>Recent <button id="clr">Clear</button></h2>' + list.map((x, i) =>
      `<div class="item"><div class="t" data-i="${i}"><b>${esc(x.label)}</b><small>${esc(x.note || `${x.lat}, ${x.lng}`)}</small></div>` +
      `<a class="btn" href="${ATS.mapsLinks(x.lat, x.lng).directions}" target="_blank" rel="noopener">Go</a></div>`).join('');
    $('clr').onclick = () => { if (confirm('Clear recent locations?')) saveRecent([]); };
    el.querySelectorAll('.t').forEach((t) => t.onclick = () => {
      const x = list[+t.dataset.i]; showTab('lsd'); $('q').value = x.label; $('qNote').value = x.note || ''; run(); window.scrollTo(0, 0);
    });
  }

  // ---------- LSD -> map ----------
  function run() {
    const v = $('q').value;
    $('qErr').textContent = ''; $('qRes').classList.remove('show'); current = null;
    if (!v.trim() || !ATS.loaded) return;
    const p = ATS.parse(v);
    if (p.error) { $('qErr').textContent = v.replace(/[^0-9]/g, '').length >= 4 ? p.error : ''; return; }
    const r = ATS.toLatLng(p);
    if (r.error) { $('qErr').textContent = r.error; return; }
    current = r;
    const L = ATS.mapsLinks(r.lat, r.lng);
    $('qLabel').textContent = r.label; $('qLevel').textContent = r.level;
    $('qCoords').textContent = `${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}`;
    $('qGo').href = L.directions; $('qPin').href = L.pin;
    $('qRes').classList.add('show');
    history.replaceState(null, '', `?q=${encodeURIComponent(r.label)}`);
  }
  $('q').addEventListener('input', run);
  $('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { $('q').blur(); } });
  $('qGo').addEventListener('click', () => current && remember(current, $('qNote').value));
  $('qPin').addEventListener('click', () => current && remember(current, $('qNote').value));
  $('qShare').addEventListener('click', () => {
    if (!current) return; remember(current, $('qNote').value);
    const note = $('qNote').value.trim();
    share(current.label, `${note ? note + ' — ' : ''}${current.label} (${current.lat}, ${current.lng})`, ATS.mapsLinks(current.lat, current.lng).directions);
  });
  $('qNote').addEventListener('change', () => { if (current && getRecent().some((x) => x.label === current.label)) remember(current, $('qNote').value); });

  // ---------- GPS -> LSD ----------
  let gpsCur = null;
  function showReverse(lat, lng, accText) {
    $('gErr').textContent = ''; $('gRes').classList.remove('show');
    const r = ATS.fromLatLng(lat, lng);
    if (r.error) { $('gErr').textContent = r.error; return; }
    gpsCur = { lat: +lat.toFixed(6), lng: +lng.toFixed(6), r };
    $('gLabel').textContent = r.label;
    $('gSub').textContent = `${r.quarterLabel}${r.onRoadAllowance ? ' · on road allowance' : ''}\n${gpsCur.lat}, ${gpsCur.lng}`;
    $('gSub').style.whiteSpace = 'pre-line';
    $('gGo').href = ATS.mapsLinks(gpsCur.lat, gpsCur.lng).pin;
    $('gpsAcc').textContent = accText || '';
    $('gRes').classList.add('show');
  }
  $('gpsBtn').addEventListener('click', () => {
    if (!navigator.geolocation) { $('gErr').textContent = 'This browser has no GPS access.'; return; }
    $('gpsBtn').textContent = 'Getting GPS fix…';
    navigator.geolocation.getCurrentPosition((pos) => {
      $('gpsBtn').textContent = 'Use my location';
      showReverse(pos.coords.latitude, pos.coords.longitude, `GPS accuracy ±${Math.round(pos.coords.accuracy)} m`);
    }, (err) => {
      $('gpsBtn').textContent = 'Use my location';
      $('gErr').textContent = err.code === 1 ? 'Location permission denied. Allow location for this site in browser settings.' : 'Could not get a GPS fix. Try again outside.';
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
  function parseLL(text) {
    const m = String(text).match(/(-?\d{2}\.\d+)\s*[, ]\s*(-?\d{2,3}\.\d+)/);
    if (!m) return null;
    let a = +m[1], b = +m[2];
    if (b > 0 && a > 0 && b > 100) b = -b; // "52.8, 113.2" -> west
    return { lat: a, lng: b };
  }
  $('ll').addEventListener('input', () => {
    const p = parseLL($('ll').value);
    if (!p) { $('gRes').classList.remove('show'); $('gErr').textContent = $('ll').value.trim().length > 8 ? 'Enter latitude, longitude e.g. 52.8651, -113.2089' : ''; return; }
    showReverse(p.lat, p.lng);
  });
  $('gCopy').addEventListener('click', () => gpsCur && copy(gpsCur.r.label));
  $('gShare').addEventListener('click', () => gpsCur && share(gpsCur.r.label, `${gpsCur.r.label} (${gpsCur.lat}, ${gpsCur.lng})`, ATS.mapsLinks(gpsCur.lat, gpsCur.lng).directions));

  // ---------- tabs ----------
  function showTab(t) {
    $('paneLsd').classList.toggle('hide', t !== 'lsd'); $('paneGps').classList.toggle('hide', t !== 'gps');
    $('tabLsd').classList.toggle('on', t === 'lsd'); $('tabGps').classList.toggle('on', t === 'gps');
  }
  $('tabLsd').onclick = () => showTab('lsd');
  $('tabGps').onclick = () => showTab('gps');

  // ---------- boot ----------
  renderRecent();
  const qs = new URLSearchParams(location.search);
  if (qs.get('q')) $('q').value = qs.get('q');
  ATS.fetchGrid('ats.bin.gz').then((n) => {
    $('status').textContent = `${n.toLocaleString()} sections · offline ready`;
    document.body.dataset.ready = '1';
    run();
  }).catch((e) => { $('status').textContent = 'Grid failed to load'; $('qErr').textContent = 'Could not load the ATS grid. Connect once to download it.'; });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');
})();
