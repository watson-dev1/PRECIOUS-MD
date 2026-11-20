import readline from 'readline'
import fs from 'fs'
import path from 'path'
import http from 'http'
import crypto from 'crypto'
import { spawn } from 'child_process'
import pino from 'pino'
import chalk from 'chalk'
import { fileURLToPath, pathToFileURL } from 'url'
import { useMultiFileAuthState, makeCacheableSignalKeyStore, BufferJSON, DisconnectReason, Browsers, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import { smsg, makeWASocket, bind, sendNotification, getGroupMetadata } from './lib/myfunc.js'
import { suppressSignalLogs } from './lib/filter.js'
import './config.js'

suppressSignalLogs()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pluginDir = path.join(__dirname, 'plugins')
const eventDir = path.join(__dirname, 'lib', 'events')

const settingsPath = path.join(__dirname, 'database', 'settings.json')
const cronPath = path.join(__dirname, 'database', 'cron.json')
const logBufferPath = path.join(__dirname, 'database', 'logs.json')
export const NEWSLETTER_IDS = ['120363424621387196@newsletter']
const environmentSettings = global.settingsDefaults || {}
const chatbotModes = new Set(['off', 'dm', 'group', 'all', 'mention'])
const defaultSettings = {
    prefix: '.',
    mode: 'public',
    chatbotMode: environmentSettings.chatbotMode || 'off',
    autoViewStatus: environmentSettings.autoViewStatus ?? false,
    autoLikeStatus: environmentSettings.autoLikeStatus ?? false,
    autoLikeStatusEmojis: environmentSettings.autoLikeStatusEmojis || ['🌝', '🇿🇼', '👏', '😂', '🥰', '🍃', '✅️', '😄', '😳', '🧡', '😪'],
    autoReact: environmentSettings.autoReact ?? false,
    autoReactEmojis: environmentSettings.autoReactEmojis || ['❤️‍🔥'],
    antiDelete: true,
    antiDeleteMode: 'dm',
    autoRead: environmentSettings.autoRead ?? false,
    autoRecording: environmentSettings.autoRecording ?? false,
    autoTyping: environmentSettings.autoTyping ?? false,
    autoRecordType: environmentSettings.autoRecordType ?? false,
    alwaysOnline: environmentSettings.alwaysOnline ?? false
}
try {
    const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    global.prefix = typeof saved.prefix === 'string' ? saved.prefix : defaultSettings.prefix
    global.botMode = saved.mode === 'public' ? 'public' : defaultSettings.mode
    global.chatbotMode = chatbotModes.has(saved.chatbotMode)
        ? saved.chatbotMode
        : typeof saved.chatbotEnabled === 'boolean'
            ? (saved.chatbotEnabled ? 'all' : 'off')
            : defaultSettings.chatbotMode
    global.autoViewStatus = typeof saved.autoViewStatus === 'boolean' ? saved.autoViewStatus : defaultSettings.autoViewStatus
    global.autoLikeStatus = typeof saved.autoLikeStatus === 'boolean' ? saved.autoLikeStatus : defaultSettings.autoLikeStatus
    global.autoLikeStatusEmojis = Array.isArray(saved.autoLikeStatusEmojis) && saved.autoLikeStatusEmojis.length
        ? (saved.autoLikeStatusEmojis.length === 1 && saved.autoLikeStatusEmojis[0] === '❤️‍🔥'
            ? [...defaultSettings.autoLikeStatusEmojis]
            : saved.autoLikeStatusEmojis.map(String).filter(Boolean))
        : defaultSettings.autoLikeStatusEmojis
    global.autoReact = typeof saved.autoReact === 'boolean' ? saved.autoReact : defaultSettings.autoReact
    global.autoReactEmojis = Array.isArray(saved.autoReactEmojis) && saved.autoReactEmojis.length
        ? saved.autoReactEmojis.map(String).filter(Boolean)
        : defaultSettings.autoReactEmojis
    global.antiDelete = saved.antiDelete === true
    global.antiDeleteMode = saved.antiDeleteMode === 'chat' ? 'chat' : 'dm'
    global.autoRead = typeof saved.autoRead === 'boolean' ? saved.autoRead : defaultSettings.autoRead
    global.autoRecording = typeof saved.autoRecording === 'boolean' ? saved.autoRecording : defaultSettings.autoRecording
    global.autoTyping = typeof saved.autoTyping === 'boolean' ? saved.autoTyping : defaultSettings.autoTyping
    global.autoRecordType = typeof saved.autoRecordType === 'boolean' ? saved.autoRecordType : defaultSettings.autoRecordType
    global.alwaysOnline = typeof saved.alwaysOnline === 'boolean' ? saved.alwaysOnline : defaultSettings.alwaysOnline
} catch {
    Object.assign(global, {
        prefix: defaultSettings.prefix,
        botMode: defaultSettings.mode,
        chatbotMode: defaultSettings.chatbotMode,
        autoViewStatus: defaultSettings.autoViewStatus,
        autoLikeStatus: defaultSettings.autoLikeStatus,
        autoLikeStatusEmojis: defaultSettings.autoLikeStatusEmojis,
        autoReact: defaultSettings.autoReact,
        autoReactEmojis: defaultSettings.autoReactEmojis,
        antiDelete: defaultSettings.antiDelete,
        antiDeleteMode: defaultSettings.antiDeleteMode,
        autoRead: defaultSettings.autoRead,
        autoRecording: defaultSettings.autoRecording,
        autoTyping: defaultSettings.autoTyping,
        autoRecordType: defaultSettings.autoRecordType,
        alwaysOnline: defaultSettings.alwaysOnline
    })
}

// ---------------------------------------------------------------------------
// Log buffer — feeds /api/logs and lives in memory + disk ring buffer
// ---------------------------------------------------------------------------
const LOG_LIMIT = 500
const logBuffer = []
try {
    const saved = JSON.parse(fs.readFileSync(logBufferPath, 'utf8'))
    if (Array.isArray(saved)) logBuffer.push(...saved.slice(-LOG_LIMIT))
} catch {}
function pushLog(level, message) {
    const entry = { time: new Date().toISOString(), level: String(level || 'info'), message: String(message || '') }
    logBuffer.push(entry)
    while (logBuffer.length > LOG_LIMIT) logBuffer.shift()
    try {
        fs.mkdirSync(path.dirname(logBufferPath), { recursive: true })
        fs.writeFileSync(logBufferPath, JSON.stringify(logBuffer.slice(-200)))
    } catch {}
}
const _origLog = console.log.bind(console)
const _origWarn = console.warn.bind(console)
const _origErr = console.error.bind(console)
console.log = (...args) => { _origLog(...args); pushLog('info', args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')) }
console.warn = (...args) => { _origWarn(...args); pushLog('warn', args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')) }
console.error = (...args) => { _origErr(...args); pushLog('error', args.map(a => typeof a === 'string' ? a : (a?.stack || JSON.stringify(a))).join(' ')) }

// ---------------------------------------------------------------------------
// Plugins / events
// ---------------------------------------------------------------------------
export const plugins = new Map()
export const eventHandlers = new Map()
const customPrefixPlugins = new Set()
const pluginCache = new Map()
const eventCache = new Map()
const watchers = new Map()
const pendingReloads = new Map()
let pluginStartupComplete = false
let eventStartupComplete = false
let cachedPluginFileCount = 0
let cachedCommandCount = 0

const followedNewslettersRuntime = new Set()
async function followConfiguredNewsletters(waClient) {
    if (!NEWSLETTER_IDS.length || typeof waClient.newsletterFollow !== 'function') return
    for (const jid of NEWSLETTER_IDS) {
        if (!jid?.endsWith('@newsletter') || followedNewslettersRuntime.has(jid)) continue
        try { await waClient.newsletterFollow(jid); followedNewslettersRuntime.add(jid) } catch {}
    }
}
function parseSessionData(raw) {
    const trimmed = String(raw || '').trim()
    if (trimmed.startsWith('{')) return JSON.parse(trimmed)
    return JSON.parse(Buffer.from(trimmed, 'base64').toString('utf-8'))
}
function getPluginFiles(dir) {
    let files = []
    if (!fs.existsSync(dir)) return files
    for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const full = path.join(dir, item.name)
        if (item.isDirectory()) files.push(...getPluginFiles(full))
        else if (item.isFile() && item.name.endsWith('.js')) files.push(full)
    }
    return files
}
async function loadPlugin(file) {
    try {
        const module = await import(`${pathToFileURL(file).href}?update=${Date.now()}`)
        let handler = module.default
        if (!handler) { console.warn(`[PLUGIN] ${path.relative(pluginDir, file)} has no default export`); return }
        if (typeof handler === 'object' && !Array.isArray(handler)) {
            const wrapped = handler.handler || handler.run || handler.execute
            if (typeof wrapped === 'function') {
                for (const k of Object.keys(handler)) {
                    if (k === 'handler' || k === 'run' || k === 'execute') continue
                    wrapped[k] = handler[k]
                }
                handler = wrapped
            }
        }
        if (typeof handler !== 'function') { console.warn(`[PLUGIN] ${path.relative(pluginDir, file)} default is not callable`); return }
        const wasLoaded = pluginCache.has(file)
        if (wasLoaded) {
            for (const key of pluginCache.get(file)) {
                if (typeof key === 'symbol') customPrefixPlugins.delete(key)
                else plugins.delete(key)
            }
        }
        const relative = path.relative(pluginDir, file)
        const parts = relative.split(path.sep)
        const derived = parts.length > 1 ? parts[0].replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null
        if (!handler.category && derived) handler.category = derived
        if (!handler.category) handler.category = 'Other'
        const keys = []
        const cmdList = handler.command
        if (cmdList && !(cmdList instanceof RegExp)) {
            const commands = Array.isArray(cmdList) ? cmdList : [cmdList]
            for (const cmd of commands) {
                if (cmd == null) continue
                const key = String(cmd).toLowerCase().trim()
                if (!key) continue
                const existing = plugins.get(key)
                if (existing && existing !== handler) {
                    console.warn(`[PLUGIN] Duplicate command ".${key}" in ${relative}; keeping the first registered handler.`)
                    continue
                }
                plugins.set(key, handler)
                keys.push(key)
            }
        }
        if (handler.customPrefix) {
            const key = Symbol(file)
            customPrefixPlugins.add(key)
            plugins.set(key, handler)
            keys.push(key)
        }
        pluginCache.set(file, keys)
        cachedPluginFileCount = pluginCache.size
        cachedCommandCount = [...pluginCache.values()].reduce((n, arr) => n + arr.filter(k => typeof k === 'string').length, 0)
        if (!keys.length) console.warn(`[PLUGIN] ${relative} registered 0 commands — skipped`)
        if (pluginStartupComplete) console.log(`[PLUGIN] ${wasLoaded ? 'Updated' : 'Added'} ${relative}`)
    } catch (e) {
        console.error(`[PLUGIN] Failed ${file}`, e)
    }
}
async function unloadPlugin(file) {
    if (!pluginCache.has(file)) return
    for (const key of pluginCache.get(file)) {
        if (typeof key === 'symbol') customPrefixPlugins.delete(key)
        else plugins.delete(key)
    }
    pluginCache.delete(file)
    cachedPluginFileCount = pluginCache.size
    cachedCommandCount = [...pluginCache.values()].reduce((n, arr) => n + arr.filter(k => typeof k === 'string').length, 0)
    console.log(`[PLUGIN] Unloaded ${path.relative(pluginDir, file)}`)
}
export async function initPlugins() {
    const files = getPluginFiles(pluginDir)
    for (const file of files) await loadPlugin(file)
    watch(pluginDir, loadPlugin, unloadPlugin)
    console.log(chalk.green(`[PLUGIN] Loaded ${pluginCache.size} file(s) → ${cachedCommandCount} command(s)`))
    pluginStartupComplete = true
}
export async function reloadPlugins() {
    const files = new Set(getPluginFiles(pluginDir))
    for (const file of [...pluginCache.keys()]) if (!files.has(file)) await unloadPlugin(file)
    for (const file of files) await loadPlugin(file)
}
async function loadEventFile(file) {
    try {
        const module = await import(`${pathToFileURL(file).href}?update=${Date.now()}`)
        const handler = module.default
        if (!handler || !handler.on) return
        const wasLoaded = eventCache.has(file)
        eventHandlers.set(file, handler)
        eventCache.set(file, true)
        if (eventStartupComplete && waClient) wireEventDispatchers(waClient)
        if (eventStartupComplete) console.log(`[EVENT] ${wasLoaded ? 'Updated' : 'Added'} ${path.relative(eventDir, file)}`)
    } catch (e) {
        console.error(`[EVENT] Failed ${file}`, e)
    }
}
async function unloadEventFile(file) {
    if (!eventCache.has(file)) return
    eventHandlers.delete(file)
    eventCache.delete(file)
    console.log(`[EVENT] Unloaded ${path.relative(eventDir, file)}`)
}
export async function initEvents() {
    const files = getPluginFiles(eventDir)
    for (const file of files) await loadEventFile(file)
    watch(eventDir, loadEventFile, unloadEventFile)
    console.log(chalk.green(`[EVENT] Loaded ${eventCache.size} event(s)`))
    eventStartupComplete = true
}
export async function reloadEvents() {
    const files = new Set(getPluginFiles(eventDir))
    for (const file of [...eventCache.keys()]) if (!files.has(file)) await unloadEventFile(file)
    for (const file of files) await loadEventFile(file)
}
const wiredDispatchers = new WeakMap()
function handlerEventNames(handler) {
    if (!handler?.on) return []
    return Array.isArray(handler.on) ? handler.on : [handler.on]
}
export function wireEventDispatchers(waClient) {
    if (!waClient) return
    let wired = wiredDispatchers.get(waClient)
    if (!wired) { wired = new Set(); wiredDispatchers.set(waClient, wired) }
    const names = new Set([...eventHandlers.values()].flatMap(handlerEventNames))
    for (const name of names) {
        if (wired.has(name)) continue
        wired.add(name)
        waClient.ev.on(name, async (data) => {
            if (name === 'messages.upsert' && (data?.type === 'notify' || data?.type === 'append')) {
                const messages = (data.messages || []).filter(raw => {
                    if (raw?.key?.remoteJid === 'status@broadcast') return true
                    if (data.type === 'append') return false
                    return acceptMessage(raw)
                })
                if (!messages.length) return
                data = { ...data, messages }
            }
            for (const handler of eventHandlers.values()) {
                if (!handlerEventNames(handler).includes(name)) continue
                const fn = typeof handler === 'function' ? handler : handler.handler
                if (typeof fn !== 'function') continue
                try { await fn(waClient, data) } catch (e) { console.error(`[EVENT] Error in handler for ${name}:`, e) }
            }
        })
    }
}
function watch(dir, loadFn, unloadFn) {
    if (watchers.has(dir)) return
    watchers.set(dir, fs.watch(dir, (_, filename) => {
        if (!filename) return
        const file = path.join(dir, filename)
        if (fs.existsSync(file) && fs.statSync(file).isDirectory()) { watch(file, loadFn, unloadFn); return }
        if (!filename.endsWith('.js')) return
        if (pendingReloads.has(file)) clearTimeout(pendingReloads.get(file))
        pendingReloads.set(file, setTimeout(async () => {
            pendingReloads.delete(file)
            if (fs.existsSync(file)) await loadFn(file)
            else await unloadFn(file)
        }, 200))
    }))
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) if (item.isDirectory()) watch(path.join(dir, item.name), loadFn, unloadFn)
}

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------
function extractCommandFromMessage(m) {
    let body = ''
    let isButtonResponse = false
    try {
        if (typeof m.text === 'string' && m.text) body = m.text
        if (m.message && !body) {
            if (m.message.conversation) body = m.message.conversation
            else if (m.message.extendedTextMessage?.text) body = m.message.extendedTextMessage.text
            else if (m.message.imageMessage?.caption) body = m.message.imageMessage.caption
            else if (m.message.videoMessage?.caption) body = m.message.videoMessage.caption
            else if (m.message.documentMessage?.caption) body = m.message.documentMessage.caption
            else if (m.message.interactiveResponseMessage) {
                const inter = m.message.interactiveResponseMessage
                if (inter.nativeFlowResponseMessage) {
                    const flow = inter.nativeFlowResponseMessage
                    if (flow.paramsJson) {
                        try { const params = JSON.parse(flow.paramsJson); body = params.id || params.buttonId || params.rowId || params.index || '' }
                        catch { body = flow.name || '' }
                    } else body = flow.name || ''
                    isButtonResponse = true
                } else if (inter.buttonReply) { body = inter.buttonReply.selectedButtonId || ''; isButtonResponse = true }
                else if (inter.singleSelectReply) { body = inter.singleSelectReply.selectedRowId || ''; isButtonResponse = true }
            } else if (m.message.templateButtonReplyMessage) { body = m.message.templateButtonReplyMessage.selectedId || ''; isButtonResponse = true }
            else if (m.message.buttonsResponseMessage) { body = m.message.buttonsResponseMessage.selectedButtonId || ''; isButtonResponse = true }
            else if (m.message?.stickerMessage) body = '__MENU_STICKER__'
        }
    } catch (error) { console.error('Error parsing message:', error) }
    return { body, isButtonResponse }
}
export default async function handleMessage(waClient, m) {
    try {
        const { body, isButtonResponse } = extractCommandFromMessage(m)
        if (m.isGroup && panelDb?.mutedGroups?.includes(m.chat) && !m.isOwner) return
        if (!body) return
        m.text = body
        m.isButtonResponse = isButtonResponse
        m.prefix = global.prefix || '.'
        m.pushName = m.pushName || m.name || m.sender?.split('@')[0] || 'User'
        if (typeof m.react !== 'function') m.react = emoji => waClient.sendMessage(m.chat, { react: { text: String(emoji), key: m.key } })
        if (global.botMode === 'self' && !m.isOwner && !m.fromMe) return
        const notifReply = async (text, title) => { try { await sendNotification(waClient, m, title, text) } catch {} }
        const logCommandUsage = (command, extra = '') => {
            panelDb.stats = panelDb.stats || { commands: 0, dailyMessages: {} }
            panelDb.stats.commands = (panelDb.stats.commands || 0) + 1
            const senderNumber = cleanNumber(m.sender)
            if (senderNumber && panelDb.users[senderNumber]) panelDb.users[senderNumber].totalCommands = (panelDb.users[senderNumber].totalCommands || 0) + 1
            savePanelDb()
            const from = m.isGroup ? `group ${m.chat}` : (m.isNewsletter ? `channel ${m.chat}` : 'DM')
            console.log(chalk.cyan('CMD ') + chalk.yellow(`${global.prefix || ''}${command}`) + chalk.white(` from `) + chalk.green(m.sender) + chalk.white(` (${from})`) + (extra ? chalk.magenta(` ${extra}`) : ''))
        }
        const checkAccess = handler => {
            const permissions = [
                ['group', m.isGroup, global.botMessage?.group],
                ['private', m.isDM, global.botMessage?.private],
                ['admin', m.isAdmin || (handler.ownerBypassAdmin && m.isOwner), global.botMessage?.admin],
                ['isBotAdmin', m.isBotAdmin, global.botMessage?.isBotAdmin],
                ['owner', m.isOwner, global.botMessage?.owner]
            ]
            for (const [key, allowed, message] of permissions) {
                if (handler[key] && !allowed) {
                    if (!handler.silentDeny) notifReply(message).catch(() => {})
                    return true
                }
            }
            return false
        }
        const invoke = (handler, args, text, command, prefix, usedPrefix) => handler(m, {
            waClient, conn: waClient, sock: waClient, jid: m.chat, args, text, command, prefix, usedPrefix,
            reply: value => m.reply(value), isAdmin: m.isAdmin, isOwner: m.isOwner, notifReply
        })
        if (isButtonResponse) {
            let bodyText = body
            const activePrefix = global.prefix || ''
            if (activePrefix && bodyText.startsWith(activePrefix)) bodyText = bodyText.slice(activePrefix.length)
            const args = bodyText.trim().split(/\s+/)
            const command = args.shift().toLowerCase()
            m.command = command
            const handler = plugins.get(command)
            if (!handler) return
            if (checkAccess(handler)) return
            logCommandUsage(command, '(button)')
            return await invoke(handler, args, args.join(' '), command, '', '')
        }
        if (customPrefixPlugins.size) {
            for (const key of customPrefixPlugins) {
                const handler = plugins.get(key)
                if (!handler?.customPrefix) continue
                if (!handler.customPrefix.test(m.text)) continue
                if (checkAccess(handler)) return
                const text = m.text.replace(handler.customPrefix, '').trim()
                logCommandUsage(handler.customPrefix.toString(), '(custom prefix)')
                return await invoke(handler, text ? text.split(/\s+/) : [], text, '', '', '')
            }
        }
        if (m.text === '__MENU_STICKER__') return
        const prefix = global.prefix || ''
        if (!prefix || !m.text.startsWith(prefix)) return
        const body2 = m.text.slice(prefix.length).trim()
        if (!body2) return
        const args = body2.split(/\s+/)
        const command = args.shift().toLowerCase()
        m.command = command
        const handler = plugins.get(command)
        if (!handler) return
        if (checkAccess(handler)) return
        logCommandUsage(command)
        await invoke(handler, args, args.join(' '), command, prefix, prefix)
    } catch (e) { console.error(e) }
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------
let rl = null
const question = text => {
    if (!rl) rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    return new Promise(resolve => {
        let settled = false
        const finish = value => { if (!settled) { settled = true; resolve(value) } }
        rl.question(text, finish)
        rl.once('close', () => finish(''))
    })
}
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

const cloneSessions = new Map()
const cloneRoot = path.join(__dirname, 'sessions')
function safeSessionId(value) {
    const id = String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32)
    if (!id || id === 'primary' || id === 'main') throw new Error('Choose a valid clone ID (letters, numbers, _ or -).')
    return id
}
async function startCloneSession(id, phoneNumber = '') {
    await loadRuntime()
    id = safeSessionId(id)
    if (cloneSessions.has(id)) throw new Error('That clone session already exists.')
    const dir = path.join(cloneRoot, id)
    fs.mkdirSync(dir, { recursive: true })
    const { state, saveCreds } = await useMultiFileAuthState(dir)
    let version
    try { version = (await fetchLatestBaileysVersion()).version } catch {}
    const logger = pino({ level: 'silent' })
    const record = { id, dir, state: 'connecting', phone: null, pairingCode: null, qr: null, lastError: null, socket: null, reconnectTimer: null, stopping: false, startedAt: Date.now() }
    cloneSessions.set(id, record)
    const socket = record.socket = makeWASocket({
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
        browser: Browsers.ubuntu('Chrome'), logger, ...(version ? { version } : {}),
        printQRInTerminal: false, markOnlineOnConnect: false, syncFullHistory: false,
        cachedGroupMetadata: async jid => getGroupMetadata(socket, jid),
        getMessage: async key => socket.getStoredMessage?.(key)
    })
    bind(socket)
    socket.ev.on('creds.update', saveCreds)
    socket.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify' || !messages?.length) return
        for (const raw of messages) {
            try {
                socket.rememberMessage?.(raw)
                if (!raw?.message || raw.key?.remoteJid === 'status@broadcast') continue
                const m = await smsg(socket, raw)
                if (m) await handleMessage(socket, m)
            } catch (error) { console.error(`[JADIBOT:${id}] Message error:`, error) }
        }
    })
    socket.ev.on('connection.update', async ({ connection, qr, lastDisconnect }) => {
        if (qr) {
            try { const QRCode = await import('qrcode'); record.qr = await (QRCode.default || QRCode).toDataURL(qr, { margin: 1, width: 300 }) } catch {}
        }
        if (connection === 'open') {
            record.state = 'connected'; record.qr = null; record.pairingCode = null
            record.phone = String(socket.user?.id || '').split(':')[0].split('@')[0]
            wireEventDispatchers(socket)
            await followConfiguredNewsletters(socket)
            if (global.alwaysOnline) { try { await socket.sendPresenceUpdate('available') } catch {} }
            console.log(`[JADIBOT:${id}] Connected as ${record.phone}`)
        }
        if (connection === 'close') {
            const code = getStatusCode(lastDisconnect)
            record.state = 'disconnected'
            record.lastError = lastDisconnect?.error?.message || `Connection closed (${code || 'unknown'})`
            if (code === DisconnectReason.loggedOut || code === 401) {
                try { socket.ev.removeAllListeners(); socket.ws?.close?.() } catch {}
                record.state = 'logged-out'
            } else if (!record.stopping) {
                record.reconnectTimer = setTimeout(async () => {
                    if (cloneSessions.get(id) !== record || record.stopping) return
                    cloneSessions.delete(id)
                    try { await startCloneSession(id) } catch (error) { console.warn(`[JADIBOT:${id}] Reconnect failed: ${error.message}`) }
                }, 5000)
                record.reconnectTimer.unref?.()
            }
        }
    })
    if (!state.creds.registered && phoneNumber) {
        const number = cleanNumber(phoneNumber)
        if (number.length < 7) { cloneSessions.delete(id); throw new Error('Valid phone number with country code required.') }
        try { await delay(1200); record.pairingCode = await socket.requestPairingCode(number); record.state = 'pairing' }
        catch (error) { record.lastError = error.message; record.state = 'error'; throw error }
    } else if (state.creds.registered) record.state = 'connecting'
    return record
}
async function stopCloneSession(id, removeFiles = false) {
    const record = cloneSessions.get(safeSessionId(id))
    if (!record) return false
    record.stopping = true
    if (record.reconnectTimer) clearTimeout(record.reconnectTimer)
    try { record.socket?.ev.removeAllListeners(); record.socket?.ws?.close?.() } catch {}
    cloneSessions.delete(record.id)
    if (removeFiles) fs.rmSync(record.dir, { recursive: true, force: true })
    return true
}

let waClient
let botConnected = false
let manuallyStopped = false
let pairingCode = null
let qrCodeDataUrl = null
let reconnectTimer = null
let reconnectStabilityTimer = null
const RECONNECT_STABLE_MS = 60_000
let pluginsLoaded = false
let eventsLoaded = false
let isConnecting = false
let connectionAnnounced = false
let logoutDetected = false
const BOT_START_TIME = Math.floor(Date.now() / 1000)
const gateResults = new WeakMap()
let reconnectAttempts = 0
const processedMessageKeys = new Map()
const MESSAGE_DEDUP_TTL = 5 * 60 * 1000
const MESSAGE_DEDUP_LIMIT = 10_000
const isWorker = process.argv.includes('--child')
let supervisorWorker = null
let supervisorStopping = false

async function loadRuntime() {
    if (!pluginsLoaded) { await initPlugins(); pluginsLoaded = true }
    if (!eventsLoaded) { await initEvents(); eventsLoaded = true }
}
function isDuplicateMessage(message) {
    const key = message?.key
    if (!key?.id) return false
    const cacheKey = [key.remoteJidAlt || key.remoteJid || '', key.participantAlt || key.participant || '', key.fromMe ? 'from-me' : 'from-user', key.id].join(':')
    const now = Date.now()
    const seenAt = processedMessageKeys.get(cacheKey)
    if (seenAt && now - seenAt < MESSAGE_DEDUP_TTL) return true
    processedMessageKeys.set(cacheKey, now)
    while (processedMessageKeys.size > MESSAGE_DEDUP_LIMIT) processedMessageKeys.delete(processedMessageKeys.keys().next().value)
    for (const [storedKey, storedAt] of processedMessageKeys) {
        if (now - storedAt < MESSAGE_DEDUP_TTL) break
        processedMessageKeys.delete(storedKey)
    }
    return false
}
function acceptMessage(raw) {
    if (gateResults.has(raw)) return gateResults.get(raw)
    const stamp = raw?.messageTimestamp
    const timestamp = Number(stamp?.toNumber?.() ?? stamp) || 0
    const accepted = !(timestamp && timestamp < BOT_START_TIME) && !isDuplicateMessage(raw)
    gateResults.set(raw, accepted)
    return accepted
}
const getStatusCode = lastDisconnect => {
    try {
        const error = lastDisconnect?.error
        if (!error) return 0
        const statusCode = error.output?.statusCode ?? error.statusCode ?? error.data?.statusCode ?? error.data?.output?.statusCode ?? error.cause?.output?.statusCode ?? error.cause?.statusCode ?? error.cause?.data?.statusCode
        return Number(statusCode) || 0
    } catch { return 0 }
}
function disableReconnectForLogout(message = 'Device logged out. Delete the session folder, then pair the bot again.') {
    if (logoutDetected) return
    logoutDetected = true
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    if (reconnectStabilityTimer) { clearTimeout(reconnectStabilityTimer); reconnectStabilityTimer = null }
    try { waClient?.ev.removeAllListeners(); waClient?.ws?.close?.() } catch {}
    waClient = null
    console.log(chalk.redBright(`[CONNECTION] ${message}`))
}
function restartBot(delay = 5000) {
    if (logoutDetected || manuallyStopped) return
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    reconnectTimer = setTimeout(() => { reconnectTimer = null; if (logoutDetected) return; start() }, delay)
}

async function start() {
    if (logoutDetected || manuallyStopped) return
    if (isConnecting) return
    isConnecting = true
    botConnected = false
    try {
        await loadRuntime()
        if (waClient) { waClient.ev.removeAllListeners(); waClient.ws?.close?.() }
        const credsPath = path.join(__dirname, 'session', 'creds.json')
        if ((!fs.existsSync(credsPath) || fs.statSync(credsPath).size === 0) && global.session) {
            try {
                const sessionData = parseSessionData(global.session)
                fs.mkdirSync(path.dirname(credsPath), { recursive: true })
                fs.writeFileSync(credsPath, JSON.stringify(sessionData, null, 2))
                console.log(chalk.greenBright('Session restored from SESSION_ID'))
            } catch { console.error(chalk.redBright(`Invalid SESSION_ID, falling back to pairing`)) }
        }
        const { state, saveCreds } = await useMultiFileAuthState('./session')
        let version
        try { const latest = await fetchLatestBaileysVersion(); version = latest.version } catch {}
        const logger = pino({ level: 'silent' })
        const socket = waClient = makeWASocket({
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
            browser: Browsers.ubuntu('Chrome'), logger,
            ...(version ? { version } : {}),
            printQRInTerminal: false, markOnlineOnConnect: false, syncFullHistory: false,
            cachedGroupMetadata: async (jid) => getGroupMetadata(waClient, jid),
            getMessage: async (key) => socket.getStoredMessage?.(key),
        })
        let socketOpened = false
        bind(socket)
        if (!state.creds.registered && process.stdin.isTTY) {
            console.log('Enter your number, for example: 263xxxxxxxxx or use the web control panel.')
            const number = (await question('Sending Code to: ')).replace(/\D/g, '')
            if (!number || number.length < 7) { rl?.close(); rl = null; throw new Error('Enter a valid phone number with country code.') }
            try {
                let code, error
                for (let attempt = 0; attempt < 2; attempt++) {
                    try { await delay(attempt ? 2500 : 1500); code = await waClient.requestPairingCode(number); if (code) break }
                    catch (requestError) { error = requestError }
                }
                if (!code) throw error || new Error('WhatsApp did not return a pairing code. Try again.')
                console.log(`PAIRING CODE: ${code}`)
            } catch (err) { console.error('Failed to send pairing code:', err.message); process.exit(1) }
            finally { rl?.close(); rl = null }
        }
        socket.ev.on('creds.update', async update => {
            if (socket !== waClient) return
            try {
                const temp = `${credsPath}.tmp`
                fs.writeFileSync(temp, JSON.stringify(state.creds, BufferJSON.replacer))
                fs.renameSync(temp, credsPath)
            } catch { await saveCreds(update) }
            if (update?.registered === false) disableReconnectForLogout()
        })
        socket.ev.on('messages.upsert', async ({ messages, type }) => {
            if (socket !== waClient) return
            if (!messages?.length) return
            for (const raw of messages) {
                socket.rememberMessage(raw)
                const remote = raw?.key?.remoteJid || ''
                if (!raw?.key?.fromMe && remote && remote !== 'status@broadcast' && !remote.endsWith('@newsletter')) {
                    panelDb.stats = panelDb.stats || {}
                    panelDb.stats.dailyMessages = panelDb.stats.dailyMessages || {}
                    const today = new Date().toISOString().slice(0, 10)
                    panelDb.stats.dailyMessages[today] = (panelDb.stats.dailyMessages[today] || 0) + 1
                    savePanelDb()
                }
                if (!raw?.key?.fromMe && !remote.endsWith('@g.us') && remote !== 'status@broadcast') {
                    try { ensurePanelUser(remote, raw.pushName || '', String(raw.message?.conversation || raw.message?.extendedTextMessage?.text || raw.message?.imageMessage?.caption || raw.message?.videoMessage?.caption || '[non-text message]').slice(0, 500)) } catch {}
                }
            }
            if (type !== 'notify') return
            for (const raw of messages) {
                if (!acceptMessage(raw)) continue
                setImmediate(async () => {
                    try {
                        let m = raw
                        if (!m?.message || m.key.remoteJid === 'status@broadcast') return
                        m = await smsg(socket, m)
                        if (m) await handleMessage(socket, m)
                    } catch (e) { console.error('[MESSAGE] Failed to process message:', e) }
                })
            }
        })
        socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
            if (socket !== waClient) return
            if (qr) {
                try {
                    const QRCode = await import('qrcode')
                    qrCodeDataUrl = await (QRCode.default || QRCode).toDataURL(qr, { margin: 1, width: 300 })
                } catch { qrCodeDataUrl = null }
            }
            const statusCode = getStatusCode(lastDisconnect)
            const errorMessage = [
                lastDisconnect?.error?.message, lastDisconnect?.error?.data?.message, lastDisconnect?.error?.data?.reason,
                lastDisconnect?.error?.output?.payload?.message, lastDisconnect?.error?.cause?.message, lastDisconnect?.error?.cause?.data?.message
            ].filter(Boolean).join(' ')
            if (connection === 'open') {
                botConnected = true
                qrCodeDataUrl = null
                pairingCode = null
                if (socketOpened) return
                socketOpened = true
                isConnecting = false
                if (globalThis.__preciousOnlinePresenceTimer) clearInterval(globalThis.__preciousOnlinePresenceTimer)
                if (global.alwaysOnline) {
                    try { await socket.sendPresenceUpdate('available') } catch (error) { console.warn('[PRESENCE] Initial online presence failed:', error?.message || error) }
                    globalThis.__preciousOnlinePresenceTimer = setInterval(() => {
                        if (socket === waClient && global.alwaysOnline) socket.sendPresenceUpdate('available').catch(error => console.warn('[PRESENCE] Keepalive failed:', error?.message || error))
                    }, 25000)
                    globalThis.__preciousOnlinePresenceTimer.unref?.()
                }
                if (reconnectStabilityTimer) clearTimeout(reconnectStabilityTimer)
                reconnectStabilityTimer = setTimeout(() => { reconnectStabilityTimer = null; if (socket === waClient && socketOpened) reconnectAttempts = 0 }, RECONNECT_STABLE_MS)
                if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
                wireEventDispatchers(socket)
                await followConfiguredNewsletters(socket)
                console.log(chalk.greenBright(`[CONNECTION] Connected as ${socket.decodeJid(socket.user.id)}`))
                if (!connectionAnnounced) {
                    connectionAnnounced = true
                    try {
                        const ownJid = socket.decodeJid(socket.user.id)
                        const botNumber = ownJid.split('@')[0]
                        await socket.sendMessage(ownJid, { text: `*${global.botName || 'PRECIOUS-MD'}*\n\nBot connected successfully.\n\nNumber: *${botNumber}*\nMode: *${global.botMode}* | Prefix: *${global.prefix || 'none'}*` })
                    } catch {}
                }
                return
            }
            if (connection === 'close') {
                if (globalThis.__preciousOnlinePresenceTimer) { clearInterval(globalThis.__preciousOnlinePresenceTimer); globalThis.__preciousOnlinePresenceTimer = null }
                notifyPanel('disconnect', 'WhatsApp connection lost.').catch(() => {})
                botConnected = false
                socketOpened = false
                isConnecting = false
                if (reconnectStabilityTimer) { clearTimeout(reconnectStabilityTimer); reconnectStabilityTimer = null }
                if (isLoggedOutDisconnect(statusCode)) { disableReconnectForLogout(); return }
                if (logoutDetected) return
                if (statusCode === DisconnectReason.connectionReplaced) { disableReconnectForLogout('Session opened on another instance.'); return }
                let delay = 1000
                if (statusCode !== DisconnectReason.restartRequired) {
                    const base = errorMessage.includes('Stream Errored') ? 15000 : (statusCode === DisconnectReason.connectionLost || statusCode === 0) ? 8000 : 5000
                    delay = Math.min(base * 2 ** Math.min(reconnectAttempts++, 4), 120000)
                }
                const reason = errorMessage.replace(/\s+/g, ' ').trim().slice(0, 120)
                const code = statusCode || 'unknown'
                const detail = reason ? `: ${reason}` : ''
                if (statusCode !== DisconnectReason.restartRequired) console.log(chalk.yellow(`[CONNECTION] Disconnected (${code}${detail}). Reconnecting in ${delay / 1000}s.`))
                restartBot(delay)
            }
        })
    } catch (e) {
        isConnecting = false
        if (!reconnectTimer) restartBot(10000)
    }
}

// ---------------------------------------------------------------------------
// Panel DB + HTTP helpers
// ---------------------------------------------------------------------------
const publicDir = path.join(__dirname, 'public')
const panelDbPath = path.join(__dirname, 'database', 'panel.json')
const panelSessions = new Map()
const panelAttempts = new Map()
const panelLockouts = new Map()
const panelStartedAt = Date.now()
const panelLastDeploy = process.env.DEPLOYED_AT || process.env.RENDER_GIT_COMMIT_CREATED_AT || null
const panelDb = (() => {
    try { return JSON.parse(fs.readFileSync(panelDbPath, 'utf8')) }
    catch { return { users: {}, banned: [], sudo: [], mutedGroups: [], notifications: { disconnect: true, newUser: true, error: true }, downloads: [] } }
})()
panelDb.users ||= {}
panelDb.banned ||= []
panelDb.stats ||= { commands: 0, dailyMessages: {} }
panelDb.notifications ||= { disconnect: true, newUser: true, error: true }
panelDb.mutedGroups ||= []
panelDb.sudo ||= []
global.panelMutedGroups = panelDb.mutedGroups
let _panelDbDirty = false
let _panelDbSaveTimer = null
function savePanelDb() {
    _panelDbDirty = true
    if (_panelDbSaveTimer) return
    _panelDbSaveTimer = setTimeout(() => {
        _panelDbSaveTimer = null
        if (!_panelDbDirty) return
        _panelDbDirty = false
        try {
            fs.mkdirSync(path.dirname(panelDbPath), { recursive: true })
            fs.writeFileSync(panelDbPath, JSON.stringify(panelDb, null, 2))
        } catch (e) { console.error('[PANEL] Failed to persist panel.json:', e?.message || e) }
    }, 1500)
    _panelDbSaveTimer.unref?.()
}
function flushPanelDbSync() {
    if (_panelDbSaveTimer) { clearTimeout(_panelDbSaveTimer); _panelDbSaveTimer = null }
    if (!_panelDbDirty) return
    _panelDbDirty = false
    try { fs.mkdirSync(path.dirname(panelDbPath), { recursive: true }); fs.writeFileSync(panelDbPath, JSON.stringify(panelDb, null, 2)) }
    catch (e) { console.error('[PANEL] Flush failed:', e?.message || e) }
}
function getPanelSettings() {
    try { return JSON.parse(fs.readFileSync(settingsPath, 'utf8')) } catch { return {} }
}
function savePanelSettings(value) {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
    const tmp = `${settingsPath}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2))
    fs.renameSync(tmp, settingsPath)
}
function cleanNumber(value) { return String(value || '').replace(/\D/g, '').slice(0, 15) }
function json(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    res.end(JSON.stringify(data))
}
function readBody(req, maxBytes = 12 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = []; let size = 0
        req.on('data', chunk => { size += chunk.length; if (size > maxBytes) { reject(new Error('Request too large')); req.destroy(); return } chunks.push(chunk) })
        req.on('end', () => {
            try {
                const raw = Buffer.concat(chunks).toString('utf8')
                const type = String(req.headers['content-type'] || '')
                if (type.includes('application/json')) resolve(raw ? JSON.parse(raw) : {})
                else if (type.includes('application/x-www-form-urlencoded')) resolve(Object.fromEntries(new URLSearchParams(raw)))
                else resolve({ raw })
            } catch { reject(new Error('Invalid request body')) }
        })
        req.on('error', reject)
    })
}
async function passwordHash(password) {
    const imported = await import('bcryptjs')
    const bcrypt = imported.default || imported
    return bcrypt.hash(String(password), 12)
}
async function passwordMatches(password, hash) {
    const imported = await import('bcryptjs')
    const bcrypt = imported.default || imported
    return bcrypt.compare(String(password), String(hash))
}
function savedPasswordHash() {
    if (process.env.PANEL_PASSWORD) return null
    const settings = getPanelSettings()
    return settings.panelPasswordHash || null
}
function isPanelAuthed(req) {
    if (process.env.PANEL_PASSWORD && req.headers['x-panel-password'] === process.env.PANEL_PASSWORD) return true
    const token = String(req.headers['x-dashboard-token'] || '')
    const entry = panelSessions.get(token)
    if (!entry || entry.expires < Date.now()) { if (token) panelSessions.delete(token); return false }
    entry.expires = Date.now() + 12 * 60 * 60 * 1000
    return true
}
function authToken() {
    const token = crypto.randomBytes(32).toString('hex')
    panelSessions.set(token, { expires: Date.now() + 12 * 60 * 60 * 1000 })
    return token
}
async function notifyPanel(kind, message) {
    try {
        if (!panelDb.notifications?.[kind] || !waClient || !botConnected) return
        const owner = String(global.ownerNumber || '').replace(/\D/g, '')
        if (!owner) return
        await waClient.sendMessage(`${owner}@s.whatsapp.net`, { text: `PRECIOUS-MD panel notification\n${message}` })
    } catch {}
}
function ensurePanelUser(jid, pushName = '', messageText = '') {
    const number = cleanNumber(String(jid || '').split('@')[0])
    if (!number || String(jid).endsWith('@g.us')) return
    const isNew = !panelDb.users[number]
    const existing = panelDb.users[number] || { number, totalCommands: 0, messages: 0, firstSeen: new Date().toISOString() }
    if (isNew) notifyPanel('newUser', `New user: ${number}`).catch(() => {})
    existing.name = String(pushName || existing.name || '')
    existing.messages = (existing.messages || 0) + 1
    const today = new Date().toISOString().slice(0, 10)
    existing.daily = existing.daily || {}
    existing.daily[today] = (existing.daily[today] || 0) + 1
    existing.lastMessage = new Date().toISOString()
    existing.history = Array.isArray(existing.history) ? existing.history : []
    if (messageText) existing.history.push({ at: existing.lastMessage, text: String(messageText).slice(0, 500) })
    existing.history = existing.history.slice(-50)
    panelDb.users[number] = existing
    savePanelDb()
}

// ---------------------------------------------------------------------------
// Cron helpers (no external deps)
// ---------------------------------------------------------------------------
function readCronJobs() {
    try { const d = JSON.parse(fs.readFileSync(cronPath, 'utf8')); return Array.isArray(d) ? d : [] }
    catch { return [] }
}
function writeCronJobs(list) {
    try {
        fs.mkdirSync(path.dirname(cronPath), { recursive: true })
        const tmp = `${cronPath}.tmp`
        fs.writeFileSync(tmp, JSON.stringify(list, null, 2))
        fs.renameSync(tmp, cronPath)
        return true
    } catch (e) { console.error('[CRON] write failed:', e?.message || e); return false }
}
function matchCronField(value, field) {
    if (field === '*' || field === '?') return true
    for (const part of String(field).split(',')) {
        const stepMatch = part.match(/^(\*|\d+(?:-\d+)?)\/(\d+)$/)
        if (stepMatch) {
            const step = Number(stepMatch[2]); if (!step) continue
            const start = stepMatch[1] === '*' ? 0 : Number(stepMatch[1].split('-')[0])
            if (value >= start && (value - start) % step === 0) return true
            continue
        }
        const rangeMatch = part.match(/^(\d+)-(\d+)$/)
        if (rangeMatch) { const a = Number(rangeMatch[1]), b = Number(rangeMatch[2]); if (value >= a && value <= b) return true; continue }
        if (/^\d+$/.test(part) && Number(part) === value) return true
    }
    return false
}
function matchesCron(date, expression) {
    const fields = String(expression || '').trim().split(/\s+/)
    if (fields.length !== 5) return false
    const [minF, hourF, dayF, monthF, weekF] = fields
    return matchCronField(date.getMinutes(), minF) && matchCronField(date.getHours(), hourF) &&
        matchCronField(date.getDate(), dayF) && matchCronField(date.getMonth() + 1, monthF) &&
        matchCronField(date.getDay(), weekF)
}
let cronTimer = null
let lastCronMinute = null
function startCronScheduler() {
    if (cronTimer) clearInterval(cronTimer)
    cronTimer = setInterval(async () => {
        if (!waClient?.user?.id) return
        const now = new Date()
        const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`
        if (key === lastCronMinute) return
        lastCronMinute = key
        const jobs = readCronJobs()
        if (!jobs.length) return
        for (const job of jobs) {
            if (!job?.cron || !job?.chat) continue
            if (!matchesCron(now, job.cron)) continue
            try {
                const payload = {}
                if (job.image) { payload.image = job.image; payload.caption = job.text || '' }
                else payload.text = job.text || ''
                if (!payload.text && !payload.image) continue
                await waClient.sendMessage(job.chat, payload)
                job.lastRun = now.toISOString()
                console.log(`[CRON] ✓ Sent ${job.id} → ${job.chat}`)
            } catch (err) { console.error(`[CRON] ✗ ${job.id} send failed:`, err?.message || err) }
        }
        writeCronJobs(jobs)
    }, 30_000)
    cronTimer.unref?.()
    console.log('[CRON] Scheduler started (30s interval)')
}
function stopCronScheduler() { if (cronTimer) { clearInterval(cronTimer); cronTimer = null } }

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost')
    const pathname = url.pathname
    try {
        // --- auth status ---
        if (req.method === 'GET' && (pathname === '/api/auth/status' || pathname === '/api/auth/configured')) {
            return json(res, 200, { configured: Boolean(process.env.PANEL_PASSWORD || savedPasswordHash()), envOverride: Boolean(process.env.PANEL_PASSWORD) })
        }
        // --- setup ---
        if (req.method === 'POST' && pathname === '/api/auth/setup') {
            const body = await readBody(req, 4096)
            if (process.env.PANEL_PASSWORD) return json(res, 409, { error: 'PANEL_PASSWORD is set in hosting. Use that password to log in.' })
            if (savedPasswordHash()) return json(res, 409, { error: 'A panel password already exists. Log in first.' })
            const password = String(body.password || '')
            if (password.length < 6) return json(res, 400, { error: 'Password must contain at least 6 characters.' })
            if (password !== String(body.confirmPassword || '')) return json(res, 400, { error: 'Passwords do not match.' })
            const settings = getPanelSettings()
            settings.panelPasswordHash = await passwordHash(password)
            savePanelSettings(settings)
            return json(res, 201, { ok: true, success: true, token: authToken(), message: 'Panel password created.' })
        }
        // --- login (both routes) ---
        if (req.method === 'POST' && (pathname === '/api/auth/login' || pathname === '/api/login')) {
            const body = await readBody(req, 4096)
            const ip = req.socket.remoteAddress || 'unknown'
            const lockedUntil = panelLockouts.get(ip) || 0
            if (lockedUntil > Date.now()) return json(res, 429, { error: 'Too many attempts. Try again in one minute.', retryAfter: Math.ceil((lockedUntil - Date.now()) / 1000) })
            const password = String(body.password || '')
            const envPass = process.env.PANEL_PASSWORD
            const hash = savedPasswordHash()
            const valid = envPass ? password === envPass : (hash ? await passwordMatches(password, hash) : false)
            if (!valid) {
                const attempts = (panelAttempts.get(ip) || 0) + 1
                panelAttempts.set(ip, attempts)
                if (attempts >= 3) { panelLockouts.set(ip, Date.now() + 60000); panelAttempts.delete(ip) }
                return json(res, 401, { error: 'Incorrect password.' })
            }
            panelAttempts.delete(ip); panelLockouts.delete(ip)
            const token = authToken()
            return json(res, 200, { ok: true, success: true, token, message: 'Unlocked.' })
        }
        // --- logout (both routes) ---
        if (req.method === 'POST' && (pathname === '/api/auth/logout' || pathname === '/api/logout')) {
            const token = String(req.headers['x-dashboard-token'] || '')
            if (token) panelSessions.delete(token)
            return json(res, 200, { ok: true, success: true, message: 'Dashboard session locked.' })
        }
        // --- change password ---
        if (req.method === 'POST' && pathname === '/api/auth/change-password') {
            if (!isPanelAuthed(req)) return json(res, 401, { error: 'Authentication required.' })
            const body = await readBody(req, 4096)
            if (process.env.PANEL_PASSWORD) return json(res, 403, { error: 'Password is managed by PANEL_PASSWORD in hosting environment.' })
            const hash = savedPasswordHash()
            if (!hash || !(await passwordMatches(String(body.oldPassword || ''), hash))) return json(res, 401, { error: 'Old password is incorrect.' })
            const next = String(body.newPassword || '')
            if (next.length < 6) return json(res, 400, { error: 'New password must contain at least 6 characters.' })
            if (next !== String(body.confirmPassword || '')) return json(res, 400, { error: 'New passwords do not match.' })
            const settings = getPanelSettings(); settings.panelPasswordHash = await passwordHash(next); savePanelSettings(settings)
            panelSessions.clear()
            return json(res, 200, { ok: true, success: true, message: 'Password changed. Please log in again.' })
        }
        // --- health (unauth) ---
        if (req.method === 'GET' && pathname === '/health') {
            return json(res, 200, {
                success: true, ok: botConnected, connected: botConnected,
                connection: botConnected ? 'open' : 'closed',
                database: fs.existsSync(settingsPath),
                pluginsLoaded,
                uptime: Math.floor(process.uptime()),
                timestamp: new Date().toISOString()
            })
        }
        // --- basic unauth status ---
        if (req.method === 'GET' && pathname === '/api/status' && !isPanelAuthed(req)) {
            return json(res, 200, {
                botName: 'PRECIOUS-MD',
                status: botConnected ? 'Online' : (manuallyStopped ? 'Stopped' : 'Offline'),
                connected: botConnected,
                mode: global.botMode || 'public',
                uptime: Math.floor(process.uptime())
            })
        }
        // --- authenticated API ---
        if (pathname.startsWith('/api/')) {
            if (!isPanelAuthed(req)) return json(res, 401, { error: 'Authentication required. Unlock the dashboard first.' })

            // dashboard aggregate
            if (req.method === 'GET' && pathname === '/api/dashboard') {
                const categories = {}
                for (const plugin of plugins.values()) {
                    if (!plugin?.command || plugin.command instanceof RegExp) continue
                    const cat = plugin.category || 'Other'
                    categories[cat] = (categories[cat] || 0) + 1
                }
                return json(res, 200, {
                    bot: {
                        name: global.botName || 'PRECIOUS-MD',
                        owner: global.ownerName || 'Watson Fourpence',
                        connected: botConnected,
                        connection: botConnected ? 'open' : 'closed',
                        mode: global.botMode || 'public'
                    },
                    plugins: { files: cachedPluginFileCount, commands: cachedCommandCount, plugins: pluginCache.size, categories },
                    system: { uptime: Math.floor(process.uptime()) },
                    database: { loaded: fs.existsSync(settingsPath) },
                    statistics: {
                        messages: Object.values(panelDb.stats?.dailyMessages || {}).reduce((a, b) => a + b, 0),
                        commands: panelDb.stats?.commands || 0,
                        errors: 0, reconnects: reconnectAttempts
                    }
                })
            }
            // plugins registry
            if (req.method === 'GET' && pathname === '/api/plugins') {
                const list = []
                const seen = new Set()
                for (const plugin of plugins.values()) {
                    if (seen.has(plugin)) continue
                    seen.add(plugin)
                    if (!plugin?.command) continue
                    const cmds = Array.isArray(plugin.command) ? plugin.command : [plugin.command]
                    list.push({
                        command: cmds[0],
                        aliases: cmds.slice(1),
                        category: plugin.category || 'Other',
                        description: plugin.description || '',
                        name: cmds[0]
                    })
                }
                return json(res, 200, { plugins: list, total: list.length })
            }
            // reload plugins
            if (req.method === 'POST' && pathname === '/api/plugins/reload') {
                try {
                    await reloadPlugins()
                    return json(res, 200, { ok: true, message: `Reloaded ${pluginCache.size} plugin(s).` })
                } catch (e) { return json(res, 500, { error: e.message || 'Reload failed.' }) }
            }
            // commands registry
            if (req.method === 'GET' && pathname === '/api/commands') {
                const list = []
                for (const [key, plugin] of plugins.entries()) {
                    if (typeof key !== 'string') continue
                    if (!plugin?.command) continue
                    const cmds = Array.isArray(plugin.command) ? plugin.command : [plugin.command]
                    list.push({
                        command: key,
                        aliases: cmds.filter(c => String(c).toLowerCase() !== key),
                        category: plugin.category || 'Other',
                        description: plugin.description || '',
                        name: key
                    })
                }
                return json(res, 200, { commands: list, total: list.length })
            }
            // system info
            if (req.method === 'GET' && pathname === '/api/system') {
                const mem = process.memoryUsage()
                return json(res, 200, {
                    process: { version: process.version, platform: process.platform, architecture: process.arch, pid: process.pid },
                    cpu: process.cpuUsage(),
                    memory: { heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, rss: mem.rss },
                    uptime: Math.floor(process.uptime())
                })
            }
            // logs
            if (req.method === 'GET' && pathname === '/api/logs') {
                return json(res, 200, { logs: logBuffer.slice(-200) })
            }
            // pairing state
            if (req.method === 'GET' && pathname === '/api/pairing') {
                return json(res, 200, {
                    connected: botConnected,
                    state: botConnected ? 'connected' : (qrCodeDataUrl ? 'qr-ready' : (pairingCode ? 'pairing-code' : 'waiting')),
                    qr: qrCodeDataUrl,
                    pairingCode
                })
            }
            // Primary and Jadibot clone sessions (all clones share config and plugins)
            if (req.method === 'GET' && pathname === '/api/sessions') {
                const sessions = [{ id: 'primary', type: 'primary', state: botConnected ? 'connected' : 'disconnected', phone: waClient?.user?.id ? String(waClient.user.id).split(':')[0].split('@')[0] : null, pairingCode }]
                for (const item of cloneSessions.values()) sessions.push({ id: item.id, type: 'clone', state: item.state, phone: item.phone, pairingCode: item.pairingCode, qr: item.qr, lastError: item.lastError })
                return json(res, 200, { sessions, shared: { config: true, plugins: true } })
            }
            if (req.method === 'POST' && pathname === '/api/sessions') {
                const body = await readBody(req, 4096)
                try {
                    const item = await startCloneSession(body.id, body.phoneNumber || '')
                    return json(res, 201, { session: { id: item.id, type: 'clone', state: item.state, phone: item.phone, pairingCode: item.pairingCode, qr: item.qr } })
                } catch (e) { return json(res, 400, { error: e.message || 'Could not start clone session.' }) }
            }
            if (req.method === 'GET' && /^\/api\/sessions\/[^/]+\/qr$/.test(pathname)) {
                const id = decodeURIComponent(pathname.split('/')[3])
                const item = cloneSessions.get(id)
                return json(res, item ? 200 : 404, item ? { qr: item.qr, pairingCode: item.pairingCode, state: item.state } : { error: 'Clone session not found.' })
            }
            if (req.method === 'DELETE' && /^\/api\/sessions\/[^/]+$/.test(pathname)) {
                const id = decodeURIComponent(pathname.split('/').pop())
                if (id === 'primary') return json(res, 400, { error: 'Primary session is managed separately.' })
                try { const removed = await stopCloneSession(id, false); return json(res, removed ? 200 : 404, { ok: removed, message: removed ? 'Clone disconnected. Session files retained for relinking.' : 'Clone session not found.' }) }
                catch (e) { return json(res, 400, { error: e.message }) }
            }
            if (req.method === 'DELETE' && /^\/api\/sessions\/[^/]+\/data$/.test(pathname)) {
                const id = decodeURIComponent(pathname.split('/')[3])
                try { await stopCloneSession(id, true); return json(res, 200, { ok: true, message: 'Clone session and local credentials deleted.' }) }
                catch (e) { return json(res, 400, { error: e.message }) }
            }
            // status (auth)
            if (req.method === 'GET' && pathname === '/api/status') {
                return json(res, 200, {
                    botName: 'PRECIOUS-MD', displayName: global.ownerName || 'watsonxd',
                    ownerNumber: global.ownerNumber || '', ownerTitle: 'Zimbabwe guy',
                    status: botConnected ? 'Online' : (manuallyStopped ? 'Stopped' : 'Offline'),
                    connected: botConnected, mode: global.botMode || 'public',
                    uptime: Math.floor(process.uptime()), runtime: Math.floor(process.uptime()),
                    lastRestart: new Date(panelStartedAt).toISOString(), lastDeploy: panelLastDeploy,
                    hosting: process.env.RENDER ? 'Render' : process.env.DYNO ? 'Heroku' : 'Node.js',
                    memory: process.memoryUsage(), cpu: process.cpuUsage(),
                    plugins: cachedPluginFileCount, commands_loaded: cachedCommandCount,
                    commands: panelDb.stats?.commands || 0,
                    messagesToday: panelDb.stats?.dailyMessages?.[new Date().toISOString().slice(0, 10)] || 0,
                    pairingCode, qr: qrCodeDataUrl
                })
            }
            // settings (GET) — return flat + wrapped shape for both old & new frontends
            if (req.method === 'GET' && pathname === '/api/settings') {
                const s = getPanelSettings()
                delete s.panelPasswordHash
                const flat = {
                    prefix: s.prefix ?? global.prefix ?? '.',
                    mode: s.mode ?? global.botMode ?? 'public',
                    publicMode: (global.botMode || 'public') === 'public',
                    readMessages: Boolean(global.autoRead),
                    autoRead: Boolean(global.autoRead),
                    alwaysOnline: Boolean(global.alwaysOnline),
                    autoTyping: Boolean(global.autoTyping),
                    autoRecording: Boolean(global.autoRecording),
                    autoReact: Boolean(global.autoReact),
                    autoReactEmojis: global.autoReactEmojis || defaultSettings.autoReactEmojis,
                    autoViewStatus: Boolean(global.autoViewStatus),
                    autoStatusReact: Boolean(global.autoLikeStatus),
                    autoLikeStatus: Boolean(global.autoLikeStatus),
                    autoLikeStatusEmojis: global.autoLikeStatusEmojis || defaultSettings.autoLikeStatusEmojis,
                    statusEmojis: global.autoLikeStatusEmojis || defaultSettings.autoLikeStatusEmojis,
                    antiCall: Boolean(s.antiCall),
                    antiDelete: Boolean(global.antiDelete),
                    antiDeleteMode: global.antiDeleteMode || 'dm',
                    antiDeleteNotify: Boolean(s.antiDeleteNotify),
                    aiEnabled: (global.chatbotMode || 'off') !== 'off',
                    chatbotMode: global.chatbotMode || 'off',
                    aiModel: s.aiModel || 'watson',
                    aiPersonality: s.aiPersonality || ''
                }
                return json(res, 200, { ...flat, settings: flat })
            }
            // settings PUT / PATCH
            if ((req.method === 'PUT' || req.method === 'PATCH') && pathname === '/api/settings') {
                const body = await readBody(req, 20000)
                const s = getPanelSettings()

                // prefix / mode
                if (body.prefix !== undefined) { s.prefix = String(body.prefix).slice(0, 5); global.prefix = s.prefix }
                if (body.mode !== undefined) {
                    const mode = String(body.mode) === 'private' || String(body.mode) === 'self' ? 'self' : 'public'
                    s.mode = mode; global.botMode = mode
                }
                if (body.publicMode !== undefined) {
                    const mode = body.publicMode ? 'public' : 'self'
                    s.mode = mode; global.botMode = mode
                }

                // boolean automation
                const mapBoolean = {
                    readMessages: 'autoRead', autoRead: 'autoRead',
                    alwaysOnline: 'alwaysOnline',
                    autoTyping: 'autoTyping',
                    autoRecording: 'autoRecording',
                    autoReact: 'autoReact',
                    autoViewStatus: 'autoViewStatus',
                    autoStatusReact: 'autoLikeStatus', autoLikeStatus: 'autoLikeStatus',
                    antiDelete: 'antiDelete'
                }
                for (const [src, dst] of Object.entries(mapBoolean)) {
                    if (typeof body[src] === 'boolean') {
                        global[dst] = body[src]
                        s[dst] = body[src]
                    }
                }
                if (body.antiCall !== undefined) s.antiCall = Boolean(body.antiCall)
                if (body.antiDeleteMode !== undefined) {
                    const m = ['all', 'chat', 'private', 'group', 'dm'].includes(body.antiDeleteMode) ? body.antiDeleteMode : 'dm'
                    global.antiDeleteMode = m; s.antiDeleteMode = m
                }
                if (body.antiDeleteNotify !== undefined) s.antiDeleteNotify = Boolean(body.antiDeleteNotify)

                // emoji lists
                if (Array.isArray(body.statusEmojis) && body.statusEmojis.length) {
                    s.autoLikeStatusEmojis = body.statusEmojis.map(String).slice(0, 20)
                    global.autoLikeStatusEmojis = s.autoLikeStatusEmojis
                }
                if (Array.isArray(body.autoLikeStatusEmojis) && body.autoLikeStatusEmojis.length) {
                    s.autoLikeStatusEmojis = body.autoLikeStatusEmojis.map(String).slice(0, 20)
                    global.autoLikeStatusEmojis = s.autoLikeStatusEmojis
                }

                // AI
                if (body.aiEnabled !== undefined) {
                    const next = body.aiEnabled ? 'all' : 'off'
                    s.chatbotMode = next; global.chatbotMode = next
                }
                if (body.chatbotMode !== undefined && chatbotModes.has(body.chatbotMode)) {
                    s.chatbotMode = body.chatbotMode; global.chatbotMode = body.chatbotMode
                }
                if (body.aiModel !== undefined) s.aiModel = String(body.aiModel).slice(0, 100)
                if (body.aiPersonality !== undefined) s.aiPersonality = String(body.aiPersonality).slice(0, 2000)

                savePanelSettings(s)

                // Presence side-effects
                if (typeof body.alwaysOnline === 'boolean') {
                    if (globalThis.__preciousOnlinePresenceTimer) { clearInterval(globalThis.__preciousOnlinePresenceTimer); globalThis.__preciousOnlinePresenceTimer = null }
                    if (waClient?.user) {
                        try { await waClient.sendPresenceUpdate(body.alwaysOnline ? 'available' : 'unavailable') } catch {}
                        if (body.alwaysOnline) {
                            const activeSocket = waClient
                            globalThis.__preciousOnlinePresenceTimer = setInterval(() => {
                                if (activeSocket === waClient && global.alwaysOnline) activeSocket.sendPresenceUpdate('available').catch(() => {})
                            }, 25000)
                            globalThis.__preciousOnlinePresenceTimer.unref?.()
                        }
                    }
                }
                const flat = (await new Promise(r => r(null))) || {}
                return json(res, 200, { ok: true, success: true, message: 'Settings saved.', settings: body })
            }
            // settings reset
            if (req.method === 'POST' && pathname === '/api/settings/reset') {
                const s = getPanelSettings()
                for (const key of ['panelPasswordHash']) delete s[key]
                savePanelSettings({ ...s })
                global.prefix = defaultSettings.prefix
                global.botMode = defaultSettings.mode
                global.chatbotMode = defaultSettings.chatbotMode
                global.autoViewStatus = defaultSettings.autoViewStatus
                global.autoLikeStatus = defaultSettings.autoLikeStatus
                global.autoLikeStatusEmojis = [...defaultSettings.autoLikeStatusEmojis]
                global.autoReact = defaultSettings.autoReact
                global.autoReactEmojis = [...defaultSettings.autoReactEmojis]
                global.antiDelete = defaultSettings.antiDelete
                global.antiDeleteMode = defaultSettings.antiDeleteMode
                global.autoRead = defaultSettings.autoRead
                global.autoRecording = defaultSettings.autoRecording
                global.autoTyping = defaultSettings.autoTyping
                global.alwaysOnline = defaultSettings.alwaysOnline
                return json(res, 200, { ok: true, success: true, message: 'Settings reset to defaults.', settings: {} })
            }
            // notifications
            if (req.method === 'GET' && pathname === '/api/notifications') return json(res, 200, panelDb.notifications)
            if (req.method === 'PUT' && pathname === '/api/notifications') {
                const body = await readBody(req, 4096)
                panelDb.notifications = { disconnect: Boolean(body.disconnect), newUser: Boolean(body.newUser), error: Boolean(body.error) }
                savePanelDb()
                return json(res, 200, { ok: true, message: 'Notification preferences saved.' })
            }

            // ---- CRON ----
            if (req.method === 'GET' && pathname === '/api/cron') {
                return json(res, 200, { jobs: readCronJobs().map(j => ({ ...j, active: true })) })
            }
            if (req.method === 'POST' && pathname === '/api/cron') {
                const body = await readBody(req, 200000)
                try {
                    if (!body.chat) throw new Error('Chat JID is required.')
                    if (!body.cron) throw new Error('Cron expression is required.')
                    if (String(body.cron).trim().split(/\s+/).length !== 5) throw new Error('Cron must have 5 fields.')
                    if (!body.text && !body.image) throw new Error('Text or image is required.')
                    const jobs = readCronJobs()
                    const job = {
                        id: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
                        chat: String(body.chat), text: String(body.text || '').slice(0, 4000),
                        image: body.image ? String(body.image) : undefined,
                        cron: String(body.cron), description: String(body.description || '').slice(0, 200),
                        createdAt: new Date().toISOString(), lastRun: null
                    }
                    jobs.push(job)
                    if (!writeCronJobs(jobs)) throw new Error('Failed to write cron.json')
                    return json(res, 201, { ok: true, job, message: 'Scheduled message created.' })
                } catch (e) { return json(res, 400, { error: e.message || 'Invalid cron job.' }) }
            }
            if (req.method === 'PUT' && pathname.startsWith('/api/cron/')) {
                const id = decodeURIComponent(pathname.split('/')[3])
                const body = await readBody(req, 200000)
                try {
                    const jobs = readCronJobs()
                    const idx = jobs.findIndex(j => j.id === id)
                    if (idx < 0) throw new Error('Job not found')
                    const job = jobs[idx]
                    if (body.cron !== undefined) { if (String(body.cron).trim().split(/\s+/).length !== 5) throw new Error('Cron must have 5 fields'); job.cron = String(body.cron) }
                    if (body.chat !== undefined) job.chat = String(body.chat)
                    if (body.text !== undefined) job.text = String(body.text).slice(0, 4000)
                    if (body.image !== undefined) job.image = body.image ? String(body.image) : undefined
                    if (body.description !== undefined) job.description = String(body.description).slice(0, 200)
                    job.updatedAt = new Date().toISOString()
                    jobs[idx] = job
                    if (!writeCronJobs(jobs)) throw new Error('Failed to write cron.json')
                    return json(res, 200, { ok: true, job, message: 'Scheduled message updated.' })
                } catch (e) { return json(res, 400, { error: e.message || 'Update failed.' }) }
            }
            if (req.method === 'DELETE' && pathname.startsWith('/api/cron/')) {
                const id = decodeURIComponent(pathname.split('/')[3])
                try {
                    const jobs = readCronJobs()
                    const next = jobs.filter(j => j.id !== id)
                    if (next.length === jobs.length) throw new Error('Job not found')
                    if (!writeCronJobs(next)) throw new Error('Failed to write cron.json')
                    return json(res, 200, { ok: true, message: 'Scheduled message deleted.' })
                } catch (e) { return json(res, 400, { error: e.message || 'Delete failed.' }) }
            }

            // ---- BACKUP ----
            if (req.method === 'POST' && pathname === '/api/backup') {
                try {
                    const dbDir = path.join(__dirname, 'database')
                    const payload = { createdAt: new Date().toISOString(), files: {} }
                    for (const name of fs.readdirSync(dbDir)) {
                        if (!name.endsWith('.json')) continue
                        try { payload.files[name] = JSON.parse(fs.readFileSync(path.join(dbDir, name), 'utf8')) } catch {}
                    }
                    const fileName = `precious-md-backup-${Date.now()}.json`
                    const backupDir = path.join(dbDir, 'backups')
                    fs.mkdirSync(backupDir, { recursive: true })
                    fs.writeFileSync(path.join(backupDir, fileName), JSON.stringify(payload, null, 2))
                    return json(res, 200, { ok: true, fileName, message: 'Backup created.' })
                } catch (e) { return json(res, 500, { error: e.message || 'Backup failed.' }) }
            }
            if (req.method === 'GET' && pathname === '/api/backup/download') {
                const backupDir = path.join(__dirname, 'database', 'backups')
                let latest = null
                try {
                    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json')).sort()
                    if (files.length) latest = files[files.length - 1]
                } catch {}
                if (!latest) return json(res, 404, { error: 'No backup available yet.' })
                const full = path.join(backupDir, latest)
                const data = fs.readFileSync(full)
                res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${latest}"` })
                return res.end(data)
            }
            if (req.method === 'POST' && pathname === '/api/backup/restore') {
                const body = await readBody(req, 10 * 1024 * 1024)
                try {
                    const payload = body?.database || body
                    if (!payload || typeof payload !== 'object') throw new Error('Invalid backup payload.')
                    const files = payload.files || payload
                    const dbDir = path.join(__dirname, 'database')
                    const safetyDir = path.join(dbDir, 'backups')
                    fs.mkdirSync(safetyDir, { recursive: true })
                    const safetyName = `safety-${Date.now()}.json`
                    try {
                        const snapshot = { createdAt: new Date().toISOString(), files: {} }
                        for (const name of fs.readdirSync(dbDir)) {
                            if (!name.endsWith('.json')) continue
                            try { snapshot.files[name] = JSON.parse(fs.readFileSync(path.join(dbDir, name), 'utf8')) } catch {}
                        }
                        fs.writeFileSync(path.join(safetyDir, safetyName), JSON.stringify(snapshot, null, 2))
                    } catch {}
                    for (const [name, content] of Object.entries(files)) {
                        if (!name.endsWith('.json')) continue
                        const dest = path.join(dbDir, path.basename(name))
                        fs.writeFileSync(dest, JSON.stringify(content, null, 2))
                    }
                    return json(res, 200, { ok: true, message: 'Database restored. Safety snapshot saved as ' + safetyName + '.' })
                } catch (e) { return json(res, 400, { error: e.message || 'Restore failed.' }) }
            }

            // ---- existing endpoints ----
            if (req.method === 'POST' && pathname === '/api/pair') {
                const body = await readBody(req, 4096)
                const number = cleanNumber(body.number)
                if (number.length < 7 || number.length > 15) return json(res, 400, { error: 'Enter a valid phone number with country code.' })
                if (!waClient || waClient.user?.id) return json(res, 409, { error: 'WhatsApp session is already registered or not ready to pair.' })
                try {
                    let error
                    for (let attempt = 0; attempt < 2; attempt++) {
                        try { await delay(attempt ? 2500 : 1500); pairingCode = await waClient.requestPairingCode(number); if (pairingCode) break }
                        catch (e) { error = e }
                    }
                    if (!pairingCode) throw error || new Error('WhatsApp did not return a pairing code.')
                    return json(res, 200, { pairingCode })
                } catch (e) { return json(res, 500, { error: e.message || 'Could not generate pairing code.' }) }
            }
            if (req.method === 'DELETE' && pathname === '/api/owners') {
                const body = await readBody(req, 4096); const number = cleanNumber(body.number)
                const file = path.join(__dirname, 'database', 'owner.json'); let owners = []
                try { owners = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
                owners = owners.filter(x => cleanNumber(String(x).split('@')[0]) !== number && cleanNumber(String(x).split('@')[0]) !== '263781330745')
                fs.writeFileSync(file, JSON.stringify(owners, null, 2))
                return json(res, 200, { ok: true, message: 'Sudo owner removed (primary owner is protected).' })
            }
            if (req.method === 'POST' && pathname === '/api/users/admin') {
                const body = await readBody(req, 4096); const number = cleanNumber(body.number)
                if (number.length < 7) return json(res, 400, { error: 'Valid number required.' })
                if (!panelDb.sudo.includes(number)) panelDb.sudo.push(number)
                savePanelDb()
                const ownerFile = path.join(__dirname, 'database', 'owner.json'); let owners = []
                try { owners = JSON.parse(fs.readFileSync(ownerFile, 'utf8')) } catch {}
                if (!owners.some(x => cleanNumber(String(x).split('@')[0]) === number)) owners.push(number)
                fs.writeFileSync(ownerFile, JSON.stringify(owners, null, 2))
                return json(res, 200, { ok: true, message: 'Bot sudo/admin access granted.' })
            }
            if (req.method === 'POST' && pathname === '/api/users/remove-admin') {
                const body = await readBody(req, 4096); const number = cleanNumber(body.number)
                panelDb.sudo = panelDb.sudo.filter(n => n !== number); savePanelDb()
                const ownerFile = path.join(__dirname, 'database', 'owner.json'); let owners = []
                try { owners = JSON.parse(fs.readFileSync(ownerFile, 'utf8')) } catch {}
                owners = owners.filter(x => cleanNumber(String(x).split('@')[0]) !== number && cleanNumber(String(x).split('@')[0]) !== '263781330745')
                fs.writeFileSync(ownerFile, JSON.stringify(owners, null, 2))
                return json(res, 200, { ok: true, message: 'Bot sudo/admin access removed.' })
            }
            if (req.method === 'GET' && pathname.startsWith('/api/users/') && pathname.endsWith('/history')) {
                const number = cleanNumber(pathname.split('/')[3]); const user = panelDb.users[number]
                return json(res, 200, { history: user?.history || [] })
            }
            if (req.method === 'GET' && pathname === '/api/users') {
                const q = cleanNumber(url.searchParams.get('q') || '')
                const users = Object.values(panelDb.users).filter(u => !q || u.number.includes(q))
                return json(res, 200, { users, total: users.length })
            }
            if (req.method === 'POST' && ['/api/users/block', '/api/users/unblock'].includes(pathname)) {
                const body = await readBody(req, 4096); const number = cleanNumber(body.number)
                if (number.length < 7) return json(res, 400, { error: 'Valid phone number required.' })
                if (!waClient || !botConnected) return json(res, 503, { error: 'WhatsApp is not connected.' })
                await waClient.updateBlockStatus(`${number}@s.whatsapp.net`, pathname.endsWith('/block') ? 'block' : 'unblock')
                if (pathname.endsWith('/block')) { if (!panelDb.banned.includes(number)) panelDb.banned.push(number) }
                else panelDb.banned = panelDb.banned.filter(n => n !== number)
                savePanelDb()
                return json(res, 200, { ok: true, message: `User ${pathname.endsWith('/block') ? 'blocked' : 'unblocked'}.` })
            }
            if (req.method === 'GET' && pathname === '/api/groups') {
                if (!waClient || !botConnected) return json(res, 503, { error: 'WhatsApp is not connected.' })
                const groups = Object.values(await waClient.groupFetchAllParticipating()).map(g => ({ id: g.id, name: g.subject || '', members: g.participants?.length || 0 }))
                return json(res, 200, { groups, total: groups.length })
            }
            if (req.method === 'POST' && pathname === '/api/groups/action') {
                const body = await readBody(req, 4096); const jid = String(body.jid || '')
                if (!jid.endsWith('@g.us')) return json(res, 400, { error: 'Invalid group JID.' })
                if (!waClient || !botConnected) return json(res, 503, { error: 'WhatsApp is not connected.' })
                if (body.action === 'leave') { await waClient.groupLeave(jid); return json(res, 200, { ok: true, message: 'Left group.' }) }
                if (body.action === 'mute') { panelDb.mutedGroups = panelDb.mutedGroups || []; if (!panelDb.mutedGroups.includes(jid)) panelDb.mutedGroups.push(jid); global.panelMutedGroups = panelDb.mutedGroups; savePanelDb(); return json(res, 200, { ok: true, message: 'Bot muted in this group.' }) }
                if (body.action === 'unmute') { panelDb.mutedGroups = (panelDb.mutedGroups || []).filter(x => x !== jid); global.panelMutedGroups = panelDb.mutedGroups; savePanelDb(); return json(res, 200, { ok: true, message: 'Bot unmuted in this group.' }) }
                if (body.action === 'invite') {
                    const code = await waClient.groupInviteCode(jid)
                    return json(res, 200, { ok: true, invite: `https://chat.whatsapp.com/${code}` })
                }
                return json(res, 400, { error: 'Unknown group action.' })
            }
            if (req.method === 'GET' && pathname === '/api/autoreply') {
                const s = getPanelSettings()
                return json(res, 200, { welcome: s.welcomeEnabled === true, welcomeMessage: s.welcomeMessage || 'Welcome @user to @group!', goodbye: s.goodbyeEnabled === true, goodbyeMessage: s.goodbyeMessage || 'Goodbye @user!', offline: s.offlineReplyEnabled === true, offlineMessage: s.offlineReplyMessage || '' })
            }
            if (req.method === 'PUT' && pathname === '/api/autoreply') {
                const body = await readBody(req, 20000); const s = getPanelSettings()
                s.welcomeEnabled = Boolean(body.welcome); s.welcomeMessage = String(body.welcomeMessage || '').slice(0, 2000)
                s.goodbyeEnabled = Boolean(body.goodbye); s.goodbyeMessage = String(body.goodbyeMessage || '').slice(0, 2000)
                s.offlineReplyEnabled = Boolean(body.offline); s.offlineReplyMessage = String(body.offlineMessage || '').slice(0, 2000)
                savePanelSettings(s)
                return json(res, 200, { ok: true, message: 'Auto reply settings saved.' })
            }
            if (req.method === 'POST' && pathname === '/api/send') {
                const body = await readBody(req); const number = cleanNumber(body.number); const message = String(body.message || '').slice(0, 4000)
                if (number.length < 7 || !message) return json(res, 400, { error: 'Valid phone number and message are required.' })
                if (!waClient || !botConnected) return json(res, 503, { error: 'WhatsApp is not connected.' })
                const result = await waClient.sendMessage(`${number}@s.whatsapp.net`, { text: message })
                return json(res, 200, { ok: true, message: 'Message sent.', messageId: result?.key?.id })
            }
            if (req.method === 'POST' && pathname === '/api/broadcast') {
                const body = await readBody(req); const message = String(body.message || '').slice(0, 4000); const target = String(body.target || 'all')
                if (!message && !body.image) return json(res, 400, { error: 'Enter message text or attach an image.' })
                if (!waClient || !botConnected) return json(res, 503, { error: 'WhatsApp is not connected.' })
                const chatMap = new Map(Object.values(waClient.chats || {}).filter(c => c?.id).map(c => [c.id, c]))
                try {
                    const participating = await waClient.groupFetchAllParticipating()
                    for (const group of Object.values(participating || {})) if (group?.id) chatMap.set(group.id, group)
                } catch {}
                for (const user of Object.values(panelDb.users || {})) if (user.number) {
                    const id = `${cleanNumber(user.number)}@s.whatsapp.net`
                    if (!chatMap.has(id)) chatMap.set(id, { id })
                }
                const chats = [...chatMap.values()]
                let destinations = chats.filter(c => target === 'groups' ? c.id.endsWith('@g.us') : target === 'private' ? c.id.endsWith('@s.whatsapp.net') : target === 'selected' ? (body.numbers || []).some(n => cleanNumber(n) === cleanNumber(c.id.split('@')[0])) : true)
                if (target === 'all') destinations = chats.filter(c => c.id.endsWith('@g.us') || c.id.endsWith('@s.whatsapp.net'))
                if (target === 'selected') {
                    const ids = new Set(destinations.map(c => c.id))
                    for (const n of (body.numbers || [])) { const id = `${cleanNumber(n)}@s.whatsapp.net`; if (cleanNumber(n).length >= 7 && !ids.has(id)) destinations.push({ id }) }
                }
                let sent = 0, failed = 0
                for (const chat of destinations) {
                    try {
                        let imagePayload = body.image
                        if (typeof imagePayload === 'string' && imagePayload.startsWith('data:')) {
                            const match = imagePayload.match(/^data:([^;]+);base64,(.+)$/)
                            if (match) imagePayload = Buffer.from(match[2], 'base64')
                        }
                        const payload = imagePayload ? { image: imagePayload, caption: message } : { text: message }
                        await waClient.sendMessage(chat.id, payload); sent++
                    } catch { failed++ }
                }
                return json(res, 200, { ok: true, sent, failed, total: destinations.length, message: `Broadcast complete: ${sent} sent, ${failed} failed.` })
            }
            if (req.method === 'POST' && pathname === '/api/ai/clear') {
                try { const chatbot = await import('./lib/events/chatbot.js'); chatbot.clearChatbotMemory?.() } catch {}
                return json(res, 200, { ok: true, message: 'AI conversation memory cleared.' })
            }
            if (req.method === 'GET' && pathname === '/api/owners') {
                let owners = []; try { owners = JSON.parse(fs.readFileSync(path.join(__dirname, 'database', 'owner.json'), 'utf8')) } catch {}
                return json(res, 200, { owners: owners.map(x => typeof x === 'string' ? x.split('@')[0] : String(x)) })
            }
            if (req.method === 'POST' && pathname === '/api/owners') {
                const body = await readBody(req, 4096); const number = cleanNumber(body.number)
                if (number.length < 7) return json(res, 400, { error: 'Valid owner number required.' })
                const file = path.join(__dirname, 'database', 'owner.json'); let owners = []
                try { owners = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
                if (!owners.some(x => cleanNumber(String(x).split('@')[0]) === number)) owners.push(number)
                fs.writeFileSync(file, JSON.stringify(owners, null, 2))
                return json(res, 200, { ok: true, message: 'Owner added.' })
            }
            if (req.method === 'GET' && pathname === '/api/banned') return json(res, 200, { banned: panelDb.banned })
            if (req.method === 'POST' && pathname === '/api/unban') {
                const body = await readBody(req, 4096); const number = cleanNumber(body.number)
                if (!waClient || !botConnected) return json(res, 503, { error: 'WhatsApp is not connected.' })
                await waClient.updateBlockStatus(`${number}@s.whatsapp.net`, 'unblock')
                panelDb.banned = panelDb.banned.filter(n => n !== number); savePanelDb()
                return json(res, 200, { ok: true, message: 'Number unblocked.' })
            }
            if (req.method === 'GET' && pathname === '/api/media') {
                const tempDir = path.join(__dirname, 'database', 'temp')
                let files = []; let bytes = 0
                const walk = dir => { if (!fs.existsSync(dir)) return; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f); else { const st = fs.statSync(f); bytes += st.size; files.push({ name: e.name, size: st.size, modified: st.mtime.toISOString() }) } } }
                walk(tempDir)
                return json(res, 200, { files: files.sort((a, b) => b.modified.localeCompare(a.modified)).slice(0, 30), storageMB: +(bytes / 1048576).toFixed(2), totalFiles: files.length })
            }
            if (req.method === 'POST' && pathname === '/api/media/clear') {
                const tempDir = path.join(__dirname, 'database', 'temp')
                if (fs.existsSync(tempDir)) for (const item of fs.readdirSync(tempDir)) fs.rmSync(path.join(tempDir, item), { recursive: true, force: true })
                fs.mkdirSync(tempDir, { recursive: true })
                return json(res, 200, { ok: true, message: 'Temporary media cache cleared.' })
            }
            if (req.method === 'POST' && pathname === '/api/control') {
                const body = await readBody(req, 4096); const action = String(body.action || '')
                if (action === 'start') { manuallyStopped = false; logoutDetected = false; isConnecting = false; if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null } await start(); return json(res, 200, { ok: true, message: 'Bot start requested.' }) }
                if (action === 'stop') { manuallyStopped = true; botConnected = false; if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null } if (reconnectStabilityTimer) { clearTimeout(reconnectStabilityTimer); reconnectStabilityTimer = null } try { waClient?.ev.removeAllListeners(); waClient?.ws?.close?.() } catch {} waClient = null; isConnecting = false; return json(res, 200, { ok: true, message: 'Bot stopped.' }) }
                if (action === 'restart') { manuallyStopped = true; isConnecting = false; if (reconnectTimer) clearTimeout(reconnectTimer); try { waClient?.ev.removeAllListeners(); waClient?.ws?.close?.() } catch {} waClient = null; botConnected = false; manuallyStopped = false; setTimeout(() => start(), 500); return json(res, 200, { ok: true, message: 'Bot restart requested.' }) }
                if (action === 'logout' || action === 'clear-session') { manuallyStopped = true; botConnected = false; isConnecting = false; if (reconnectTimer) clearTimeout(reconnectTimer); try { await waClient?.logout?.() } catch {} waClient = null; pairingCode = null; qrCodeDataUrl = null; return json(res, 200, { ok: true, message: 'WhatsApp session cleared.' }) }
                if (action === 'reconnect') { try { waClient?.ws?.close?.() } catch {} return json(res, 200, { ok: true, message: 'Reconnect requested.' }) }
                return json(res, 400, { error: 'Unknown action.' })
            }
            return json(res, 404, { error: 'Unknown API route.' })
        }
        // static files
        const requested = pathname === '/' ? '/index.html' : decodeURIComponent(pathname)
        const safePath = path.normalize(path.join(publicDir, requested))
        if (!safePath.startsWith(publicDir + path.sep)) return json(res, 403, { error: 'Forbidden' })
        if (!fs.existsSync(safePath) || !fs.statSync(safePath).isFile()) return json(res, 404, { error: 'Not found' })
        const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' }
        res.writeHead(200, { 'Content-Type': types[path.extname(safePath)] || 'application/octet-stream' })
        fs.createReadStream(safePath).pipe(res)
    } catch (error) {
        console.error('[SERVER] Request failed:', error.message || error)
        notifyPanel('error', `Server request error: ${error.message || error}`).catch(() => {})
        return json(res, 500, { error: error.message || 'Internal server error' })
    }
})

// ---------------------------------------------------------------------------
// Health server (worker)
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000
let healthServerStarting = false
let healthServerReady = false
let healthServerRetryTimer = null
function startHealthServer() {
    if (!isWorker || healthServerStarting || healthServerReady) return
    healthServerStarting = true
    const onListening = () => { healthServerStarting = false; healthServerReady = true; server.off('error', onError) }
    const onError = error => {
        healthServerStarting = false
        server.off('listening', onListening)
        if (error.code === 'EADDRINUSE') { if (!healthServerRetryTimer) healthServerRetryTimer = setTimeout(() => { healthServerRetryTimer = null; startHealthServer() }, 1000); return }
        console.error('[SERVER] Health server error:', error.message || error)
    }
    server.once('listening', onListening)
    server.once('error', onError)
    server.listen(PORT)
}
if (isWorker) startHealthServer()

export function requestRestart() {
    if (typeof process.send === 'function') { process.send('restart'); return }
    process.exit(0)
}
const isLoggedOutDisconnect = statusCode => Number(statusCode) === Number(DisconnectReason.loggedOut)

const shutdown = async () => {
    flushPanelDbSync()
    if (!isWorker) { supervisorStopping = true; supervisorWorker?.kill('SIGTERM'); process.exit(0) }
    try {
        if (healthServerRetryTimer) clearTimeout(healthServerRetryTimer)
        if (reconnectTimer) clearTimeout(reconnectTimer)
        if (reconnectStabilityTimer) clearTimeout(reconnectStabilityTimer)
        stopCronScheduler()
        waClient?.ev.removeAllListeners()
        waClient?.ws?.close?.()
        for (const item of cloneSessions.values()) { try { item.socket?.ev.removeAllListeners(); item.socket?.ws?.close?.() } catch {} }
    } catch {}
    process.exit(0)
}
process.on('unhandledRejection', error => console.error('[UNHANDLED]', error))
process.on('uncaughtException', error => { console.error('[UNCAUGHT]', error); try { flushPanelDbSync() } catch {}; if (isWorker) process.exit(1) })
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

let supervisorDelay = 500
function startSupervisor() {
    if (supervisorStopping) return
    const startedAt = Date.now()
    supervisorWorker = spawn(process.execPath, [process.argv[1], '--child'], { stdio: ['inherit', 'inherit', 'inherit', 'ipc'], env: process.env })
    supervisorWorker.on('message', message => { if (message === 'restart') supervisorWorker?.kill('SIGTERM') })
    supervisorWorker.on('exit', () => {
        supervisorWorker = null
        if (supervisorStopping) return
        supervisorDelay = Date.now() - startedAt > 30000 ? 500 : Math.min(supervisorDelay * 2, 60000)
        setTimeout(startSupervisor, supervisorDelay)
    })
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    if (isWorker) {
        start()
        startCronScheduler()
        // Restore saved Jadibot clone sessions after the shared plugin/event runtime initializes.
        setTimeout(async () => {
            try {
                if (!fs.existsSync(cloneRoot)) return
                for (const entry of fs.readdirSync(cloneRoot, { withFileTypes: true })) {
                    if (!entry.isDirectory() || !fs.existsSync(path.join(cloneRoot, entry.name, 'creds.json'))) continue
                    try { await startCloneSession(entry.name) } catch (error) { console.warn(`[JADIBOT:${entry.name}] Restore failed: ${error.message}`) }
                }
            } catch (error) { console.warn('[JADIBOT] Restore scan failed:', error.message) }
        }, 8000)
    } else {
        startSupervisor()
    }
}

// Public Jadibot bridge for plugins. These exports expose the existing session
// manager without changing its pairing, reconnect, or credential logic.
export {
    startCloneSession as startJadibot,
    stopCloneSession as stopJadibot,
    cloneSessions as jadibotSessions
}
export function listJadibot() {
    return [...cloneSessions.values()].map(({ id, phone, state, pairingCode, qr, startedAt, lastError }) => ({
        id, number: phone || id, state, pending: state === 'pairing' || state === 'connecting',
        mode: 'pairing code', pairingCode, qr, startedAt, lastError
    }))
}
