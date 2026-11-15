let handler = async (m, { waClient }) => {
    const jid = waClient.decodeJid(waClient.user.id)
    const number = String(global.ownerNumber || jid.split('@')[0]).replace(/\D/g, '')
    const name = global.ownerName || 'watson-dev1'

    const vcard = `BEGIN:VCARD\n`
        + `VERSION:3.0\n`
        + `FN:${name}\n`
        + `ORG:${global.botName || ''};\n`
        + `TEL;type=CELL;type=VOICE;waid=${number}:+${number}\n`
        + `END:VCARD`

    await waClient.sendMessage(m.chat, {
        contacts: {
            displayName: name,
            contacts: [{ vcard }]
        }
    }, { quoted: m })
}

handler.command = ['owner']

export default handler
