import { downloadMediaMessage } from '@whiskeysockets/baileys'
import pino from 'pino'

const logger = pino({ level: 'silent' })
const MAX_BYTES = 40 * 1024 * 1024

export function statusKind(message) {
    const c = message?.message || {}
    if (c.imageMessage) return 'image'
    if (c.videoMessage) return 'video'
    if (c.audioMessage) return 'audio'
    if (c.extendedTextMessage || c.conversation) return 'text'
    return null
}

export function statusText(message) {
    const c = message?.message || {}
    return c.conversation || c.extendedTextMessage?.text || c.imageMessage?.caption || c.videoMessage?.caption || ''
}

/** Download a status/media message into a ready-to-send payload. */
export async function statusToPayload(client, message, caption = '') {
    const kind = statusKind(message)
    if (!kind) return null
    if (kind === 'text') return { text: `${caption ? `${caption}\n\n` : ''}${statusText(message)}`.trim() }

    const media = message.message[`${kind}Message`]
    const size = Number(media?.fileLength?.toNumber?.() ?? media?.fileLength) || 0
    if (size > MAX_BYTES) throw new Error('Status media is too large.')

    const buffer = await downloadMediaMessage(message, 'buffer', {}, { logger, reuploadRequest: client.updateMediaMessage })
    if (!buffer?.length) throw new Error('Empty media download.')
    const text = [caption, media?.caption].filter(Boolean).join('\n').trim() || undefined
    if (kind === 'image') return { image: buffer, caption: text }
    if (kind === 'video') return { video: buffer, caption: text, mimetype: media?.mimetype || 'video/mp4' }
    return { audio: buffer, mimetype: media?.mimetype || 'audio/ogg; codecs=opus', ptt: Boolean(media?.ptt) }
}
