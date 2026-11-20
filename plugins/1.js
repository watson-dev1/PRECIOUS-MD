
// plugins/menu2.js
import moment from 'moment-timezone'
import os from 'os'

const readMore = String.fromCharCode(8206).repeat(4001)

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

const ucapan = () => {
    const hour = Number(moment.tz('Africa/Harare').format('HH'))

    if (hour >= 18) return '🌙 GOOD NIGHT 🌙😴'
    if (hour >= 15) return '🌇 GOOD EVENING 🌇'
    if (hour >= 10) return '🌞 GOOD AFTERNOON 🌞'

    return '☀️ GOOD MORNING ☀️'
}

const pickRandom = list => {
    if (!Array.isArray(list)) return null
    const images = list.filter(Boolean)
    return images.length
        ? images[Math.floor(Math.random() * images.length)]
        : null
}

// Supports global.plugins as Map, Array, or Object
const getPlugins = () => {
    const registry = global.plugins || global.pluginMap || {}

    if (registry instanceof Map) return [...registry.values()]
    if (Array.isArray(registry)) return registry
    if (typeof registry === 'object') return Object.values(registry)

    return []
}

// Convert command definitions into displayable names
const getCommands = plugin => {
    const result = []

    const add = value => {
        if (typeof value === 'string' && value.trim()) {
            result.push(value.trim())
        } else if (value instanceof RegExp) {
            const pattern = value.source
                .replace(/^\^/, '')
                .replace(/\$$/, '')
                .replace(/\\\|/g, ', ')
                .replace(/\(\?:/g, '(')
                .replace(/[()[\]^$]/g, '')
                .replace(/\\[a-z]/g, '')
            if (pattern) result.push(pattern)
        }
    }

    if (Array.isArray(plugin.command)) {
        plugin.command.forEach(add)
    } else {
        add(plugin.command)
    }

    // Many PRECIOUS-MD plugins use help instead of command
    if (Array.isArray(plugin.help)) {
        plugin.help.forEach(add)
    } else {
        add(plugin.help)
    }

    return [...new Set(result)]
}

const getCategories = plugin => {
    const categories = []

    if (Array.isArray(plugin.category)) {
        categories.push(...plugin.category)
    } else if (plugin.category) {
        categories.push(plugin.category)
    }

    if (Array.isArray(plugin.tags)) {
        categories.push(...plugin.tags)
    } else if (plugin.tags) {
        categories.push(plugin.tags)
    }

    return [...new Set(
        categories
            .filter(Boolean)
            .map(value => String(value).trim())
            .filter(Boolean)
    )]
}

let handler = async (m, { waClient }) => {
    if (!waClient?.user?.id) {
        return m.reply('❌ Bot is not fully connected yet. Try again in a moment.')
    }

    try {
        await waClient.sendMessage(m.chat, {
            react: { text: '✨', key: m.key }
        }).catch(() => {})

        const dbUsers = global.db?.data?.users || {}
        const userData = dbUsers[m.sender] || {}

        const name = String(m.pushName || 'User').replace(/[*_`~]/g, '')
        const owner = global.ownerNumber || 'Watson Fourpence'
        const mode = global.botMode || 'public'
        const prefix = global.prefix || '.'

        const uptime = formatUptime(process.uptime())
        const platform = os.platform()
        const memory = process.memoryUsage()
        const ram = (memory.rss / 1048576).toFixed(1)

        const level = userData.level || 0
        const exp = userData.exp || 0
        const limit = userData.limit || 0
        const role = userData.role || 'Newbie'

        const premiumTime = Number(userData.premiumTime || 0)
        const premium = premiumTime > Date.now() ? 'PREMIUM' : 'FREE'

        const totalUsers = Object.keys(dbUsers).length

        // Read the actual loaded plugin registry
        const plugins = getPlugins()
        const categories = {}

        for (const plugin of plugins) {
            if (!plugin || plugin.disabled) continue

            const commands = getCommands(plugin)
            if (!commands.length) continue

            const pluginCategories = getCategories(plugin)
            const category = pluginCategories[0] || 'General'

            if (!categories[category]) categories[category] = []

            for (const command of commands) {
                categories[category].push({
                    command,
                    premium: Boolean(plugin.premium),
                    limit: Boolean(plugin.limit)
                })
            }
        }

        const totalCommands = Object.values(categories)
            .reduce((total, commands) => total + commands.length, 0)

        const menuHeader = [
            '✨🌟 *WELCOME TO PRECIOUS-MD* 🌟✨',
            '',
            '╭━━━⊱ 💫 *USER INFORMATION* 💫 ⊱━━━',
            `┃ 👤 Name: ${name}`,
            `┃ 👑 Owner: ${owner}`,
            `┃ ⚙️ Mode: ${mode}`,
            `┃ 🔤 Prefix: ${prefix}`,
            `┃ 💎 Account: ${premium}`,
            `┃ 🏅 Level: ${level}`,
            `┃ ⭐ Exp: ${exp}`,
            `┃ 🪙 Limit: ${limit}`,
            `┃ 🎖️ Role: ${role}`,
            '╰━━━━━━━━━━━━━━━━━━',
            '',
            '╭━━━⊱ ⚙️ *BOT INFORMATION* ⚙️ ⊱━━━',
            '┃ 🤖 Bot: PRECIOUS-MD',
            `┃ 📱 Platform: ${platform}`,
            `┃ ⏱️ Uptime: ${uptime}`,
            `┃ 🧠 RAM: ${ram} MB`,
            `┃ 👥 Registered: ${totalUsers}`,
            `┃ 🔧 Commands: ${totalCommands}`,
            `┃ 🧩 Loaded plugins: ${plugins.length}`,
            '┃ 🟢 Status: ONLINE',
            '╰━━━━━━━━━━━━━━━━━━',
            '',
            `📢 *${ucapan()}*`,
            '',
            '╭━━━⊱ 📚 *COMMAND MENU* 📚 ⊱━━━',
            `┃ ⬡▸ ${totalCommands} commands available`,
            '╰━━━━━━━━━━━━━━━━━━',
            readMore
        ]

        const menuSections = Object.keys(categories)
            .sort()
            .map(category => {
                const commands = categories[category]
                    .sort((a, b) => a.command.localeCompare(b.command))
                    .map(item => {
                        const marks =
                            (item.premium ? ' 🅿' : '') +
                            (item.limit ? ' 🅻' : '')

                        return `┃ ⬡▸ ${prefix}${item.command}${marks}`
                    })

                return [
                    '',
                    `╭━━━⊱ 💠 *${String(category).toUpperCase()}* 💠 ⊱━━━`,
                    ...commands,
                    '╰━━━━━━━━━━━━━━━━━━'
                ].join('\n')
            })

        const footer = [
            '',
            '╭━━━⊱ 👑 *PRECIOUS-MD* ⊱━━━',
            '┃ Created by Watson Fourpence',
            '┃ Powered by Watson XD',
            '╰━━━━━━━━━━━━━━━━━━'
        ].join('\n')

        let text = [
            ...menuHeader,
            ...menuSections,
            footer
        ].join('\n')

        // Keep the menu readable if no commands are discovered
        if (!totalCommands) {
            text += [
                '',
                '⚠️ *No commands were found in the plugin registry.*',
                'Check that your plugin loader exposes its plugins through global.plugins.'
            ].join('\n')
        }

        const image = pickRandom(global.princeImg)

        if (image) {
            await waClient.sendMessage(
                m.chat,
                {
                    image,
                    caption: text,
                    mentions: m.sender ? [m.sender] : []
                },
                { quoted: m }
            )
        } else {
            await waClient.sendMessage(
                m.chat,
                {
                    text,
                    mentions: m.sender ? [m.sender] : []
                },
                { quoted: m }
            )
        }

    } catch (err) {
        console.error('[MENU2] Error:', err?.stack || err)

        await m.reply(
            '❌ Failed to load PRECIOUS-MD menu. Check the bot console for the error.'
        ).catch(() => {})
    }
}

handler.command = ['menu4', 'h4', 'hh', 'help2']
handler.category = 'General'
handler.description = 'Display all PRECIOUS-MD commands'
handler.usage = 'menu2'
handler.ownerBypassAdmin = true

export default handler
