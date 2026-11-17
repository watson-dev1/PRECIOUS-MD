const processedStatusMessages = new Map()
const STATUS_DEDUP_LIMIT = 1200
const STATUS_DEDUP_TTL = 10 * 60 * 1000

function statusParticipant(key) {
    const candidates = [key?.participantAlt, key?.participant]
    for (const candidate of candidates) {
        if (typeof candidate !== 'string' || !candidate.includes('@')) continue
        // Status reaction/read receipts require a user JID, not a device-qualified JID.
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
    }
    if (processedStatusMessages.has(id)) return false
    processedStatusMessages.set(id, now)
    while (processedStatusMessages.size > STATUS_DEDUP_LIMIT) {
        processedStatusMessages.delete(processedStatusMessages.keys().next().value)
    }
    return true
}

let handler = async (waClient, { messages = [], type }) => {
    if (type !== 'notify' || (!global.autoViewStatus && !global.autoLikeStatus)) return

    for (const raw of messages) {
        const key = raw?.key
        if (key?.remoteJid !== 'status@broadcast' || key?.fromMe || !raw?.message || !key?.id) continue

        const participant = statusParticipant(key)
        if (!participant || !rememberStatus(`${participant}:${key.id}`)) continue

        const statusKey = {
            remoteJid: 'status@broadcast',
            id: key.id,
            fromMe: false,
            participant
        }

        if (global.autoViewStatus) {
            try {
                await waClient.readMessages([statusKey])
            } catch (error) {
                console.warn('[STATUS] View receipt failed:', error?.message || error)
            }
        }

        if (global.autoLikeStatus) {
            const emojis = (global.autoLikeStatusEmojis || ['🌝', '🇿🇼', '👏', '😂', '🥰', '🍃', '✅️', '😄', '😳', '🧡', '😪']).filter(Boolean)
            const emoji = emojis[Math.floor(Math.random() * emojis.length)] || '🌝'
            try {
                await waClient.sendMessage('status@broadcast', {
                    react: { text: emoji, key: statusKey }
                }, { statusJidList: [participant] })
            } catch (error) {
                console.warn('[STATUS] Reaction failed:', error?.message || error)
            }
        }
    }
}

handler.on = 'messages.upsert'
export default handler
