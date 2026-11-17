
 // lib/events/statuslistener.js

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SETTINGS_PATH = path.join(
    __dirname,
    '..',
    '..',
    'database',
    'settings.json'
)

const processedStatuses = new Map()
const STATUS_DEDUP_LIMIT = 1200
const STATUS_DEDUP_TTL = 10 * 60 * 1000

const DEFAULT_EMOJIS = [
    '🌝', '🇿🇼', '👏', '😂', '🥰',
    '🍃', '✅️', '😄', '😳', '🧡',
    '😪', '❤️', '🔥', '💚', '😍'
]

function readSettings() {
    try {
        return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'))
    } catch {
        return {}
    }
}

function getSettings() {
    const settings = readSettings()

    return {
        autoView: global.autoViewStatus === true ||
            settings.autoViewStatus === true,

        autoReact: global.autoLikeStatus === true ||
            global.autoStatusReact === true ||
            settings.autoLikeStatus === true ||
            settings.autoStatusReact === true,

        emojis: Array.isArray(global.autoLikeStatusEmojis) &&
            global.autoLikeStatusEmojis.length
            ? global.autoLikeStatusEmojis
            : Array.isArray(settings.autoLikeStatusEmojis) &&
                settings.autoLikeStatusEmojis.length
                ? settings.autoLikeStatusEmojis
                : DEFAULT_EMOJIS
    }
}

function getParticipant(key) {
    const candidates = [
        key?.participantAlt,
        key?.participant
    ]

    for (const jid of candidates) {
        if (typeof jid !== 'string' || !jid.includes('@')) continue

        const [user, server] = jid.split('@')

        if (!user || !server) continue

        if (server === 's.whatsapp.net') {
            return `${user.split(':')[0]}@s.whatsapp.net`
        }

        if (server === 'lid') {
            return jid
        }
    }

    return null
}

function isProcessed(id) {
    const now = Date.now()

    for (const [key, timestamp] of processedStatuses) {
        if (now - timestamp > STATUS_DEDUP_TTL) {
            processedStatuses.delete(key)
        } else {
            break
        }
    }

    return processedStatuses.has(id)
}

function markProcessed(id) {
    processedStatuses.set(id, Date.now())

    while (processedStatuses.size > STATUS_DEDUP_LIMIT) {
        processedStatuses.delete(
            processedStatuses.keys().next().value
        )
    }
}

async function statusHandler(client, data) {
    try {
        if (!client || !data) return

        if (!['notify', 'append'].includes(data.type)) return

        const messages = Array.isArray(data.messages)
            ? data.messages
            : []

        if (!messages.length) return

        const settings = getSettings()

        if (!settings.autoView && !settings.autoReact) return

        for (const message of messages) {
            const key = message?.key

            if (!key?.id) continue
            if (key.remoteJid !== 'status@broadcast') continue
            if (key.fromMe) continue
            if (!message.message) continue

            const participant = getParticipant(key)

            if (!participant) {
                console.log('[STATUS] Could not identify status owner')
                continue
            }

            const statusId = `${participant}:${key.id}`

            if (isProcessed(statusId)) continue

            const statusKey = {
                remoteJid: 'status@broadcast',
                id: key.id,
                fromMe: false,
                participant
            }

            let successful = true

            // IMMEDIATE STATUS VIEW
            if (settings.autoView) {
                try {
                    await client.readMessages([statusKey])

                    console.log(
                        '[STATUS] Viewed:',
                        participant
                    )
                } catch (error) {
                    successful = false

                    console.error(
                        '[STATUS] View failed:',
                        error?.message || error
                    )
                }
            }

            // IMMEDIATE STATUS REACTION
            if (settings.autoReact) {
                try {
                    const emojis = settings.emojis.filter(
                        emoji => typeof emoji === 'string' && emoji.trim()
                    )

                    const emoji = emojis.length
                        ? emojis[Math.floor(Math.random() * emojis.length)]
                        : '🌝'

                    await client.sendMessage(
                        'status@broadcast',
                        {
                            react: {
                                text: emoji,
                                key: statusKey
                            }
                        },
                        {
                            statusJidList: [participant]
                        }
                    )

                    console.log(
                        '[STATUS] Reacted:',
                        emoji,
                        participant
                    )
                } catch (error) {
                    successful = false

                    console.error(
                        '[STATUS] Reaction failed:',
                        error?.message || error
                    )
                }
            }

            if (successful) {
                markProcessed(statusId)
            }
        }

    } catch (error) {
        console.error(
            '[STATUS] Handler error:',
            error?.message || error
        )
    }
}

const statusEvent = {
    on: 'messages.upsert',
    handler: statusHandler
}

statusEvent.default = statusEvent

export default new Proxy(statusEvent, {
    apply(_target, _thisArg, args) {
        return statusHandler(args[0], args[1])
    }
})
