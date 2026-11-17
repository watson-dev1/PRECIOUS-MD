import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SETTINGS_PATH = path.join(__dirname, '..', '..', 'database', 'settings.json')

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
        console.error('[AUTOVIEW] Failed to write settings:', err?.message || err)
    }
}

const PREFIX = () => global.prefix || '.'

let handler = async (m, { args = [] }) => {
    const choice = String(args[0] || '').toLowerCase()

    // ---- toggle with no args ----
    if (!choice) {
        const next = !global.autoViewStatus
        global.autoViewStatus = next
        const settings = readSettings()
        settings.autoViewStatus = next
        writeSettings(settings)
        return m.reply(`Auto view status is now *${next ? 'ON' : 'OFF'}*.`)
    }

    // ---- explicit on / off ----
    if (choice === 'on' || choice === 'off') {
        const next = choice === 'on'
        global.autoViewStatus = next
        const settings = readSettings()
        settings.autoViewStatus = next
        writeSettings(settings)
        return m.reply(`Auto view status turned *${choice}*.`)
    }

    // ---- unknown subcommand — help ----
    return m.reply(
        `*Auto view status*\n\n` +
        `Current: *${global.autoViewStatus ? 'ON' : 'OFF'}*\n\n` +
        `*Usage*\n` +
        `• ${PREFIX()}avs           — toggle\n` +
        `• ${PREFIX()}avs on        — enable\n` +
        `• ${PREFIX()}avs off       — disable`
    )
}

handler.command = ['autoviewstatus', 'avs']
handler.category = 'General'
handler.description = 'Toggle auto-viewing of WhatsApp statuses'
handler.usage = 'autoviewstatus [on|off]'
handler.owner = true
handler.ownerBypassAdmin = true

export default handler