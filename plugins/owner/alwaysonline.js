import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const SETTINGS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'database', 'settings.json')

function readSettings() {
    try {
        return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'))
    } catch {
        return {}
    }
}

function saveSettings(enabled) {
    const settings = readSettings()
    settings.alwaysOnline = enabled
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true })
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2))
}

let handler = async (m, { args, waClient }) => {
    const choice = String(args[0] || '').toLowerCase()
    if (!['on', 'off', 'enable', 'disable'].includes(choice)) {
        return m.reply(`Always Online is currently *${global.alwaysOnline ? 'ON' : 'OFF'}*.\\n\\nUsage: ${global.prefix || '.'}alwaysonline on | off`)
    }

    const enabled = choice === 'on' || choice === 'enable'
    global.alwaysOnline = enabled
    saveSettings(enabled)

    const socket = waClient
    let presenceMessage = ''
    if (globalThis.__preciousOnlinePresenceTimer) {
        clearInterval(globalThis.__preciousOnlinePresenceTimer)
        globalThis.__preciousOnlinePresenceTimer = null
    }
    if (socket?.sendPresenceUpdate) {
        try {
            await socket.sendPresenceUpdate(enabled ? 'available' : 'unavailable')
            if (enabled) {
                const activeSocket = socket
                globalThis.__preciousOnlinePresenceTimer = setInterval(() => {
                    if (global.alwaysOnline) {
                        activeSocket.sendPresenceUpdate('available').catch(() => {})
                    }
                }, 25000)
                globalThis.__preciousOnlinePresenceTimer.unref?.()
            }
            presenceMessage = '\\nWhatsApp presence updated.'
        } catch (error) {
            presenceMessage = `\\nSaved, but WhatsApp presence update failed: ${error?.message || 'connection unavailable'}`
        }
    }

    return m.reply(`Always Online is now *${enabled ? 'ON' : 'OFF'}*.${presenceMessage}`)
}

handler.command = ['alwaysonline', 'online']
handler.owner = true
export default handler
