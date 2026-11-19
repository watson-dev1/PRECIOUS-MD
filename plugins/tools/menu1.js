
import { plugins } from '../../index.js'
import { generateWAMessageFromContent } from '@whiskeysockets/baileys'

const PREFIX = () => global.prefix || '.'

const formatUptime = seconds => {
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

// Extract text, including interactive button replies.
function getMessageText(m) {
    let text =
        m.text ||
        m.body ||
        m.message?.conversation ||
        m.message?.extendedTextMessage?.text ||
        m.message?.buttonsResponseMessage?.selectedButtonId ||
        m.message?.templateButtonReplyMessage?.selectedId ||
        ''

    if (!text && m.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
        try {
            const data = JSON.parse(
                m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson
            )
            text = data.id || ''
        } catch {}
    }

    return String(text).trim()
}

// Collect all plugin commands dynamically.
function getCategories() {
    const categories = {}
    const seenPlugins = new Set()
    const seenCommands = new Set()

    for (const plugin of plugins.values()) {
        if (!plugin || seenPlugins.has(plugin)) continue
        seenPlugins.add(plugin)

        if (plugin.silentDeny || !plugin.command) continue
        if (plugin.command instanceof RegExp) continue

        const category = String(plugin.category || 'Other')
        if (!categories[category]) categories[category] = []

        const commands = Array.isArray(plugin.command)
            ? plugin.command
            : [plugin.command]

        for (const command of commands) {
            if (typeof command !== 'string' && typeof command !== 'number') continue

            const name = String(command).trim()
            if (!name) continue

            const uniqueKey = name.toLowerCase()
            if (seenCommands.has(uniqueKey)) continue

            seenCommands.add(uniqueKey)
            categories[category].push(name)
        }
    }

    for (const category of Object.keys(categories)) {
        categories[category].sort((a, b) => a.localeCompare(b))

        if (!categories[category].length) {
            delete categories[category]
        }
    }

    return Object.fromEntries(
        Object.entries(categories).sort(([a], [b]) => a.localeCompare(b))
    )
}

// Create quick reply buttons.
function createButtons(items) {
    return items.slice(0, 3).map(item => ({
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
            display_text: item.label.slice(0, 20),
            id: item.id
        })
    }))
}

// Send interactive WhatsApp message.
async function sendMenu(m, waClient, text, buttons = []) {
    const prefix = PREFIX()

    try {
        const message = generateWAMessageFromContent(
            m.chat,
            {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: {
                            deviceListMetadata: {},
                            deviceListMetadataVersion: 2
                        },
                        interactiveMessage: {
                            body: {
                                text
                            },
                            footer: {
                                text: 'PRECIOUS-MD | Created by Watson Fourpence'
                            },
                            nativeFlowMessage: {
                                buttons: createButtons(buttons)
                            }
                        }
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
            { messageId: message.key.id }
        )
    } catch (error) {
        console.error('[MENU] Interactive error:', error?.message || error)

        // Text fallback for unsupported WhatsApp clients.
        let fallback = text

        if (buttons.length) {
            fallback += '\n\n'
            fallback += buttons.map(
                button => `• ${button.label}: ${button.id}`
            ).join('\n')
        }

        await waClient.sendMessage(
            m.chat,
            { text: fallback },
            { quoted: m }
        ).catch(() => m.reply(fallback).catch(() => {}))
    }
}

// Main menu.
function createMainMenu(m, categories, page = 1) {
    const prefix = PREFIX()
    const names = Object.keys(categories)

    const perPage = 3
    const totalPages = Math.max(1, Math.ceil(names.length / perPage))

    page = Math.min(Math.max(1, page), totalPages)

    const start = (page - 1) * perPage
    const currentCategories = names.slice(start, start + perPage)

    const totalCommands = Object.values(categories)
        .reduce((total, commands) => total + commands.length, 0)

    let menu = `╭━━〔 *PRECIOUS-MD* 〕━━╮\n`
    menu += `┃ 👤 User: ${String(m.pushName || 'User').replace(/[*_\`~]/g, '')}\n`
    menu += `┃ 👑 Owner: Watson Fourpence\n`
    menu += `┃ ⚡ Mode: ${global.botMode || 'public'}\n`
    menu += `┃ 🔰 Prefix: ${prefix}\n`
    menu += `┃ ⏱️ Uptime: ${formatUptime(process.uptime())}\n`
    menu += `┃ 📚 Commands: ${totalCommands}\n`
    menu += `┃ 📂 Categories: ${names.length}\n`
    menu += `╰━━━━━━━━━━━━━━━━━━╯\n\n`

    menu += `       *SELECT A CATEGORY*\n`
    menu += `╭────────────────────╮\n`

    for (const category of currentCategories) {
        menu += `┃ 📁 ${category}\n`
        menu += `┃    ${categories[category].length} commands\n`
    }

    menu += `╰────────────────────╯\n\n`

    menu += `📌 Page ${page}/${totalPages}\n`
    menu += `👆 Tap a category button below.\n`

    if (totalPages > 1) {
        menu += `\n➡️ More categories: ${prefix}menu page ${page === totalPages ? 1 : page + 1}`
    }

    menu += `\n\n💡 Example: ${prefix}menu page 2`

    const buttons = currentCategories.map(category => ({
        label: category,
        id: `${prefix}menu cat ${encodeURIComponent(category)}`
    }))

    return { menu, buttons }
}

// Display commands from one category.
function createCategoryMenu(category, commands) {
    const prefix = PREFIX()

    let menu = `╭━━〔 *PRECIOUS-MD* 〕━━╮\n`
    menu += `┃ 📂 CATEGORY: ${category.toUpperCase()}\n`
    menu += `┃ 📚 Commands: ${commands.length}\n`
    menu += `╰━━━━━━━━━━━━━━━━━━╯\n\n`

    menu += `╭─〔 *AVAILABLE COMMANDS* 〕\n`

    for (const command of commands) {
        menu += `┃ ✦ ${prefix}${command}\n`
    }

    menu += `╰────────────────────╯\n\n`
    menu += `💡 Use the prefix before each command.\n`
    menu += `🔙 Tap Back to Menu to return.`

    return menu
}

let handler = async (m, { waClient }) => {
    if (!waClient?.user?.id) {
        return m.reply('❌ Bot is not fully connected yet.')
    }

    const categories = getCategories()
    const categoryNames = Object.keys(categories)

    if (!categoryNames.length) {
        return m.reply('❌ No commands found. Check your plugin loader.')
    }

    const prefix = PREFIX()
    const incoming = getMessageText(m)

    // Remove the command prefix.
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const commandText = incoming.replace(
        new RegExp(`^${escapedPrefix}`),
        ''
    ).trim()

    const args = commandText.split(/\s+/)
    const action = (args[1] || '').toLowerCase()

    // Display selected category.
    if (action === 'cat' && args[2]) {
        let category

        try {
            category = decodeURIComponent(args[2])
        } catch {
            category = args.slice(2).join(' ')
        }

        const actualCategory = categoryNames.find(
            name => name.toLowerCase() === category.toLowerCase()
        )

        if (!actualCategory) {
            return m.reply('❌ Category not found.')
        }

        const text = createCategoryMenu(
            actualCategory,
            categories[actualCategory]
        )

        const index = categoryNames.indexOf(actualCategory)

        const buttons = [
            {
                label: 'Back to Menu',
                id: `${prefix}menu`
            }
        ]

        if (categoryNames[index + 1]) {
            buttons.push({
                label: 'Next Category',
                id: `${prefix}menu cat ${encodeURIComponent(categoryNames[index + 1])}`
            })
        }

        if (categoryNames[index - 1]) {
            buttons.push({
                label: 'Previous Category',
                id: `${prefix}menu cat ${encodeURIComponent(categoryNames[index - 1])}`
            })
        }

        return sendMenu(m, waClient, text, buttons)
    }

    // Display another menu page.
    if (action === 'page') {
        const requestedPage = Number(args[2]) || 1

        const { menu, buttons } = createMainMenu(
            m,
            categories,
            requestedPage
        )

        return sendMenu(m, waClient, menu, buttons)
    }

    // Display main category menu.
    const { menu, buttons } = createMainMenu(m, categories, 1)

    return sendMenu(m, waClient, menu, buttons)
}

handler.command = ['menu1', 'help1']
handler.category = 'tools'

export default handler
