// plugins/ping.js
let handler = async (m, { waClient }) => {
    // ---- 1. Socket health guard ----
    if (!waClient?.user?.id) {
        return m.reply('❌ Bot is not fully connected yet. Try again in a moment.')
    }

    // ---- 2. Measure send round-trip ----
    const start = Date.now()
    let sent
    try {
        sent = await waClient.sendMessage(m.chat, { text: '⚡ Testing speed…' }, { quoted: m })
    } catch (err) {
        console.warn('[PING] Initial send failed:', err?.message || err)
        return m.reply('⚠️ Could not send test message. Check connection.')
    }
    const latency = Date.now() - start

    // ---- 3. Build rich report ----
    const mem = process.memoryUsage()
    const uptime = Math.floor(process.uptime())
    const days = Math.floor(uptime / 86400)
    const hours = Math.floor((uptime % 86400) / 3600)
    const minutes = Math.floor((uptime % 3600) / 60)
    const seconds = uptime % 60
    const uptimeText = [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`, `${seconds}s`]
        .filter(Boolean).join(' ')

    const quality =
        latency < 150 ? '🟢 Excellent' :
        latency < 400 ? '🟡 Good' :
        latency < 900 ? '🟠 Fair' :
                       '🔴 Poor'

    const report = [
        `*🏓 PONG*`,
        ``,
        `┃ ⚡ Latency: *${latency} ms*`,
        `┃ 📊 Quality: ${quality}`,
        `┃ ⏱️ Uptime: ${uptimeText}`,
        `┃ 🧠 RSS: ${(mem.rss / 1048576).toFixed(1)} MB`,
        `┃ 📦 Heap: ${(mem.heapUsed / 1048576).toFixed(1)} / ${(mem.heapTotal / 1048576).toFixed(1)} MB`,
        `┃ ⚙️ Node: ${process.version}`,
        `┃ 🔤 Prefix: ${global.prefix || '.'}`,
        ``,
        `> PRECIOUS-MD • watsonxd`
    ].join('\n')

    // ---- 4. Try to edit the sent message; fall back to new message ----
    const editSupported =
        typeof waClient.updateMessage === 'function' ||
        typeof waClient.editMessage === 'function'

    try {
        if (typeof waClient.updateMessage === 'function') {
            // Baileys-style (preferred)
            await waClient.updateMessage(m.chat, sent.key, { text: report })
            return
        }
        if (typeof waClient.editMessage === 'function') {
            // Alternative helper name seen in some forks
            await waClient.editMessage(m.chat, sent.key, { text: report })
            return
        }
        // Older Baileys: sendMessage with { edit: key }
        await waClient.sendMessage(m.chat, { text: report, edit: sent.key })
        return
    } catch (err) {
        // Silent fallback to a fresh message if edit isn't supported
        // (this is expected on old Baileys or if the key has no valid remoteJidAlt)
        if (!editSupported) {
            // no need to log — expected
        } else {
            console.warn('[PING] Edit failed, sending fresh message:', err?.message || err)
        }
    }

    try {
        await waClient.sendMessage(m.chat, { text: report }, { quoted: m })
    } catch (fallbackErr) {
        console.error('[PING] Fallback send failed:', fallbackErr?.message || fallbackErr)
        await m.reply(report).catch(() => {})
    }
}

handler.command = ['ping', 'speed']
handler.category = 'General'
handler.description = 'Measure bot response latency'
handler.usage = 'ping'
handler.ownerBypassAdmin = true

export default handler