// lib/events/statuslistener.js
const processedStatusMessages = new Map()
const STATUS_DEDUP_LIMIT = 1200
const STATUS_DEDUP_TTL = 10 * 60 * 1000

const DEFAULT_EMOJIS = ['🌝', '🇿🇼', '👏', '😂', '🥰', '🍃', '✅️', '😄', '😳', '🧡', '😪']

function statusParticipant(key) {
    const candidates = [key?.participantAlt, key?.participant]
    for (const candidate of candidates) {
        if (typeof candidate !== 'string' || !candidate.includes('@')) continue
        const [user, server] = candidate.split('@')
        if (server === 's.whatsapp.net') return `${user.split(':')[0]}@${server}`
        if (server === 'lid') return candidate
    }
    return null
}

function rememberStatus(id) {
    const now = Date.now()
    for (const [key, time] of processedStatusMessages) {
        if (now - time > STATUS_DEDUP_TTL) processedStatusMessages.delete(key)
        else break
    }
    if (processedStatusMessages.has(id)) return false
    processedStatusMessages.set(id, now)
    while (processedStatusMessages.size > STATUS_DEDUP_LIMIT) {
        processedStatusMessages.delete(processedStatusMessages.keys().next().value)
    }
    return true
}

async function statusHandler(waClient, data) {
    try {
        if (!waClient) return

        const type = data?.type
        const messages = Array.isArray(data?.messages) ? data.messages : []

        // Accept both 'notify' and 'append' — WhatsApp delivers statuses as either,
        // depending on whether it's a live status or caught up on reconnect.
        if (type !== 'notify' && type !== 'append') return
        if (!messages.length) return

        const autoView = global.autoViewStatus === true
        const autoLike = global.autoLikeStatus === true
        if (!autoView && !autoLike) return

        for (const raw of messages) {
            const key = raw?.key
            if (!key?.id) continue
            if (key.remoteJid !== 'status@broadcast') continue
            if (key.fromMe) continue
            if (!raw?.message) continue

            const participant = statusParticipant(key)
            if (!participant) continue

            const dedupId = `${participant}:${key.id}`
            if (!rememberStatus(dedupId)) continue

            const statusKey = {
                remoteJid: 'status@broadcast',
                id: key.id,
                fromMe: false,
                participant
            }

            // ---- Auto view ----
            if (autoView) {
                try {
                    await waClient.readMessages([statusKey])
                    console.log('[STATUS] ✓ viewed status from', participant)
                } catch (error) {
                    console.warn('[STATUS] View receipt failed:', error?.message || error)
                }
            }

            // ---- Auto react ----
            if (autoLike) {
                const emojis = (Array.isArray(global.autoLikeStatusEmojis) && global.autoLikeStatusEmojis.length
                    ? global.autoLikeStatusEmojis
                    : DEFAULT_EMOJIS
                ).filter(Boolean)
                const emoji = emojis[Math.floor(Math.random() * emojis.length)] || '🌝'

                try {
                    await waClient.sendMessage(
                        'status@broadcast',
                        { react: { text: emoji, key: statusKey } },
                        { statusJidList: [participant] }
                    )
                    console.log('[STATUS] ✓ reacted', emoji, 'to status from', participant)
                } catch (error) {
                    console.warn('[STATUS] Reaction failed:', error?.message || error)
                }
            }
        }
    } catch (error) {
        console.error('[STATUS] Handler crashed:', error)
    }
}

const statusEvent = {
    on: 'messages.upsert',
    handler: statusHandler
}

statusEvent.default = statusEvent

export default new Proxy(statusEvent, {
    apply(_target, _thisArg, args) {
        return statusHandler(args[0], args[1])
    }
})