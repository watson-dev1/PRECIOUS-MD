import {
    generateWAMessageFromContent,
    prepareWAMessageMedia
} from '@whiskeysockets/baileys'

function asString(value) {
    return value == null ? '' : String(value)
}

export function quickReply(text, id) {
    return {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
            display_text: asString(text),
            id: asString(id)
        })
    }
}

export function urlButton(text, url) {
    return {
        name: 'cta_url',
        buttonParamsJson: JSON.stringify({
            display_text: asString(text),
            url: asString(url),
            merchant_url: asString(url)
        })
    }
}

export function copyButton(text, code) {
    return {
        name: 'cta_copy',
        buttonParamsJson: JSON.stringify({
            display_text: asString(text),
            copy_code: asString(code)
        })
    }
}

export function listButton(title, sections = []) {
    return {
        name: 'single_select',
        buttonParamsJson: JSON.stringify({
            title: asString(title),
            sections
        })
    }
}

function buildFallbackText({ title, body, footer, buttons }) {
    const lines = []

    if (title) lines.push(`*${title}*`)
    if (body) lines.push(body)

    const actions = []

    for (const button of buttons) {
        let params

        try {
            params = JSON.parse(button.buttonParamsJson)
        } catch {
            continue
        }

        if (!params || typeof params !== 'object') continue

        switch (button.name) {
            case 'quick_reply':
                actions.push(
                    `• ${params.display_text || 'Command'}: ${params.id || ''}`
                )
                break

            case 'cta_url':
                actions.push(
                    `• ${params.display_text || 'Link'}: ${params.url || ''}`
                )
                break

            case 'cta_copy':
                actions.push(
                    `• ${params.display_text || 'Copy'}: ${params.copy_code || ''}`
                )
                break

            case 'single_select': {
                const sections = Array.isArray(params.sections)
                    ? params.sections
                    : []

                for (const section of sections) {
                    actions.push(
                        `\n*${section.title || params.title || 'Categories'}*`
                    )

                    const rows = Array.isArray(section.rows)
                        ? section.rows
                        : []

                    for (const row of rows) {
                        actions.push(
                            `• ${row.title || 'Category'}: ${row.id || ''}`
                        )
                    }
                }

                break
            }
        }
    }

    if (actions.length) {
        lines.push(
            'Type a command below:\n' + actions.join('\n')
        )
    }

    if (footer) lines.push(footer)

    return lines.join('\n\n').trim()
}

function splitText(text, limit = 3500) {
    const chunks = []
    let current = ''

    for (const line of text.split('\n')) {
        if (line.length > limit) {
            if (current) {
                chunks.push(current)
                current = ''
            }

            for (let index = 0; index < line.length; index += limit) {
                chunks.push(line.slice(index, index + limit))
            }

            continue
        }

        const next = current ? `${current}\n${line}` : line

        if (next.length > limit) {
            chunks.push(current)
            current = line
        } else {
            current = next
        }
    }

    if (current) chunks.push(current)

    return chunks
}

function imagePayload(image) {
    return typeof image === 'string'
        ? { image: { url: image } }
        : { image }
}

async function sendFallback(waClient, chat, quoted, options) {
    const text = buildFallbackText(options)
    const chunks = splitText(text)
    const sendOptions = quoted ? { quoted } : {}

    // Use an image caption only for a short fallback.
    if (options.image && text.length <= 900) {
        try {
            return await waClient.sendMessage(
                chat,
                {
                    ...imagePayload(options.image),
                    caption: text
                },
                sendOptions
            )
        } catch (error) {
            console.warn(
                '[BUTTONS] Image fallback failed:',
                error?.message || error
            )
        }
    }

    let result

    for (const chunk of chunks) {
        result = await waClient.sendMessage(
            chat,
            { text: chunk },
            sendOptions
        )
    }

    return result
}

/**
 * Sends a native-flow interactive message.
 * Falls back to text if generation or relay throws.
 *
 * A successful relay does not prove that button taps
 * are being handled by the incoming-message router.
 */
export async function sendButtons(
    waClient,
    m,
    {
        body = '',
        footer = 'PRECIOUS-MD',
        title = '',
        image,
        buttons = []
    } = {}
) {
    const chat = typeof m === 'string'
        ? m
        : m?.chat || m?.key?.remoteJid

    if (!chat) {
        throw new Error('[BUTTONS] Missing destination chat')
    }

    const quoted =
        typeof m === 'object' && m?.key && m?.message
            ? m
            : undefined

    const options = {
        title: asString(title),
        body: asString(body),
        footer: asString(footer),
        image,
        buttons: Array.isArray(buttons) ? buttons : []
    }

    if (!options.buttons.length) {
        return sendFallback(waClient, chat, quoted, options)
    }

    try {
        if (!waClient?.user?.id) {
            throw new Error('WhatsApp client is not connected')
        }

        let header = {
            title: options.title,
            hasMediaAttachment: false
        }

        if (image) {
            try {
                const media = await prepareWAMessageMedia(
                    imagePayload(image),
                    { upload: waClient.waUploadToServer }
                )

                if (media.imageMessage) {
                    header = {
                        ...header,
                        hasMediaAttachment: true,
                        imageMessage: media.imageMessage
                    }
                }
            } catch (error) {
                console.warn(
                    '[BUTTONS] Header image failed:',
                    error?.message || error
                )
            }
        }

        const message = generateWAMessageFromContent(
            chat,
            {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: {
                            deviceListMetadata: {},
                            deviceListMetadataVersion: 2
                        },
                        interactiveMessage: {
                            header,
                            body: {
                                text: options.body
                            },
                            footer: {
                                text: options.footer
                            },
                            nativeFlowMessage: {
                                buttons: options.buttons
                            }
                        }
                    }
                }
            },
            {
                userJid: waClient.user.id,
                ...(quoted ? { quoted } : {})
            }
        )

        await waClient.relayMessage(
            chat,
            message.message,
            { messageId: message.key.id }
        )

        return message
    } catch (error) {
        console.warn(
            '[BUTTONS] Interactive send failed; using text:',
            error?.message || error
        )

        return sendFallback(waClient, chat, quoted, options)
    }
          }
