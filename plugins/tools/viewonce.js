
import { downloadContentFromMessage } from '@whiskeysockets/baileys'
import { getCachedMessage } from '../lib/media-cache.js'

const SUPPORTED = [
    'imageMessage',
    'videoMessage',
    'audioMessage'
]

function unwrap(message) {
    let msg = message?.message

    if (!msg) return null

    // Handle ephemeral messages
    if (msg.ephemeralMessage?.message) {
        msg = msg.ephemeralMessage.message
    }

    // Handle view-once wrappers
    if (msg.viewOnceMessage?.message) {
        msg = msg.viewOnceMessage.message
    }

    if (msg.viewOnceMessageV2?.message) {
        msg = msg.viewOnceMessageV2.message
    }

    if (msg.viewOnceMessageV2Extension?.message) {
        msg = msg.viewOnceMessageV2Extension.message
    }

    return msg
}

function findMedia(message) {
    const content = unwrap(message)

    if (!content) return null

    for (const type of SUPPORTED) {
        if (content[type]) {
            return {
                type,
                content: content[type]
            }
        }
    }

    return null
}

async function downloadMedia(media) {
    const type = media.type.replace('Message', '').toLowerCase()

    const stream = await downloadContentFromMessage(
        media.content,
        type
    )

    const chunks = []

    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk))
    }

    const buffer = Buffer.concat(chunks)

    if (!buffer.length) {
        throw new Error('Downloaded media is empty.')
    }

    return buffer
}

const handler = async (m, { waClient, text = '' }) => {
    try {
        const quoted = m.quoted

        let original = null
        let media = null

        // First try the original quoted message
        if (quoted) {
            media = findMedia({
                message: quoted.fakeObj?.message ||
                    quoted.message ||
                    quoted.msg && {
                        [quoted.mtype]: quoted.msg
                    }
            })

            // Recover original message from cache
            if (!media) {
                const key = quoted.key ||
                    quoted.fakeObj?.key

                if (key?.id) {
                    original = getCachedMessage(
                        key.remoteJid || m.chat,
                        key.id
                    )

                    if (original) {
                        media = findMedia(original)
                    }
                }
            }
        }

        // Also support media attached to the command
        if (!media && SUPPORTED.includes(m.mtype)) {
            media = findMedia({
                message: {
                    [m.mtype]: m.msg
                }
            })
        }

        if (!media) {
            return m.reply(
                '❌ Original media unavailable.\n\n' +
                'The bot must receive and cache the original message ' +
                'before it can recover the media. Send the media again ' +
                'and reply with .once.'
            )
        }

        const buffer = await downloadMedia(media)
        const content = media.content

        const caption = String(text).trim() ||
            content.caption ||
            ''

        const options = { quoted: m }

        if (media.type === 'imageMessage') {
            return await waClient.sendMessage(
                m.chat,
                {
                    image: buffer,
                    mimetype: content.mimetype || 'image/jpeg',
                    caption,
                    viewOnce: true
                },
                options
            )
        }

        if (media.type === 'videoMessage') {
            return await waClient.sendMessage(
                m.chat,
                {
                    video: buffer,
                    mimetype: content.mimetype || 'video/mp4',
                    caption,
                    gifPlayback: content.gifPlayback === true,
                    viewOnce: true
                },
                options
            )
        }

        return await waClient.sendMessage(
            m.chat,
            {
                audio: buffer,
                mimetype: content.mimetype ||
                    'audio/ogg; codecs=opus',
                ptt: content.ptt === true,
                viewOnce: true
            },
            options
        )

    } catch (error) {
        console.error('[PRECIOUS ONCE]', error)

        return m.reply(
            `❌ View Once failed: ${error.message}`
        )
    }
}

handler.command = ['once', 'vv', 'sendonce']

export default handler
