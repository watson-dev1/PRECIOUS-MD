import config from './config.js';

import express from 'express';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { Boom } from '@hapi/boom';

import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
  jidNormalizedUser
} from '@whiskeysockets/baileys';

import {
  loadDatabase,
  saveDatabase
} from './lib/database.js';

import { handleMessage } from './lib/handler.js';

import {
  loadPlugins,
  reloadPlugins
} from './lib/plugin-loader.js';

import { installEventHandlers } from './lib/events.js';

import {
  installAutomationHandlers,
  stopAutomation
} from './lib/automation.js';

import {
  startReminderScheduler,
  stopReminderScheduler
} from './lib/reminders.js';

import { createMultiSessionManager } from './lib/multi-session.js';

// ======================================================
// PRECIOUS-MD v3 — WATSON FOURPENCE
// ======================================================

globalThis.config = config;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(config.port) || 9090;
const HOST = '0.0.0.0';

const SESSION_DIR = path.resolve(
  config.sessionDir || './session'
);

const DASHBOARD_FILE = path.join(__dirname, 'index.html');

// ======================================================
// LOGGING
// ======================================================

const dashboardLogs = [];
const MAX_DASHBOARD_LOGS = 500;
let primaryQr = null;
let primaryPairingCode = null;

function pushDashboardLog(level, message) {
  const entry = {
    id: crypto.randomUUID(),
    time: new Date().toISOString(),
    level,
    message: String(message ?? '').slice(0, 2000)
  };
  dashboardLogs.push(entry);
  if (dashboardLogs.length > MAX_DASHBOARD_LOGS) dashboardLogs.shift();
}

function logInfo(message) {
  pushDashboardLog('info', message);
  console.log(`[PRECIOUS-MD] ${message}`);
}

function logError(label, error) {
  const message = error?.stack || error?.message || error;
  pushDashboardLog('error', `[${label}] ${message}`);
  console.error(`[${label}]`, message);
}

// ======================================================
// SETTINGS CONFIGURATION
// ======================================================

const DEFAULT_BOT_SETTINGS = Object.freeze({
  prefix: String(config.prefix || '.'),
  publicMode: Boolean(config.publicMode),

  readMessages: Boolean(config.readMessages),
  alwaysOnline: Boolean(config.alwaysOnline),
  autoTyping: Boolean(config.autoTyping),
  autoRecording: Boolean(config.autoRecording),
  autoReact: Boolean(config.autoReact),

  autoViewStatus: Boolean(config.autoViewStatus),
  autoStatusReact: Boolean(config.autoStatusReact),

  statusEmojis: Array.isArray(config.statusEmojis)
    ? [...config.statusEmojis]
    : [
        '🔥', '❤️', '😂', '💚',
        '😍', '😮', '😢', '🙏',
        '👍', '👏', '😎', '🥰',
        '💯', '🤩', '😭', '✨'
      ],

  antiCall: Boolean(config.antiCall),
  antiDelete: Boolean(config.antiDelete),
  antiDeleteMode: config.antiDeleteMode || 'all',
  antiDeleteNotify: Boolean(config.antiDeleteNotify),

  aiEnabled: Boolean(config.aiEnabled)
});

const EDITABLE_SETTING_KEYS = new Set(
  Object.keys(DEFAULT_BOT_SETTINGS)
);

const BOOLEAN_SETTING_KEYS = new Set([
  'publicMode',
  'readMessages',
  'alwaysOnline',
  'autoTyping',
  'autoRecording',
  'autoReact',
  'autoViewStatus',
  'autoStatusReact',
  'antiCall',
  'antiDelete',
  'antiDeleteNotify',
  'aiEnabled'
]);

// ======================================================
// ANTI-DELETE SETTINGS HELPERS
// ======================================================

function getStoredAntiDeleteSettings(settings = {}) {
  const value =
    settings.antiDelete ??
    settings.antidelete ??
    settings.anti_delete ??
    settings.automation?.antiDelete ??
    settings.automation?.antidelete ??
    false;

  if (typeof value === 'boolean') {
    return {
      enabled: value,
      mode: settings.antiDeleteMode || 'all'
    };
  }

  if (value && typeof value === 'object') {
    return {
      enabled: value.enabled === true,
      mode: value.mode || settings.antiDeleteMode || 'all'
    };
  }

  return {
    enabled: false,
    mode: settings.antiDeleteMode || 'all'
  };
}

function normalizeAntiDeleteMode(mode) {
  return ['all', 'group', 'private'].includes(mode)
    ? mode
    : 'all';
}

// ======================================================
// DASHBOARD SETTINGS
// ======================================================

function getDashboardSettings() {
  const settings = globalThis.db?.settings || {};
  const antiDelete = getStoredAntiDeleteSettings(settings);

  return {
    prefix: config.prefix || '.',
    publicMode: Boolean(config.publicMode),

    readMessages: Boolean(config.readMessages),
    alwaysOnline: Boolean(config.alwaysOnline),
    autoTyping: Boolean(config.autoTyping),
    autoRecording: Boolean(config.autoRecording),
    autoReact: Boolean(config.autoReact),

    autoViewStatus: Boolean(config.autoViewStatus),
    autoStatusReact: Boolean(config.autoStatusReact),

    statusEmojis: Array.isArray(config.statusEmojis)
      ? [...config.statusEmojis]
      : [...DEFAULT_BOT_SETTINGS.statusEmojis],

    antiCall: Boolean(config.antiCall),

    // Always return a boolean to the dashboard.
    antiDelete: antiDelete.enabled,
    antiDeleteMode: normalizeAntiDeleteMode(antiDelete.mode),
    antiDeleteNotify: Boolean(config.antiDeleteNotify),

    aiEnabled: Boolean(config.aiEnabled),

    updatedAt: settings.updatedAt || null
  };
}

// ======================================================
// APPLY SETTINGS
// ======================================================

function applyBotSettings(settings = {}) {
  for (const key of EDITABLE_SETTING_KEYS) {
    if (settings[key] === undefined) continue;

    if (key === 'antiDelete') {
      const value = settings.antiDelete;

      // Database stores an object; runtime config uses boolean.
      config.antiDelete =
        value && typeof value === 'object'
          ? value.enabled === true
          : value === true;

      continue;
    }

    config[key] = settings[key];
  }

  const antiDelete = getStoredAntiDeleteSettings(settings);

  if (settings.antiDeleteMode !== undefined) {
    config.antiDeleteMode = normalizeAntiDeleteMode(
      settings.antiDeleteMode
    );
  } else if (antiDelete.mode) {
    config.antiDeleteMode = normalizeAntiDeleteMode(
      antiDelete.mode
    );
  }

  config.prefix = String(config.prefix || '.');
  config.prefixes = [config.prefix];

  globalThis.config = config;
}

// ======================================================
// AUTOMATION SETTINGS SYNCHRONIZATION
// ======================================================

function syncAutomationSettings(settings = {}, overwrite = false) {
  if (!globalThis.db) return;

  if (
    !globalThis.db.settings ||
    typeof globalThis.db.settings !== 'object' ||
    Array.isArray(globalThis.db.settings)
  ) {
    globalThis.db.settings = {};
  }

  if (
    !globalThis.db.settings.automation ||
    typeof globalThis.db.settings.automation !== 'object' ||
    Array.isArray(globalThis.db.settings.automation)
  ) {
    globalThis.db.settings.automation = {};
  }

  const automation = globalThis.db.settings.automation;

  const mapping = {
    readMessages: 'autoread',
    alwaysOnline: 'alwaysonline',
    autoViewStatus: 'autostatus',
    autoStatusReact: 'statusreact',
    autoReact: 'autoreact',
    antiCall: 'anticall',
    autoTyping: 'autotyping',
    autoRecording: 'autorecording'
  };

  for (const [configKey, automationKey] of Object.entries(mapping)) {
    if (typeof settings[configKey] !== 'boolean') continue;

    if (
      overwrite ||
      typeof automation[automationKey] !== 'boolean'
    ) {
      automation[automationKey] = settings[configKey];
    }
  }

  if (Array.isArray(settings.statusEmojis)) {
    automation.statusEmojis = [...settings.statusEmojis];
  }
}

// ======================================================
// VALIDATE SETTINGS
// ======================================================

function validateBotSettings(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input)
  ) {
    return {
      valid: false,
      error: 'Settings must be sent as a JSON object.'
    };
  }

  const updates = {};

  for (const [key, value] of Object.entries(input)) {
    if (!EDITABLE_SETTING_KEYS.has(key)) {
      return {
        valid: false,
        error: `Unsupported setting: ${key}`
      };
    }

    if (BOOLEAN_SETTING_KEYS.has(key)) {
      if (typeof value !== 'boolean') {
        return {
          valid: false,
          error: `${key} must be true or false.`
        };
      }

      updates[key] = value;
      continue;
    }

    if (key === 'prefix') {
      if (
        typeof value !== 'string' ||
        value.length < 1 ||
        value.length > 5 ||
        /\s/.test(value)
      ) {
        return {
          valid: false,
          error: 'Prefix must be 1–5 characters with no spaces.'
        };
      }

      updates.prefix = value;
      continue;
    }

    if (key === 'antiDeleteMode') {
      if (!['all', 'private', 'group'].includes(value)) {
        return {
          valid: false,
          error: 'Anti-delete mode must be all, private or group.'
        };
      }

      updates.antiDeleteMode = value;
      continue;
    }

    if (key === 'statusEmojis') {
      if (
        !Array.isArray(value) ||
        value.length < 1 ||
        value.length > 20 ||
        value.some(
          emoji =>
            typeof emoji !== 'string' ||
            !emoji.trim() ||
            emoji.length > 16
        )
      ) {
        return {
          valid: false,
          error: 'Status emojis must be an array of 1–20 valid emoji strings.'
        };
      }

      updates.statusEmojis = [
        ...new Set(value.map(item => item.trim()))
      ];

      continue;
    }
  }

  if (!Object.keys(updates).length) {
    return {
      valid: false,
      error: 'No editable settings were supplied.'
    };
  }

  return {
    valid: true,
    updates
  };
}

// ======================================================
// SAVE SETTINGS
// ======================================================

async function persistBotSettings(updates) {
  if (!globalThis.db) {
    throw new Error('Database has not been loaded.');
  }

  if (
    !globalThis.db.settings ||
    typeof globalThis.db.settings !== 'object' ||
    Array.isArray(globalThis.db.settings)
  ) {
    globalThis.db.settings = {};
  }

  const settings = globalThis.db.settings;
  const previousAntiDelete = settings.antiDelete;

  Object.assign(settings, updates);

  // Keep anti-delete in structured database format.
  if (
    Object.hasOwn(updates, 'antiDelete') ||
    Object.hasOwn(updates, 'antiDeleteMode')
  ) {
    const previousEnabled =
      typeof previousAntiDelete === 'boolean'
        ? previousAntiDelete
        : previousAntiDelete?.enabled === true;

    const previousMode =
      previousAntiDelete?.mode ||
      settings.antiDeleteMode ||
      'all';

    settings.antiDelete = {
      enabled: Object.hasOwn(updates, 'antiDelete')
        ? updates.antiDelete === true
        : previousEnabled,

      mode: normalizeAntiDeleteMode(
        Object.hasOwn(updates, 'antiDeleteMode')
          ? updates.antiDeleteMode
          : previousMode
      )
    };

    settings.antiDeleteMode = settings.antiDelete.mode;
  }

  syncAutomationSettings(updates, true);

  settings.updatedAt = new Date().toISOString();

  applyBotSettings(settings);

  await saveDatabase();

  return getDashboardSettings();
}

// ======================================================
// DASHBOARD SECURITY
// ======================================================

// Never ship a shared default dashboard password. Access stays disabled
// until the operator sets a private DASHBOARD_PASSWORD in .env.
const DASHBOARD_PASSWORD = String(
  config.dashboardPassword || 'admin@2030'
).trim();

const DASHBOARD_SESSION_TTL = 12 * 60 * 60 * 1000;
const DASHBOARD_SESSION_SECRET = crypto.randomBytes(48);

const dashboardSessions = new Map();

const MAX_DASHBOARD_SESSIONS = 500;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW = 15 * 60 * 1000;
const LOGIN_LOCK_TIME = 15 * 60 * 1000;

const loginAttempts = new Map();

const MAX_RELOAD_REQUESTS = 500;
const RELOAD_COOLDOWN = 5000;

const reloadRequests = new Map();

logInfo('Dashboard password authentication enabled.');

// ======================================================
// GLOBAL STATE
// ======================================================

let starting = false;
let stopped = false;

let databaseLoaded = false;
let pluginsLoaded = false;

let activeSocket = null;

let retryCount = 0;
let connectionState = 'starting';

let reconnectTimer = null;
let pairingTimer = null;

let shutdownPromise = null;

const startedAt = Date.now();

const processedMessages = new Set();
const MAX_PROCESSED_MESSAGES = 5000;

const stats = {
  messages: 0,
  errors: 0,
  reconnects: 0,
  lastConnected: null,
  lastDisconnected: null,
  lastMessageAt: null
};

// In-memory hourly message activity for the dashboard. This is telemetry only;
// it is intentionally not persisted and never contains message content.
const messageActivity = new Map();

function recordMessageActivity(timestamp = Date.now()) {
  const hour = Math.floor(timestamp / 3600000) * 3600000;
  messageActivity.set(hour, (messageActivity.get(hour) || 0) + 1);

  const oldestAllowed = hour - 23 * 3600000;
  for (const bucket of messageActivity.keys()) {
    if (bucket < oldestAllowed) messageActivity.delete(bucket);
  }

  stats.lastMessageAt = new Date(timestamp).toISOString();
}

function getMessageActivity(hours = 12) {
  const now = Date.now();
  const currentHour = Math.floor(now / 3600000) * 3600000;
  const count = Math.max(1, Math.min(24, Number(hours) || 12));

  return Array.from({ length: count }, (_, index) => {
    const timestamp = currentHour - (count - index - 1) * 3600000;
    return {
      timestamp: new Date(timestamp).toISOString(),
      messages: messageActivity.get(timestamp) || 0
    };
  });
}

// ======================================================
// DIRECTORIES
// ======================================================

const directories = [
  SESSION_DIR,
  path.resolve(config.mediaDir || './temp'),
  path.resolve('./plugins'),
  path.resolve('./data'),
  path.resolve('./temp'),
  path.resolve('./logs'),
  path.resolve('./backups')
];

for (const directory of directories) {
  fs.mkdirSync(directory, { recursive: true });
}

// ======================================================
// MULTI-SESSION MANAGER
// ======================================================

const multiSessions = createMultiSessionManager({
  baseDir: path.resolve('./sessions'),

  onMessage: async (sock, message) => {
    await handleMessage(sock, message);
  },

  onLog: logInfo,

  logLevel: config.logLevel || 'silent'
});

// ======================================================
// SECURITY HELPERS
// ======================================================

function safeEqual(first, second) {
  if (
    typeof first !== 'string' ||
    typeof second !== 'string'
  ) {
    return false;
  }

  const a = Buffer.from(first);
  const b = Buffer.from(second);

  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

function signSession(id, expiresAt) {
  return crypto
    .createHmac('sha256', DASHBOARD_SESSION_SECRET)
    .update(`${id}.${expiresAt}`)
    .digest('hex');
}

function createDashboardSession() {
  const id = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + DASHBOARD_SESSION_TTL;
  const signature = signSession(id, expiresAt);

  dashboardSessions.set(id, {
    expiresAt,
    createdAt: Date.now()
  });

  while (dashboardSessions.size > MAX_DASHBOARD_SESSIONS) {
    const oldest = dashboardSessions.keys().next().value;
    if (!oldest) break;
    dashboardSessions.delete(oldest);
  }

  return `${id}.${expiresAt}.${signature}`;
}

function verifyDashboardToken(req) {
  const supplied = req.headers['x-dashboard-token'];

  if (
    typeof supplied !== 'string' ||
    supplied.length > 512
  ) {
    return false;
  }

  const parts = supplied.split('.');
  if (parts.length !== 3) return false;

  const [id, expiresString, signature] = parts;

  if (
    !/^[a-f0-9]{64}$/i.test(id) ||
    !/^\d+$/.test(expiresString) ||
    !/^[a-f0-9]{64}$/i.test(signature)
  ) {
    return false;
  }

  const session = dashboardSessions.get(id);
  if (!session) return false;

  const expiresAt = Number(expiresString);

  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt !== session.expiresAt ||
    Date.now() > expiresAt
  ) {
    dashboardSessions.delete(id);
    return false;
  }

  const expected = signSession(id, expiresAt);

  return safeEqual(signature, expected);
}

function protectDashboard(req, res, next) {
  if (verifyDashboardToken(req)) return next();

  return res.status(401).json({
    success: false,
    error: 'Unauthorized. Please login again.'
  });
}

// ======================================================
// LOGIN RATE LIMITING
// ======================================================

function getClientAddress(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function checkLoginLimit(address) {
  const current = Date.now();
  const previous = loginAttempts.get(address);

  if (!previous) return { allowed: true };

  if (previous.lockedUntil && current < previous.lockedUntil) {
    return {
      allowed: false,
      remaining: Math.ceil(
        (previous.lockedUntil - current) / 1000
      )
    };
  }

  if (
    current - previous.startedAt > LOGIN_WINDOW ||
    (previous.lockedUntil && current >= previous.lockedUntil)
  ) {
    loginAttempts.delete(address);
    return { allowed: true };
  }

  return { allowed: true };
}

function recordFailedLogin(address) {
  const current = Date.now();
  let record = loginAttempts.get(address);

  if (!record || current - record.startedAt > LOGIN_WINDOW) {
    record = {
      attempts: 0,
      startedAt: current,
      lockedUntil: 0
    };
  }

  record.attempts++;

  if (record.attempts >= MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = current + LOGIN_LOCK_TIME;
  }

  loginAttempts.set(address, record);

  if (loginAttempts.size > 1000) {
    const oldest = loginAttempts.keys().next().value;
    if (oldest) loginAttempts.delete(oldest);
  }
}

function clearFailedLogins(address) {
  loginAttempts.delete(address);
}

// ======================================================
// SECURITY HEADERS
// ======================================================

function noCache(_req, res, next) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'SAMEORIGIN',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  });

  next();
}

// ======================================================
// EXPRESS SERVER
// ======================================================

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', false);

app.use(noCache);

app.use(express.json({
  limit: '12mb'
}));

// ======================================================
// DASHBOARD PAGE
// ======================================================

app.get('/', (_req, res) => {
  if (!fs.existsSync(DASHBOARD_FILE)) {
    return res.status(404).send(
      'PRECIOUS-MD dashboard file was not found.'
    );
  }

  return res.sendFile(DASHBOARD_FILE);
});

// ======================================================
// DASHBOARD LOGIN
// ======================================================

app.post('/api/login', (req, res) => {
  if (!DASHBOARD_PASSWORD) {
    return res.status(503).json({
      success: false,
      error: 'Dashboard login is disabled. Set DASHBOARD_PASSWORD in your private .env file.'
    });
  }

  const address = getClientAddress(req);
  const limit = checkLoginLimit(address);

  if (!limit.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Too many login attempts. Try again later.',
      retryAfter: limit.remaining
    });
  }

  const password = req.body?.password;

  if (
    typeof password !== 'string' ||
    !safeEqual(password, DASHBOARD_PASSWORD)
  ) {
    recordFailedLogin(address);

    return res.status(401).json({
      success: false,
      error: 'Incorrect dashboard password.'
    });
  }

  clearFailedLogins(address);

  const token = createDashboardSession();

  return res.json({
    success: true,
    message: 'Dashboard login successful.',
    token,
    expiresIn: DASHBOARD_SESSION_TTL
  });
});

// ======================================================
// DASHBOARD LOGOUT
// ======================================================

app.post('/api/logout', protectDashboard, (req, res) => {
  const supplied = req.headers['x-dashboard-token'];
  const [id] = supplied.split('.');

  dashboardSessions.delete(id);

  return res.json({
    success: true,
    message: 'Logged out successfully.'
  });
});

// ======================================================
// SESSION VALIDATION
// ======================================================

app.get('/api/session', protectDashboard, (_req, res) => {
  return res.json({
    success: true,
    authenticated: true
  });
});

// ======================================================
// SETTINGS API
// ======================================================

app.get('/api/settings', protectDashboard, (_req, res) => {
  if (!databaseLoaded) {
    return res.status(503).json({
      success: false,
      error: 'Database is not ready yet.'
    });
  }

  return res.json({
    success: true,
    settings: getDashboardSettings()
  });
});

async function updateSettingsRoute(req, res) {
  if (!databaseLoaded) {
    return res.status(503).json({
      success: false,
      error: 'Database is not ready yet.'
    });
  }

  const validation = validateBotSettings(req.body);

  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      error: validation.error
    });
  }

  try {
    const settings = await persistBotSettings(
      validation.updates
    );

    return res.json({
      success: true,
      message: 'Settings saved and applied.',
      settings
    });
  } catch (error) {
    logError('SETTINGS SAVE', error);

    return res.status(500).json({
      success: false,
      error: 'Could not save settings to the database.'
    });
  }
}

app.put(
  '/api/settings',
  protectDashboard,
  updateSettingsRoute
);

app.patch(
  '/api/settings',
  protectDashboard,
  updateSettingsRoute
);

app.post(
  '/api/settings/reset',
  protectDashboard,
  async (_req, res) => {
    if (!databaseLoaded) {
      return res.status(503).json({
        success: false,
        error: 'Database is not ready yet.'
      });
    }

    try {
      const resetValues = structuredClone(
        DEFAULT_BOT_SETTINGS
      );

      const settings = await persistBotSettings(
        resetValues
      );

      return res.json({
        success: true,
        message: 'Settings restored to configuration defaults.',
        settings
      });
    } catch (error) {
      logError('SETTINGS RESET', error);

      return res.status(500).json({
        success: false,
        error: 'Could not reset settings.'
      });
    }
  }
);

// ======================================================
// GROUP SECURITY DASHBOARD API
// ======================================================

const GROUP_SECURITY_FLAGS = [
  'antiLink', 'antiBad', 'antiSpam', 'antiScam',
  'antiMention', 'antiBot', 'antiPorn', 'antiForeign'
];

app.get('/api/groups/security', protectDashboard, (_req, res) => {
  const groups = globalThis.db?.groups || {};
  const result = Object.entries(groups).map(([jid, value]) => {
    const group = value && typeof value === 'object' ? value : {};
    return {
      jid,
      ...Object.fromEntries(GROUP_SECURITY_FLAGS.map(key => [key, group[key] === true])),
      maxWarnings: Number.isInteger(Number(group.maxWarnings)) ? Number(group.maxWarnings) : 3,
      maxMentions: Number.isInteger(Number(group.maxMentions)) ? Number(group.maxMentions) : 8,
      foreignAllowedCodes: Array.isArray(group.foreignAllowedCodes) ? group.foreignAllowedCodes : []
    };
  });
  res.json({ success: true, total: result.length, groups: result });
});

app.patch('/api/groups/:jid/security', protectDashboard, async (req, res) => {
  if (!databaseLoaded || !globalThis.db?.groups) {
    return res.status(503).json({ success: false, error: 'Database is not ready.' });
  }
  const jid = String(req.params.jid || '');
  if (!/^\d{5,25}-\d{5,25}@g\.us$/.test(jid)) {
    return res.status(400).json({ success: false, error: 'Invalid WhatsApp group ID.' });
  }
  const group = globalThis.db.groups[jid];
  if (!group || typeof group !== 'object') {
    return res.status(404).json({ success: false, error: 'Group is not present in the bot database yet.' });
  }
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const updates = {};
  for (const key of GROUP_SECURITY_FLAGS) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== 'boolean') return res.status(400).json({ success: false, error: `${key} must be true or false.` });
      updates[key] = body[key];
    }
  }
  for (const key of ['maxWarnings', 'maxMentions']) {
    if (body[key] !== undefined) {
      const value = Number(body[key]);
      const max = key === 'maxWarnings' ? 10 : 50;
      if (!Number.isInteger(value) || value < 1 || value > max) {
        return res.status(400).json({ success: false, error: `${key} must be between 1 and ${max}.` });
      }
      updates[key] = value;
    }
  }
  if (body.foreignAllowedCodes !== undefined) {
    if (!Array.isArray(body.foreignAllowedCodes) || body.foreignAllowedCodes.length > 30 || body.foreignAllowedCodes.some(code => !/^\d{1,4}$/.test(String(code)))) {
      return res.status(400).json({ success: false, error: 'Country codes must be an array of up to 30 numeric calling codes.' });
    }
    updates.foreignAllowedCodes = [...new Set(body.foreignAllowedCodes.map(String))];
  }
  if (!Object.keys(updates).length) return res.status(400).json({ success: false, error: 'No valid group settings supplied.' });
  try {
    Object.assign(group, updates);
    await saveDatabase();
    return res.json({ success: true, message: 'Group security settings saved.', jid, settings: Object.fromEntries([...GROUP_SECURITY_FLAGS, 'maxWarnings', 'maxMentions', 'foreignAllowedCodes'].map(key => [key, group[key]])) });
  } catch (error) {
    logError('GROUP SECURITY SAVE', error);
    return res.status(500).json({ success: false, error: 'Could not save group security settings.' });
  }
});

// ======================================================
// PLUGIN STATISTICS
// ======================================================

function getPluginStatistics() {
  const plugins = Array.isArray(globalThis.plugins)
    ? globalThis.plugins
    : [];

  const categories = {};
  const files = new Set();

  for (const plugin of plugins) {
    const category = String(
      plugin.category || 'general'
    ).toLowerCase();

    categories[category] =
      (categories[category] || 0) + 1;

    if (plugin.filename) files.add(plugin.filename);
  }

  return {
    files: files.size,
    plugins: plugins.length,
    commands: globalThis.commandMap?.size || 0,
    categories
  };
}

// ======================================================
// DASHBOARD DATA
// ======================================================

app.get('/api/dashboard', protectDashboard, (_req, res) => {
  const pluginStats = getPluginStatistics();
  const connected = Boolean(globalThis.sock?.user);

  return res.json({
    success: true,

    bot: {
      name: config.botName || 'PRECIOUS-MD',
      owner: config.ownerName || 'Watson Fourpence',
      connected,
      connection: connectionState
    },

    system: {
      uptime: Math.floor(process.uptime()),
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      memory: process.memoryUsage()
    },

    plugins: pluginStats,

    database: {
      loaded: databaseLoaded
    },

    statistics: {
      ...stats,
      startedAt
    },

    activity: getMessageActivity(12)
  });
});

// ======================================================
// PLUGIN INFORMATION
// ======================================================

app.get('/api/plugins', protectDashboard, (_req, res) => {
  const plugins = Array.isArray(globalThis.plugins)
    ? globalThis.plugins
    : [];

  return res.json({
    success: true,
    total: plugins.length,

    plugins: plugins.map(plugin => ({
      command: plugin.command || '',

      aliases: Array.isArray(plugin.aliases)
        ? plugin.aliases
        : [],

      category: plugin.category || 'general',
      description: plugin.description || '',
      filename: plugin.filename || 'unknown'
    }))
  });
});

// ======================================================
// COMMAND INFORMATION
// ======================================================

app.get('/api/commands', protectDashboard, (_req, res) => {
  const commandMap =
    globalThis.commandMap instanceof Map
      ? globalThis.commandMap
      : new Map();

  const commands = [];

  for (const [name, plugin] of commandMap) {
    commands.push({
      command: name,
      name,
      category: plugin.category || 'general',
      description: plugin.description || '',

      aliases: Array.isArray(plugin.aliases)
        ? plugin.aliases
        : []
    });
  }

  return res.json({
    success: true,
    total: commands.length,
    commands
  });
});

// ======================================================
// SYSTEM INFORMATION
// ======================================================

app.get('/api/system', protectDashboard, (_req, res) => {
  const memory = process.memoryUsage();

  return res.json({
    success: true,

    process: {
      pid: process.pid,
      uptime: process.uptime(),
      version: process.version,
      platform: process.platform,
      architecture: process.arch
    },

    memory: {
      rss: memory.rss,
      heapTotal: memory.heapTotal,
      heapUsed: memory.heapUsed,
      external: memory.external,
      arrayBuffers: memory.arrayBuffers
    },

    cpu: process.cpuUsage(),
    connection: connectionState
  });
});

// ======================================================
// HEALTH CHECK
// ======================================================

app.get('/health', (_req, res) => {
  const connected = Boolean(globalThis.sock?.user);

  const healthy =
    databaseLoaded &&
    pluginsLoaded &&
    !stopped;

  return res.status(healthy ? 200 : 503).json({
    success: healthy,
    ok: healthy && connected,

    bot: config.botName || 'PRECIOUS-MD',

    connected,
    connection: connectionState,

    uptime: Math.floor(process.uptime()),

    plugins: globalThis.plugins?.length || 0,
    commands: globalThis.commandMap?.size || 0,

    database: databaseLoaded,
    pluginsLoaded,
    retryCount
  });
});

// ======================================================
// READINESS CHECK
// ======================================================

app.get('/ready', (_req, res) => {
  const ready =
    databaseLoaded &&
    pluginsLoaded &&
    Boolean(globalThis.sock?.user) &&
    !stopped;

  return res.status(ready ? 200 : 503).json({
    success: ready,
    ready,
    connection: connectionState
  });
});

// ======================================================
// PROTECTED PLUGIN RELOAD
// ======================================================

app.post(
  '/api/plugins/reload',
  protectDashboard,
  async (req, res) => {
    const source = getClientAddress(req);
    const current = Date.now();

    const previous = reloadRequests.get(source) || 0;

    if (current - previous < RELOAD_COOLDOWN) {
      return res.status(429).json({
        success: false,
        error: 'Please wait before reloading plugins again.'
      });
    }

    reloadRequests.set(source, current);

    if (reloadRequests.size > MAX_RELOAD_REQUESTS) {
      const oldest = reloadRequests.keys().next().value;
      if (oldest) reloadRequests.delete(oldest);
    }

    try {
      await reloadPlugins();

      return res.json({
        success: true,
        message: 'Plugins reloaded successfully.',
        plugins: globalThis.plugins?.length || 0,
        commands: globalThis.commandMap?.size || 0
      });
    } catch (error) {
      logError('PLUGIN RELOAD', error);

      return res.status(500).json({
        success: false,
        error: 'Plugin reload failed.'
      });
    }
  }
);

// ======================================================
// MULTI-SESSION MANAGEMENT
// ======================================================

app.get('/api/sessions', protectDashboard, (_req, res) => {
  return res.json({ success: true, sessions: multiSessions.list().map(({ qr, ...session }) => session) });
});

app.get('/api/sessions/:id/qr', protectDashboard, async (req, res) => {
  try {
    const session = multiSessions.status(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found.' });
    return res.json({ success: true, qr: session.qr ? await QRCode.toDataURL(session.qr, { margin: 1, width: 240 }) : null });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Could not render session QR.' });
  }
});

app.post('/api/sessions', protectDashboard, async (req, res) => {
  try {
    const session = await multiSessions.start({
      id: req.body?.id,
      phoneNumber: req.body?.phoneNumber || ''
    });

    return res.status(201).json({
      success: true,
      session
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message || 'Could not start session.'
    });
  }
});

app.delete(
  '/api/sessions/:id',
  protectDashboard,
  async (req, res) => {
    try {
      const stoppedSession =
        await multiSessions.stop(req.params.id);

      return res.json({
        success: stoppedSession,

        message: stoppedSession
          ? 'Session stopped.'
          : 'Session not found.'
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// ======================================================
// LIVE LOGS, QR PAIRING AND DATABASE BACKUPS
// ======================================================

app.get('/api/logs', protectDashboard, (req, res) => {
  const after = Number(req.query.after || 0);
  const logs = dashboardLogs.filter(item => Date.parse(item.time) > after);
  return res.json({ success: true, logs: logs.slice(-150), latest: dashboardLogs.at(-1)?.time || null });
});

app.get('/api/pairing', protectDashboard, async (_req, res) => {
  try {
    return res.json({
      success: true,
      state: connectionState,
      connected: Boolean(globalThis.sock?.user),
      pairingCode: primaryPairingCode,
      qr: primaryQr ? await QRCode.toDataURL(primaryQr, { margin: 1, width: 260 }) : null
    });
  } catch (error) {
    logError('PAIRING QR', error);
    return res.status(500).json({ success: false, error: 'Could not render pairing QR.' });
  }
});

app.post('/api/backup', protectDashboard, async (_req, res) => {
  try {
    if (!databaseLoaded) return res.status(503).json({ success: false, error: 'Database is not ready.' });
    const source = path.resolve(config.databaseFile || './data/database.json');
    const backupDir = path.resolve('./backups');
    await fs.promises.mkdir(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `precious-md-database-${stamp}.json`;
    const destination = path.join(backupDir, fileName);
    await saveDatabase();
    await fs.promises.copyFile(source, destination);
    return res.json({ success: true, message: 'Database backup created.', fileName, size: (await fs.promises.stat(destination)).size });
  } catch (error) {
    logError('DATABASE BACKUP', error);
    return res.status(500).json({ success: false, error: 'Could not create database backup.' });
  }
});

app.get('/api/backup/download', protectDashboard, async (_req, res) => {
  try {
    if (!databaseLoaded) return res.status(503).json({ success: false, error: 'Database is not ready.' });
    await saveDatabase();
    const source = path.resolve(config.databaseFile || './data/database.json');
    return res.download(source, 'precious-md-database.json');
  } catch (error) {
    logError('DATABASE BACKUP DOWNLOAD', error);
    return res.status(500).json({ success: false, error: 'Could not download database backup.' });
  }
});

app.post('/api/backup/restore', protectDashboard, async (req, res) => {
  try {
    const payload = req.body?.database;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({ success: false, error: 'Upload a valid database JSON object.' });
    }
    for (const key of ['users', 'chats', 'groups']) {
      if (payload[key] !== undefined && (!payload[key] || typeof payload[key] !== 'object' || Array.isArray(payload[key]))) {
        return res.status(400).json({ success: false, error: `Invalid database section: ${key}.` });
      }
    }
    if (!databaseLoaded) return res.status(503).json({ success: false, error: 'Database is not ready.' });
    const source = path.resolve(config.databaseFile || './data/database.json');
    const backupDir = path.resolve('./backups');
    await fs.promises.mkdir(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await saveDatabase();
    await fs.promises.copyFile(source, path.join(backupDir, `before-restore-${stamp}.json`));
    globalThis.db = payload;
    await saveDatabase();
    await loadDatabase();
    logInfo('Database restored from dashboard upload.');
    return res.json({ success: true, message: 'Database restored successfully. A pre-restore backup was also created.' });
  } catch (error) {
    logError('DATABASE RESTORE', error);
    return res.status(500).json({ success: false, error: 'Database restore failed. The pre-restore backup is preserved.' });
  }
});

// ======================================================
// EXPRESS ERROR HANDLER
// ======================================================

app.use((error, _req, res, _next) => {
  logError('EXPRESS ERROR', error);

  if (res.headersSent) return;

  res.status(500).json({
    success: false,
    error: 'Internal server error.'
  });
});

// ======================================================
// DASHBOARD SERVER
// ======================================================

const server = app.listen(PORT, HOST, () => {
  logInfo(`Dashboard running on port ${PORT}`);
  logInfo('Dashboard authentication enabled.');
  logInfo(`Dashboard URL: http://localhost:${PORT}`);
});

server.on('error', error => {
  logError('EXPRESS SERVER', error);
});

// ======================================================
// TIMER MANAGEMENT
// ======================================================

function clearPairingTimer() {
  if (pairingTimer) {
    clearTimeout(pairingTimer);
    pairingTimer = null;
  }
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

// ======================================================
// SOCKET CLEANUP
// ======================================================

function cleanupSocket(sock) {
  if (activeSocket !== sock) return;

  activeSocket = null;

  if (globalThis.sock === sock) {
    globalThis.sock = null;
  }

  connectionState = 'disconnected';

  clearPairingTimer();
  stopReminderScheduler();

  try {
    stopAutomation(sock);
  } catch (error) {
    logError('AUTOMATION CLEANUP', error);
  }
}

// ======================================================
// RECONNECTION SYSTEM
// ======================================================

function scheduleReconnect(delay) {
  if (stopped || reconnectTimer) return;

  connectionState = 'reconnecting';

  logInfo(
    `Reconnecting in ${Math.ceil(delay / 1000)} seconds...`
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startBot();
  }, delay);

  reconnectTimer.unref?.();
}

function getReconnectDelay() {
  const base = 4000;

  const exponential = base * Math.pow(
    2,
    Math.min(Math.max(retryCount - 1, 0), 4)
  );

  const jitter = Math.floor(Math.random() * 1500);

  return Math.min(exponential + jitter, 60000);
}

// ======================================================
// DATABASE AND PLUGIN INITIALIZATION
// ======================================================

async function initializeProject() {
  if (!databaseLoaded) {
    logInfo('Loading database...');

    await loadDatabase();

    databaseLoaded = true;

    // Convert stored anti-delete settings into runtime config.
    applyBotSettings(globalThis.db?.settings || {});

    // Synchronize top-level settings into automation settings.
    syncAutomationSettings(
      globalThis.db?.settings || {},
      false
    );

    logInfo('Database loaded.');
  }

  if (!pluginsLoaded) {
    logInfo('Loading plugins...');

    await loadPlugins();

    pluginsLoaded = true;

    logInfo(
      `Loaded ${globalThis.plugins?.length || 0} plugins.`
    );

    logInfo(
      `Registered ${globalThis.commandMap?.size || 0} commands.`
    );
  }
}

// ======================================================
// MESSAGE DEDUPLICATION
// ======================================================

function getMessageId(message) {
  const id = message?.key?.id;
  if (!id) return null;

  const chat = message.key.remoteJid || '';
  const participant = message.key.participant || '';

  return `${chat}:${participant}:${id}`;
}

function rememberMessage(id) {
  if (!id) return false;
  if (processedMessages.has(id)) return false;

  processedMessages.add(id);

  if (processedMessages.size > MAX_PROCESSED_MESSAGES) {
    const oldest = processedMessages.values().next().value;
    if (oldest) processedMessages.delete(oldest);
  }

  return true;
}

// ======================================================
// MESSAGE PROCESSING
// ======================================================

async function processMessage(sock, message) {
  if (!message?.message) return;
  if (activeSocket !== sock) return;

  // Status updates are handled by automation.js.
  if (message?.key?.remoteJid === 'status@broadcast') {
    return;
  }

  const id = getMessageId(message);

  if (id && !rememberMessage(id)) return;

  try {
    stats.messages++;
    recordMessageActivity();
    await handleMessage(sock, message);
  } catch (error) {
    stats.errors++;
    logError('MESSAGE PROCESSING', error);
  }
}

// ======================================================
// PAIRING NUMBER
// ======================================================

function getPairingNumber() {
  return String(
    process.env.PAIRING_NUMBER ||
    config.pairingNumber ||
    ''
  ).replace(/\D/g, '');
}

// ======================================================
// MAIN WHATSAPP CONNECTION
// ======================================================

async function startBot() {
  if (starting || stopped || activeSocket) return;

  starting = true;
  connectionState = 'connecting';

  let sock = null;

  try {
    await initializeProject();

    const {
      state,
      saveCreds
    } = await useMultiFileAuthState(SESSION_DIR);

    const { version } = await fetchLatestBaileysVersion();

    logInfo(`WhatsApp version: ${version.join('.')}`);

    sock = makeWASocket({
      version,

      logger: pino({
        level: config.logLevel || 'silent'
      }),

      auth: state,
      browser: Browsers.ubuntu('Chrome'),
      printQRInTerminal: false,
      markOnlineOnConnect: true,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      getMessage: async () => undefined
    });

    activeSocket = sock;
    globalThis.sock = sock;

    // ==================================================
    // SAVE CREDENTIALS
    // ==================================================

    sock.ev.on('creds.update', async () => {
      try {
        await saveCreds();
      } catch (error) {
        logError('CREDENTIAL SAVE', error);
      }
    });

    // ==================================================
    // INSTALL EVENT MODULES
    // ==================================================

    // This installs anti-delete message caching and
    // deletion detection, plus group welcome/goodbye events.
    installEventHandlers(sock);

    // Automation receives status updates independently.
    installAutomationHandlers(sock);

    // ==================================================
    // INCOMING MESSAGES
    // ==================================================

    sock.ev.on(
      'messages.upsert',
      async ({ messages, type }) => {
        if (type !== 'notify') return;
        if (activeSocket !== sock) return;

        for (const message of messages || []) {
          if (activeSocket !== sock) break;

          if (
            message?.key?.remoteJid === 'status@broadcast'
          ) {
            continue;
          }

          await processMessage(sock, message);
        }
      }
    );

    // ==================================================
    // CONNECTION EVENTS
    // ==================================================

    sock.ev.on(
      'connection.update',
      async update => {
        if (activeSocket !== sock) return;

        const {
          connection,
          lastDisconnect,
          qr
        } = update;

        if (qr) {
          primaryQr = qr;
          primaryPairingCode = null;
        }

        if (qr && !getPairingNumber()) {
          console.log(
            '\n📱 Scan this QR with WhatsApp Linked Devices:\n'
          );

          qrcode.generate(qr, { small: true });
        }

        if (connection === 'connecting') {
          connectionState = 'connecting';
          logInfo('Connecting to WhatsApp...');
        }

        if (connection === 'open') {
          starting = false;
          retryCount = 0;
          connectionState = 'connected';
          primaryQr = null;
          primaryPairingCode = null;

          clearPairingTimer();
          clearReconnectTimer();

          stats.lastConnected = new Date().toISOString();

          console.log('');
          console.log('╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮');
          console.log('┃   PRECIOUS-MD CONNECTED    ┃');
          console.log('╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯');

          console.log(`🤖 Bot: ${config.botName || 'PRECIOUS-MD'}`);
          console.log(`👑 Creator: ${config.ownerName || 'Watson Fourpence'}`);
          console.log(`📱 Account: ${jidNormalizedUser(sock.user.id)}`);
          console.log(`🧩 Plugins: ${globalThis.plugins?.length || 0}`);
          console.log(`⚙️ Commands: ${globalThis.commandMap?.size || 0}`);
          console.log(`🗑️ Anti-delete: ${config.antiDelete ? 'ON' : 'OFF'}`);
          console.log(`🌐 Dashboard: http://localhost:${PORT}`);
          console.log(`❤️ Health: http://localhost:${PORT}/health`);

          try {
            startReminderScheduler(sock);
          } catch (error) {
            logError('REMINDER SCHEDULER', error);
          }
        }

        if (connection === 'close') {
          starting = false;
          clearPairingTimer();

          const status = lastDisconnect?.error
            ? new Boom(lastDisconnect.error).output?.statusCode
            : undefined;

          const loggedOut =
            status === DisconnectReason.loggedOut;

          stats.lastDisconnected = new Date().toISOString();

          cleanupSocket(sock);

          logError(
            'WHATSAPP CONNECTION CLOSED',
            status || lastDisconnect?.error || 'Unknown reason'
          );

          if (loggedOut) {
            connectionState = 'logged_out';
            primaryQr = null;
            primaryPairingCode = null;

            console.error(
              'Session logged out. Remove the old session and pair again.'
            );

            return;
          }

          retryCount++;
          stats.reconnects++;

          scheduleReconnect(getReconnectDelay());
        }
      }
    );

    // ==================================================
    // PAIRING CODE LOGIN
    // ==================================================

    const number = getPairingNumber();

    if (number && !state.creds.registered) {
      clearPairingTimer();

      pairingTimer = setTimeout(async () => {
        pairingTimer = null;

        if (stopped || activeSocket !== sock || sock.user) {
          return;
        }

        try {
          const code = await sock.requestPairingCode(number);
          primaryPairingCode = code;
          primaryQr = null;

          console.log('');
          console.log('╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮');
          console.log('┃   PRECIOUS-MD PAIRING CODE  ┃');
          console.log('╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯');
          console.log(`🔐 CODE: ${code}`);
          console.log('');
          console.log(
            'Enter this code in WhatsApp Linked Devices.'
          );
        } catch (error) {
          logError('PAIRING CODE', error);
        }
      }, 3000);

      pairingTimer.unref?.();
    }
  } catch (error) {
    starting = false;

    logError('BOT STARTUP FAILED', error);

    if (sock) {
      cleanupSocket(sock);

      try {
        sock.end(undefined);
      } catch {}
    }

    retryCount++;
    stats.reconnects++;

    scheduleReconnect(getReconnectDelay());
  }
}

// ======================================================
// GRACEFUL SHUTDOWN
// ======================================================

async function shutdown(signal) {
  if (shutdownPromise) return shutdownPromise;

  shutdownPromise = (async () => {
    stopped = true;
    starting = false;
    connectionState = 'stopping';

    console.log(
      `\n🛑 ${signal}: stopping ${config.botName || 'PRECIOUS-MD'}...`
    );

    clearReconnectTimer();
    clearPairingTimer();

    stopReminderScheduler();

    await multiSessions.stopAll();

    dashboardSessions.clear();

    const sock = activeSocket;

    activeSocket = null;
    globalThis.sock = null;

    if (sock) {
      try {
        stopAutomation(sock);
      } catch (error) {
        logError('AUTOMATION SHUTDOWN', error);
      }
    }

    try {
      if (databaseLoaded) {
        await saveDatabase();
        logInfo('Database saved.');
      }
    } catch (error) {
      logError('DATABASE SHUTDOWN', error);
    }

    if (sock) {
      try {
        sock.end(undefined);
      } catch (error) {
        logError('SOCKET SHUTDOWN', error);
      }
    }

    await new Promise(resolve => {
      if (!server.listening) {
        resolve();
        return;
      }

      const timeout = setTimeout(resolve, 3000);
      timeout.unref?.();

      server.close(() => {
        clearTimeout(timeout);
        resolve();
      });
    });

    connectionState = 'stopped';

    console.log(
      `👋 ${config.botName || 'PRECIOUS-MD'} stopped.`
    );

    process.exit(0);
  })();

  return shutdownPromise;
}

// ======================================================
// PROCESS ERROR HANDLING
// ======================================================

process.on('uncaughtException', error => {
  stats.errors++;
  logError('UNCAUGHT EXCEPTION', error);
});

process.on('unhandledRejection', error => {
  stats.errors++;
  logError('UNHANDLED REJECTION', error);
});

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ======================================================
// START APPLICATION
// ======================================================

console.log('');

console.log('╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮');
console.log('┃    PRECIOUS-MD STARTING    ┃');
console.log('╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯');

console.log(`👑 Creator: ${config.ownerName || 'Watson Fourpence'}`);
console.log(`🤖 Bot: ${config.botName || 'PRECIOUS-MD'}`);
console.log(`🟢 Node.js: ${process.version}`);
console.log(`🌐 Dashboard Port: ${PORT}`);
console.log('🔐 Dashboard Authentication: ENABLED');

console.log('');

await startBot();