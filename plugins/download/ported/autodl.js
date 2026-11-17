// .autodl on|off  -> nyalakan / matikan auto-download di chat ini.
// Kalau aktif, cukup kirim link TikTok / Instagram / YouTube / Facebook / Twitter(X), bot langsung mengunduhnya
// tanpa command. Di grup hanya admin/owner yang bisa mengatur; di private chat siapa saja (untuk chat-nya sendiri).
import { saveDB } from '../../../lib/core/system.js'

const ON = /^(on|1|true|aktif|nyala)$/i
const OFF = /^(off|0|false|mati|nonaktif)$/i

let handler = async (m, { text, jid, prefix, isAdmin, isOwner, reply }) => {
    const cfg = (global.db.groups ||= {})
    const chat = (cfg[jid] ||= {})
    const arg = String(text || '').trim().split(/\s+/)[0]

    if (!ON.test(arg) && !OFF.test(arg)) {
        return reply(
            `*▢ AUTO DOWNLOAD*\nStatus chat ini: ${chat.autodl ? '✅ ON' : '❌ OFF'}\n\n` +
            `${prefix}autodl on  → link otomatis diunduh\n${prefix}autodl off\n\n` +
            `Mendukung: TikTok, Instagram, YouTube, Facebook, Twitter/X.`
        )
    }
    if (m.isGroup && !isAdmin && !isOwner) return reply(global.mess.admin)

    const on = ON.test(arg)
    chat.autodl = on
    saveDB(global.db)
    return reply(on
        ? '✅ Auto-download *aktif*. Kirim link TikTok / IG / YouTube / FB / X dan bot akan mengunduhnya.'
        : '❌ Auto-download *dimatikan* di chat ini.')
}

handler.command = ['autodl']
handler.help = ['autodl on/off']
handler.tags = ['download']

export default handler
