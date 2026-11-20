import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getFeature, ownerJid, numberOf } from '../featurestore.js'
import { statusToPayload, statusKind } from '../statusutil.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SETTINGS_PATH = path.join(__dirname, '..', '..', 'database', 'settings.json')

const STATUS_DEDUP_LIMIT = 1500
const STATUS_DEDUP_TTL = 30 * 60 * 1000
const STATUS_MAX_AGE = 24 * 60 * 60 // WhatsApp statuses live 24h (seconds)
const processedStatuses = new Map()

const clean = list => Array.isArray(list) ? list.filter(e => typeof e === 'string' && e.trim()) : []
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function readSettings() {
    try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) }
    catch { return {} }
}

// The live `global` values are the source of truth (commands and the panel update them
// immediately). The settings file is only a fallback when a global was never set, so
// turning a feature OFF actually sticks.
function getSettings() {
    const saved = readSettings()
    const pick = (live, stored, fallback = false) =>
        typeof live === 'boolean' ? live : typeof stored === 'boolean' ? stored : fallback

    const liveEmojis = clean(global.autoLikeStatusEmojis)
    const savedEmojis = clean(saved.autoLikeStatusEmojis)
    const defaultEmojis = clean(global.settingsDefaults?.autoLikeStatusEmojis)

    const delay = Number(global.statusViewDelay ?? global.settingsDefaults?.statusViewDelay)

    return {
        autoView: pick(global.autoViewStatus, saved.autoViewStatus, true),
        autoReact: pick(global.autoLikeStatus, saved.autoLikeStatus, false),
        emojis: liveEmojis.length ? liveEmojis : savedEmojis.length ? savedEmojis : defaultEmojis,
        delay: Number.isFinite(delay) && delay >= 0 ? Math.min(delay, 30000) : 1500
    }
}

const bare = jid => {
    if (typeof jid !== 'string' || !jid.includes('@')) return null
    const [user, server] = jid.split('@')
    return `${user.split(':')[0]}@${server}`
}

// Who posted the status. Prefer the phone-number JID, fall back to the LID.
function getPoster(key) {
    const candidates = [key?.participantAlt, key?.participant].map(bare).filter(Boolean)
    return candidates.find(j => j.endsWith('@s.whatsapp.net')) || candidates[0] || null
}

function getOwnJids(client) {
    const ids = [client?.user?.id, client?.user?.lid].map(bare).filter(Boolean)
    return [...new Set(ids)]
}

function isRealStatus(message) {
    const content = message?.message
    if (!content) return false
    const types = Object.keys(content).filter(t => t !== 'messageContextInfo' && t !== 'senderKeyDistributionMessage')
    if (!types.length) return false
    // Ignore protocol messages (deletes/revokes) and reactions to statuses
    return !types.every(t => t === 'protocolMessage' || t === 'reactionMessage')
}

function isTooOld(message) {
    const stamp = message?.messageTimestamp
    const ts = Number(stamp?.toNumber?.() ?? stamp) || 0
    return ts > 0 && (Date.now() / 1000 - ts) > STATUS_MAX_AGE
}


// ---- anti-delete cache (only filled while antiDeleteStatus is ON) ----
const cache = new Map() // statusId -> { message, poster, payload, bytes }
const CACHE_ITEMS = 60
const CACHE_BYTES = 60 * 1024 * 1024
let cacheBytes = 0

function cacheAdd(id, entry) {
    cache.set(id, entry)
    cacheBytes += entry.bytes
    while (cache.size > CACHE_ITEMS || cacheBytes > CACHE_BYTES) {
        const [oldKey, old] = cache.entries().next().value
        cacheBytes -= old.bytes
        cache.delete(oldKey)
    }
}

const payloadBytes = payload => Buffer.isBuffer(payload?.image || payload?.video || payload?.audio)
    ? (payload.image || payload.video || payload.audio).length : 0

async function sendToOwner(client, payload, extra = {}) {
    const to = ownerJid()
    if (!to || to.startsWith('@')) return
    await client.sendMessage(to, { ...payload, ...extra })
}

function passesFilters(poster) {
    const number = numberOf(poster)
    const ignore = getFeature('statusIgnore', []).map(String)
    const only = getFeature('statusOnly', []).map(String)
    if (ignore.includes(number)) return false
    if (only.length && !only.includes(number)) return false
    return true
}

async function handleRevoke(client, message) {
    if (!getFeature('antiDeleteStatus', false)) return
    const revokedId = message.message?.protocolMessage?.key?.id
    if (!revokedId) return
    for (const [id, entry] of cache) {
        if (!id.endsWith(`:${revokedId}`)) continue
        const number = numberOf(entry.poster)
        try {
            const caption = `🗑️ *Deleted status* from @${number}`
            const payload = entry.payload
            const body = payload.text !== undefined
                ? { text: `${caption}\n\n${payload.text}`, mentions: [entry.poster] }
                : { ...payload, caption: [caption, payload.caption].filter(Boolean).join('\n'), mentions: [entry.poster] }
            await sendToOwner(client, body)
            console.log('[STATUS] ANTI-DELETE forwarded:', number)
        } catch (error) {
            console.error('[STATUS] ANTI-DELETE ERROR:', error?.message || error)
        }
        cacheBytes -= entry.bytes
        cache.delete(id)
        break
    }
}

async function archiveStatus(client, message, poster, id) {
    const wantSave = getFeature('autoSaveStatus', false)
    const wantCache = getFeature('antiDeleteStatus', false)
    if (!wantSave && !wantCache) return
    if (!statusKind(message)) return
    try {
        const payload = await statusToPayload(client, message)
        if (!payload) return
        if (wantCache) cacheAdd(id, { message, poster, payload, bytes: payloadBytes(payload) })
        if (wantSave) {
            const caption = `💾 Status from @${numberOf(poster)}${message.pushName ? ` (${message.pushName})` : ''}`
            const body = payload.text !== undefined
                ? { text: `${caption}\n\n${payload.text}`, mentions: [poster] }
                : { ...payload, caption: [caption, payload.caption].filter(Boolean).join('\n'), mentions: [poster] }
            await sendToOwner(client, body)
            console.log('[STATUS] SAVED:', numberOf(poster))
        }
    } catch (error) {
        console.error('[STATUS] SAVE ERROR:', error?.message || error)
    }
}

function claim(id) {
    const now = Date.now()
    for (const [k, t] of processedStatuses) {
        if (now - t > STATUS_DEDUP_TTL) processedStatuses.delete(k)
        else break
    }
    if (processedStatuses.has(id)) return false
    processedStatuses.set(id, now)
    while (processedStatuses.size > STATUS_DEDUP_LIMIT) {
        processedStatuses.delete(processedStatuses.keys().next().value)
    }
    return true
}

const release = id => processedStatuses.delete(id)

function pickEmoji(emojis) {
    return emojis.length ? emojis[Math.floor(Math.random() * emojis.length)] : ''
}

async function withRetry(fn, tries = 2) {
    let lastError
    for (let i = 0; i < tries; i++) {
        try { return await fn() }
        catch (error) { lastError = error; if (i < tries - 1) await sleep(1200) }
    }
    throw lastError
}

async function handleStatus(client, message, settings) {
    const key = message.key
    const poster = getPoster(key)
    if (!poster) { console.log('[STATUS] Missing participant'); return }

    if (!passesFilters(poster)) return

    const id = `${poster}:${key.id}`
    if (!claim(id)) return

    if (settings.delay) await sleep(settings.delay)

    let viewed = false
    let reacted = false

    // Always use the ORIGINAL key exactly as WhatsApp delivered it (LID or PN).
    // Rewriting participant breaks the match on WhatsApp's side.
    if (settings.autoView) {
        try {
            await withRetry(() => client.readMessages([key]))
            viewed = true
            console.log('[STATUS] VIEWED:', poster)
        } catch (error) {
            console.error('[STATUS] VIEW ERROR:', error?.message || error)
        }
    }

    if (settings.autoReact) {
        try {
            const emoji = pickEmoji(settings.emojis)
            if (!emoji) throw new Error('No status reaction emojis are configured.')
            // statusJidList must contain the poster AND our own account, otherwise
            // the reaction is not delivered to the poster.
            const statusJidList = [...new Set([poster, bare(key.participant), bare(key.participantAlt), ...getOwnJids(client)].filter(Boolean))]
            await withRetry(() => client.sendMessage(
                'status@broadcast',
                { react: { text: emoji, key } },
                { statusJidList }
            ))
            reacted = true
            console.log('[STATUS] REACTED:', emoji, poster)
        } catch (error) {
            console.error('[STATUS] REACTION ERROR:', error?.message || error)
        }
    }

    // Let a later redelivery retry if nothing worked
    if (!viewed && !reacted) release(id)

    await archiveStatus(client, message, poster, id)
}

async function statusHandler(client, data) {
    try {
        if (!client || !data) return
        // Only live statuses. 'append' is history sync and would spam old statuses.
        if (data.type !== 'notify') return

        const messages = Array.isArray(data.messages) ? data.messages : []
        if (!messages.length) return

        // Deleted statuses (anti-delete)
        for (const message of messages) {
            if (message?.key?.remoteJid === 'status@broadcast' && !message.key.fromMe && [0, 'REVOKE'].includes(message.message?.protocolMessage?.type)) {
                await handleRevoke(client, message).catch(() => {})
            }
        }

        const settings = getSettings()
        const wantsArchive = getFeature('autoSaveStatus', false) || getFeature('antiDeleteStatus', false)
        if (!settings.autoView && !settings.autoReact && !wantsArchive) return

        const statuses = messages.filter(message =>
            message?.key?.id &&
            message.key.remoteJid === 'status@broadcast' &&
            !message.key.fromMe &&
            isRealStatus(message) &&
            !isTooOld(message)
        )

        // Don't let one slow status block the others
        await Promise.allSettled(statuses.map(message =>
            handleStatus(client, message, settings).catch(error => console.error('[STATUS] Message error:', error))
        ))
    } catch (error) {
        console.error('[STATUS] Handler crashed:', error)
    }
}

export default {
    on: 'messages.upsert',
    handler: statusHandler
}
