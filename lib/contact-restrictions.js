import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'restricted-contacts.json');
const AUTO_REPLY_COOLDOWN = 24 * 60 * 60 * 1000;

let cache = null;
let writeQueue = Promise.resolve();

function normalizeNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 ? digits : '';
}

async function loadData() {
  if (cache) return cache;
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const parsed = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
    cache = {
      contacts: parsed?.contacts && typeof parsed.contacts === 'object' ? parsed.contacts : {},
      lastReplies: parsed?.lastReplies && typeof parsed.lastReplies === 'object' ? parsed.lastReplies : {}
    };
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[CONTACT RESTRICTIONS] Failed to read data:', error.message);
    cache = { contacts: {}, lastReplies: {} };
  }
  return cache;
}

async function saveData() {
  const data = await loadData();
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const temp = `${DATA_FILE}.tmp`;
    await fs.writeFile(temp, JSON.stringify(data, null, 2));
    await fs.rename(temp, DATA_FILE);
  });
  return writeQueue;
}

export function normalizeContactNumber(value) {
  return normalizeNumber(value);
}

export async function addRestrictedContact(value, addedBy = '') {
  const number = normalizeNumber(value);
  if (!number) throw new Error('Enter a valid phone number with country code.');
  const data = await loadData();
  const existed = Boolean(data.contacts[number]);
  data.contacts[number] = {
    number,
    addedAt: data.contacts[number]?.addedAt || Date.now(),
    addedBy: String(addedBy || 'owner')
  };
  await saveData();
  return { number, existed };
}

export async function removeRestrictedContact(value) {
  const number = normalizeNumber(value);
  if (!number) throw new Error('Enter a valid phone number with country code.');
  const data = await loadData();
  const existed = Boolean(data.contacts[number]);
  delete data.contacts[number];
  delete data.lastReplies[number];
  await saveData();
  return { number, existed };
}

export async function listRestrictedContacts() {
  const data = await loadData();
  return Object.values(data.contacts).sort((a, b) => a.number.localeCompare(b.number));
}

export async function findRestrictedContact(identities = []) {
  const data = await loadData();
  for (const identity of identities) {
    const number = normalizeNumber(String(identity || '').split('@')[0].split(':')[0]);
    if (number && data.contacts[number]) return data.contacts[number];
  }
  return null;
}

export async function shouldSendRestrictionReply(number) {
  const data = await loadData();
  const last = Number(data.lastReplies[number]) || 0;
  return Date.now() - last >= AUTO_REPLY_COOLDOWN;
}

export async function markRestrictionReplySent(number) {
  const data = await loadData();
  data.lastReplies[number] = Date.now();
  await saveData();
}
