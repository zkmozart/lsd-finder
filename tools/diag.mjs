import { readFileSync } from 'node:fs'; import { gunzipSync } from 'node:zlib';
await import('../app/ats.js'); const ATS = globalThis.ATS;
const b = gunzipSync(readFileSync('app/ats.bin.gz')); ATS.load(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
const truth = JSON.parse(readFileSync(process.argv[2] || 'tests/truth.json'));
const hav=(a,b,c,d)=>{const R=6371000,t=Math.PI/180,x=Math.sin((c-a)*t/2)**2+Math.cos(a*t)*Math.cos(c*t)*Math.sin((d-b)*t/2)**2;return 2*R*Math.asin(Math.sqrt(x));};
const e = truth.map(t=>{const p=ATS.parse(`${t.lsd}-${t.sec}-${t.twp}-${t.rge} W${t.mer}`);const g=ATS.toLatLng(p);const back=ATS.fromLatLng(t.lat,t.lng);return {l:p.label,m:hav(t.lat,t.lng,g.lat,g.lng),back:back.label, t, g};}).sort((a,b)=>b.m-a.m);
const m=e.map(x=>x.m).sort((a,b)=>a-b); console.log('p50',m[200].toFixed(1),'p90',m[360].toFixed(1),'p99',m[396].toFixed(1),'max',m[399].toFixed(1));
console.log('>30m', e.filter(x=>x.m>30).length, 'revmiss', e.filter(x=>x.back!==x.l).length);
for (const x of e.slice(0,8)) console.log(x.l, x.m.toFixed(1), x.back, x.t.lat.toFixed(5), x.t.lng.toFixed(5), x.g.lat, x.g.lng);
