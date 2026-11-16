let handler = async (waClient, { messages, type }) => {
    if (type !== 'notify' || !global.autoRead) return

    const keys = (messages || [])
        .filter(message => message?.message && !message.key?.fromMe && message.key?.remoteJid && message.key.remoteJid !== 'status@broadcast')
        .map(message => message.key)

    if (keys.length) {
        await waClient.readMessages(keys).catch(() => {})
    }
}

handler.on = 'messages.upsert'

export default handler
