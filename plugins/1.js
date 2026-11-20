
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
    if (!images.length) return null

    return images[Math.floor(Math.random() * images.length)]
}

let handler = async (m, { waClient }) => {
    // Socket guard
    if (!waClient?.user?.id) {
        return m.reply('❌ Bot is not fully connected yet. Try again in a moment.')
    }

    try {
        await waClient.sendMessage(m.chat, {
            react: {
                text: '✨',
                key: m.key
            }
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

        // Load registered plugins
        const plugins = Object.values(global.plugins || {})

        const validPlugins = plugins.filter(plugin =>
            plugin &&
            !plugin.disabled &&
            plugin.command
        )

        const categories = {}

        for (const plugin of validPlugins) {
            const category = plugin.category || 'Other'

            if (!categories[category]) {
                categories[category] = []
            }

            const commands = Array.isArray(plugin.command)
                ? plugin.command
                : [plugin.command]

            for (const command of commands) {
                if (typeof command === 'string') {
                    categories[category].push({
                        command,
                        premium: Boolean(plugin.premium),
                        limit: Boolean(plugin.limit)
                    })
                } else if (command instanceof RegExp) {
                    categories[category].push({
                        command: command.source
                            .replace(/^\^|\$$/g, '')
                            .replace(/\\\|/g, ', '),
                        premium: Boolean(plugin.premium),
                        limit: Boolean(plugin.limit)
                    })
                }
            }
        }

        const totalCommands = Object.values(categories)
            .reduce((total, commands) => total + commands.length, 0)

        const header = [
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
            `┃ 🤖 Bot: PRECIOUS-MD`,
            `┃ 📱 Platform: ${platform}`,
            `┃ ⏱️ Uptime: ${uptime}`,
            `┃ 🧠 RAM: ${ram} MB`,
            `┃ 👥 Registered: ${totalUsers}`,
            `┃ 🔧 Commands: ${totalCommands}`,
            `┃ 🟢 Status: ONLINE`,
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
                    `╭━━━⊱ 💠 *${category.toUpperCase()}* 💠 ⊱━━━`,
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

        const text = [
            ...header,
            ...menuSections,
            footer
        ].join('\n')

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
handler.description = 'Display the PRECIOUS-MD command menu'
handler.usage = 'menu2'
handler.ownerBypassAdmin = true

export default handler
