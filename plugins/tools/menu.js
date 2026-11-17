import { plugins } from '../../index.js'
import { generateWAMessageFromContent } from '@whiskeysockets/baileys'

const formatUptime = seconds => {
    const total = Math.max(0, Math.floor(Number(seconds) || 0))
    const days = Math.floor(total / 86400)
    const hours = Math.floor((total % 86400) / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const remaining = total % 60
    return [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`, `${remaining}s`]
        .filter(Boolean).join(' ') || '0s'
}

let handler = async (m, { waClient }) => {
    if (!waClient?.user?.id) return m.reply('❌ Bot is not fully connected yet.')

    const categories = {}
    const seen = new Set()
    let rawCount = 0

    for (const plugin of plugins.values()) {
        rawCount++
        if (!plugin) continue
        if (seen.has(plugin)) continue
        seen.add(plugin)

        if (plugin.silentDeny) continue
        if (!plugin.command) continue
        if (plugin.command instanceof RegExp) continue

        const category = plugin.category || 'Other'
        if (!categories[category]) categories[category] = []

        const raw = Array.isArray(plugin.command) ? plugin.command : [plugin.command]
        for (const cmd of raw) {
            if (cmd == null) continue
            if (typeof cmd !== 'string' && typeof cmd !== 'number') continue
            const text = String(cmd).trim()
            if (!text) continue
            categories[category].push(`${global.prefix || ''}${text}`)
        }
    }

    for (const key of Object.keys(categories)) {
        if (!categories[key].length) delete categories[key]
    }

    const totalCommands = Object.values(categories).reduce((n, arr) => n + new Set(arr).size, 0)

    let menu = `╭━━〔 *PRECIOUS-MD* 〕━━╮\n`
    menu += `┃ User: ${String(m.pushName || 'User').replace(/[*_`~]/g, '')}\n`
    menu += `┃ Mode: ${global.botMode || 'public'}\n`
    menu += `┃ Prefix: ${global.prefix || '.'}\n`
    menu += `┃ Uptime: ${formatUptime(process.uptime())}\n`
    menu += `┃ Commands: ${totalCommands}\n`
    menu += `╰━━━━━━━━━━━━━━━━━━╯\n\n`

    if (!totalCommands) {
        menu += `⚠️ *No commands loaded*\n\n`
        menu += `Plugins iterated: ${rawCount}\n`
        menu += `Plugins with commands: 0\n\n`
        menu += `Check the bot console for "[PLUGIN] ... registered 0 commands" warnings.\n`
        return m.reply(menu.trim())
    }

    for (const category of Object.keys(categories).sort((a, b) => a.localeCompare(b))) {
        const unique = [...new Set(categories[category])].sort((a, b) => a.localeCompare(b))
        menu += `╭─〔 *${category.toUpperCase()}* 〕\n`
        menu += unique.map(command => `┃ ✦ ${command}`).join('\n')
        menu += '\n╰─────────────────\n\n'
    }

    try {
        const message = generateWAMessageFromContent(m.chat, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                    interactiveMessage: {
                        body: { text: menu.trim() },
                        footer: { text: 'PRECIOUS-MD by watson-dev1' },
                        nativeFlowMessage: {
                            buttons: [
                                { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Menu', id: `${global.prefix || '.'}menu` }) },
                                { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Owner', id: `${global.prefix || '.'}owner` }) },
                                { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Ping', id: `${global.prefix || '.'}ping` }) },
                                { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Uptime', id: `${global.prefix || '.'}uptime` }) },
                                { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Alive', id: `${global.prefix || '.'}alive` }) }
                            ]
                        }
                    }
                }
            }
        }, { userJid: waClient.user.id, quoted: m })

        await waClient.relayMessage(m.chat, message.message, { messageId: message.key.id })
    } catch (err) {
        console.warn('[MENU] Interactive send failed, falling back to plain text:', err?.message || err)
        try {
            await waClient.sendMessage(m.chat, { text: menu.trim() }, { quoted: m })
        } catch {
            await m.reply(menu.trim()).catch(() => {})
        }
    }
}

handler.command = ['menu', 'help']
handler.category = 'General'
export default handler