let handler = async (m, { waClient }) => {
    // ---- Socket guard ----
    if (!waClient?.user?.id) {
        return m.reply('❌ Bot is not fully connected yet. Try again in a moment.')
    }

    // ---- Resolve owner number with three-tier fallback ----
    let number = String(global.ownerNumber || '').replace(/\D/g, '')

    // Fallback 1: database/owner.json
    if (!number || number.length < 7) {
        try {
            const fs = await import('fs')
            const path = await import('path')
            const { fileURLToPath } = await import('url')
            const __dirname = path.dirname(fileURLToPath(import.meta.url))
            const ownerFile = path.join(__dirname, '..', '..', 'database', 'owner.json')
            const list = JSON.parse(fs.readFileSync(ownerFile, 'utf8'))
            if (Array.isArray(list) && list.length) {
                const first = String(list[0]).split('@')[0].split(':')[0]
                number = first.replace(/\D/g, '')
            }
        } catch {}
    }

    // Fallback 2: bot's own number
    if (!number || number.length < 7) {
        try {
            const jid = waClient.decodeJid(waClient.user.id)
            number = jid.split('@')[0].split(':')[0].replace(/\D/g, '')
        } catch {}
    }

    if (!number || number.length < 7) {
        return m.reply('⚠️ Could not determine owner number. Set `ownerNumber` in config.')
    }

    const name = global.ownerName || global.ownerTitle || 'watson-dev1'
    const botName = global.botName || 'PRECIOUS-MD'

    // ---- Build vCard ----
    const vcard = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${name}`,
        `ORG:${botName};`,
        `TITLE:Owner & Developer`,
        `TEL;type=CELL;type=VOICE;waid=${number}:+${number}`,
        `URL:https://github.com/watson-dev1`,
        `NOTE:Contact for ${botName}`,
        'END:VCARD'
    ].join('\n')

    // ---- Send as contact card ----
    try {
        await waClient.sendMessage(m.chat, {
            contacts: {
                displayName: name,
                contacts: [{ vcard }]
            }
        }, { quoted: m })
    } catch (err) {
        console.warn('[OWNER] Contact send failed, falling back to text:', err?.message || err)
        try {
            await waClient.sendMessage(m.chat, {
                text: `👑 *Owner*\n\n📛 Name: ${name}\n📱 Number: +${number}\n🤖 Bot: ${botName}\n\nwa.me/${number}`
            }, { quoted: m })
        } catch {
            await m.reply(`👑 Owner: +${number}`).catch(() => {})
        }
    }
}

handler.command = ['owner']
handler.category = 'General'
handler.description = 'Send the bot owner contact card'
handler.usage = 'owner'
handler.ownerBypassAdmin = true

export default handler
