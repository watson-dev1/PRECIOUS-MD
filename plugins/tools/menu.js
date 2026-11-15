import { plugins } from '../../index.js'
import { generateWAMessageFromContent } from '@whiskeysockets/baileys'

const formatUptime = seconds => {
    const total = Math.floor(seconds)
    const days = Math.floor(total / 86400)
    const hours = Math.floor((total % 86400) / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const remaining = total % 60
    return [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`, `${remaining}s`]
        .filter(Boolean).join(' ')
}

let handler = async (m, { waClient }) => {
    const categories = {}
    const seen = new Set()
    for (const plugin of plugins.values()) {
        if (seen.has(plugin) || plugin.silentDeny || !plugin.command || plugin.command instanceof RegExp) continue
        seen.add(plugin)
        const category = plugin.category || 'Other'
        if (!categories[category]) categories[category] = []
        const commands = (Array.isArray(plugin.command) ? plugin.command : [plugin.command])
            .filter(Boolean).map(command => `${global.prefix || ''}${command}`)
        categories[category].push(...commands)
    }

    let menu = `╭━━〔 *PRECIOUS-MD* 〕━━╮\n`
    menu += `┃ User: ${String(m.pushName || 'User').replace(/[*_`~]/g, '')}\n`
    menu += `┃ Mode: ${global.botMode || 'public'}\n`
    menu += `┃ Prefix: ${global.prefix || '.'}\n`
    menu += `┃ Uptime: ${formatUptime(process.uptime())}\n`
    menu += `╰━━━━━━━━━━━━━━━━━━╯\n\n`
    for (const category of Object.keys(categories).sort()) {
        menu += `╭─〔 *${category.toUpperCase()}* 〕\n`
        menu += [...new Set(categories[category])].sort().map(command => `┃ ✦ ${command}`).join('\n')
        menu += '\n╰─────────────────\n\n'
    }

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
}

handler.command = ['menu', 'help']
handler.category = 'General'
export default handler
