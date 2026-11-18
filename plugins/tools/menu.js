
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

const PREFIX = () => String(global.prefix || global.config?.PREFIX || '.')
const IMAGE = path.join(process.cwd(), 'media', 'Watson.jpg')
const FOOTER = `${BOT_NAME} • Created by ${OWNER}`

const CATEGORY_PAGE_SIZE = 2
const MAX_MESSAGE_LENGTH = 3500

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
    return CATEGORY_ICONS[String(name).toLowerCase()] || '📂'
}

// ==========================================
// AUTOMATIC COMMAND COLLECTION
// ==========================================

function getCategories() {
    const categories = new Map()
    const seenCommands = new Set()
    const seenPlugins = new Set()

    if (!(plugins instanceof Map)) {
        console.warn('[MENU] Plugin registry is not a Map.')
        return []
    }

    for (const plugin of plugins.values()) {
        if (!plugin || typeof plugin !== 'object') continue
        if (seenPlugins.has(plugin)) continue

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

            const commandKey = `${categoryKey}:${name.toLowerCase()}`

            if (seenCommands.has(commandKey)) continue

            seenCommands.add(commandKey)

            categories.get(categoryKey).commands.push(
                `${PREFIX()}${name}`
            )
        }
    }

    return [...categories.values()]
        .filter(category => category.commands.length)
        .map(category => ({
            ...category,
            commands: category.commands.sort((a, b) =>
                a.localeCompare(b)
            )
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
}

// ==========================================
// READ INCOMING MESSAGE
// ==========================================

function getMessageText(m) {
    return String(
        m?.text ||
        m?.body ||
        m?.message?.conversation ||
        m?.message?.extendedTextMessage?.text ||
        m?.message?.buttonsResponseMessage?.selectedButtonId ||
        m?.message?.templateButtonReplyMessage?.selectedId ||
        m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
        ''
    ).trim()
}

// ==========================================
// DETECT COMMAND
// ==========================================

function getMenuAction(m, args = []) {
    const knownCommands = [
        'menu',
        'help',
        'menucat',
        'menufull',
        'full',
        'menupage'
    ]

    const rawText = getMessageText(m)
    const prefix = PREFIX()

    // First try to read the original message.
    if (rawText) {
        const escapedPrefix = prefix.replace(
            /[.*+?^${}()|[\]\\]/g,
            '\\$&'
        )

        const match = rawText.match(
            new RegExp(`^${escapedPrefix}([\\w-]+)(?:\\s+([\\s\\S]*))?$`, 'i')
        )

        if (match) {
            const command = match[1].toLowerCase()

            if (knownCommands.includes(command)) {
                return {
                    command,
                    parameters: (match[2] || '').trim().split(/\s+/).filter(Boolean)
                }
            }
        }
    }

    // Some dispatchers include the command in args.
    const first = String(args[0] || '').toLowerCase()

    if (knownCommands.includes(first)) {
        return {
            command: first,
            parameters: args.slice(1).map(String)
        }
    }

    // Other dispatchers remove the command from args.
    // Use the matched command supplied by the dispatcher.
    const matchedCommand = String(
        m?.command ||
        m?.matchedCommand ||
        m?.cmd ||
        ''
    ).toLowerCase()

    if (knownCommands.includes(matchedCommand)) {
        return {
            command: matchedCommand,
            parameters: args.map(String)
        }
    }

    // Fallback for a direct menu call.
    return {
        command: 'menu',
        parameters: args.map(String)
    }
}

// ==========================================
// MENU HEADER
// ==========================================

function createHeader(categories) {
    return `╭───❖ *BOT INFO* ❖───
│ 👑 Owner: ${OWNER}
│ 🤖 Name: ${BOT_NAME}
│ 🔖 Version: ${VERSION}
│ 🌍 Mode: ${global.config?.MODE || global.botMode || 'Public'}
│ 🔑 Prefix: ${PREFIX()}
│ 📚 Library: Baileys MD
│ 🟢 Status: Online
╰───────────────❖

╭───❖ *SYSTEM INFO* ❖───
│ ⏰ Runtime: ${formatUptime(process.uptime())}
│ 📅 Date: ${getDate()}
│ 📚 Commands: ${getTotal(categories)}
╰───────────────❖`
}

// ==========================================
// NATIVE FLOW BUTTONS
// ==========================================

function createButtons(items = []) {
    return items.slice(0, 3).map(item => ({
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
            display_text: item.label,
            id: item.id
        })
    }))
}

// ==========================================
// SEND INTERACTIVE MESSAGE
// ==========================================

async function sendInteractive(m, waClient, text, buttons = []) {
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
// SEND IMAGE
// ==========================================

async function sendMenuImage(m, waClient, caption) {
    try {
        if (!fs.existsSync(IMAGE)) {
            console.warn('[MENU] Image not found:', IMAGE)
            return false
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

        return true
    } catch (error) {
        console.error('[MENU IMAGE ERROR]', error)
        return false
    }
}

// ==========================================
// TEXT TO SPEECH
// ==========================================

async function sendMenuVoice(m, waClient, voiceText) {
    try {
        if (!voiceText || typeof generateTTS !== 'function') return

        const audio = await generateTTS(String(voiceText))

        if (!audio) {
            console.warn('[MENU TTS] Empty audio.')
            return
        }

        const buffer = Buffer.isBuffer(audio)
            ? audio
            : Buffer.from(audio)

        if (!buffer.length) return

        await waClient.sendMessage(
            m.chat,
            {
                audio: buffer,
                mimetype: 'audio/mpeg',
                ptt: false
            },
            {
                quoted: m
            }
        )

        console.log('[MENU TTS] Voice greeting sent.')
    } catch (error) {
        console.error('[MENU TTS ERROR]', error)
    }
}

// ==========================================
// MAIN MENU
// ==========================================

function createMainMenu(categories, page = 0) {
    const totalPages = Math.max(
        1,
        Math.ceil(categories.length / CATEGORY_PAGE_SIZE)
    )

    page = Math.max(
        0,
        Math.min(Number(page) || 0, totalPages - 1)
    )

    const start = page * CATEGORY_PAGE_SIZE

    const visible = categories.slice(
        start,
        start + CATEGORY_PAGE_SIZE
    )

    let text = createHeader(categories)

    text += `

╭───❖ *PRECIOUS MENU* ❖───
│ 📋 Select a category below.
│ 💬 Commands appear after selection.
│
│ 📑 Page: ${page + 1}/${totalPages}
│ 📂 Categories: ${categories.length}
╰───────────────❖`

    const buttons = visible.map(category => ({
        label: `${categoryIcon(category.name)} ${category.name}`,
        id: `${PREFIX()}menucat ${encodeURIComponent(category.name)}`
    }))

    if (totalPages > 1) {
        const nextPage = page + 1 < totalPages
            ? page + 1
            : 0

        buttons.push({
            label: page + 1 < totalPages
                ? '➡️ NEXT PAGE'
                : '🔄 FIRST PAGE',
            id: `${PREFIX()}menupage ${nextPage}`
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

function createCategoryMenu(categories, name) {
    const category = categories.find(
        item => item.name.toLowerCase() ===
            String(name).toLowerCase()
    )

    if (!category) {
        return {
            text: `❌ Category not found: ${name || 'Unknown'}\n\nUse ${PREFIX()}menu to return to the menu.`,
            buttons: [
                {
                    label: '🏠 MAIN MENU',
                    id: `${PREFIX()}menu`
                }
            ],
            voice: null
        }
    }

    const text = `${createHeader(categories)}

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
        voice: `${getGreeting()}, ${clean(global.userName || 'User')}.
You are now viewing the ${category.name} menu.
There are ${category.commands.length} commands available.
Choose a command from the menu.
I'm ${BOT_NAME}, and I'm ready to help you.`
    }
}

// ==========================================
// SPLIT LONG MESSAGES
// ==========================================

function splitMessage(text, maxLength = MAX_MESSAGE_LENGTH) {
    const lines = String(text).split('\n')
    const chunks = []

    let current = ''

    for (const line of lines) {
        if ((current + '\n' + line).length > maxLength && current) {
            chunks.push(current)
            current = line
        } else {
            current += current ? `\n${line}` : line
        }
    }

    if (current) chunks.push(current)

    return chunks
}

// ==========================================
// FULL COMMAND MENU
// ==========================================

function createFullMenu(categories) {
    const sections = categories.map(category => {
        return `╭───❖ ${categoryIcon(category.name)} *${category.name.toUpperCase()}* ❖───
${category.commands.map(command => `│ ✦ ${command}`).join('\n')}
╰───────────────❖`
    })

    const text = `${createHeader(categories)}

╭───❖ *COMPLETE COMMAND LIST* ❖───
│ 📚 Total: ${getTotal(categories)}
│ 📂 Categories: ${categories.length}
╰───────────────❖

${sections.join('\n\n')}`

    return {
        chunks: splitMessage(text),
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

const handler = async (m, context = {}) => {
    const waClient =
        context.waClient ||
        context.conn ||
        context.client

    const args = Array.isArray(context.args)
        ? context.args
        : []

    if (!waClient?.user?.id) {
        return m.reply('❌ PRECIOUS-MD is not connected yet.')
    }

    const categories = getCategories()

    if (!categories.length) {
        return m.reply('⚠️ No commands are registered. Check your plugin loader.')
    }

    const {
        command,
        parameters
    } = getMenuAction(m, args)

    const userName = clean(m.pushName || 'User')
    const greeting = getGreeting()

    let result
    let voiceText = null
    let showImage = false

    // ======================================
    // MAIN MENU
    // ======================================

    if (command === 'menu' || command === 'help') {
        result = createMainMenu(categories, 0)

        showImage = true

        voiceText = `${greeting}, ${userName}.
Welcome to ${BOT_NAME}.
Your menu is ready.
Please choose a category below to see my commands.
I'm ready to help you.`
    }

    // ======================================
    // CATEGORY MENU
    // ======================================

    else if (command === 'menucat') {
        let categoryName = parameters.join(' ')

        try {
            categoryName = decodeURIComponent(categoryName)
        } catch {}

        result = createCategoryMenu(
            categories,
            categoryName
        )

        if (result.voice) {
            result.voice = result.voice.replace(
                'User',
                userName
            )
        }

        voiceText = result.voice
    }

    // ======================================
    // FULL MENU
    // ======================================

    else if (command === 'menufull' || command === 'full') {
        result = createFullMenu(categories)

        voiceText = `${greeting}, ${userName}.
Here is the complete ${BOT_NAME} command list.
There are ${getTotal(categories)} commands across ${categories.length} categories.
Choose any available command.
I'm ready to help you.`
    }

    // ======================================
    // CATEGORY PAGINATION
    // ======================================

    else if (command === 'menupage') {
        const page = Number(parameters[0]) || 0

        result = createMainMenu(
            categories,
            page
        )

        voiceText = `${greeting}, ${userName}.
Here are more categories.
Choose a category to view its commands.`
    }

    // ======================================
    // FALLBACK
    // ======================================

    else {
        result = createMainMenu(categories, 0)
    }

    // ======================================
    // MAIN MENU IMAGE
    // ======================================

    if (showImage) {
        await sendMenuImage(
            m,
            waClient,
            `✨ Welcome to ${BOT_NAME}, ${userName}!

👑 Created by ${OWNER}

Select a category below to explore the commands.`
        )
    }

    // ======================================
    // SEND MENU
    // ======================================

    try {
        if (result.chunks) {
            for (let i = 0; i < result.chunks.length; i++) {
                const isLast = i === result.chunks.length - 1

                if (isLast) {
                    await sendInteractive(
                        m,
                        waClient,
                        result.chunks[i],
                        result.buttons
                    )
                } else {
                    await waClient.sendMessage(
                        m.chat,
                        {
                            text: result.chunks[i]
                        },
                        {
                            quoted: m
                        }
                    )
                }
            }
        } else {
            await sendInteractive(
                m,
                waClient,
                result.text,
                result.buttons
            )
        }
    } catch (error) {
        console.error('[MENU BUTTON ERROR]', error)

        if (result.chunks) {
            for (const chunk of result.chunks) {
                await waClient.sendMessage(
                    m.chat,
                    {
                        text: chunk
                    },
                    {
                        quoted: m
                    }
                )
            }
        } else {
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
    }

    // ======================================
    // SEND VOICE GREETING
    // ======================================

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
    'menupage',
    'full'
]

handler.category = 'General'

export default handler
