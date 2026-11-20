
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

    if (!['on', 'off', 'enable', 'disable'].includes(choice)) {
        const viewing = Boolean(global.autoViewStatus)
        const reacting = Boolean(global.autoLikeStatus)

        return m.reply(
            `╭━━━〔 STATUS AUTOMATION 〕━━━╮
┃ 👁️ Auto View: ${viewing ? 'ON' : 'OFF'}
┃ ❤️ Auto React: ${reacting ? 'ON' : 'OFF'}
╰━━━━━━━━━━━━━━━━━━━━╯

Usage:
${PREFIX()}autoviewlike on
${PREFIX()}autoviewlike off`
        )
    }

    const enabled = ['on', 'enable'].includes(choice)

    global.autoViewStatus = enabled
    global.autoLikeStatus = enabled

    const settings = readSettings()

    settings.autoViewStatus = enabled
    settings.autoLikeStatus = enabled

    saveSettings(settings)

    return m.reply(
        `✅ Status automation is now *${enabled ? 'ON' : 'OFF'}*.

👁️ Auto View: ${enabled ? 'ON' : 'OFF'}
❤️ Auto React: ${enabled ? 'ON' : 'OFF'}`
    )
}

handler.command = ['autoviewlike', 'avl']
handler.category = 'Owner'
handler.owner = true

export default handler
