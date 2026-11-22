import { getFeature, ownerJid, numberOf } from '../featurestore.js'
import { statusToPayload, statusKind } from '../statusutil.js'

// ─────────────────────────────────────────────────────────────────────────────
// STATUS VIEW + STATUS REACT  (single source of truth — no other file does this)
//
//   config.js  →  AUTO_STATUS_VIEW   true | false   (bot views contacts' statuses)
//                 AUTO_STATUS_REACT  true | false   (bot reacts to contacts' statuses)
//
// Also keeps the owner tools that already lived here: auto-save status,
// anti-delete status and the statusignore / statusonly lists.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_DEDUP_LIMIT = 1500
const STATUS_DEDUP_TTL = 30 * 60 * 1000
const STATUS_MAX_AGE = 24 * 60 * 60        // WhatsApp statuses live 24h (seconds)
const BACKLOG_REACT_MAX_AGE = 15 * 60      // statuses that arrive late (after a reconnect) are only reacted to if this fresh (seconds)
const STATUS_QUEUE_LIMIT = 300
const STATUS_ACTION_DELAY = [1200, 2600]   // random pause (ms) before each status, keeps it natural + rate-limit safe
const processedStatuses = new Map()

// The ONLY emojis the bot may use when reacting to a status (picked at random).
const STATUS_REACT_EMOJIS = Object.freeze(['💚', '💛', '💓', '❤️', '💙'])

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const jitter = ([min, max]) => min + Math.floor(Math.random() * (max - min + 1))

// Switches live in config.js (AUTO_STATUS_VIEW / AUTO_STATUS_REACT), read on every status
const statusToggles = () => ({
    view: global.AUTO_STATUS_VIEW === true,
    react: global.AUTO_STATUS_REACT === true
})

const bare = jid => {
    if (typeof jid !== 'string' || !jid.includes('@')) return null
    const [user, server] = jid.split('@')
    return `${user.split(':')[0]}@${server}`
}

function getOwnJids(client) {
    const ids = [client?.user?.id, client?.user?.lid].map(bare).filter(Boolean)
    return [...new Set(ids)]
}

// Who posted the status. Prefer the phone-number JID, fall back to the LID.
function getPoster(key) {
    const candidates = [key?.participantAlt, key?.participant].map(bare).filter(Boolean)
    return candidates.find(j => j.endsWith('@s.whatsapp.net')) || candidates[0] || null
}

function isRealStatus(message) {
    const content = message?.message
    if (!content) return false
    const types = Object.keys(content).filter(t => t !== 'messageContextInfo' && t !== 'senderKeyDistributionMessage')
    if (!types.length) return false
    // Ignore protocol messages (deletes/revokes) and reaction messages
    return !types.every(t => t === 'protocolMessage' || t === 'reactionMessage')
}

const statusAge = message => {
    const stamp = message?.messageTimestamp
    const ts = Number(stamp?.toNumber?.() ?? stamp) || 0
    return ts > 0 ? (Date.now() / 1000 - ts) : 0
}
const isTooOld = message => statusAge(message) > STATUS_MAX_AGE


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

const pickEmoji = () => STATUS_REACT_EMOJIS[Math.floor(Math.random() * STATUS_REACT_EMOJIS.length)]

async function withRetry(fn, tries = 2) {
    let lastError
    for (let i = 0; i < tries; i++) {
        try { return await fn() }
        catch (error) { lastError = error; if (i < tries - 1) await sleep(1200) }
    }
    throw lastError
}

// Really mark a status as seen.
// Baileys' readMessages() silently downgrades to a "read-self" receipt when the bot
// account has read receipts switched off in its privacy settings — the poster then never
// sees the view. A direct 'read' receipt always counts, so it goes first; readMessages
// is only the fallback.
async function viewStatus(client, key) {
    const participant = key.participant || key.participantAlt
    if (typeof client.sendReceipt === 'function' && participant) {
        try {
            await client.sendReceipt('status@broadcast', participant, [key.id], 'read')
            return 'receipt'
        } catch (error) {
            console.error('[STATUS] receipt failed, falling back to readMessages:', error?.message || error)
        }
    }
    await client.readMessages([key])
    return 'readMessages'
}

async function handleStatus(client, message, toggles, fresh) {
    const key = message.key
    const poster = getPoster(key)
    if (!poster) { console.log('[STATUS] Missing participant'); return }

    if (!passesFilters(poster)) return

    const id = `${poster}:${key.id}`
    if (!claim(id)) return

    if (toggles.view || toggles.react) await sleep(jitter(STATUS_ACTION_DELAY))

    let viewed = false
    let reacted = false

    // Always use the ORIGINAL key exactly as WhatsApp delivered it (LID or PN).
    // Rewriting participant breaks the match on WhatsApp's side.
    if (toggles.view) {
        try {
            const how = await withRetry(() => viewStatus(client, key))
            viewed = true
            console.log(`[STATUS] VIEWED (${how}):`, poster)
        } catch (error) {
            console.error('[STATUS] VIEW ERROR:', error?.message || error)
        }
    }

    // Statuses that only reached us after a reconnect are viewed, but only reacted to
    // while still fresh — avoids a burst of reactions to old statuses after a restart.
    if (toggles.react && fresh) {
        try {
            const emoji = pickEmoji()
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
            console.error('[STATUS] REACT ERROR:', error?.message || error)
        }
    }

    // Let a later redelivery retry if nothing worked
    if ((toggles.view || toggles.react) && !viewed && !reacted) release(id)

    await archiveStatus(client, message, poster, id)
}

// Statuses are handled one at a time in the background so a burst (or a backlog after
// a reconnect) never blocks the other event handlers and never trips WhatsApp's rate limit.
let queueTail = Promise.resolve()
let queued = 0
function enqueue(task) {
    if (queued >= STATUS_QUEUE_LIMIT) return
    queued++
    queueTail = queueTail
        .then(task)
        .catch(error => console.error('[STATUS] Message error:', error))
        .finally(() => { queued-- })
}

async function statusHandler(client, data) {
    try {
        if (!client || !data) return
        // 'notify' = live status. 'append' = statuses that were waiting while the bot was
        // offline/reconnecting (very common on Render) — they must be handled too.
        if (data.type !== 'notify' && data.type !== 'append') return

        const messages = Array.isArray(data.messages) ? data.messages : []
        if (!messages.length) return

        // Deleted statuses (anti-delete)
        for (const message of messages) {
            if (message?.key?.remoteJid === 'status@broadcast' && !message.key.fromMe && [0, 'REVOKE'].includes(message.message?.protocolMessage?.type)) {
                await handleRevoke(client, message).catch(() => {})
            }
        }

        const toggles = statusToggles()
        const wantsArchive = getFeature('autoSaveStatus', false) || getFeature('antiDeleteStatus', false)
        if (!toggles.view && !toggles.react && !wantsArchive) return

        const statuses = messages.filter(message =>
            message?.key?.id &&
            message.key.remoteJid === 'status@broadcast' &&
            !message.key.fromMe &&
            isRealStatus(message) &&
            !isTooOld(message)
        )

        for (const message of statuses) {
            const fresh = data.type === 'notify' || statusAge(message) <= BACKLOG_REACT_MAX_AGE
            enqueue(() => handleStatus(client, message, toggles, fresh))
        }
    } catch (error) {
        console.error('[STATUS] Handler crashed:', error)
    }
}

export default {
    on: 'messages.upsert',
    handler: statusHandler
}
