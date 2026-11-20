import { plugins } from '../../index.js'
import {
    generateWAMessageFromContent,
    prepareWAMessageMedia
} from '@whiskeysockets/baileys'

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MENU_IMAGE = path.resolve(__dirname, '../../media/watson.jpg')

const PREFIX = () => global.prefix || '.'

const formatUptime = (seconds) => {
    const total = Math.max(0, Math.floor(Number(seconds) || 0))

    const days = Math.floor(total / 86400)
    const hours = Math.floor((total % 86400) / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const remaining = total % 60

    return [
        days && `${days}d`,
        hours && `${hours}h`,
        minutes && `${minutes}m`,
        `${remaining}s`
    ].filter(Boolean).join(' ') || '0s'
}

const cleanText = (value) =>
    String(value || '').replace(/[*_`~]/g, '').trim()

const buildMenu = (m) => {
    const categories = {}
    const seen = new Set()

    let rawCount = 0

    for (const plugin of plugins.values()) {
        rawCount++

        if (!plugin || seen.has(plugin)) continue
        seen.add(plugin)

        if (plugin.silentDeny || !plugin.command) continue
        if (plugin.command instanceof RegExp) continue

        const category = plugin.category || 'Other'

        if (!categories[category]) {
            categories[category] = []
        }

        const commands = Array.isArray(plugin.command)
            ? plugin.command
            : [plugin.command]

        for (const cmd of commands) {
            if (cmd == null) continue

            if (
                typeof cmd !== 'string' &&
                typeof cmd !== 'number'
            ) continue

            const command = String(cmd).trim()

            if (!command) continue

            categories[category].push(`${PREFIX()}${command}`)
        }
    }

    for (const category of Object.keys(categories)) {
        categories[category] = [
            ...new Set(categories[category])
        ]

        if (!categories[category].length) {
            delete categories[category]
        }
    }

    const totalCommands = Object.values(categories)
        .reduce((total, commands) => total + commands.length, 0)

    const user = cleanText(m.pushName || 'User')

    let menu = ''

    menu += `╭━━〔 *PRECIOUS-MD* 〕━━╮\n`
    menu += `┃\n`
    menu += `┃ 👤 User: ${user}\n`
    menu += `┃ ⚙️ Mode: ${global.botMode || 'public'}\n`
    menu += `┃ ⌨️ Prefix: ${PREFIX()}\n`
    menu += `┃ ⏱️ Uptime: ${formatUptime(process.uptime())}\n`
    menu += `┃ 📚 Commands: ${totalCommands}\n`
    menu += `┃\n`
    menu += `╰━━━━━━━━━━━━━━━━━━━━╯\n\n`

    menu += `  ✨ *WELCOME TO PRECIOUS-MD*\n`
    menu += `  Created by Watson Fourpence\n\n`

    if (!totalCommands) {
        menu += `⚠️ *No commands loaded*\n\n`
        menu += `Plugins checked: ${rawCount}\n`
        menu += `Plugins with commands: 0\n`

        return menu.trim()
    }

    const sortedCategories = Object.keys(categories)
        .sort((a, b) => a.localeCompare(b))

    for (const category of sortedCategories) {
        const commands = categories[category]
            .sort((a, b) => a.localeCompare(b))

        menu += `\n`
        menu += `╭─〔 *${category.toUpperCase()}* 〕\n`
        menu += `┃\n`

        menu += commands
            .map(command => `┃  ✦ ${command}`)
            .join('\n')

        menu += `\n┃\n`
        menu += `╰────────────────────\n`
    }

    menu += `\n`
    menu += `━━━━━━━━━━━━━━━━━━━━\n`
    menu += `  *PRECIOUS-MD WHATSAPP BOT*\n`
    menu += `  Powered by Watson XD\n`
    menu += `━━━━━━━━━━━━━━━━━━━━`

    return menu.trim()
}

const makeButtons = () => {
    const prefix = PREFIX()

    return [
        {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: '📋 Menu',
                id: `${prefix}menu`
            })
        },
        {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: '👑 Owner',
                id: `${prefix}owner`
            })
        },
        {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: '⚡ Ping',
                id: `${prefix}ping`
            })
        }
    ]
}

const sendInteractiveMenu = async (waClient, m, menu) => {
    const buttons = makeButtons()

    let imageMessage = null

    // Prepare image for the interactive message header.
    // Do NOT send the image separately.

    if (fs.existsSync(MENU_IMAGE)) {
        try {
            const buffer = fs.readFileSync(MENU_IMAGE)

            const media = await prepareWAMessageMedia(
                { image: buffer },
                { upload: waClient.waUploadToServer }
            )

            imageMessage = media?.imageMessage || null

        } catch (error) {
            console.warn(
                '[MENU] Image preparation failed:',
                error?.message || error
            )
        }
    } else {
        console.warn(`[MENU] Image not found: ${MENU_IMAGE}`)
    }

    const interactiveMessage = {
        body: {
            text: menu
        },

        footer: {
            text: 'PRECIOUS-MD • Created by Watson Fourpence'
        },

        nativeFlowMessage: {
            buttons
        }
    }

    // Attach image to the SAME interactive menu message.
    if (imageMessage) {
        interactiveMessage.header = {
            title: 'PRECIOUS-MD',
            subtitle: 'WhatsApp Multi-Device Bot',
            hasMediaAttachment: true,
            imageMessage
        }
    }

    const message = generateWAMessageFromContent(
        m.chat,
        {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage
                }
            }
        },
        {
            userJid: waClient.user.id,
            quoted: m
        }
    )

    await waClient.relayMessage(
        m.chat,
        message.message,
        {
            messageId: message.key.id
        }
    )
}

const handler = async (m, { waClient }) => {
    if (!waClient?.user?.id) {
        return m.reply('❌ Bot is not fully connected yet.')
    }

    const menu = buildMenu(m)

    try {
        // ONE message containing image + menu + buttons.
        await sendInteractiveMenu(waClient, m, menu)

    } catch (error) {
        console.warn(
            '[MENU] Interactive menu failed:',
            error?.message || error
        )

        // Text-only fallback, still ONE menu message.
        try {
            await waClient.sendMessage(
                m.chat,
                { text: menu },
                { quoted: m }
            )
        } catch (fallbackError) {
            console.error(
                '[MENU] Text fallback failed:',
                fallbackError?.message || fallbackError
            )

            await m.reply(menu).catch(() => {})
        }
    }
}

handler.command = ['menu', 'help']
handler.category = 'General'

export default handler
