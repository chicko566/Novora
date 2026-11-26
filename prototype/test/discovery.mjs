// Prueft die UDP-Discovery: Probe senden, Antwort des laufenden Servers erwarten.
import dgram from 'node:dgram';

const PORT = Number(process.env.SP_DISC || 47831);
const sock = dgram.createSocket('udp4');
let done = false;

const timer = setTimeout(() => {
  if (!done) { console.error('FAIL: keine Discovery-Antwort in 1500 ms'); process.exit(1); }
}, 1500);

sock.on('message', (msg, rinfo) => {
  try {
    const j = JSON.parse(msg.toString());
    if (j.t !== 'novora' && j.t !== 'novora') return;
    done = true;
    clearTimeout(timer);
    console.log(JSON.stringify({ ok: true, from: `${rinfo.address}:${rinfo.port}`, name: j.name, port: j.port, version: j.v }, null, 2));
    sock.close();
    process.exit(0);
  } catch { /* ignore */ }
});

const probe = Buffer.from(JSON.stringify({ t: 'discover' }));
sock.bind(0, () => {
  sock.send(probe, 0, probe.length, PORT, '127.0.0.1');
});
