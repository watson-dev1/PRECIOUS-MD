
import { plugins } from '../../index.js'
import { generateWAMessageFromContent } from '@whiskeysockets/baileys'
import fs from 'fs'
import path from 'path'
import generateTTS from '../../lib/tts.js'

// ==========================================
// PRECIOUS-MD CONFIGURATION
// ==========================================

const BOT_NAME = global.config?.BOT_NAME || 'PRECIOUS-MD'
const OWNER = global.config?.OWNER_NAME || 'Watson Fourpence'
const VERSION = global.config?.VERSION || '3.0.0'
const PREFIX = () => global.prefix || '.'
const IMAGE = path.join(process.cwd(), 'media', 'Watson.jpg')
const FOOTER = `${BOT_NAME} • Created by ${OWNER}`

const CATEGORY_PAGE_SIZE = 2

// ==========================================
// SYSTEM INFORMATION
// ==========================================

function formatUptime(seconds) {
    const total = Math.floor(Number(seconds) || 0)
    const days = Math.floor(total / 86400)
    const hours = Math.floor((total % 86400) / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const secs = total % 60

    return [
        days && `${days}d`,
        hours && `${hours}h`,
        minutes && `${minutes}m`,
        `${secs}s`
    ].filter(Boolean).join(' ') || '0s'
}

function getGreeting() {
    const hour = new Date().getHours()

    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
}

function getDate() {
    return new Date().toLocaleString('en-ZW', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
}

function clean(value) {
    return String(value || '')
        .replace(/[*_`~]/g, '')
        .trim()
}

function getTotal(categories) {
    return categories.reduce(
        (total, category) => total + category.commands.length,
        0
    )
}

// ==========================================
// CATEGORY ICONS
// ==========================================

const CATEGORY_ICONS = {
    general: '🏠',
    owner: '👑',
    group: '👥',
    tools: '🛠️',
    sticker: '🎨',
    stickers: '🎨',
    media: '📸',
    download: '📥',
    downloads: '📥',
    'artificial intelligence': '🤖',
    ai: '🤖',
    entertainment: '🎭',
    games: '🎮',
    utilities: '⚙️',
    search: '🔎',
    fun: '🎉',
    other: '📂'
}

function categoryIcon(name) {
    return CATEGORY_ICONS[name.toLowerCase()] || '📂'
}

// ==========================================
// AUTOMATIC PLUGIN COMMAND COLLECTION
// ==========================================

function getCategories() {
    const categories = new Map()
    const seenPlugins = new Set()
    const seenCommands = new Set()

    for (const plugin of plugins.values()) {
        if (!plugin || seenPlugins.has(plugin)) continue

        seenPlugins.add(plugin)

        if (plugin.silentDeny) continue
        if (!plugin.command) continue
        if (plugin.command instanceof RegExp) continue

        const category = clean(plugin.category || 'Other')
        const categoryKey = category.toLowerCase()

        if (!categories.has(categoryKey)) {
            categories.set(categoryKey, {
                name: category,
                commands: []
            })
        }

        const commands = Array.isArray(plugin.command)
            ? plugin.command
            : [plugin.command]

        for (const command of commands) {
            if (
                typeof command !== 'string' &&
                typeof command !== 'number'
            ) continue

            const name = String(command).trim()
            if (!name) continue

            const key = name.toLowerCase()

            if (seenCommands.has(key)) continue
            seenCommands.add(key)

            categories.get(categoryKey).commands.push(
                `${PREFIX()}${name}`
            )
        }
    }

    return [...categories.values()]
        .filter(category => category.commands.length)
        .map(category => ({
            ...category,
            commands: category.commands.sort()
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
}

// ==========================================
// MENU HEADER
// ==========================================

function createHeader(m, categories) {
    const total = getTotal(categories)

    return `╭───❖ *BOT INFO* ❖───
│ 👑 Owner: ${OWNER}
│ 🤖 Name: ${BOT_NAME}
│ 🔖 Version: ${VERSION}
│ 🌍 Mode: ${global.config?.MODE || global.botMode || 'Public'}
│ 🔑 Prefix: ${PREFIX()}
│ 📚 Lib: Baileys MD
│ 🟢 Status: Online
╰───────────────❖

╭───❖ *SYSTEM* ❖───
│ ⏰ Runtime: ${formatUptime(process.uptime())}
│ 📅 Date: ${getDate()}
│ 📚 Commands: ${total}
╰───────────────❖`
}

// ==========================================
// NATIVE FLOW BUTTONS
// ==========================================

function createButtons(items) {
    return items.slice(0, 3).map(item => ({
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
            display_text: item.label,
            id: item.id
        })
    }))
}

// ==========================================
// SEND INTERACTIVE MENU
// ==========================================

async function sendInteractive(
    m,
    waClient,
    text,
    buttons = []
) {
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
                            text: FOOTER
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
        {
            messageId: message.key.id
        }
    )
}

// ==========================================
// SEND BOT IMAGE
// ==========================================

async function sendMenuImage(m, waClient, caption) {
    try {
        if (!fs.existsSync(IMAGE)) {
            console.warn('[MENU] Image not found:', IMAGE)
            return
        }

        await waClient.sendMessage(
            m.chat,
            {
                image: fs.readFileSync(IMAGE),
                caption
            },
            {
                quoted: m
            }
        )
    } catch (error) {
        console.error('[MENU IMAGE ERROR]', error.message)
    }
}

// ==========================================
// TEXT TO SPEECH
// ==========================================

async function sendMenuVoice(
    m,
    waClient,
    voiceText
) {
    try {
        if (typeof generateTTS !== 'function') {
            console.warn('[MENU TTS] Generator unavailable')
            return
        }

        const audio = await generateTTS(voiceText)

        if (!audio || !audio.length) {
            console.warn('[MENU TTS] Empty audio')
            return
        }

        await waClient.sendMessage(
            m.chat,
            {
                audio,
                mimetype: 'audio/mpeg',
                ptt: false
            },
            {
                quoted: m
            }
        )

        console.log('[MENU TTS] Voice sent to:', m.pushName)

    } catch (error) {
        console.error('[MENU TTS ERROR]', error.message)
    }
}

// ==========================================
// MAIN MENU
// ==========================================

function createMainMenu(m, categories, page = 0) {
    const totalPages = Math.max(
        1,
        Math.ceil(categories.length / CATEGORY_PAGE_SIZE)
    )

    page = Math.max(0, Math.min(page, totalPages - 1))

    const start = page * CATEGORY_PAGE_SIZE
    const visible = categories.slice(
        start,
        start + CATEGORY_PAGE_SIZE
    )

    let text = createHeader(m, categories)

    text += `

╭───❖ *MENU* ❖───
│ 📋 Choose a category
│ 👇 Tap a button below
│ 💬 Commands will appear
│    after you choose a category
│
│ 📑 Page: ${page + 1}/${totalPages}
╰───────────────❖`

    const buttons = visible.map(category => ({
        label: `${categoryIcon(category.name)} ${category.name}`,
        id: `${PREFIX()}menucat ${encodeURIComponent(category.name)}`
    }))

    if (totalPages > 1) {
        const nextPage = page + 1 < totalPages ? page + 1 : 0

        buttons.push({
            label: page + 1 < totalPages
                ? '➡️ NEXT'
                : '🔄 FIRST PAGE',
            id: `${PREFIX()}menupage ${nextPage}`
        })
    } else if (visible.length === 1) {
        buttons.push({
            label: '📚 FULL MENU',
            id: `${PREFIX()}menufull`
        })
    } else {
        buttons.push({
            label: '📚 FULL MENU',
            id: `${PREFIX()}menufull`
        })
    }

    return {
        text,
        buttons
    }
}

// ==========================================
// CATEGORY MENU
// ==========================================

function createCategoryMenu(m, categories, name) {
    const category = categories.find(
        item => item.name.toLowerCase() === name.toLowerCase()
    )

    if (!category) {
        return {
            text: `❌ Category not found: ${name}`,
            buttons: [
                {
                    label: '🏠 MAIN MENU',
                    id: `${PREFIX()}menu`
                }
            ],
            voice: null
        }
    }

    const text = `${createHeader(m, categories)}

╭───❖ ${categoryIcon(category.name)} *${category.name.toUpperCase()} MENU* ❖───
│ 📚 Commands: ${category.commands.length}
│
${category.commands.map(command => `│ ✦ ${command}`).join('\n')}
╰───────────────❖

╭───❖ *NAVIGATION* ❖───
│ 🏠 Return to main menu
│ 📚 View all commands
╰───────────────❖`

    return {
        text,
        buttons: [
            {
                label: '🏠 MAIN MENU',
                id: `${PREFIX()}menu`
            },
            {
                label: '📚 FULL MENU',
                id: `${PREFIX()}menufull`
            }
        ],
        voice: `${getGreeting()}, ${clean(m.pushName || 'User')}.
You are now viewing the ${category.name} menu.
There are ${category.commands.length} commands available.
Choose a command from the menu.
I'm ${BOT_NAME}, and I'm ready to help you.`
    }
}

// ==========================================
// FULL COMMAND MENU
// ==========================================

function createFullMenu(m, categories) {
    const sections = categories.map(category => {
        return `╭───❖ *${categoryIcon(category.name)} ${category.name.toUpperCase()}* ❖───
${category.commands.map(command => `│ ✦ ${command}`).join('\n')}
╰───────────────❖`
    })

    const text = `${createHeader(m, categories)}

╭───❖ *COMPLETE COMMAND LIST* ❖───
│ 📚 Total: ${getTotal(categories)}
│ 📂 Categories: ${categories.length}
╰───────────────❖

${sections.join('\n\n')}`

    return {
        text,
        buttons: [
            {
                label: '🏠 MAIN MENU',
                id: `${PREFIX()}menu`
            }
        ]
    }
}

// ==========================================
// MAIN HANDLER
// ==========================================

const handler = async (m, { waClient, args = [] }) => {
    if (!waClient?.user?.id) {
        return m.reply('❌ PRECIOUS-MD is not connected yet.')
    }

    const categories = getCategories()

    if (!categories.length) {
        return m.reply('⚠️ No commands are registered.')
    }

    const action = String(args[0] || '').toLowerCase()

    const userName = clean(m.pushName || 'User')
    const greeting = getGreeting()

    let result
    let voiceText = null
    let showImage = false

    // MAIN MENU
    if (!action || action === 'menu' || action === 'help') {
        result = createMainMenu(m, categories, 0)

        showImage = true

        voiceText = `${greeting}, ${userName}.
Welcome to ${BOT_NAME}.
Your menu is ready.
Please choose a category below to see my commands.
I'm ready to help you.`
    }

    // CATEGORY MENU
    else if (action === 'menucat') {
        let categoryName = args.slice(1).join(' ')

        try {
            categoryName = decodeURIComponent(categoryName)
        } catch {}

        result = createCategoryMenu(
            m,
            categories,
            categoryName
        )

        voiceText = result.voice
    }

    // FULL MENU
    else if (action === 'menufull' || action === 'full') {
        result = createFullMenu(m, categories)

        voiceText = `${greeting}, ${userName}.
Here is the complete ${BOT_NAME} command list.
There are ${getTotal(categories)} commands across ${categories.length} categories.
You can choose any available command.
I'm ready to help you.`
    }

    // CATEGORY PAGINATION
    else if (action === 'menupage') {
        const page = Number(args[1]) || 0

        result = createMainMenu(
            m,
            categories,
            page
        )

        voiceText = `${greeting}, ${userName}.
Here are more categories.
Choose a category to view its commands.`
    }

    else {
        result = createMainMenu(m, categories, 0)
    }

    // IMAGE ONLY ON MAIN MENU
    if (showImage) {
        await sendMenuImage(
            m,
            waClient,
            `✨ Welcome to ${BOT_NAME}, ${userName}!\n👑 Created by ${OWNER}\n\nSelect a category below to explore the commands.`
        )
    }

    // SEND INTERACTIVE MENU
    try {
        await sendInteractive(
            m,
            waClient,
            result.text,
            result.buttons
        )
    } catch (error) {
        console.error('[MENU BUTTON ERROR]', error)

        await waClient.sendMessage(
            m.chat,
            {
                text: result.text
            },
            {
                quoted: m
            }
        )
    }

    // SEND VOICE GREETING
    if (voiceText) {
        await sendMenuVoice(
            m,
            waClient,
            voiceText
        )
    }
}

// ==========================================
// COMMAND REGISTRATION
// ==========================================

handler.command = [
    'menu',
    'help',
    'menucat',
    'menufull',
    'menupage'
]

handler.category = 'General'

export default handler
