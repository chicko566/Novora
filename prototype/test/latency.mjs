// Latenz-Messung: Pairing -> 500x Press -> p50/p95/p99 (Client-RTT inkl. HTTP)
import { performance } from 'node:perf_hooks';

const BASE = process.env.SP_BASE || 'http://127.0.0.1:47830';
const N = Number(process.env.SP_N || 500);

const j = async (p, o = {}) => {
  const r = await fetch(BASE + p, { ...o, headers: { 'content-type': 'application/json', ...(o.headers || {}) } });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

const code = (await j('/api/pair/request', { method: 'POST' })).body.code;
const claim = await j('/api/pair/claim', { method: 'POST', body: JSON.stringify({ code, device: 'latency-test' }) });
const token = claim.body.token;
if (!token) { console.error('pairing failed'); process.exit(1); }

const layout = (await j('/api/layout', { headers: { 'x-token': token } })).body;
const page = layout.pages.find((p) => p.type !== 'mixer');
const mic = page.tiles.find((t) => t.action?.type === 'mic') || page.tiles[0];

const times = [];
for (let i = 0; i < 40; i++) await j('/api/ping', { headers: { 'x-token': token } }); // warmup

for (let i = 0; i < N; i++) {
  const t0 = performance.now();
  await j('/api/press', { method: 'POST', headers: { 'x-token': token }, body: JSON.stringify({ page: page.id, key: mic.key, phase: 'down' }) });
  times.push(performance.now() - t0);
}

times.sort((a, b) => a - b);
const q = (p) => times[Math.min(times.length - 1, Math.floor(times.length * p))];
const avg = times.reduce((a, b) => a + b, 0) / times.length;
console.log(JSON.stringify({
  n: N,
  page: page.id,
  key: mic.key,
  action: mic.action?.type,
  p50: +q(0.5).toFixed(2),
  p95: +q(0.95).toFixed(2),
  p99: +q(0.99).toFixed(2),
  avg: +avg.toFixed(2),
  max: +times[times.length - 1].toFixed(2)
}, null, 2));

// Testgeraet wieder entfernen (nur lokal) – kurz warten, damit das Rate-Limit abklingt
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);
const ov = await j('/api/admin/overview');
const me = (ov.body.devices || []).find((d) => d.name === 'latency-test');
if (me) await j('/api/admin/revoke', { method: 'POST', body: JSON.stringify({ id: me.id }) });
