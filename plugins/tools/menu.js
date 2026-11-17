// plugins/menu.js
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

// Escape WhatsApp formatting chars + zero-width joiner issues
const esc = s => String(s ?? '').replace(/[*_`~]/g, '')

// Build the command index once per invocation — but skip duplicates cleanly
function buildCategories() {
    const categories = {}
    const seen = new Set()

    for (const plugin of plugins.values()) {
        if (!plugin || typeof plugin !== 'object') continue
        if (seen.has(plugin)) continue
        seen.add(plugin)

        // Skip silent / hidden / regex-only / custom-prefix-only plugins
        if (plugin.silentDeny) continue
        if (!plugin.command) continue
        if (plugin.command instanceof RegExp) continue

        const category = plugin.category || 'Other'
        const list = Array.isArray(plugin.command) ? plugin.command : [plugin.command]
        const mapped = list
            .filter(c => c && typeof c === 'string' || typeof c === 'number')
            .map(c => String(c).toLowerCase())

        if (!mapped.length) continue
        if (!categories[category]) categories[category] = new Set()
        for (const c of mapped) categories[category].add(c)
    }

    // Sort categories, sort commands inside each
    const out = []
    for (const name of Object.keys(categories).sort((a, b) => a.localeCompare(b))) {
        out.push([name, [...categories[name]].sort((a, b) => a.localeCompare(b))])
    }
    return out
}

function buildMenuText(m, categories) {
    const prefix = global.prefix ?? '.'
    const lines = []

    lines.push('╭━━〔 *PRECIOUS-MD* 〕━━╮')
    lines.push(`┃ 👤 ${esc(m.pushName || 'User')}`)
    lines.push(`┃ ⚙️ Mode: ${esc(global.botMode || 'public')}`)
    lines.push(`┃ 🔤 Prefix: ${esc(prefix || '(none)')}`)
    lines.push(`┃ ⏱️ Uptime: ${formatUptime(process.uptime())}`)
    lines.push(`┃ 📦 Commands: ${categories.reduce((n, [, list]) => n + list.length, 0)}`)
    lines.push('╰━━━━━━━━━━━━━━━━━━╯')

    for (const [name, commands] of categories) {
        lines.push('')
        lines.push(`╭─〔 *${esc(name).toUpperCase()}* 〕`)
        // Chunk 2 per line to keep mobile width tidy
        for (let i = 0; i < commands.length; i += 2) {
            const pair = commands.slice(i, i + 2).map(c => `✦ ${prefix}${esc(c)}`).join('   ')
            lines.push(`┃ ${pair}`)
        }
        lines.push('╰─────────────────')
    }

    lines.push('')
    lines.push('> _PRECIOUS-MD • watsonxd • Zimbabwe_')

    return lines.join('\n')
}

function buildInteractive(chat, menuText, prefix, quoted, waClient) {
    const buttons = [
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🏠 Menu', id: `${prefix}menu` }) },
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '👑 Owner', id: `${prefix}owner` }) },
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📶 Ping', id: `${prefix}ping` }) },
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '⏱️ Uptime', id: `${prefix}uptime` }) },
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '💚 Alive', id: `${prefix}alive` }) }
    ]

    return generateWAMessageFromContent(chat, {
        viewOnceMessage: {
            message: {
                messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                interactiveMessage: {
                    body: { text: menuText },
                    footer: { text: 'PRECIOUS-MD by watson-dev1' },
                    nativeFlowMessage: { buttons }
                }
            }
        }
    }, { userJid: waClient.user.id, quoted })
}

let handler = async (m, { waClient }) => {
    if (!waClient?.user?.id) {
        return m.reply('❌ Bot is not fully connected. Try again in a moment.')
    }

    const categories = buildCategories()
    if (!categories.length) {
        return m.reply('📭 No commands are currently loaded.')
    }

    const prefix = global.prefix ?? '.'
    const menuText = buildMenuText(m, categories)

    // Try interactive message first; fall back to plain text if it throws.
    try {
        const message = buildInteractive(m.chat, menuText, prefix, m, waClient)
        await waClient.relayMessage(m.chat, message.message, { messageId: message.key.id })
    } catch (err) {
        console.warn('[MENU] Interactive send failed, falling back to text:', err?.message || err)
        try {
            await waClient.sendMessage(m.chat, { text: menuText }, { quoted: m })
        } catch (fallbackErr) {
            console.error('[MENU] Text fallback also failed:', fallbackErr?.message || fallbackErr)
            await m.reply(menuText).catch(() => {})
        }
    }
}

handler.command = ['menu', 'help']
handler.category = 'General'
handler.description = 'Show all available commands by category'
handler.usage = 'menu'
handler.ownerBypassAdmin = true

export default handler