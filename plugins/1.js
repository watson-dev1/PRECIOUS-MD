
// plugins/readviewonce.js

import { downloadContentFromMessage } from '@whiskeysockets/baileys'

const unwrapMessage = (message) => {
    if (!message) return null

    const wrappers = [
        'ephemeralMessage',
        'viewOnceMessage',
        'viewOnceMessageV2',
        'viewOnceMessageV2Extension',
        'documentWithCaptionMessage'
    ]

    let current = message

    // Remove WhatsApp message wrappers
    while (current) {
        let unwrapped = false

        for (const wrapper of wrappers) {
            if (current[wrapper]?.message) {
                current = current[wrapper].message
                unwrapped = true
                break
            }
        }

        if (!unwrapped) break
    }

    return current
}

const getMedia = (quoted) => {
    const candidates = [
        quoted?.msg,
        quoted?.message,
        quoted?.fakeObj?.message,
        quoted?.quoted?.message
    ]

    for (const candidate of candidates) {
        const message = unwrapMessage(candidate)
        if (!message) continue

        for (const type of ['imageMessage', 'videoMessage', 'audioMessage']) {
            if (message[type]) {
                return {
                    media: message[type],
                    type: type.replace('Message', ''),
                    viewOnce: Boolean(message[type].viewOnce)
                }
            }
        }
    }

    return null
}

const downloadMedia = async (media, type) => {
    const stream = await downloadContentFromMessage(media, type)
    const chunks = []

    for await (const chunk of stream) {
        chunks.push(chunk)
    }

    return Buffer.concat(chunks)
}

let handler = async (m, { waClient }) => {
    try {
        if (!waClient?.user?.id) {
            return m.reply('❌ Bot is not connected.')
        }

        if (!m.quoted) {
            return m.reply(
                '✳️ Reply to a View Once image, video, or audio with .readvo'
            )
        }

        const result = getMedia(m.quoted)

        if (!result) {
            return m.reply(
                '❌ Could not find the original media message.\n\nMake sure you reply directly to the View Once media.'
            )
        }

        const { media, type } = result

        if (!media.url && !media.directPath) {
            return m.reply(
                '❌ The media has no valid download URL or directPath. WhatsApp may have removed the media or the quoted message wrapper is incomplete.'
            )
        }

        const buffer = await downloadMedia(media, type)

        if (!buffer?.length) {
            throw new Error('Downloaded media is empty.')
        }

        const caption = [
            '✅ *VIEW ONCE MEDIA RECOVERED*',
            '',
            '> PRECIOUS-MD',
            '> Created by Watson Fourpence'
        ].join('\n')

        if (type === 'image') {
            await waClient.sendMessage(
                m.chat,
                {
                    image: buffer,
                    caption,
                    mimetype: media.mimetype || 'image/jpeg'
                },
                { quoted: m }
            )
        } else if (type === 'video') {
            await waClient.sendMessage(
                m.chat,
                {
                    video: buffer,
                    caption,
                    mimetype: media.mimetype || 'video/mp4'
                },
                { quoted: m }
            )
        } else if (type === 'audio') {
            await waClient.sendMessage(
                m.chat,
                {
                    audio: buffer,
                    mimetype: media.mimetype || 'audio/ogg; codecs=opus',
                    ptt: true
                },
                { quoted: m }
            )
        }

    } catch (err) {
        console.error('[READVO] Error:', err?.stack || err)

        await m.reply(
            `❌ Failed to recover View Once media.\n\nReason: ${err?.message || 'Unknown error'}`
        ).catch(() => {})
    }
}

handler.command = ['readviewonce', 'readvo', 'v']
handler.category = 'Tools'
handler.description = 'Recover quoted View Once media'
handler.usage = 'Reply to View Once media with .readvo'
handler.ownerBypassAdmin = true

export default handler
