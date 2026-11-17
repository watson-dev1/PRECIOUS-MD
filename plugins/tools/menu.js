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

const esc = s => String(s ?? '').replace(/[*_`~]/g, '')

// ---- Build the full command index ----
function collectCommands() {
    const byCategory = new Map()   // category -> Set<command>
    const seen = new Set()

    let rawCount = 0
    let okCount = 0

    for (const plugin of plugins.values()) {
        rawCount++
        if (!plugin || typeof plugin !== 'object') continue
        if (seen.has(plugin)) continue
        seen.add(plugin)

        if (plugin.silentDeny) continue
        if (!plugin.command) continue
        if (plugin.command instanceof RegExp) continue

        // Normalize into an array of strings
        const raw = Array.isArray(plugin.command) ? plugin.command : [plugin.command]
        const cmds = []
        for (const c of raw) {
            if (c == null) continue
            if (typeof c === 'number') { cmds.push(String(c)); continue }
            if (typeof c === 'string' && c.trim()) { cmds.push(c.trim()); continue }
            // Skip anything else (objects, regex, etc.)
        }
        if (!cmds.length) continue

        okCount++
        const category = (plugin.category && String(plugin.category).trim()) || 'Other'
        if (!byCategory.has(category)) byCategory.set(category, new Set())
        const bucket = byCategory.get(category)
        for (const c of cmds) bucket.add(c.toLowerCase())
    }

    // Sort
    return {
        rawCount,
        okCount,
        categories: [...byCategory.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([name, set]) => [name, [...set].sort((a, b) => a.localeCompare(b))])
    }
}

function buildMenuText(m, { categories, rawCount, okCount }, page, perPage) {
    const prefix = global.prefix ?? '.'
    const allCommands = categories.flatMap(([cat, list]) => list.map(c => ({ cat, c })))
    const totalPages = Math.max(1, Math.ceil(allCommands.length / perPage))
    const safePage = Math.min(Math.max(1, page), totalPages)
    const start = (safePage - 1) * perPage
    const pageCommands = allCommands.slice(start, start + perPage)

    // Group page slice back by category
    const pageByCat = new Map()
    for (const { cat, c } of pageCommands) {
        if (!pageByCat.has(cat)) pageByCat.set(cat, [])
        pageByCat.get(cat).push(c)
    }

    const lines = []
    lines.push('╭━━〔 *PRECIOUS-MD* 〕━━╮')
    lines.push(`┃ 👤 ${esc(m.pushName || 'User')}`)
    lines.push(`┃ ⚙️ Mode: ${esc(global.botMode || 'public')}`)
    lines.push(`┃ 🔤 Prefix: ${esc(prefix || '(none)')}`)
    lines.push(`┃ ⏱️ Uptime: ${formatUptime(process.uptime())}`)
    lines.push(`┃ 📦 Commands: ${allCommands.length} (${okCount}/${rawCount} plugins)`)
    lines.push(`┃ 📄 Page: ${safePage} / ${totalPages}`)
    lines.push('╰━━━━━━━━━━━━━━━━━━╯')

    if (allCommands.length === 0) {
        lines.push('')
        lines.push('⚠️ *No commands loaded.*')
        lines.push('This means `plugins` Map is empty or every plugin is filtered out.')
        lines.push(`Debug: rawCount=${rawCount}, okCount=${okCount}`)
    } else {
        for (const [name, commands] of pageByCat) {
            lines.push('')
            lines.push(`╭─〔 *${esc(name).toUpperCase()}* 〕`)
            for (let i = 0; i < commands.length; i += 2) {
                const pair = commands.slice(i, i + 2).map(c => `✦ ${prefix}${esc(c)}`).join('   ')
                lines.push(`┃ ${pair}`)
            }
            lines.push('╰─────────────────')
        }
        if (totalPages > 1) {
            lines.push('')
            lines.push(`> Next: *${prefix}menu ${safePage < totalPages ? safePage + 1 : 1}*`)
        }
    }

    lines.push('')
    lines.push('> _PRECIOUS-MD • watsonxd • Zimbabwe_')
    return lines.join('\n')
}

let handler = async (m, { waClient, args }) => {
    if (!waClient?.user?.id) return m.reply('❌ Bot not connected.')

    const page = Math.max(1, parseInt(args?.[0], 10) || 1)
    const perPage = 20

    const data = collectCommands()

    // If nothing found, send a debug message to help the owner
    if (data.categories.length === 0) {
        const debugLines = [
            '⚠️ *Menu is empty*',
            '',
            `Plugins iterated: ${data.rawCount}`,
            `Plugins with commands: ${data.okCount}`,
            '',
            '*Possible causes:*',
            '1. `initPlugins()` hasn\\'t run yet',
            '2. All plugins have `silentDeny = true`',
            '3. All plugins have RegExp commands only',
            '4. Plugin files aren\\'t exporting `.command`',
            '',
            'Check bot console for `[PLUGIN] Loaded N plugin(s)`'
        ]
        return m.reply(debugLines.join('\n'))
    }

    const menuText = buildMenuText(m, data, page, perPage)
    const prefix = global.prefix ?? '.'

    try {
        const buttons = [
            { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🏠 Menu', id: `${prefix}menu` }) },
            { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '👑 Owner', id: `${prefix}owner` }) },
            { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📶 Ping', id: `${prefix}ping` }) },
            { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '⏱️ Uptime', id: `${prefix}uptime` }) },
            { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '💚 Alive', id: `${prefix}alive` }) }
        ]

        const message = generateWAMessageFromContent(m.chat, {
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
        }, { userJid: waClient.user.id, quoted: m })

        await waClient.relayMessage(m.chat, message.message, { messageId: message.key.id })
    } catch (err) {
        console.warn('[MENU] Interactive failed, using text fallback:', err?.message || err)
        try {
            await waClient.sendMessage(m.chat, { text: menuText }, { quoted: m })
        } catch {
            await m.reply(menuText).catch(() => {})
        }
    }
}

handler.command = ['menu', 'help']
handler.category = 'General'
handler.description = 'Show all commands by category (paginated)'
handler.usage = 'menu [page]'
handler.ownerBypassAdmin = true

export default handler