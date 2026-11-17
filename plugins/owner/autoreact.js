import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SETTINGS_PATH = path.join(__dirname, '..', '..', 'database', 'settings.json')

const DEFAULT_EMOJIS = ['❤️‍🔥']
const MAX_EMOJIS = 20

function readSettings() {
    try {
        return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'))
    } catch {
        return {}
    }
}

function writeSettings(data) {
    try {
        fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true })
        const tmp = `${SETTINGS_PATH}.tmp`
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
        fs.renameSync(tmp, SETTINGS_PATH)
    } catch (err) {
        console.error('[AUTOREACT] Failed to write settings:', err?.message || err)
    }
}

function parseEmojis(input) {
    if (!input) return []
    const parts = String(input)
        .split(/[,，;|\s]+/)
        .map(e => e.trim())
        .filter(Boolean)
    return [...new Set(parts)].slice(0, MAX_EMOJIS)
}

function currentEmojis() {
    return (Array.isArray(global.autoReactEmojis) && global.autoReactEmojis.length)
        ? global.autoReactEmojis
        : DEFAULT_EMOJIS
}

const PREFIX = () => global.prefix || '.'

let handler = async (m, { args = [] }) => {
    const choice = String(args[0] || '').toLowerCase()

    // ---------- .autoreact emoji <list> ----------
    if (choice === 'emoji') {
        const emojis = parseEmojis(args.slice(1).join(' '))
        if (!emojis.length) {
            return m.reply(
                `*Auto-react emoji settings*\n\n` +
                `Current: ${currentEmojis().join(' ')}\n\n` +
                `Usage:\n` +
                `• ${PREFIX()}autoreact emoji ❤️‍🔥,😍,🥰\n` +
                `• ${PREFIX()}autoreact emoji ❤️‍🔥 😍 🥰`
            )
        }
        global.autoReactEmojis = emojis
        const settings = readSettings()
        settings.autoReactEmojis = emojis
        writeSettings(settings)
        return m.reply(`✅ Auto-react reactions set to:\n${emojis.join(' ')}`)
    }

    // ---------- .autoreact on | off ----------
    if (choice === 'on' || choice === 'off') {
        const next = choice === 'on'
        const rawEmojis = args.slice(1).join(' ').trim()
        const emojis = rawEmojis ? parseEmojis(rawEmojis) : currentEmojis()
        if (rawEmojis && !emojis.length) {
            return m.reply('⚠️ Provide at least one valid reaction emoji.')
        }
        global.autoReact = next
        global.autoReactEmojis = emojis

        const settings = readSettings()
        settings.autoReact = next
        settings.autoReactEmojis = emojis
        writeSettings(settings)

        return m.reply(
            `Auto-react is now *${next ? 'ON' : 'OFF'}*.\n` +
            `Reactions: ${emojis.join(' ')}`
        )
    }

    // ---------- .autoreact (no args) — toggle ----------
    if (!choice) {
        const next = !global.autoReact
        const emojis = currentEmojis()
        global.autoReact = next
        global.autoReactEmojis = emojis

        const settings = readSettings()
        settings.autoReact = next
        settings.autoReactEmojis = emojis
        writeSettings(settings)

        return m.reply(
            `Auto-react is now *${next ? 'ON' : 'OFF'}*.\n` +
            `Reactions: ${emojis.join(' ')}`
        )
    }

    // ---------- unknown subcommand ----------
    return m.reply(
        `*Auto-react*\n\n` +
        `Current: *${global.autoReact ? 'ON' : 'OFF'}*\n` +
        `Reactions: ${currentEmojis().join(' ')}\n\n` +
        `*Usage*\n` +
        `• ${PREFIX()}autoreact                — toggle ON/OFF\n` +
        `• ${PREFIX()}autoreact on             — enable\n` +
        `• ${PREFIX()}autoreact off            — disable\n` +
        `• ${PREFIX()}autoreact emoji ❤️‍🔥,😍  — set reaction emojis\n` +
        `• ${PREFIX()}autoreact on ❤️‍🔥,😍    — enable + set emojis`
    )
}

handler.command = ['autoreact']
handler.category = 'General'
handler.description = 'Toggle auto-reaction to received messages and set emojis'
handler.usage = 'autoreact [on|off|emoji <list>]'
handler.owner = true
handler.ownerBypassAdmin = true

export default handler