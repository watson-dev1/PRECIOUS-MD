
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SETTINGS_PATH = path.join(__dirname, '..', '..', 'database', 'settings.json')

function readSettings() {
    try {
        return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'))
    } catch {
        return {}
    }
}

function saveSettings(settings) {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true })

    const temp = `${SETTINGS_PATH}.tmp`
    fs.writeFileSync(temp, JSON.stringify(settings, null, 2))
    fs.renameSync(temp, SETTINGS_PATH)
}

const PREFIX = () => global.prefix || '.'

const handler = async (m, { args = [] }) => {
    const choice = String(args[0] || '').toLowerCase()

    if (!choice) {
        const next = !global.autoViewStatus

        global.autoViewStatus = next

        const settings = readSettings()
        settings.autoViewStatus = next
        saveSettings(settings)

        return m.reply(
            `👁️ Auto-view status is now *${next ? 'ON' : 'OFF'}*.`
        )
    }

    if (!['on', 'off', 'enable', 'disable'].includes(choice)) {
        return m.reply(
            `*AUTO VIEW STATUS*

Current: ${global.autoViewStatus ? 'ON' : 'OFF'}

Usage:
${PREFIX()}avs
${PREFIX()}avs on
${PREFIX()}avs off`
        )
    }

    const enabled = ['on', 'enable'].includes(choice)

    global.autoViewStatus = enabled

    const settings = readSettings()
    settings.autoViewStatus = enabled
    saveSettings(settings)

    return m.reply(
        `✅ Auto-view status turned *${enabled ? 'ON' : 'OFF'}*.`
    )
}

handler.command = ['autoviewstatus', 'avs']
handler.category = 'Owner'
handler.description = 'Toggle automatic WhatsApp status viewing'
handler.owner = true
handler.ownerBypassAdmin = true

export default handler
