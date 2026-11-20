import { generateWAMessageFromContent, prepareWAMessageMedia } from '@whiskeysockets/baileys'

export const quickReply = (text, id) => ({ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: text, id }) })
export const urlButton = (text, url) => ({ name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: text, url, merchant_url: url }) })
export const copyButton = (text, code) => ({ name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: text, copy_code: code }) })
export const listButton = (title, sections) => ({ name: 'single_select', buttonParamsJson: JSON.stringify({ title, sections }) })

function fallbackText(body, footer, buttons) {
    const lines = []
    for (const button of buttons) {
        let params = {}
        try { params = JSON.parse(button.buttonParamsJson) } catch {}
        if (button.name === 'quick_reply') lines.push(`• *${params.display_text}* → ${params.id}`)
        else if (button.name === 'cta_url') lines.push(`• ${params.display_text}: ${params.url}`)
        else if (button.name === 'cta_copy') lines.push(`• ${params.display_text}: ${params.copy_code}`)
        else if (button.name === 'single_select') {
            for (const section of params.sections || []) {
                lines.push(`\n*${section.title || params.title}*`)
                for (const row of section.rows || []) lines.push(`• ${row.title} → ${row.id}`)
            }
        }
    }
    return `${body}\n\n${lines.join('\n')}${footer ? `\n\n_${footer}_` : ''}`.trim()
}

/**
 * Send an interactive message with native-flow buttons. Falls back to plain text
 * (with the command each button would run) when WhatsApp or the library rejects it.
 */
export async function sendButtons(waClient, m, { body, footer = 'PRECIOUS-MD', title, image, buttons = [] }) {
    const chat = m.chat || m
    const quoted = m.key ? m : undefined
    try {
        let header = { title: title || '', hasMediaAttachment: false }
        if (image) {
            try {
                const media = await prepareWAMessageMedia(
                    typeof image === 'string' ? { image: { url: image } } : { image },
                    { upload: waClient.waUploadToServer }
                )
                header = { title: title || '', hasMediaAttachment: true, imageMessage: media.imageMessage }
            } catch (error) {
                console.warn('[BUTTONS] header image failed:', error?.message || error)
            }
        }
        const message = generateWAMessageFromContent(chat, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                    interactiveMessage: {
                        header,
                        body: { text: body },
                        footer: { text: footer },
                        nativeFlowMessage: { buttons }
                    }
                }
            }
        }, { userJid: waClient.user.id, quoted })
        await waClient.relayMessage(chat, message.message, { messageId: message.key.id })
        return message
    } catch (error) {
        console.warn('[BUTTONS] interactive send failed, using text:', error?.message || error)
        const text = fallbackText(body, footer, buttons)
        try {
            if (image) return await waClient.sendMessage(chat, typeof image === 'string' ? { image: { url: image }, caption: text } : { image, caption: text }, { quoted })
        } catch {}
        return await waClient.sendMessage(chat, { text }, { quoted })
    }
}
