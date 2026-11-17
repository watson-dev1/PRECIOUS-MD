import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SETTINGS_PATH = path.join(__dirname, '..', '..', 'database', 'settings.json')

const VALID_MODES = ['self', 'public']

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
        console.error('[MODE] Failed to write settings:', err?.message || err)
    }
}

const PREFIX = () => global.prefix || '.'

let handler = async (m, { args = [] }) => {
    const choice = String(args[0] || '').toLowerCase()
    const current = global.botMode || 'public'

    // ---- no args — show current + usage ----
    if (!choice) {
        return m.reply(
            `*Bot mode*\n\n` +
            `Current: *${current}*\n\n` +
            `*Usage*\n` +
            `• ${PREFIX()}mode self    — only owner can use commands\n` +
            `• ${PREFIX()}mode public  — anyone can use commands`
        )
    }

    // ---- toggle without arg ----
    if (choice === 'toggle') {
        const next = current === 'public' ? 'self' : 'public'
        global.botMode = next
        const settings = readSettings()
        settings.mode = next
        writeSettings(settings)
        return m.reply(`Bot mode set to *${next}*.${next === 'self' ? ' Only the owner can use commands now.' : ' Anyone can use commands now.'}`)
    }

    // ---- validate ----
    if (!VALID_MODES.includes(choice)) {
        return m.reply(
            `⚠️ Invalid mode: *${choice}*\n\n` +
            `Valid: ${VALID_MODES.join(' | ')}\n` +
            `Usage: ${PREFIX()}mode self | ${PREFIX()}mode public`
        )
    }

    // ---- already set ----
    if (choice === current) {
        return m.reply(`ℹ️ Bot is already in *${choice}* mode.`)
    }

    // ---- apply ----
    global.botMode = choice
    const settings = readSettings()
    settings.mode = choice
    writeSettings(settings)

    return m.reply(
        `Bot mode set to *${choice}*.` +
        (choice === 'self'
            ? ' Only the owner can use commands now.'
            : ' Anyone can use commands now.')
    )
}

handler.command = ['mode']
handler.category = 'Owner'
handler.description = 'Switch bot between self and public mode'
handler.usage = 'mode [self|public|toggle]'
handler.owner = true
handler.ownerBypassAdmin = true

export default handler
