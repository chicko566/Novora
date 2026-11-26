// LAN discovery over UDP: answers {"t":"discover"} immediately and
// broadcasts the server presence every 3 s on every interface.
import dgram from 'node:dgram';
import os from 'node:os';

export function listInterfaces() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const n of list || []) {
      if (n.family !== 'IPv4' || n.internal) continue;
      out.push({ name, ip: n.address, mask: n.netmask, mac: n.mac || '' });
    }
  }
  return out;
}

function broadcastAddresses() {
  const out = new Set(['255.255.255.255']);
  for (const iface of listInterfaces()) {
    const ip = iface.ip.split('.').map(Number);
    const mask = iface.mask.split('.').map(Number);
    if (ip.length !== 4 || mask.length !== 4) continue;
    const broadcast = ip.map((octet, i) => ((octet & mask[i]) | (~mask[i] & 255)) >>> 0);
    out.add(broadcast.join('.'));
  }
  return [...out];
}

// Local address that belongs to the same subnet as the peer.
function ipFor(remote) {
  const r = String(remote).split('.').map(Number);
  const ifaces = listInterfaces();
  for (const iface of ifaces) {
    const ip = iface.ip.split('.').map(Number);
    const mask = iface.mask.split('.').map(Number);
    if (ip.length !== 4 || mask.length !== 4 || r.length !== 4) continue;
    if (ip.every((octet, i) => (octet & mask[i]) === (r[i] & mask[i]))) return iface.ip;
  }
  return ifaces[0]?.ip || '127.0.0.1';
}

export function createDiscovery({ getName, getPort, discoveryPort, version }) {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  let timer = null;

  const payload = (ip) => Buffer.from(JSON.stringify({
    t: 'novora',
    v: version,
    name: getName(),
    port: getPort(),
    ip,
    host: os.hostname()
  }));

  function announce() {
    const message = payload(listInterfaces()[0]?.ip || '127.0.0.1');
    for (const address of broadcastAddresses()) {
      socket.send(message, 0, message.length, discoveryPort, address, () => {});
    }
  }

  socket.on('message', (msg, rinfo) => {
    let parsed;
    try { parsed = JSON.parse(msg.toString('utf8')); } catch { return; }
    if (!parsed || parsed.t !== 'discover') return;
    const reply = payload(ipFor(rinfo.address));
    socket.send(reply, 0, reply.length, rinfo.port, rinfo.address, () => {});
  });

  socket.on('error', () => {});

  socket.bind(discoveryPort, () => {
    try { socket.setBroadcast(true); } catch {}
    announce();
    timer = setInterval(announce, 3000);
    timer.unref?.();
  });

  function stop() {
    clearInterval(timer);
    try { socket.close(); } catch {}
  }

  return { announce, stop, interfaces: listInterfaces };
}
