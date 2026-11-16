import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const settingsFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'database', 'settings.json')
const sent = new Map()
let handler = async (waClient, { messages, type }) => {
    if (type !== 'notify' || (global.chatbotMode && global.chatbotMode !== 'off')) return
    let settings = {}
    try { settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')) } catch {}
    if (settings.offlineReplyEnabled !== true || !settings.offlineReplyMessage) return
    const now = Date.now()
    for (const message of messages || []) {
        const jid = message?.key?.remoteJid
        if (!jid || message.key.fromMe || jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@newsletter')) continue
        const last = sent.get(jid) || 0
        if (now - last < 60 * 60 * 1000) continue
        sent.set(jid, now)
        const text = String(settings.offlineReplyMessage).slice(0, 2000)
        await waClient.sendMessage(jid, { text }).catch(() => {})
    }
    for (const [jid, at] of sent) if (now - at > 24 * 60 * 60 * 1000) sent.delete(jid)
}
handler.on = 'messages.upsert'
export default handler
