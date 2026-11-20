import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SETTINGS_PATH = path.join(__dirname, '..', '..', 'database', 'settings.json')

const STATUS_DEDUP_LIMIT = 1200
const STATUS_DEDUP_TTL = 10 * 60 * 1000
const processedStatuses = new Map()

function readSettings() {
    try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) }
    catch (error) { console.error('[STATUS] Settings read failed:', error.message); return {} }
}

function getSettings() {
    const saved = readSettings()

    const globalEmojis = Array.isArray(global.autoLikeStatusEmojis)
        ? global.autoLikeStatusEmojis.filter(e => typeof e === 'string' && e.trim())
        : []
    const savedEmojis = Array.isArray(saved.autoLikeStatusEmojis)
        ? saved.autoLikeStatusEmojis.filter(e => typeof e === 'string' && e.trim())
        : []

    const configuredDefaults = Array.isArray(global.settingsDefaults?.autoLikeStatusEmojis)
        ? global.settingsDefaults.autoLikeStatusEmojis.filter(e => typeof e === 'string' && e.trim())
        : []

    return {
        autoView: global.autoViewStatus === true || saved.autoViewStatus === true,
        autoReact: global.autoLikeStatus === true || saved.autoLikeStatus === true,
        // Never invent a reaction: use the active setting, persisted setting, or config defaults only.
        emojis: globalEmojis.length ? globalEmojis : savedEmojis.length ? savedEmojis : configuredDefaults
    }
}

function getParticipant(key) {
    const candidates = [key?.participantAlt, key?.participant]
    let lid = null

    for (const jid of candidates) {
        if (typeof jid !== 'string') continue
        const [user, server] = jid.split('@')
        if (!user || !server) continue
        const number = user.split(':')[0]
        if (server === 's.whatsapp.net') return `${number}@s.whatsapp.net`
        if (server === 'lid' && !lid) lid = jid
    }

    return lid
}

function alreadyProcessed(id) {
    const now = Date.now()
    for (const [key, timestamp] of processedStatuses) {
        if (now - timestamp > STATUS_DEDUP_TTL) processedStatuses.delete(key)
        else break
    }
    return processedStatuses.has(id)
}

function markProcessed(id) {
    processedStatuses.set(id, Date.now())
    while (processedStatuses.size > STATUS_DEDUP_LIMIT) {
        processedStatuses.delete(processedStatuses.keys().next().value)
    }
}

function pickEmoji(emojis) {
    const list = (emojis || []).filter(e => typeof e === 'string' && e.trim())
    if (!list.length) return ''
    return list[Math.floor(Math.random() * list.length)]
}

async function statusHandler(client, data) {
    try {
        if (!client || !data) return
        if (data.type !== 'notify' && data.type !== 'append') return

        const messages = Array.isArray(data.messages) ? data.messages : []
        if (!messages.length) return

        const settings = getSettings()
        if (!settings.autoView && !settings.autoReact) return

        for (const message of messages) {
            try {
                const key = message?.key
                if (!key?.id) continue
                if (key.remoteJid !== 'status@broadcast') continue
                if (key.fromMe) continue
                if (!message.message) continue

                const participant = getParticipant(key)
                if (!participant) { console.log('[STATUS] Missing participant'); continue }

                const id = `${participant}:${key.id}`
                if (alreadyProcessed(id)) continue

                // Preserve the original key so WhatsApp matches the reaction
                const statusKey = { ...key, remoteJid: 'status@broadcast', fromMe: false, participant }

                let viewed = false
                let reacted = false

                if (settings.autoView) {
                    try {
                        await client.readMessages([statusKey])
                        viewed = true
                        console.log('[STATUS] VIEWED:', participant)
                    } catch (error) {
                        console.error('[STATUS] VIEW ERROR:', error.message)
                    }
                }

                if (settings.autoReact) {
                    try {
                        const emoji = pickEmoji(settings.emojis)
                        if (!emoji) throw new Error('No status reaction emojis are configured.')
                        await client.sendMessage(
                            'status@broadcast',
                            { react: { text: emoji, key: statusKey } },
                            { statusJidList: [participant] }
                        )
                        reacted = true
                        console.log('[STATUS] REACTED:', emoji, participant)
                    } catch (error) {
                        console.error('[STATUS] REACTION ERROR:', error.message)
                    }
                }

                if (viewed || reacted) markProcessed(id)
            } catch (error) {
                console.error('[STATUS] Message error:', error)
            }
        }
    } catch (error) {
        console.error('[STATUS] Handler crashed:', error)
    }
}

export default {
    on: 'messages.upsert',
    handler: statusHandler
}