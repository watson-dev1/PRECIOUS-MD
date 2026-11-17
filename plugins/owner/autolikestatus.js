import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SETTINGS_PATH = path.join(__dirname, '..', '..', 'database', 'settings.json')

const DEFAULT_EMOJIS = ['🌝', '🇿🇼', '👏', '😂', '🥰', '🍃', '✅️', '😄', '😳', '🧡', '😪']
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
        console.error('[AUTOLIKE] Failed to write settings:', err?.message || err)
    }
}

// Split on commas AND common separators, dedupe, trim, cap at MAX_EMOJIS
function parseEmojis(input) {
    if (!input) return []
    const parts = String(input)
        .split(/[,，;|\s]+/)          // comma, fullwidth comma, semicolon, pipe, whitespace
        .map(e => e.trim())
        .filter(Boolean)
    return [...new Set(parts)].slice(0, MAX_EMOJIS)
}

function currentEmojis() {
    const list = Array.isArray(global.autoLikeStatusEmojis) && global.autoLikeStatusEmojis.length
        ? global.autoLikeStatusEmojis
        : DEFAULT_EMOJIS
    return list
}

const PREFIX = () => global.prefix || '.'

let handler = async (m, { args = [] }) => {
    const choice = String(args[0] || '').toLowerCase()

    // ---------- .autolike emoji <list> ----------
    if (choice === 'emoji') {
        const emojis = parseEmojis(args.slice(1).join(' '))
        if (!emojis.length) {
            return m.reply(
                `*Auto-like emoji settings*\n\n` +
                `Current: ${currentEmojis().join(' ')}\n\n` +
                `Usage:\n` +
                `• ${PREFIX()}autolike emoji 🌝,😂,🥰\n` +
                `• ${PREFIX()}autolike emoji 🌝 😂 🥰`
            )
        }
        global.autoLikeStatusEmojis = emojis
        const settings = readSettings()
        settings.autoLikeStatusEmojis = emojis
        writeSettings(settings)
        return m.reply(`✅ Auto-like reactions set to:\n${emojis.join(' ')}`)
    }

    // ---------- .autolike on | off ----------
    if (choice === 'on' || choice === 'off') {
        const next = choice === 'on'
        const rawEmojis = args.slice(1).join(' ').trim()
        const emojis = rawEmojis ? parseEmojis(rawEmojis) : currentEmojis()
        if (rawEmojis && !emojis.length) {
            return m.reply('⚠️ Provide at least one valid reaction emoji.')
        }

        global.autoLikeStatus = next
        global.autoLikeStatusEmojis = emojis

        const settings = readSettings()
        settings.autoLikeStatus = next
        settings.autoLikeStatusEmojis = emojis
        writeSettings(settings)

        return m.reply(
            `Auto-like status is now *${next ? 'ON' : 'OFF'}*.\n` +
            `Reactions: ${emojis.join(' ')}`
        )
    }

    // ---------- .autolike (no args) — toggle ----------
    if (!choice) {
        const next = !global.autoLikeStatus
        const emojis = currentEmojis()
        global.autoLikeStatus = next
        global.autoLikeStatusEmojis = emojis

        const settings = readSettings()
        settings.autoLikeStatus = next
        settings.autoLikeStatusEmojis = emojis
        writeSettings(settings)

        return m.reply(
            `Auto-like status is now *${next ? 'ON' : 'OFF'}*.\n` +
            `Reactions: ${emojis.join(' ')}`
        )
    }

    // ---------- unknown subcommand / help ----------
    return m.reply(
        `*Auto-like status*\n\n` +
        `Current: *${global.autoLikeStatus ? 'ON' : 'OFF'}*\n` +
        `Reactions: ${currentEmojis().join(' ')}\n\n` +
        `*Usage*\n` +
        `• ${PREFIX()}autolike                — toggle ON/OFF\n` +
        `• ${PREFIX()}autolike on             — enable\n` +
        `• ${PREFIX()}autolike off            — disable\n` +
        `• ${PREFIX()}autolike emoji 🌝,😂,🥰  — set reaction emojis\n` +
        `• ${PREFIX()}autolike on 🌝,😂        — enable + set emojis`
    )
}

handler.command = ['autolike', 'autolikestatus']
handler.category = 'General'
handler.description = 'Toggle auto-reaction to WhatsApp statuses and set emojis'
handler.usage = 'autolike [on|off|emoji <list>]'
handler.owner = true
handler.ownerBypassAdmin = true

export default handler