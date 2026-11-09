
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ==================================================
// PRECIOUS-MD CONTACT RESTRICTIONS
// Created by Watson Fourpence
// ==================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'restricted-contacts.json');

const REPLY_COOLDOWN = 24 * 60 * 60 * 1000;

// ==================================================
// DATABASE
// ==================================================

function ensureDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({
        contacts: [],
        lastReplies: {}
      }, null, 2)
    );
  }
}

function loadDatabase() {
  ensureDatabase();

  try {
    const data = JSON.parse(
      fs.readFileSync(DATA_FILE, 'utf8')
    );

    return {
      contacts: Array.isArray(data.contacts)
        ? data.contacts
        : [],

      lastReplies:
        data.lastReplies &&
        typeof data.lastReplies === 'object' &&
        !Array.isArray(data.lastReplies)
          ? data.lastReplies
          : {}
    };

  } catch (error) {
    console.error('[CONTACT RESTRICTIONS] Database read error:', error);

    return {
      contacts: [],
      lastReplies: {}
    };
  }
}

function saveDatabase(data) {
  ensureDatabase();

  const temporaryFile = `${DATA_FILE}.tmp`;

  fs.writeFileSync(
    temporaryFile,
    JSON.stringify(data, null, 2)
  );

  fs.renameSync(temporaryFile, DATA_FILE);
}

// ==================================================
// NUMBER NORMALIZATION
// ==================================================

export function normalizeContactNumber(number) {
  return String(number || '')
    .replace(/[^0-9]/g, '');
}

function getContactJid(number) {
  const normalized = normalizeContactNumber(number);

  return normalized
    ? `${normalized}@s.whatsapp.net`
    : '';
}

// ==================================================
// ADD CONTACT
// ==================================================

export async function addRestrictedContact(number) {
  const normalized = normalizeContactNumber(number);

  if (!/^\d{7,15}$/.test(normalized)) {
    throw new Error('Invalid WhatsApp number.');
  }

  const db = loadDatabase();

  const exists = db.contacts.some(contact => {
    const value = typeof contact === 'string'
      ? contact
      : contact.number;

    return normalizeContactNumber(value) === normalized;
  });

  if (exists) return false;

  db.contacts.push({
    number: normalized,
    addedAt: Date.now()
  });

  saveDatabase(db);

  console.log(
    `[CONTACT RESTRICTIONS] Added ${normalized}`
  );

  return true;
}

// ==================================================
// REMOVE CONTACT
// ==================================================

export async function removeRestrictedContact(number) {
  const normalized = normalizeContactNumber(number);

  const db = loadDatabase();

  const originalLength = db.contacts.length;

  db.contacts = db.contacts.filter(contact => {
    const value = typeof contact === 'string'
      ? contact
      : contact.number;

    return normalizeContactNumber(value) !== normalized;
  });

  delete db.lastReplies[normalized];

  if (db.contacts.length === originalLength) {
    return false;
  }

  saveDatabase(db);

  console.log(
    `[CONTACT RESTRICTIONS] Removed ${normalized}`
  );

  return true;
}

// ==================================================
// LIST CONTACTS
// ==================================================

export async function listRestrictedContacts() {
  const db = loadDatabase();

  return db.contacts.map(contact => {
    if (typeof contact === 'string') {
      return {
        number: normalizeContactNumber(contact)
      };
    }

    return {
      ...contact,
      number: normalizeContactNumber(contact.number)
    };
  });
}

// ==================================================
// FIND RESTRICTED CONTACT
// ==================================================

export async function findRestrictedContact(identities = []) {
  const db = loadDatabase();

  const numbers = new Set();

  for (const identity of identities) {
    const value = String(identity || '').trim();

    if (!value) continue;

    // Only match actual phone JIDs or plain phone numbers.
    // Never interpret a LID as a phone number.
    if (
      value.endsWith('@s.whatsapp.net') ||
      /^\+?\d[\d\s()-]{5,20}$/.test(value)
    ) {
      const number = normalizeContactNumber(
        value.split('@')[0]
      );

      if (number) numbers.add(number);
    }
  }

  for (const contact of db.contacts) {
    const number = normalizeContactNumber(
      typeof contact === 'string'
        ? contact
        : contact.number
    );

    if (numbers.has(number)) {
      return {
        number,
        jid: getContactJid(number)
      };
    }
  }

  return null;
}

// ==================================================
// CHECK 24-HOUR REPLY COOLDOWN
// ==================================================

export async function shouldSendRestrictionReply(number) {
  const normalized = normalizeContactNumber(number);

  if (!normalized) return false;

  const db = loadDatabase();

  const lastReply = Number(
    db.lastReplies[normalized] || 0
  );

  return Date.now() - lastReply >= REPLY_COOLDOWN;
}

// ==================================================
// MARK REPLY AS SENT
// ==================================================

export async function markRestrictionReplySent(number) {
  const normalized = normalizeContactNumber(number);

  if (!normalized) {
    throw new Error('Invalid contact number.');
  }

  const db = loadDatabase();

  db.lastReplies[normalized] = Date.now();

  saveDatabase(db);

  return true;
}
