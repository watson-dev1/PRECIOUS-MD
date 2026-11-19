
import { downloadContentFromMessage } from '@whiskeysockets/baileys'

const SUPPORTED = [
    'imageMessage',
    'videoMessage',
    'audioMessage'
]

function getMedia(target) {
    return target?.msg ||
        target?.message?.[target?.mtype] ||
        null
}

async function downloadTarget(target) {
    if (typeof target.download === 'function') {
        try {
            const result = await target.download()
            if (result?.length) return result
        } catch {}
    }

    const content = getMedia(target)

    if (!content) {
        throw new Error('Media content not found.')
    }

    const type = target.mtype
        .replace('Message', '')
        .toLowerCase()

    const stream = await downloadContentFromMessage(
        content,
        type
    )

    const chunks = []

    for await (const chunk of stream) {
        chunks.push(chunk)
    }

    const buffer = Buffer.concat(chunks)

    if (!buffer.length) {
        throw new Error('Downloaded media is empty.')
    }

    return buffer
}

let handler = async (m, { waClient, text = '' }) => {
    const target = SUPPORTED.includes(m.quoted?.mtype)
        ? m.quoted
        : SUPPORTED.includes(m.mtype)
            ? m
            : null

    if (!target) {
        return m.reply(
            `Reply to an image, video or audio with .once`
        )
    }

    try {
        const buffer = await downloadTarget(target)
        const media = getMedia(target)

        const caption = String(text).trim() ||
            target.text ||
            target.caption ||
            media?.caption ||
            ''

        const options = {
            quoted: m
        }

        let content

        if (target.mtype === 'imageMessage') {
            content = {
                image: buffer,
                mimetype: media?.mimetype || 'image/jpeg',
                caption,
                viewOnce: true
            }
        } else if (target.mtype === 'videoMessage') {
            content = {
                video: buffer,
                mimetype: media?.mimetype || 'video/mp4',
                caption,
                gifPlayback: media?.gifPlayback === true,
                viewOnce: true
            }
        } else {
            const ptt = media?.ptt === true

            content = {
                audio: buffer,
                mimetype: media?.mimetype ||
                    (ptt ? 'audio/ogg; codecs=opus' : 'audio/mpeg'),
                ptt,
                viewOnce: true
            }
        }

        await waClient.sendMessage(m.chat, content, options)

    } catch (error) {
        console.error('[ONCE ERROR]', error)

        await m.reply(
            `View Once error: ${error.message || error}`
        )
    }
}

handler.command = ['once', 'vv', 'sendonce']

export default handler
