import { plugins } from '../../index.js'
import { sendButtons, quickReply, listButton } from '../../lib/buttons.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MENU_IMAGE = path.resolve(__dirname, '../../media/watson.jpg')

const formatUptime = seconds => {
    const total = Math.max(0, Math.floor(Number(seconds) || 0))
    const days = Math.floor(total / 86400)
    const hours = Math.floor((total % 86400) / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const remaining = total % 60
    return [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`, `${remaining}s`]
        .filter(Boolean).join(' ') || '0s'
}

const ICONS = { General: '🏠', Owner: '👑', Group: '👥', Download: '📥', Tools: '🧰', 'AI & Tools': '🤖', Games: '🎮', Economy: '💰', Fun: '🎉', Search: '🔎', Other: '📦' }
const icon = name => ICONS[name] || '✦'

function collect() {
    const categories = {}
    const seen = new Set()
    for (const plugin of plugins.values()) {
        if (!plugin || seen.has(plugin)) continue
        seen.add(plugin)
        if (plugin.silentDeny || !plugin.command || plugin.command instanceof RegExp) continue
        const category = plugin.category || 'Other'
        const raw = Array.isArray(plugin.command) ? plugin.command : [plugin.command]
        for (const cmd of raw) {
            if (typeof cmd !== 'string' && typeof cmd !== 'number') continue
            const name = String(cmd).trim()
            if (!name) continue
            ;(categories[category] ||= new Set()).add(name)
        }
    }
    return Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, [...v].sort((a, b) => a.localeCompare(b))]).filter(([, v]) => v.length))
}

let handler = async (m, { waClient, args = [] }) => {
    if (!waClient?.user?.id) return m.reply('❌ Bot is not fully connected yet.')
    const prefix = global.prefix || '.'
    const categories = collect()
    const names = Object.keys(categories).sort((a, b) => a.localeCompare(b))
    const total = new Set(Object.values(categories).flat()).size
    if (!total) return m.reply('⚠️ No commands loaded. Check the bot console for plugin errors.')

    // FIX: Clean up args to handle quick reply text and case sensitivity
    let wanted = args.join(' ').trim().toLowerCase()
    
    // If the user clicked a quick reply button, it might send the button text
    if (wanted === 'full list' || wanted === '📜 full list') wanted = 'all'
    
    // If the user clicked Ping, Owner, or Alive, exit the menu and let those plugins handle it
    if (['ping', '🏓 ping', 'owner', '👑 owner', 'alive', '🟢 alive'].includes(wanted)) {
        return // Let the respective command handler take over
    }

    // ---- .menu all : full catalogue as text ----
    if (wanted === 'all') {
        let menu = `╭━━〔 *PRECIOUS-MD* 〕━━╮\n┃ Commands: ${total}\n┃ Prefix: ${prefix}\n╰━━━━━━━━━━━━━━━━━━╯\n\n`
        for (const name of names) {
            menu += `╭─〔 ${icon(name)} *${name.toUpperCase()}* 〕\n${categories[name].map(c => `┃ ✦ ${prefix}${c}`).join('\n')}\n╰─────────────────\n\n`
        }
        return m.reply(menu.trim())
    }

    // ---- .menu <category> ----
    if (wanted) {
        // Strip icons from the category name if they were sent back by the button
        const cleanWanted = wanted.replace(/[^a-z0-9 &]/g, '').trim()
        
        const name = names.find(n => n.toLowerCase() === cleanWanted) || names.find(n => n.toLowerCase().startsWith(cleanWanted))
        
        if (!name) {
            // If it's a category name that wasn't found, show a helpful message
            return m.reply(`Category not found. Use *${prefix}menu* to see them all.`)
        }
        
        return sendButtons(waClient, m, {
            title: `${icon(name)} ${name.toUpperCase()}`,
            body: `*${categories[name].length} commands*\n\n${categories[name].map(c => `✦ ${prefix}${c}`).join('\n')}`,
            // FIX: Send the actual command text as the ID so it triggers properly
            buttons: [
                quickReply('⬅️ Main menu', `${prefix}menu`), 
                quickReply('📜 Full list', `${prefix}menu all`)
            ]
        })
    }

    // ---- .menu : header card + category picker ----
    const body =
        `╭━━〔 *PRECIOUS-MD* 〕━━╮\n` +
        `┃ 👤 ${String(m.pushName || 'User').replace(/[*_`~]/g, '')}\n` +
        `┃ ⚙️ Mode: ${global.botMode || 'public'}  |  Prefix: ${prefix}\n` +
        `┃ ⏱️ Uptime: ${formatUptime(process.uptime())}\n` +
        `┃ 📚 Commands: ${total}\n` +
        `╰━━━━━━━━━━━━━━━━━━╯\n\n` +
        `Tap *Select category* to browse, or use the quick buttons below.`

    const image = fs.existsSync(MENU_IMAGE) ? fs.readFileSync(MENU_IMAGE) : undefined
    
    return sendButtons(waClient, m, {
        image,
        title: 'PRECIOUS-MD MENU',
        footer: 'PRECIOUS-MD by watson-dev1',
        body,
        buttons: [
            listButton('📂 Select category', [{
                title: 'Categories',
                rows: names.map(name => ({ 
                    title: `${icon(name)} ${name}`, 
                    description: `${categories[name].length} commands`, 
                    id: `${prefix}menu ${name}` // This is correct for list buttons
                }))
            }]),
            // FIX: We pass the actual command (e.g. '.menu all') as the ID.
            // When clicked, most WA libraries send the ID back to the bot.
            quickReply('📜 Full list', `${prefix}menu all`),
            quickReply('🏓 Ping', `${prefix}ping`),
            quickReply('👑 Owner', `${prefix}owner`),
            quickReply('🟢 Alive', `${prefix}alive`)
        ]
    })
}

handler.command = ['menu2', 'help2', 'commands']
handler.category = 'General'
export default handler
