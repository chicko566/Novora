// Persistence: default layout + atomic JSON file storage.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // prototype/

// Data path is configurable so tests never touch the live file.
export const DATA_PATH = process.env.NOVORA_DATA
  ? path.resolve(process.env.NOVORA_DATA)
  : path.join(ROOT, 'data.json');

const DEFAULT_DATA = {
  name: os.hostname() || 'PC',
  profile: 'Streaming',
  // Only `home` is a top-level page; the others are folders opened from a
  // tile on home (`folder: true`).
  pages: [
    {
      id: 'home', name: 'Home', cols: 5, rows: 4, folder: false,
      tiles: [
        { key: 0, logo: 'mic', action: { type: 'mic' }, state: 'mic' },
        { key: 1, logo: 'spotify', action: { type: 'open', target: 'spotify:' } },
        { key: 2, logo: 'discord', action: { type: 'open', target: 'discord:' } },
        { key: 3, logo: 'chrome', action: { type: 'open', target: 'https://www.google.com' } },
        { key: 4, logo: 'volume', action: { type: 'volume', dir: 'up' }, state: 'volume' },
        { key: 5, logo: 'play', action: { type: 'media', key: 'playpause' } },
        { key: 6, logo: 'obs', action: { type: 'open', target: 'obs64.exe' } },
        { key: 7, logo: 'steam', action: { type: 'open', target: 'steam://open/main' } },
        { key: 8, logo: 'rec', action: { type: 'record' }, state: 'recording' },
        { key: 9, logo: 'browser', action: { type: 'open', target: 'https://www.google.com' } },
        { key: 10, logo: 'tool', action: { type: 'hotkey', keys: 'Ctrl+Shift+M' } },
        { key: 11, logo: 'timer', action: { type: 'hotkey', keys: 'Win+Shift+S' } },
        { key: 12, logo: 'tb-folder', action: { type: 'page', page: 'music' } },
        { key: 13, logo: 'tb-folder', action: { type: 'page', page: 'tools' } },
        { key: 14, logo: 'settings', action: { type: 'open', target: 'ms-settings:' } },
        { key: 15, logo: 'lock', action: { type: 'hotkey', keys: 'Win+L' } },
        { key: 16, logo: 'prev', action: { type: 'media', key: 'prev' } },
        { key: 17, logo: 'next', action: { type: 'media', key: 'next' } },
        { key: 18, logo: 'mute', action: { type: 'volume', dir: 'mute' } },
        { key: 19, logo: 'tb-folder', action: { type: 'page', page: 'mixer' } }
      ]
    },
    {
      id: 'music', name: 'Musik', cols: 5, rows: 3, folder: true,
      tiles: [
        { key: 0, logo: 'play', action: { type: 'media', key: 'playpause' } },
        { key: 1, logo: 'prev', action: { type: 'media', key: 'prev' } },
        { key: 2, logo: 'next', action: { type: 'media', key: 'next' } },
        { key: 3, logo: 'volume', action: { type: 'volume', dir: 'up' }, state: 'volume' },
        { key: 4, logo: 'mute', action: { type: 'volume', dir: 'mute' } },
        { key: 5, logo: 'spotify', action: { type: 'open', target: 'spotify:' } }
      ]
    },
    { id: 'tools', name: 'Tools', cols: 5, rows: 3, folder: true, tiles: [] },
    { id: 'mixer', name: 'Mixer', type: 'mixer', folder: false }
  ],
  mixer: [
    { id: 'spotify', name: 'Spotify', vol: 62, muted: false },
    { id: 'discord', name: 'Discord', vol: 38, muted: false },
    { id: 'chrome', name: 'Chrome', vol: 80, muted: false },
    { id: 'game', name: 'Spiel', vol: 100, muted: false },
    { id: 'system', name: 'System', vol: 45, muted: true }
  ],
  devices: [],
  // Open pairing requests (new device waits for the PC to confirm).
  pairRequests: [],
  state: { mic: false, volume: 62, recording: false },
  settings: { palette: 'graphite', lang: 'de', autoPair: true, requireApproval: true }
};

export function loadData() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    return normalize({ ...structuredClone(DEFAULT_DATA), ...raw });
  } catch {
    return structuredClone(DEFAULT_DATA);
  }
}

// Keep the shape the clients expect even if the file was hand-edited.
function normalize(db) {
  if (!Array.isArray(db.pages)) db.pages = [];
  if (!Array.isArray(db.mixer)) db.mixer = [];
  if (!Array.isArray(db.devices)) db.devices = [];
  if (!Array.isArray(db.pairRequests)) db.pairRequests = [];
  db.pairRequests = db.pairRequests.filter((r) => r && typeof r === 'object' && typeof r.id === 'string')
    .map((r) => ({
      id: r.id,
      device: typeof r.device === 'string' ? r.device.slice(0, 40) : 'Gerät',
      hwid: typeof r.hwid === 'string' ? r.hwid.slice(0, 64) : '',
      ip: typeof r.ip === 'string' ? r.ip.slice(0, 64) : '',
      createdAt: Number.isFinite(r.createdAt) ? r.createdAt : Date.now(),
      status: r.status === 'allowed' || r.status === 'denied' ? r.status : 'pending'
    }));
  if (!db.state || typeof db.state !== 'object') db.state = { mic: false, volume: 62, recording: false };
  if (!db.settings || typeof db.settings !== 'object') db.settings = {};
  // Missing field (old client / hand-edited file) means approval is required.
  if (typeof db.settings.requireApproval !== 'boolean') db.settings.requireApproval = true;
  if (typeof db.name !== 'string' || !db.name) db.name = os.hostname() || 'PC';
  return db;
}

// Atomic write: temp file + rename, so a crash never leaves half a JSON file.
export function saveData(db) {
  const tmp = `${DATA_PATH}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DATA_PATH);
    return true;
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch {}
    console.error(`[store] save failed: ${err.code || err.message}`);
    return false;
  }
}
