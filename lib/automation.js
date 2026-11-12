
import config from '../config.js';
import { saveDatabase } from './database.js';

// ==================================================
// PRECIOUS-MD V3 AUTOMATION SYSTEM
// Created by Watson Fourpence
// ==================================================

// --------------------------------------------------
// CONFIGURATION
// --------------------------------------------------

const defaults = {
  autoread: config.readMessages ?? false,
  alwaysonline: config.alwaysOnline ?? false,
  autostatus: config.autoViewStatus ?? false,
  statusreact: config.autoStatusReact ?? false,
  autoreact: config.autoReact ?? false,
  anticall: config.antiCall ?? false,
  autotyping: config.autoTyping ?? false,
  autorecording: config.autoRecording ?? false,
  autobio: false,
  viewonce: false
};

const statusEmojis =
  Array.isArray(config.statusEmojis) &&
  config.statusEmojis.length
    ? config.statusEmojis.filter(
        emoji => typeof emoji === 'string' && emoji.trim()
      )
    : [
        '🔥', '❤️', '😂', '💚',
        '😍', '😮', '😢', '🙏',
        '👍', '👏', '😎', '🥰',
        '💯', '🤩', '😭', '✨'
      ];

const onlineTimers = new WeakMap();
const activeSockets = new Set();
const installedSockets = new WeakSet();
const onlineRequests = new WeakSet();
const bioTimers = new WeakMap();
const BIO_INTERVAL = 6 * 60 * 60 * 1000;

const processedCalls = new Map();
const processedStatuses = new Map();

const ONLINE_INTERVAL = 25000;
const CALL_CACHE_LIMIT = 1000;
const CALL_CACHE_TTL = 10 * 60 * 1000;

const STATUS_CACHE_LIMIT = 3000;
const STATUS_CACHE_TTL = 24 * 60 * 60 * 1000;

// ==================================================
// SETTINGS
// ==================================================

export function getAutomationSettings() {
  if (!globalThis.db) {
    throw new Error(
      'Database must be loaded before automation starts.'
    );
  }

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

  const saved = globalThis.db.settings.automation;

  for (const [key, value] of Object.entries(defaults)) {
    if (typeof saved[key] !== 'boolean') {
      saved[key] = value;
    }
  }

  return saved;
}

export function isAutomationEnabled(name) {
  if (!Object.hasOwn(defaults, name)) {
    return false;
  }

  return getAutomationSettings()[name] === true;
}

export async function setAutomation(name, enabled) {
  if (!Object.hasOwn(defaults, name)) {
    throw new Error(
      `Unknown automation setting: ${name}`
    );
  }

  if (typeof enabled !== 'boolean') {
    throw new TypeError(
      'Automation value must be true or false.'
    );
  }

  const settings = getAutomationSettings();

  settings[name] = enabled;

  await saveDatabase();

  if (name === 'alwaysonline') {
    for (const sock of activeSockets) {
      if (enabled) startOnlineTimer(sock);
      else stopOnlineTimer(sock);
    }
  }

  if (name === 'autobio') {
    for (const sock of activeSockets) {
      if (enabled) startBioTimer(sock);
      else stopBioTimer(sock);
    }
  }

  return settings[name];
}

// ==================================================
// ALWAYS ONLINE
// ==================================================

async function updateOnline(sock) {
  if (
    !sock ||
    !isAutomationEnabled('alwaysonline') ||
    onlineRequests.has(sock)
  ) {
    return;
  }

  onlineRequests.add(sock);

  try {
    await sock.sendPresenceUpdate('available');
  } catch (error) {
    console.error(
      '[ALWAYS ONLINE]',
      error.message
    );
  } finally {
    onlineRequests.delete(sock);
  }
}

function startOnlineTimer(sock) {
  if (!sock) return;

  stopOnlineTimer(sock);

  if (!isAutomationEnabled('alwaysonline')) {
    return;
  }

  updateOnline(sock).catch(() => {});

  const timer = setInterval(() => {
    updateOnline(sock).catch(() => {});
  }, ONLINE_INTERVAL);

  timer.unref?.();

  onlineTimers.set(sock, timer);
}

function stopOnlineTimer(sock) {
  if (!sock) return;

  const timer = onlineTimers.get(sock);

  if (timer) {
    clearInterval(timer);
    onlineTimers.delete(sock);
  }
}

// ==================================================
// AUTO BIO (WhatsApp profile About)
// ==================================================

async function updateBio(sock) {
  const text = String(globalThis.db?.settings?.autobioText || '').trim();
  if (!sock || !text || !isAutomationEnabled('autobio')) return;
  try {
    if (typeof sock.updateProfileStatus === 'function') {
      await sock.updateProfileStatus(text.slice(0, 139));
      console.log('[AUTO BIO] WhatsApp About updated.');
    }
  } catch (error) {
    console.error('[AUTO BIO]', error.message);
  }
}

function startBioTimer(sock) {
  if (!sock) return;
  stopBioTimer(sock);
  if (!isAutomationEnabled('autobio')) return;
  updateBio(sock).catch(() => {});
  const timer = setInterval(() => updateBio(sock).catch(() => {}), BIO_INTERVAL);
  timer.unref?.();
  bioTimers.set(sock, timer);
}

function stopBioTimer(sock) {
  const timer = sock && bioTimers.get(sock);
  if (timer) { clearInterval(timer); bioTimers.delete(sock); }
}

// ==================================================
// MESSAGE HELPERS
// ==================================================

function unwrapMessage(message = {}) {
  let current = message;

  const wrappers = [
    'ephemeralMessage',
    'documentWithCaptionMessage',
    'viewOnceMessage',
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension',
    'editedMessage'
  ];

  for (let i = 0; i < 20; i++) {
    if (!current || typeof current !== 'object') {
      break;
    }

    let next = null;

    for (const wrapper of wrappers) {
      const candidate = current[wrapper]?.message;

      if (
        candidate &&
        typeof candidate === 'object'
      ) {
        next = candidate;
        break;
      }
    }

    if (!next || next === current) {
      break;
    }

    current = next;
  }

  return current || {};
}

function isViewOnce(message = {}) {
  let current = message;

  for (let i = 0; i < 20; i++) {
    if (!current || typeof current !== 'object') {
      return false;
    }

    if (
      current.viewOnceMessage ||
      current.viewOnceMessageV2 ||
      current.viewOnceMessageV2Extension
    ) {
      return true;
    }

    const next =
      current.ephemeralMessage?.message ||
      current.documentWithCaptionMessage?.message ||
      current.editedMessage?.message;

    if (!next || next === current) {
      break;
    }

    current = next;
  }

  return false;
}

function randomEmoji() {
  return statusEmojis[
    Math.floor(Math.random() * statusEmojis.length)
  ];
}

function isStatusMessage(msg) {
  return msg?.key?.remoteJid === 'status@broadcast';
}

function isValidMessage(msg) {
  return Boolean(
    msg?.key?.remoteJid &&
    msg?.key?.id &&
    msg?.message
  );
}

// ==================================================
// STATUS CACHE
// ==================================================

function cleanStatusCache() {
  const now = Date.now();

  for (const [key, timestamp] of processedStatuses) {
    if (now - timestamp > STATUS_CACHE_TTL) {
      processedStatuses.delete(key);
    }
  }

  while (processedStatuses.size > STATUS_CACHE_LIMIT) {
    const oldest = processedStatuses.keys().next().value;

    if (oldest === undefined) break;

    processedStatuses.delete(oldest);
  }
}

function getStatusParticipant(msg) {
  const key = msg?.key || {};
  const candidates = [
    key.participant,
    msg?.participant,
    key.remoteJidAlt,
    msg?.key?.participantAlt
  ];
  return candidates.find(value => typeof value === 'string' && value.trim() && value !== 'status@broadcast') || null;
}

function getStatusKey(msg, participant = getStatusParticipant(msg)) {
  const key = msg?.key;
  if (!key?.id || !participant) return null;
  return `${participant}:${key.id}`;
}

// ==================================================
// STATUS AUTOMATION
// ==================================================

async function handleStatus(sock, msg) {
  const participant = getStatusParticipant(msg);
  if (!participant || msg?.key?.fromMe) return;

  const statusKey = getStatusKey(msg, participant);
  if (!statusKey) return;

  const readEnabled = isAutomationEnabled('autostatus');
  const reactEnabled = isAutomationEnabled('statusreact');
  if (!readEnabled && !reactEnabled) return;

  if (processedStatuses.has(statusKey)) return;
  cleanStatusCache();

  let allActionsSucceeded = true;

  // Status receipts must use the original status key. Some Baileys
  // forks expose sendReceipt as a fallback when readMessages rejects it.
  if (readEnabled) {
    let readSucceeded = false;
    try {
      await sock.readMessages([msg.key]);
      readSucceeded = true;
      console.log(`[STATUS READ] Viewed status from ${participant}`);
    } catch (firstError) {
      try {
        if (typeof sock.sendReceipt === 'function') {
          await sock.sendReceipt('status@broadcast', participant, [msg.key.id], 'read');
          readSucceeded = true;
          console.log(`[STATUS READ] Receipt fallback succeeded for ${participant}`);
        } else {
          throw firstError;
        }
      } catch (error) {
        console.error('[STATUS READ]', error?.message || error);
      }
    }
    if (!readSucceeded) allActionsSucceeded = false;
  }

  if (reactEnabled) {
    try {
      const emoji = randomEmoji();
      await sock.sendMessage(
        'status@broadcast',
        { react: { text: emoji, key: msg.key } },
        { statusJidList: [participant] }
      );
      console.log(`[STATUS REACT] ${emoji} -> ${participant}`);
    } catch (error) {
      console.error('[STATUS REACTION]', error?.message || error);
      allActionsSucceeded = false;
    }
  }

  // Cache only after at least one enabled action succeeds. Failed status
  // receipts remain eligible for a later retry instead of being discarded.
  if (allActionsSucceeded) {
    processedStatuses.set(statusKey, Date.now());
    cleanStatusCache();
  }
}

// ==================================================
// PRIVATE / GROUP MESSAGE AUTOMATION
// ==================================================

async function handleMessageAutomation(sock, msg) {
  if (!isValidMessage(msg)) return;

  const jid = msg.key.remoteJid;

  if (msg.key.fromMe) return;

  // Status messages must be processed separately.
  if (isStatusMessage(msg)) {
    await handleStatus(sock, msg);
    return;
  }

  // ------------------------------------------------
  // AUTO READ
  // ------------------------------------------------

  if (isAutomationEnabled('autoread')) {
    try {
      await sock.readMessages([msg.key]);
    } catch (error) {
      console.error(
        '[AUTOREAD]',
        error.message
      );
    }
  }

  // ------------------------------------------------
  // AUTO REACTION
  // ------------------------------------------------

  if (isAutomationEnabled('autoreact')) {
    try {
      await sock.sendMessage(jid, {
        react: {
          text: randomEmoji(),
          key: msg.key
        }
      });
    } catch (error) {
      console.error(
        '[AUTOREACT]',
        error.message
      );
    }
  }

  // ------------------------------------------------
  // VIEW ONCE DETECTION
  // ------------------------------------------------

  if (
    isAutomationEnabled('viewonce') &&
    isViewOnce(msg.message)
  ) {
    const content = unwrapMessage(msg.message);

    const type = Object.keys(content)[0] || 'unknown';

    console.log(
      `[PRECIOUS-MD] View-once message detected: ${type}`
    );
  }
}

// ==================================================
// ANTI-CALL
// ==================================================

function cleanProcessedCalls() {
  const now = Date.now();

  for (const [key, timestamp] of processedCalls) {
    if (now - timestamp > CALL_CACHE_TTL) {
      processedCalls.delete(key);
    }
  }

  while (processedCalls.size > CALL_CACHE_LIMIT) {
    const oldest = processedCalls.keys().next().value;

    if (oldest === undefined) break;

    processedCalls.delete(oldest);
  }
}

async function handleCalls(sock, calls) {
  if (!isAutomationEnabled('anticall')) return;

  const callList = Array.isArray(calls)
    ? calls
    : calls
      ? [calls]
      : [];

  for (const call of callList) {
    if (
      !call ||
      call.status !== 'offer' ||
      !call.id ||
      !call.from
    ) {
      continue;
    }

    const callKey = `${call.from}:${call.id}`;

    if (processedCalls.has(callKey)) {
      continue;
    }

    processedCalls.set(callKey, Date.now());

    cleanProcessedCalls();

    try {
      if (typeof sock.rejectCall === 'function') {
        await sock.rejectCall(
          call.id,
          call.from
        );
      }

      await sock.sendMessage(call.from, {
        text:
          '📵 Sorry, calls are disabled. Please message this user direct.'
      }).catch(() => {});

    } catch (error) {
      console.error(
        '[ANTI-CALL]',
        error.message
      );
    }
  }
}

// ==================================================
// CONNECTION MANAGEMENT
// ==================================================

function handleConnectionUpdate(sock, update) {
  if (update?.connection === 'open') {
    activeSockets.add(sock);

    startOnlineTimer(sock);
    startBioTimer(sock);

    return;
  }

  if (
    update?.connection === 'close' ||
    update?.connection === 'connecting'
  ) {
    stopOnlineTimer(sock);
    stopBioTimer(sock);

    if (update.connection === 'close') {
      activeSockets.delete(sock);
    }
  }
}

// ==================================================
// INSTALL EVENT HANDLERS
// ==================================================

export function installAutomationHandlers(sock) {
  if (!sock?.ev) {
    throw new Error(
      'A valid Baileys socket is required.'
    );
  }

  if (installedSockets.has(sock)) {
    return false;
  }

  installedSockets.add(sock);

  // ------------------------------------------------
  // CONNECTION EVENTS
  // ------------------------------------------------

  sock.ev.on(
    'connection.update',
    update => {
      try {
        handleConnectionUpdate(sock, update);
      } catch (error) {
        console.error(
          '[AUTOMATION CONNECTION]',
          error.message
        );
      }
    }
  );

  // Start if socket is already connected.
  if (sock.user) {
    activeSockets.add(sock);
    startOnlineTimer(sock);
    startBioTimer(sock);
  }

  // ------------------------------------------------
  // MESSAGE EVENTS
  // ------------------------------------------------

  sock.ev.on(
    'messages.upsert',
    async update => {
      if (
        !update ||
        !Array.isArray(update.messages)
      ) {
        return;
      }

      // Process status and normal incoming messages.
      // Status updates may arrive as notify or append.
      // Other automation is restricted to notify.

      for (const msg of update.messages) {
        try {
          if (isStatusMessage(msg)) {
            await handleMessageAutomation(
              sock,
              msg
            );

            continue;
          }

          if (update.type !== 'notify') {
            continue;
          }

          await handleMessageAutomation(
            sock,
            msg
          );

        } catch (error) {
          console.error(
            '[AUTOMATION]',
            error.message
          );
        }
      }
    }
  );

  // ------------------------------------------------
  // CALL EVENTS
  // ------------------------------------------------

  sock.ev.on(
    'call',
    async calls => {
      try {
        await handleCalls(sock, calls);
      } catch (error) {
        console.error(
          '[ANTI-CALL]',
          error.message
        );
      }
    }
  );

  console.log(
    '[PRECIOUS-MD] Automation handlers installed.'
  );

  return true;
}

// ==================================================
// TYPING / RECORDING PRESENCE
// ==================================================

export async function startProcessingPresence(sock, jid, audio = false) {
  const enabled = audio
    ? isAutomationEnabled('autorecording')
    : isAutomationEnabled('autotyping');

  if (!enabled || !sock || !jid) return async () => {};

  const presence = audio ? 'recording' : 'composing';
  const startedAt = Date.now();
  const MAX_PRESENCE_MS = 10_000;
  const HEARTBEAT_MS = 3_000;
  let stopped = false;
  let interval = null;
  let timeout = null;

  const send = async () => {
    if (stopped || Date.now() - startedAt >= MAX_PRESENCE_MS) return;
    try { await sock.sendPresenceUpdate(presence, jid); }
    catch (error) { console.error('[PRESENCE]', error.message); }
  };

  await send();
  interval = setInterval(() => { send().catch(() => {}); }, HEARTBEAT_MS);
  interval.unref?.();
  timeout = setTimeout(() => stop(), MAX_PRESENCE_MS);
  timeout.unref?.();

  async function stop() {
    if (stopped) return;
    stopped = true;
    if (interval) clearInterval(interval);
    if (timeout) clearTimeout(timeout);
    try { await sock.sendPresenceUpdate('paused', jid); }
    catch (error) { console.error('[PRESENCE STOP]', error.message); }
  }

  return stop;
}

// ==================================================
// CLEANUP
// ==================================================

export function stopAutomation(sock) {
  if (sock) {
    stopOnlineTimer(sock);
    stopBioTimer(sock);
    activeSockets.delete(sock);
    return;
  }

  for (const activeSocket of [...activeSockets]) {
    stopOnlineTimer(activeSocket);
    stopBioTimer(activeSocket);
    activeSockets.delete(activeSocket);
  }

  processedCalls.clear();
  processedStatuses.clear();
}
