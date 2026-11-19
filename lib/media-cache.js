
const messageCache = new Map()

const MAX_MESSAGES = 1000

export function cacheMessage(m) {
    const key = m.key?.id
    if (!key) return

    const chat = m.key.remoteJid
    const id = `${chat}:${key}`

    messageCache.set(id, m)

    if (messageCache.size > MAX_MESSAGES) {
        const oldest = messageCache.keys().next().value
        messageCache.delete(oldest)
    }
}

export function getCachedMessage(chat, id) {
    return messageCache.get(`${chat}:${id}`) || null
}
