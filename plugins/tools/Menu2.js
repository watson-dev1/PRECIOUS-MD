
import { plugins } from '../../index.js'
import { generateWAMessageFromContent } from '@whiskeysockets/baileys'
import os from 'os'

const BRAND = {
    name: 'PRECIOUS-MD',
    creator: 'Watson Fourpence',
    powered: 'WATSON XD',
    footer: '© 2026 PRECIOUS-MD • All Rights Reserved',
    image: 'media/Watson.jpg'
}

const clean = (value, max = 100) =>
    String(value ?? '')
        .replace(/[\n\r\t]/g, ' ')
        .replace(/[*_~`]/g, '')
        .trim()
        .slice(0, max) || 'Unknown'

const formatUptime = seconds => {
    let s = Math.max(0, Math.floor(Number(seconds) || 0))
    const d = Math.floor(s / 86400)
    s %= 86400
    const h = Math.floor(s / 3600)
    s %= 3600
    const m = Math.floor(s / 60)
    s %= 60

    return [
        d && `${d}d`,
        h && `${h}h`,
        m && `${m}m`,
        `${s}s`
    ].filter(Boolean).join(' ')
}

const formatBytes = bytes => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

const getTime = () => {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Harare',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(new Date())
}

const getDate = () => {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Harare',
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    }).format(new Date())
}

const getPlugins = () => {
    if (plugins instanceof Map) return [...plugins.values()]
    if (Array.isArray(plugins)) return plugins
    if (plugins && typeof plugins === 'object') {
        return Object.values(plugins)
    }
    return []
}

const getCommands = () => {
    const categories = new Map()
    const seenPlugins = new Set()
    const seenCommands = new Set()

    let totalPlugins = 0
    let activePlugins = 0

    for (const plugin of getPlugins()) {
        totalPlugins++

        if (!plugin || typeof plugin !== 'object') continue
        if (seenPlugins.has(plugin)) continue

        seenPlugins.add(plugin)

        if (plugin.silentDeny || plugin.disabled) continue
        if (!plugin.command) continue
        if (plugin.command instanceof RegExp) continue

        activePlugins++

        const category = clean(plugin.category || 'Other', 40)
        const commands = Array.isArray(plugin.command)
            ? plugin.command
            : [plugin.command]

        if (!categories.has(category)) {
            categories.set(category, [])
        }

        for (const cmd of commands) {
            if (typeof cmd !== 'string' && typeof cmd !== 'number') {
                continue
            }

            const name = String(cmd).trim().toLowerCase()
            if (!name) continue

            const key = `${category}:${name}`

            if (seenCommands.has(key)) continue
            seenCommands.add(key)

            categories.get(category).push(name)
        }
    }

    const sorted = [...categories.entries()]
        .filter(([, commands]) => commands.length)
        .sort(([a], [b]) => a.localeCompare(b))

    const totalCommands = sorted.reduce(
        (total, [, commands]) => total + commands.length,
        0
    )

    return {
        categories: sorted,
        totalCommands,
        totalPlugins,
        activePlugins
    }
}

const makeMenu = (m, waClient) => {
    const prefix = String(global.prefix || '.')
    const mode = clean(global.botMode || 'public').toUpperCase()
    const user = clean(m.pushName || 'User', 35)
    const bot = clean(waClient.user?.name || BRAND.name, 35)

    const memory = process.memoryUsage()
    const totalMemory = os.totalmem()
    const freeMemory = os.freemem()
    const usedSystemMemory = totalMemory - freeMemory

    const stats = getCommands()

    const categoryIcons = {
        General: '◈',
        Owner: '♛',
        Group: '♧',
        Tools: '⚙',
        Sticker: '◇',
        Media: '▣',
        'Artificial Intelligence': '✧',
        Entertainment: '♬',
        Games: '♞',
        Utilities: '⌘',
        Downloader: '↓',
        Search: '⌕'
    }

    let menu = ''

    menu += `╭━━━〔 ✦ ${BRAND.name} ✦ 〕━━━╮\n`
    menu += `┃\n`
    menu += `┃  ◈ Welcome, ${user}\n`
    menu += `┃  ◈ Bot: ${bot}\n`
    menu += `┃  ◈ Creator: ${BRAND.creator}\n`
    menu += `┃  ◈ Powered by: ${BRAND.powered}\n`
    menu += `┃\n`
    menu += `╰━━━━━━━━━━━━━━━━━━━━╯\n\n`

    menu += `╭━━━〔 SYSTEM STATUS 〕━━━╮\n`
    menu += `┃ ◉ Status       : ONLINE\n`
    menu += `┃ ◈ Mode         : ${mode}\n`
    menu += `┃ ◈ Prefix       : ${prefix}\n`
    menu += `┃ ◈ Uptime       : ${formatUptime(process.uptime())}\n`
    menu += `┃ ◈ Server Time  : ${getTime()}\n`
    menu += `┃ ◈ Date         : ${getDate()}\n`
    menu += `┃ ◈ Node.js      : ${process.version}\n`
    menu += `┃ ◈ Platform     : ${process.platform}\n`
    menu += `╰━━━━━━━━━━━━━━━━━━━━╯\n\n`

    menu += `╭━━━〔 PERFORMANCE 〕━━━╮\n`
    menu += `┃ ◈ Bot RAM      : ${formatBytes(memory.rss)}\n`
    menu += `┃ ◈ Heap Used    : ${formatBytes(memory.heapUsed)}\n`
    menu += `┃ ◈ Heap Total   : ${formatBytes(memory.heapTotal)}\n`
    menu += `┃ ◈ System RAM   : ${formatBytes(usedSystemMemory)}\n`
    menu += `┃ ◈ CPU Cores    : ${os.cpus().length}\n`
    menu += `╰━━━━━━━━━━━━━━━━━━━━╯\n\n`

    menu += `╭━━━〔 PLUGIN STATISTICS 〕━━━╮\n`
    menu += `┃ ◈ Total Plugins   : ${stats.totalPlugins}\n`
    menu += `┃ ◈ Active Plugins  : ${stats.activePlugins}\n`
    menu += `┃ ◈ Categories     : ${stats.categories.length}\n`
    menu += `┃ ◈ Total Commands : ${stats.totalCommands}\n`
    menu += `╰━━━━━━━━━━━━━━━━━━━━╯\n\n`

    menu += `╭━━━〔 COMMAND DIRECTORY 〕━━━╮\n\n`

    if (!stats.totalCommands) {
        menu += `⚠ No commands are currently registered.\n\n`
    }

    for (const [category, commands] of stats.categories) {
        const icon = categoryIcons[category] || '✦'
        const commandList = commands
            .sort((a, b) => a.localeCompare(b))
            .map(command => `${prefix}${command}`)
            .join('  •  ')

        menu += `╭─〔 ${icon} ${category.toUpperCase()} 〕\n`
        menu += `┃\n`

        // Keep category lines readable on mobile.
        const words = commandList.split('  •  ')
        let line = '┃  '

        for (const word of words) {
            if ((line + word).length > 65) {
                menu += line.trimEnd() + '\n'
                line = '┃  '
            }

            line += word + '  •  '
        }

        if (line.trim() !== '┃') {
            menu += line.replace(/  •  $/, '') + '\n'
        }

        menu += `╰────────────────────\n\n`
    }

    menu += `╭━━━〔 QUICK ACCESS 〕━━━╮\n`
    menu += `┃ ◈ ${prefix}menu\n`
    menu += `┃ ◈ ${prefix}owner\n`
    menu += `┃ ◈ ${prefix}ping\n`
    menu += `┃ ◈ ${prefix}alive\n`
    menu += `┃ ◈ ${prefix}uptime\n`
    menu += `╰━━━━━━━━━━━━━━━━━━━━╯\n\n`

    menu += `╭━━━〔 ABOUT PRECIOUS 〕━━━╮\n`
    menu += `┃\n`
    menu += `┃  Created by ${BRAND.creator}\n`
    menu += `┃  Powered by ${BRAND.powered}\n`
    menu += `┃  Designed for WhatsApp\n`
    menu += `┃\n`
    menu += `╰━━━━━━━━━━━━━━━━━━━━╯\n\n`

    menu += `_${BRAND.footer}_`

    return menu
}

const sendFallback = async (m, waClient, text) => {
    // Split oversized menus into WhatsApp-friendly messages.
    const limit = 3500
    const chunks = []

    for (let i = 0; i < text.length; i += limit) {
        chunks.push(text.slice(i, i + limit))
    }

    for (const chunk of chunks) {
        await waClient.sendMessage(
            m.chat,
            { text: chunk },
            { quoted: m }
        )
    }
}

let handler = async (m, { waClient }) => {
    if (!waClient?.user?.id) {
        return m.reply('❌ PRECIOUS-MD is not fully connected yet.')
    }

    try {
        const menu = makeMenu(m, waClient)

        // Interactive menu with text fallback.
        if (menu.length <= 3500) {
            try {
                const buttons = [
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                            display_text: '♛ OWNER',
                            id: `${global.prefix || '.'}owner`
                        })
                    },
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                            display_text: '⚡ PING',
                            id: `${global.prefix || '.'}ping`
                        })
                    },
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                            display_text: '✦ ALIVE',
                            id: `${global.prefix || '.'}alive`
                        })
                    }
                ]

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
                                        text: menu
                                    },
                                    footer: {
                                        text: `${BRAND.name} | ${BRAND.creator}`
                                    },
                                    nativeFlowMessage: {
                                        buttons
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

                return
            } catch (error) {
                console.warn(
                    '[MENU] Interactive message failed:',
                    error?.message || error
                )
            }
        }

        await sendFallback(m, waClient, menu)

    } catch (error) {
        console.error('[MENU] Menu generation failed:', error)

        return m.reply(
            '❌ An error occurred while generating the PRECIOUS-MD menu. Please try again.'
        )
    }
}

handler.command = ['menu4', 'help4']
handler.category = 'General'
handler.description = 'Display the premium PRECIOUS-MD command centre'
handler.exp = 0

export default handler
