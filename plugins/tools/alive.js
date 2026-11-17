// plugins/alive.js
const formatUptime = seconds => {
    const total = Math.max(0, Math.floor(Number(seconds) || 0))
    const days = Math.floor(total / 86400)
    const hours = Math.floor((total % 86400) / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const remaining = total % 60
    return [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`, `${remaining}s`]
        .filter(Boolean).join(' ') || '0s'
}

let handler = async (m, { waClient }) => {
    // ---- Socket guard ----
    if (!waClient?.user?.id) {
        return m.reply('❌ Bot is not fully connected yet. Try again in a moment.')
    }

    const uptimeText = formatUptime(process.uptime())
    const mem = process.memoryUsage()
    const rss = (mem.rss / 1048576).toFixed(1)

    const owner = global.ownerNumber || 'watson-dev1'
    const mode = global.botMode || 'public'
    const prefix = global.prefix || '.'
    const user = String(m.pushName || 'User').replace(/[*_`~]/g, '')

    const text = [
        `*✅ PRECIOUS-MD is ONLINE*`,
        ``,
        `┃ 👤 User: ${user}`,
        `┃ 👑 Owner: ${owner}`,
        `┃ ⚙️ Mode: ${mode}`,
        `┃ 🔤 Prefix: ${prefix}`,
        `┃ ⏱️ Uptime: ${uptimeText}`,
        `┃ 🧠 RAM: ${rss} MB`,
        `┃ 🟢 Status: Connected`,
        ``,
        `> PRECIOUS-MD by watson-dev1`
    ].join('\n')

    try {
        await waClient.sendMessage(m.chat, { text }, { quoted: m })
    } catch (err) {
        console.warn('[ALIVE] Send failed:', err?.message || err)
        await m.reply(text).catch(() => {})
    }
}

handler.command = ['alive']
handler.category = 'General'
handler.description = 'Confirm the bot is online with live status'
handler.usage = 'alive'
handler.ownerBypassAdmin = true

export default handler