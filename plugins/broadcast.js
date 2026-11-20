const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

let handler = async (m, { waClient, args, command }) => {
    const text = args.join(' ').trim()
    if (!text) return m.reply(`Usage: ${global.prefix || '.'}${command} <message>\n\n• broadcast → everyone\n• bcgroups → groups only\n• bcprivate → private chats only`)

    const chats = Object.values(waClient.chats || {}).filter(c => c?.id && (c.id.endsWith('@g.us') || c.id.endsWith('@s.whatsapp.net')))
    const targets = chats.filter(c => command === 'bcgroups' ? c.id.endsWith('@g.us') : command === 'bcprivate' ? c.id.endsWith('@s.whatsapp.net') : true)
    if (!targets.length) return m.reply('No chats found to broadcast to yet.')

    await m.reply(`📣 Broadcasting to *${targets.length}* chat(s) with a delay between sends to avoid bans...`)
    let sent = 0, failed = 0
    for (const chat of targets) {
        try { await waClient.sendMessage(chat.id, { text: `📣 *BROADCAST*\n\n${text}` }); sent++ } catch { failed++ }
        await sleep(1500 + Math.floor(Math.random() * 1500))
    }
    return m.reply(`Broadcast finished. Sent: ${sent} | Failed: ${failed}`)
}
handler.command = ['broadcast', 'bcgroups', 'bcprivate']
handler.category = 'Owner'
handler.owner = true
handler.silentDeny = true
export default handler
