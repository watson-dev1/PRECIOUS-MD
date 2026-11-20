/**
 * PRECIOUS-MD — ViewOnce recovery and resend
 * Supports quoted ViewOnce images/videos and preserves the ViewOnce flag on resend.
 */
import { downloadContentFromMessage } from '@whiskeysockets/baileys'
import { getCachedMessage } from '../../lib/media-cache.js'

const SUPPORTED = ['imageMessage', 'videoMessage', 'audioMessage']
const WRAPPERS = [
    'ephemeralMessage',
    'viewOnceMessage',
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension',
    'documentWithCaptionMessage'
]

function unwrapContent(input) {
    let content = input?.message || input || null
    const visited = new Set()
    for (let depth = 0; content && depth < 12; depth++) {
        if (visited.has(content)) break
        visited.add(content)
        let next = null
        for (const wrapper of WRAPPERS) {
            const candidate = content?.[wrapper]?.message
            if (candidate && typeof candidate === 'object') {
                next = candidate
                break
            }
        }
        if (!next) break
        content = next
    }
    return content
}

function findMedia(input) {
    const content = unwrapContent(input)
    if (!content || typeof content !== 'object') return null
    for (const type of SUPPORTED) {
        if (content[type] && typeof content[type] === 'object') {
            return { type, content: content[type] }
        }
    }
    return null
}

function findQuotedMedia(quoted) {
    if (!quoted) return null
    const candidates = [
        quoted.fakeObj?.message,
        quoted.rawMessage?.message,
        quoted.message,
        quoted.msg && quoted.mtype ? { [quoted.mtype]: quoted.msg } : null
    ]
    for (const candidate of candidates) {
        const media = findMedia(candidate)
        if (media) return media
    }

    const key = quoted.fakeObj?.key || quoted.key
    if (key?.id) {
        const cached = getCachedMessage(key.remoteJid || quoted.chat, key.id)
        const media = findMedia(cached)
        if (media) return media
    }
    return null
}

async function downloadMedia(media) {
    const mediaType = media.type.replace(/Message$/, '').toLowerCase()
    const stream = await downloadContentFromMessage(media.content, mediaType)
    const chunks = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    const buffer = Buffer.concat(chunks)
    if (!buffer.length) throw new Error('WhatsApp returned an empty media stream.')
    return buffer
}

const handler = async (m, { waClient, text = '' }) => {
    try {
        if (!waClient?.sendMessage) return m.reply('❌ WhatsApp connection is not ready.')

        let media = findQuotedMedia(m.quoted)
        if (!media && m.message) media = findMedia(m.message)
        if (!media && m.mtype && SUPPORTED.includes(m.mtype)) {
            media = findMedia({ [m.mtype]: m.msg })
        }

        if (!media) {
            return m.reply(
                '❌ Original ViewOnce media is unavailable.\n\n' +
                'Reply directly to a ViewOnce image or video with .once. ' +
                'The bot must have received the original message while connected.'
            )
        }

        const buffer = await downloadMedia(media)
        const source = media.content
        const caption = String(text || '').trim() || String(source.caption || '')
        const options = { quoted: m }

        if (media.type === 'imageMessage') {
            return await waClient.sendMessage(m.chat, {
                image: buffer,
                mimetype: source.mimetype || 'image/jpeg',
                caption,
                viewOnce: true
            }, options)
        }

        if (media.type === 'videoMessage') {
            return await waClient.sendMessage(m.chat, {
                video: buffer,
                mimetype: source.mimetype || 'video/mp4',
                caption,
                gifPlayback: source.gifPlayback === true,
                viewOnce: true
            }, options)
        }

        return await waClient.sendMessage(m.chat, {
            audio: buffer,
            mimetype: source.mimetype || 'audio/ogg; codecs=opus',
            ptt: source.ptt === true,
            viewOnce: true
        }, options)
    } catch (error) {
        console.error('[PRECIOUS ONCE] Recovery failed:', error?.stack || error)
        return m.reply(`❌ ViewOnce failed: ${error?.message || 'Unknown media error'}`)
    }
}

handler.command = ['once', 'vv', 'sendonce']
handler.category = 'Tools'
export default handler
