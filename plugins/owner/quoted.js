const MEDIA_TYPES = new Set([
    'imageMessage',
    'videoMessage',
    'audioMessage',
    'documentMessage',
    'stickerMessage'
])

function getNestedQuotedMessage(waClient, storedMessage) {
    if (!storedMessage || typeof storedMessage !== 'object') return null

    for (const content of Object.values(storedMessage)) {
        const nested = content?.contextInfo?.quotedMessage
        if (!nested || typeof nested !== 'object') continue

        const mtype = Object.keys(nested).find(key => key === 'conversation' || key.endsWith('Message'))
        if (!mtype) return null

        const msg = nested[mtype]
        const text = typeof msg === 'string'
            ? msg
            : msg?.text || msg?.caption || msg?.body?.text || msg?.header?.title || ''

        return {
            mtype,
            msg,
            message: nested,
            text,
            caption: msg?.caption || '',
            mimetype: msg?.mimetype,
            download: (saveToFile = false) => waClient.downloadM({ msg }, mtype.replace(/Message$/i, ''), saveToFile)
        }
    }

    return null
}

function resolveQuotedTarget(waClient, m) {
    const directQuote = m.quoted
    if (!directQuote?.id || typeof waClient.getStoredMessage !== 'function') return directQuote

    const stored = waClient.getStoredMessage(directQuote.fakeObj?.key || {
        remoteJid: directQuote.chat || m.chat,
        participant: directQuote.participant || directQuote.sender,
        id: directQuote.id
    })

    return getNestedQuotedMessage(waClient, stored) || directQuote
}

async function resendQuoted(waClient, quoted, destination, quotedMessage) {
    const caption = quoted.text || quoted.caption || ''

    if (!MEDIA_TYPES.has(quoted.mtype)) {
        if (!caption) throw new Error(`Unsupported message type: ${quoted.mtype || 'unknown'}`)
        return waClient.sendMessage(destination, { text: caption }, { quoted: quotedMessage })
    }

    const media = await quoted.download()

    if (quoted.mtype === 'imageMessage') {
        return waClient.sendMessage(destination, {
            image: media,
            mimetype: quoted.mimetype || 'image/jpeg',
            caption
        }, { quoted: quotedMessage })
    }

    if (quoted.mtype === 'videoMessage') {
        return waClient.sendMessage(destination, {
            video: media,
            mimetype: quoted.mimetype || 'video/mp4',
            caption
        }, { quoted: quotedMessage })
    }

    if (quoted.mtype === 'audioMessage') {
        return waClient.sendMessage(destination, {
            audio: media,
            mimetype: quoted.mimetype || 'audio/mpeg',
            ptt: Boolean(quoted.msg?.ptt)
        }, { quoted: quotedMessage })
    }

    if (quoted.mtype === 'documentMessage') {
        return waClient.sendMessage(destination, {
            document: media,
            mimetype: quoted.mimetype || 'application/octet-stream',
            fileName: quoted.msg?.fileName || 'document',
            caption
        }, { quoted: quotedMessage })
    }

    return waClient.sendMessage(destination, { sticker: media }, { quoted: quotedMessage })
}

let handler = async (m, { waClient }) => {
    if (!m.quoted) {
        return await m.reply('Reply to a message to send a fresh copy of it.')
    }

    try {
        await resendQuoted(waClient, resolveQuotedTarget(waClient, m), m.chat, m)
    } catch (error) {
        await m.reply(`Unable to process that message: ${error.message || String(error)}`)
    }
}

handler.command = ['quoted', 'resend']
handler.owner = true

export default handler
