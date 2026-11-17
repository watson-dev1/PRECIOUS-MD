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
// Panel DB (moved ABOVE handleMessage so it is initialized before any use)
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
    catch { return { users: {}, banned: [], sudo: [], mutedGroups: [], notifications: { disconnect: true, newUser: true, error: true }, downloads: [], stats: { commands: 0, dailyMessages: {} } } }
})()
panelDb.users ||= {}
panelDb.banned ||= []
panelDb.stats ||= { commands: 0, dailyMessages: {} }
panelDb.stats.dailyMessages ||= {}
panelDb.notifications ||= { disconnect: true, newUser: true, error: true }
panelDb.mutedGroups ||= []
panelDb.sudo ||= []
global.panelMutedGroups = panelDb.mutedGroups

// Debounced persistence — avoids blocking the event loop on every message.
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
        } catch (e) {
            console.error('[PANEL] Failed to persist panel.json:', e?.message || e)
        }
    }, 1500)
    _panelDbSaveTimer.unref?.()
}
function flushPanelDbSync() {
    if (_panelDbSaveTimer) { clearTimeout(_panelDbSaveTimer); _panelDbSaveTimer = null }
    if (!_panelDbDirty) return
    _panelDbDirty = false
    try {
        fs.mkdirSync(path.dirname(panelDbPath), { recursive: true })
        fs.writeFileSync(panelDbPath, JSON.stringify(panelDb, null, 2))
    } catch (e) {
        console.error('[PANEL] Flush failed:', e?.message || e)
    }
}

function getPanelSettings() {
    try { return JSON.parse(fs.readFileSync(settingsPath, 'utf8')) } catch { return {} }
}
function savePanelSettings(value) {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
    fs.writeFileSync(settingsPath, JSON.stringify(value, null, 2))
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

// ---------------------------------------------------------------------------
// Plugins / events
// ---------------------------------------------------------------------------
export const plugins = new Map()
const customPrefixPlugins = new Set()   // separate dispatch list
export const eventHandlers = new Map()

const pluginCache = new Map()
const eventCache = new Map()
const watchers = new Map()
const pendingReloads = new Map()
let pluginStartupComplete = false
let eventStartupComplete = false
let cachedPluginCount = 0

const followedNewslettersRuntime = new Set()

async function followConfiguredNewsletters(waClient) {
    if (!NEWSLETTER_IDS.length || typeof waClient.newsletterFollow !== 'function') return
    for (const jid of NEWSLETTER_IDS) {
        if (!jid?.endsWith('@newsletter') || followedNewslettersRuntime.has(jid)) continue
        try {
            await waClient.newsletterFollow(jid)
            followedNewslettersRuntime.add(jid)
        } catch {}
    }
}

function parseSessionData(raw) {
    const trimmed = raw.trim()
    if (trimmed.startsWith('{')) {
        return JSON.parse(trimmed)
    }
    return JSON.parse(Buffer.from(trimmed, 'base64').toString('utf-8'))
}

function getPluginFiles(dir) {
    let files = []
    if (!fs.existsSync(dir)) return files
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name)
        if (item.isDirectory()) files.push(...getPluginFiles(full))
        else if (item.isFile() && item.name.endsWith('.js')) files.push(full)
    }
    return files
}

async function loadPlugin(file) {
    try {
        const module = await import(`${pathToFileURL(file).href}?update=${Date.now()}`)
        const handler = module.default
        if (!handler) return
        const wasLoaded = pluginCache.has(file)
        if (wasLoaded) {
            for (const key of pluginCache.get(file)) {
                if (typeof key === 'symbol') customPrefixPlugins.delete(key)
                else plugins.delete(key)
            }
        }
        const relative = path.relative(pluginDir, file)
        const parts = relative.split(path.sep)
        handler.category = parts.length > 1
            ? parts[0].replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
            : 'Other'
        const keys = []
        if (handler.command && !(handler.command instanceof RegExp)) {
            const commands = Array.isArray(handler.command) ? handler.command : [handler.command]
            for (const cmd of commands) {
                const key = String(cmd).toLowerCase()
                plugins.set(key, handler)
                keys.push(key)
            }
        }
        if (handler.customPrefix) {
            const key = Symbol(file)
            customPrefixPlugins.add(key)
            // store handler by symbol in plugins for lookups
            plugins.set(key, handler)
            keys.push(key)
        }
        pluginCache.set(file, keys)
        cachedPluginCount = pluginCache.size
        if (pluginStartupComplete) {
            console.log(`[PLUGIN] ${wasLoaded ? 'Updated' : 'Added'} ${path.relative(pluginDir, file)}`)
        }
    } catch (e) {
        console.error(`[PLUGIN] Failed ${file}`)
        console.error(e)
    }
}

async function unloadPlugin(file) {
    if (!pluginCache.has(file)) return
    for (const key of pluginCache.get(file)) {
        if (typeof key === 'symbol') customPrefixPlugins.delete(key)
        else plugins.delete(key)
    }
    pluginCache.delete(file)
    cachedPluginCount = pluginCache.size
    console.log(`[PLUGIN] Unloaded ${path.relative(pluginDir, file)}`)
}

export async function initPlugins() {
    const files = getPluginFiles(pluginDir)
    for (const file of files) {
        await loadPlugin(file)
    }
    watch(pluginDir, loadPlugin, unloadPlugin)
    console.log(chalk.green(`[PLUGIN] Loaded ${pluginCache.size} plugin(s)`))
    pluginStartupComplete = true
}

export async function reloadPlugins() {
    const files = new Set(getPluginFiles(pluginDir))
    for (const file of [...pluginCache.keys()]) {
        if (!files.has(file)) await unloadPlugin(file)
    }
    for (const file of files) {
        await loadPlugin(file)
    }
}

async function loadEventFile(file) {
    try {
        const module = await import(`${pathToFileURL(file).href}?update=${Date.now()}`)
        const handler = module.default
        if (!handler || !handler.on) return
        const wasLoaded = eventCache.has(file)
        eventHandlers.set(file, handler)
        eventCache.set(file, true)
        if (eventStartupComplete) {
            console.log(`[EVENT] ${wasLoaded ? 'Updated' : 'Added'} ${path.relative(eventDir, file)}`)
        }
    } catch (e) {
        console.error(`[EVENT] Failed ${file}`)
        console.error(e)
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
    for (const file of files) {
        await loadEventFile(file)
    }
    watch(eventDir, loadEventFile, unloadEventFile)
    console.log(chalk.green(`[EVENT] Loaded ${eventCache.size} event(s)`))
    eventStartupComplete = true
}

export async function reloadEvents() {
    const files = new Set(getPluginFiles(eventDir))
    for (const file of [...eventCache.keys()]) {
        if (!files.has(file)) await unloadEventFile(file)
    }
    for (const file of files) {
        await loadEventFile(file)
    }
}

const wiredEventNames = new Set()

function handlerEventNames(handler) {
    if (!handler.on) return []
    return Array.isArray(handler.on) ? handler.on : [handler.on]
}

export function wireEventDispatchers(waClient) {
    wiredEventNames.clear()
    const names = new Set([...eventHandlers.values()].flatMap(handlerEventNames))
    for (const name of names) {
        if (wiredEventNames.has(name)) continue
        wiredEventNames.add(name)
        waClient.ev.on(name, async (data) => {
            if (name === 'messages.upsert' && data?.type === 'notify') {
                const messages = (data.messages || []).filter(acceptMessage)
                if (!messages.length) return
                data = { ...data, messages }
            }
            for (const handler of eventHandlers.values()) {
                if (!handlerEventNames(handler).includes(name)) continue
                try {
                    await handler(waClient, data)
                } catch (e) {
                    console.error(`[EVENT] Error in handler for ${name}:`, e)
                }
            }
        })
    }
}

function watch(dir, loadFn, unloadFn) {
    if (watchers.has(dir)) return
    watchers.set(dir, fs.watch(dir, (_, filename) => {
        if (!filename) return
        const file = path.join(dir, filename)
        if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
            watch(file, loadFn, unloadFn)
            return
        }
        if (!filename.endsWith('.js')) return
        if (pendingReloads.has(file)) clearTimeout(pendingReloads.get(file))
        pendingReloads.set(file, setTimeout(async () => {
            pendingReloads.delete(file)
            if (fs.existsSync(file)) await loadFn(file)
            else await unloadFn(file)
        }, 200))
    }))
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        if (item.isDirectory()) watch(path.join(dir, item.name), loadFn, unloadFn)
    }
}

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
                        try {
                            const params = JSON.parse(flow.paramsJson)
                            body = params.id || params.buttonId || params.rowId || params.index || ''
                        } catch { body = flow.name || '' }
                    } else body = flow.name || ''
                    isButtonResponse = true
                } else if (inter.buttonReply) {
                    body = inter.buttonReply.selectedButtonId || ''
                    isButtonResponse = true
                } else if (inter.singleSelectReply) {
                    body = inter.singleSelectReply.selectedRowId || ''
                    isButtonResponse = true
                }
            } else if (m.message.templateButtonReplyMessage) {
                body = m.message.templateButtonReplyMessage.selectedId || ''
                isButtonResponse = true
            } else if (m.message.buttonsResponseMessage) {
                body = m.message.buttonsResponseMessage.selectedButtonId || ''
                isButtonResponse = true
            } else if (m.message?.stickerMessage) {
                body = '__MENU_STICKER__'
            }
        }
    } catch (error) {
        console.error('Error parsing message:', error)
    }
    return { body, isButtonResponse }
}

export default async function handleMessage(waClient, m) {
    try {
        const { body, isButtonResponse } = extractCommandFromMessage(m)
        if (m.isGroup && panelDb.mutedGroups?.includes(m.chat) && !m.isOwner) return
        if (!body) return
        m.text = body
        m.isButtonResponse = isButtonResponse
        m.prefix = global.prefix || '.'
        m.pushName = m.pushName || m.name || m.sender?.split('@')[0] || 'User'
        if (typeof m.react !== 'function') m.react = emoji => waClient.sendMessage(m.chat, { react: { text: String(emoji), key: m.key } })

        if (global.botMode === 'self' && !m.isOwner && !m.fromMe) return

        const notifReply = async (text, title) => {
            try { await sendNotification(waClient, m, title, text) } catch {}
        }
        const logCommandUsage = (command, extra = '') => {
            panelDb.stats = panelDb.stats || { commands: 0, dailyMessages: {} }
            panelDb.stats.commands = (panelDb.stats.commands || 0) + 1
            const senderNumber = cleanNumber(m.sender)
            if (senderNumber && panelDb.users[senderNumber]) {
                panelDb.users[senderNumber].totalCommands = (panelDb.users[senderNumber].totalCommands || 0) + 1
            }
            savePanelDb()
            const from = m.isGroup ? `group ${m.chat}` : (m.isNewsletter ? `channel ${m.chat}` : 'DM')
            const usedPrefix = global.prefix || ''
            console.log(
                chalk.cyan('CMD ') +
                chalk.yellow(`${usedPrefix}${command}`) +
                chalk.white(` from `) +
                chalk.green(m.sender) +
                chalk.white(` (${from})`) +
                (extra ? chalk.magenta(` ${extra}`) : '')
            )
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

        const invoke = async (handler, args, text, command, prefix, usedPrefix) => {
            return await handler(m, {
                waClient, conn: waClient, sock: waClient, jid: m.chat,
                args, text, command, prefix, usedPrefix,
                reply: value => m.reply(value),
                isAdmin: m.isAdmin, isOwner: m.isOwner, notifReply
            })
        }

        if (isButtonResponse) {
            let bodyText = body
            const activePrefix = global.prefix || ''
            if (activePrefix && bodyText.startsWith(activePrefix)) {
                bodyText = bodyText.slice(activePrefix.length)
            }
            const args = bodyText.trim().split(/\s+/)
            const command = args.shift().toLowerCase()
            m.command = command
            const handler = plugins.get(command)
            if (!handler) return
            if (checkAccess(handler)) return
            logCommandUsage(command, '(button)')
            return await invoke(handler, args, args.join(' '), command, '', '')
        }

        // custom prefix handlers — dispatched only from their own set
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

        // sticker menu shortcut
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
    } catch (e) {
        console.error(e)
    }
}

// ---------------------------------------------------------------------------
// Runtime / connection
// ---------------------------------------------------------------------------
let rl = null

const question = text => {
    if (!rl) {
        rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        })
    }
    return new Promise(resolve => {
        let settled = false
        const finish = value => { if (!settled) { settled = true; resolve(value) } }
        rl.question(text, finish)
        rl.once('close', () => finish(''))
    })
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

let waClient
let botConnected = false
let manuallyStopped = false
let pairingCode = null
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
    if (!pluginsLoaded) {
        await initPlugins()
        pluginsLoaded = true
    }
    if (!eventsLoaded) {
        await initEvents()
        eventsLoaded = true
    }
}

function isDuplicateMessage(message) {
    const key = message?.key
    if (!key?.id) return false
    const cacheKey = [
        key.remoteJidAlt || key.remoteJid || '',
        key.participantAlt || key.participant || '',
        key.fromMe ? 'from-me' : 'from-user',
        key.id
    ].join(':')
    const now = Date.now()
    const seenAt = processedMessageKeys.get(cacheKey)
    if (seenAt && now - seenAt < MESSAGE_DEDUP_TTL) return true
    processedMessageKeys.set(cacheKey, now)
    while (processedMessageKeys.size > MESSAGE_DEDUP_LIMIT) {
        processedMessageKeys.delete(processedMessageKeys.keys().next().value)
    }
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
        const statusCode = error.output?.statusCode ??
            error.statusCode ??
            error.data?.statusCode ??
            error.data?.output?.statusCode ??
            error.cause?.output?.statusCode ??
            error.cause?.statusCode ??
            error.cause?.data?.statusCode
        return Number(statusCode) || 0
    } catch {
        return 0
    }
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
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        if (logoutDetected) return
        start()
    }, delay)
}

// notifyPanel is defined here because it depends on live socket state.
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

async function start() {
    if (logoutDetected || manuallyStopped) return
    if (isConnecting) return
    isConnecting = true
    botConnected = false

    try {
        await loadRuntime()

        if (waClient) {
            waClient.ev.removeAllListeners()
            waClient.ws?.close?.()
        }

        const credsPath = path.join(__dirname, 'session', 'creds.json')
        if ((!fs.existsSync(credsPath) || fs.statSync(credsPath).size === 0) && global.session) {
            try {
                const sessionData = parseSessionData(global.session)
                fs.mkdirSync(path.dirname(credsPath), { recursive: true })
                fs.writeFileSync(credsPath, JSON.stringify(sessionData, null, 2))
                console.log(chalk.greenBright('Session restored from SESSION_ID'))
            } catch {
                console.error(chalk.redBright(`Invalid SESSION_ID, falling back to pairing`))
            }
        }

        const { state, saveCreds } = await useMultiFileAuthState('./session')
        let version
        try {
            const latest = await fetchLatestBaileysVersion()
            version = latest.version
        } catch {
        }

        const logger = pino({ level: 'silent' })
        const socket = waClient = makeWASocket({
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
            browser: Browsers.ubuntu('Chrome'),
            logger,
            ...(version ? { version } : {}),
            printQRInTerminal: false,
            markOnlineOnConnect: false,
            syncFullHistory: false,
            cachedGroupMetadata: async (jid) => getGroupMetadata(waClient, jid),
            getMessage: async (key) => socket.getStoredMessage?.(key),
        })
        let socketOpened = false

        bind(socket)

        if (!state.creds.registered && process.stdin.isTTY) {
            console.log('Enter your number, for example: 263xxxxxxxxx or use the web control panel.')
            const number = (await question('Sending Code to: ')).replace(/\D/g, '')
            if (!number || number.length < 7) {
                rl?.close(); rl = null
                throw new Error('Enter a valid phone number with country code.')
            }
            try {
                let code
                let error
                for (let attempt = 0; attempt < 2; attempt++) {
                    try {
                        await delay(attempt ? 2500 : 1500)
                        code = await waClient.requestPairingCode(number)
                        if (code) break
                    } catch (requestError) {
                        error = requestError
                    }
                }
                if (!code) throw error || new Error('WhatsApp did not return a pairing code. Try again.')
                console.log(`PAIRING CODE: ${code}`)
            } catch (err) {
                console.error('Failed to send pairing code:', err.message)
                process.exit(1)
            } finally {
                rl?.close(); rl = null
            }
        }

        socket.ev.on('creds.update', async update => {
            if (socket !== waClient) return
            try {
                const temp = `${credsPath}.tmp`
                fs.writeFileSync(temp, JSON.stringify(state.creds, BufferJSON.replacer))
                fs.renameSync(temp, credsPath)
            } catch {
                await saveCreds(update)
            }
            if (update?.registered === false) disableReconnectForLogout()
        })

        socket.ev.on('messages.upsert', async ({ messages, type }) => {
            if (socket !== waClient) return
            if (!messages?.length) return
            for (const raw of messages) {
                socket.rememberMessage(raw)
                const remote = raw?.key?.remoteJid || ''
                if (!raw?.key?.fromMe && remote && remote !== 'status@broadcast' && !remote.endsWith('@newsletter')) {
                    const today = new Date().toISOString().slice(0, 10)
                    panelDb.stats.dailyMessages[today] = (panelDb.stats.dailyMessages[today] || 0) + 1
                    savePanelDb()
                }
                if (!raw?.key?.fromMe && !remote.endsWith('@g.us') && remote !== 'status@broadcast') {
                    try {
                        ensurePanelUser(
                            remote,
                            raw.pushName || '',
                            String(
                                raw.message?.conversation ||
                                raw.message?.extendedTextMessage?.text ||
                                raw.message?.imageMessage?.caption ||
                                raw.message?.videoMessage?.caption ||
                                '[non-text message]'
                            ).slice(0, 500)
                        )
                    } catch {}
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
                    } catch (e) {
                        console.error('[MESSAGE] Failed to process message:', e)
                    }
                })
            }
        })

        socket.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
            if (socket !== waClient) return
            const statusCode = getStatusCode(lastDisconnect)
            const errorMessage = [
                lastDisconnect?.error?.message,
                lastDisconnect?.error?.data?.message,
                lastDisconnect?.error?.data?.reason,
                lastDisconnect?.error?.output?.payload?.message,
                lastDisconnect?.error?.cause?.message,
                lastDisconnect?.error?.cause?.data?.message
            ].filter(Boolean).join(' ')

            if (connection === 'open') {
                botConnected = true
                if (socketOpened) return
                socketOpened = true
                isConnecting = false
                if (globalThis.__preciousOnlinePresenceTimer) clearInterval(globalThis.__preciousOnlinePresenceTimer)
                if (global.alwaysOnline) {
                    try { await socket.sendPresenceUpdate('available') } catch (error) {
                        console.warn('[PRESENCE] Initial online presence failed:', error?.message || error)
                    }
                    globalThis.__preciousOnlinePresenceTimer = setInterval(() => {
                        if (socket === waClient && global.alwaysOnline) {
                            socket.sendPresenceUpdate('available').catch(error =>
                                console.warn('[PRESENCE] Keepalive failed:', error?.message || error)
                            )
                        }
                    }, 25000)
                    globalThis.__preciousOnlinePresenceTimer.unref?.()
                }
                if (reconnectStabilityTimer) clearTimeout(reconnectStabilityTimer)
                reconnectStabilityTimer = setTimeout(() => {
                    reconnectStabilityTimer = null
                    if (socket === waClient && socketOpened) reconnectAttempts = 0
                }, RECONNECT_STABLE_MS)
                if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
                wireEventDispatchers(socket)
                await followConfiguredNewsletters(socket)
                console.log(chalk.greenBright(`[CONNECTION] Connected as ${socket.decodeJid(socket.user.id)}`))
                if (!connectionAnnounced) {
                    connectionAnnounced = true
                    try {
                        const ownJid = socket.decodeJid(socket.user.id)
                        const botNumber = ownJid.split('@')[0]
                        await socket.sendMessage(ownJid, {
                            text: `*${global.botName}*\n\nBot connected successfully.\n\nNumber: *${botNumber}*\nMode: *${global.botMode}* | Prefix: *${global.prefix || 'none'}*`
                        })
                    } catch {}
                }
                return
            }

            if (connection === 'close') {
                if (globalThis.__preciousOnlinePresenceTimer) {
                    clearInterval(globalThis.__preciousOnlinePresenceTimer)
                    globalThis.__preciousOnlinePresenceTimer = null
                }
                // flip connected BEFORE notifying so we don't try to send on a dead socket
                botConnected = false
                notifyPanel('disconnect', 'WhatsApp connection lost.').catch(() => {})
                socketOpened = false
                isConnecting = false
                if (reconnectStabilityTimer) { clearTimeout(reconnectStabilityTimer); reconnectStabilityTimer = null }
                if (isLoggedOutDisconnect(statusCode)) {
                    disableReconnectForLogout()
                    return
                }
                if (logoutDetected) return
                if (statusCode === DisconnectReason.connectionReplaced) {
                    disableReconnectForLogout('Session opened on another instance. Reconnect stopped to avoid a takeover loop.')
                    return
                }
                let delay = 1000
                if (statusCode !== DisconnectReason.restartRequired) {
                    const base = errorMessage.includes('Stream Errored')
                        ? 15000
                        : (statusCode === DisconnectReason.connectionLost || statusCode === 0) ? 8000 : 5000
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
// HTTP server / panel API
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname
    try {
        if (req.method === 'GET' && pathname === '/api/auth/status') {
            return json(res, 200, { configured: Boolean(process.env.PANEL_PASSWORD || savedPasswordHash()), envOverride: Boolean(process.env.PANEL_PASSWORD) })
        }
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
            return json(res, 201, { ok: true, token: authToken(), message: 'Panel password created.' })
        }
        if (req.method === 'POST' && pathname === '/api/auth/login') {
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
            return json(res, 200, { ok: true, token: authToken(), message: 'Unlocked.' })
        }
        if (req.method === 'POST' && pathname === '/api/auth/logout') {
            const token = String(req.headers['x-dashboard-token'] || '')
            if (token) panelSessions.delete(token)
            return json(res, 200, { ok: true, message: 'Dashboard session locked.' })
        }
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
            return json(res, 200, { ok: true, message: 'Password changed. Please log in again.' })
        }

        // Unauthenticated status: safe, minimal, no owner number leak.
        if (req.method === 'GET' && pathname === '/api/status' && !isPanelAuthed(req)) {
            return json(res, 200, {
                botName: 'PRECIOUS-MD',
                status: botConnected ? 'Online' : (manuallyStopped ? 'Stopped' : 'Offline'),
                connected: botConnected,
                mode: global.botMode || 'public',
                uptime: Math.floor(process.uptime())
            })
        }

        if (pathname.startsWith('/api/')) {
            if (!isPanelAuthed(req)) return json(res, 401, { error: 'Authentication required. Unlock the dashboard first.' })

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
            if (req.method === 'GET' && pathname === '/api/status') {
                return json(res, 200, {
                    botName: 'PRECIOUS-MD', displayName: 'watsonxd', ownerNumber: global.ownerNumber || '',
                    ownerTitle: 'Zimbabwe guy', status: botConnected ? 'Online' : (manuallyStopped ? 'Stopped' : 'Offline'),
                    connected: botConnected, mode: global.botMode || 'public', uptime: Math.floor(process.uptime()),
                    runtime: Math.floor(process.uptime()), lastRestart: new Date(panelStartedAt).toISOString(),
                    lastDeploy: panelLastDeploy, hosting: process.env.RENDER ? 'Render' : process.env.DYNO ? 'Heroku' : process.env.PANEL ? 'Panel' : 'Node.js',
                    memory: process.memoryUsage(), cpu: process.cpuUsage(), plugins: cachedPluginCount,
                    commands: panelDb.stats?.commands || 0,
                    messagesToday: panelDb.stats?.dailyMessages?.[new Date().toISOString().slice(0, 10)] || 0,
                    pairingCode
                })
            }
            if (req.method === 'GET' && pathname === '/api/settings') {
                const settings = getPanelSettings()
                delete settings.panelPasswordHash
                return json(res, 200, settings)
            }
            if (req.method === 'GET' && pathname === '/api/notifications') return json(res, 200, panelDb.notifications)
            if (req.method === 'PUT' && pathname === '/api/notifications') {
                const body = await readBody(req, 4096)
                panelDb.notifications = { disconnect: Boolean(body.disconnect), newUser: Boolean(body.newUser), error: Boolean(body.error) }
                savePanelDb()
                return json(res, 200, { ok: true, message: 'Notification preferences saved.' })
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
                const q = cleanNumber(new URL(req.url, 'http://localhost').searchParams.get('q') || '')
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
                return json(res, 200, { ok: true, message: 'Auto reply settings saved. Welcome/goodbye event behavior requires group settings support.' })
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
            if (req.method === 'PATCH' && pathname === '/api/settings') {
                const body = await readBody(req, 20000); const s = getPanelSettings()
                for (const key of ['chatbotMode', 'aiModel', 'aiPersonality', 'mode', 'prefix']) if (body[key] !== undefined) s[key] = String(body[key]).slice(0, 2000)
                if (body.aiEnabled !== undefined) s.chatbotMode = body.aiEnabled ? 'all' : 'off'
                const booleanSettings = ['autoViewStatus', 'autoLikeStatus', 'autoReact', 'alwaysOnline']
                for (const key of booleanSettings) {
                    if (typeof body[key] === 'boolean') {
                        s[key] = body[key]
                        global[key] = body[key]
                    }
                }
                if (body.mode === 'public' || body.mode === 'private') global.botMode = body.mode
                if (s.chatbotMode && chatbotModes.has(s.chatbotMode)) global.chatbotMode = s.chatbotMode
                savePanelSettings(s)
                if (typeof body.alwaysOnline === 'boolean') {
                    if (globalThis.__preciousOnlinePresenceTimer) { clearInterval(globalThis.__preciousOnlinePresenceTimer); globalThis.__preciousOnlinePresenceTimer = null }
                    if (waClient?.user) {
                        try { await waClient.sendPresenceUpdate(body.alwaysOnline ? 'available' : 'unavailable') } catch {}
                        if (body.alwaysOnline) {
                            const activeSocket = waClient
                            globalThis.__preciousOnlinePresenceTimer = setInterval(() => {
                                if (activeSocket === waClient && global.alwaysOnline) {
                                    activeSocket.sendPresenceUpdate('available').catch(() => {})
                                }
                            }, 25000)
                            globalThis.__preciousOnlinePresenceTimer.unref?.()
                        }
                    }
                }
                return json(res, 200, { ok: true, message: 'Settings saved.' })
            }
            if (req.method === 'POST' && pathname === '/api/ai/clear') {
                const chatbot = await import('./lib/events/chatbot.js')
                chatbot.clearChatbotMemory()
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
                if (fs.existsSync(tempDir)) for (const item of fs.readdirSync(tempDir)) { const f = path.join(tempDir, item); fs.rmSync(f, { recursive: true, force: true }) }
                fs.mkdirSync(tempDir, { recursive: true })
                return json(res, 200, { ok: true, message: 'Temporary media cache cleared.' })
            }
            if (req.method === 'POST' && pathname === '/api/control') {
                const body = await readBody(req, 4096); const action = String(body.action || '')
                if (action === 'start') {
                    manuallyStopped = false; logoutDetected = false; isConnecting = false
                    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
                    await start()
                    return json(res, 200, { ok: true, message: 'Bot start requested.' })
                }
                if (action === 'stop') {
                    manuallyStopped = true; botConnected = false
                    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
                    if (reconnectStabilityTimer) { clearTimeout(reconnectStabilityTimer); reconnectStabilityTimer = null }
                    try { waClient?.ev.removeAllListeners(); waClient?.ws?.close?.() } catch {}
                    waClient = null; isConnecting = false
                    return json(res, 200, { ok: true, message: 'Bot stopped.' })
                }
                if (action === 'restart') {
                    manuallyStopped = true
                    isConnecting = false
                    if (reconnectTimer) clearTimeout(reconnectTimer)
                    try { waClient?.ev.removeAllListeners(); waClient?.ws?.close?.() } catch {}
                    waClient = null; botConnected = false; manuallyStopped = false
                    setTimeout(() => start(), 500)
                    return json(res, 200, { ok: true, message: 'Bot restart requested.' })
                }
                if (action === 'logout' || action === 'clear-session') {
                    manuallyStopped = true; botConnected = false; isConnecting = false
                    if (reconnectTimer) clearTimeout(reconnectTimer)
                    try { await waClient?.logout?.() } catch {}
                    waClient = null; pairingCode = null
                    return json(res, 200, { ok: true, message: 'WhatsApp session cleared.' })
                }
                if (action === 'reconnect') {
                    try { waClient?.ws?.close?.() } catch {}
                    return json(res, 200, { ok: true, message: 'Reconnect requested.' })
                }
                return json(res, 400, { error: 'Unknown action.' })
            }
            return json(res, 404, { error: 'Unknown API route.' })
        }

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

const PORT = process.env.PORT || 3000
let healthServerStarting = false
let healthServerReady = false
let healthServerRetryTimer = null

function startHealthServer() {
    if (!isWorker || healthServerStarting || healthServerReady) return
    healthServerStarting = true
    const onListening = () => {
        healthServerStarting = false
        healthServerReady = true
        server.off('error', onError)
    }
    const onError = error => {
        healthServerStarting = false
        server.off('listening', onListening)
        if (error.code === 'EADDRINUSE') {
            if (!healthServerRetryTimer) {
                healthServerRetryTimer = setTimeout(() => {
                    healthServerRetryTimer = null
                    startHealthServer()
                }, 1000)
            }
            return
        }
        console.error('[SERVER] Health server error:', error.message || error)
    }
    server.once('listening', onListening)
    server.once('error', onError)
    server.listen(PORT)
}

if (isWorker) startHealthServer()

export function requestRestart() {
    if (typeof process.send === 'function') {
        process.send('restart')
        return
    }
    process.exit(0)
}

const isLoggedOutDisconnect = statusCode => Number(statusCode) === Number(DisconnectReason.loggedOut)

const shutdown = async () => {
    flushPanelDbSync()
    if (!isWorker) {
        supervisorStopping = true
        supervisorWorker?.kill('SIGTERM')
        process.exit(0)
    }
    try {
        if (healthServerRetryTimer) clearTimeout(healthServerRetryTimer)
        if (reconnectTimer) clearTimeout(reconnectTimer)
        if (reconnectStabilityTimer) clearTimeout(reconnectStabilityTimer)
        waClient?.ev.removeAllListeners()
        waClient?.ws?.close?.()
    } catch {}
    process.exit(0)
}

process.on('unhandledRejection', error => console.error('[UNHANDLED]', error))
process.on('uncaughtException', error => {
    console.error('[UNCAUGHT]', error)
    // Let the supervisor restart the worker instead of limping along in a bad state.
    try { flushPanelDbSync() } catch {}
    if (isWorker) process.exit(1)
})
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

let supervisorDelay = 500

function startSupervisor() {
    if (supervisorStopping) return
    const startedAt = Date.now()
    supervisorWorker = spawn(process.execPath, [process.argv[1], '--child'], {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env: process.env
    })
    supervisorWorker.on('message', message => {
        if (message === 'restart') supervisorWorker?.kill('SIGTERM')
    })
    supervisorWorker.on('exit', () => {
        supervisorWorker = null
        if (supervisorStopping) return
        supervisorDelay = Date.now() - startedAt > 30000 ? 500 : Math.min(supervisorDelay * 2, 60000)
        setTimeout(startSupervisor, supervisorDelay)
    })
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    if (isWorker) start()
    else startSupervisor()
}