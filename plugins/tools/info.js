import os from 'os'
import { plugins } from '../../index.js'
import { getCmdStats } from '../../lib/cmdstats.js'
import { openStore } from '../../lib/featurestore.js'

const fmtUptime = s => { s = Math.floor(s); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), mi = Math.floor(s % 3600 / 60); return `${d ? d + 'd ' : ''}${h ? h + 'h ' : ''}${mi}m` }

let handler = async (m, { waClient, command }) => {
    if (command === 'botinfo' || command === 'info') {
        const unique = new Set(plugins.values())
        const stats = getCmdStats(1)
        const mem = process.memoryUsage()
        return m.reply(
            `*🤖 ${global.botName || 'PRECIOUS-MD'}*\n\n` +
            `Owner: *${global.ownerName}*\nNumber: wa.me/${global.ownerNumber}\nMode: *${global.botMode || 'public'}* | Prefix: *${global.prefix || '.'}*\n` +
            `Commands loaded: *${[...unique].filter(p => p?.command).length}* files\nCommands run: *${stats.total}*\n` +
            `Uptime: *${fmtUptime(process.uptime())}*\nMemory: *${Math.round(mem.rss / 1048576)} MB*\n` +
            `Platform: *${os.platform()} ${os.arch()}* | Node *${process.version}*\n\nRepo: ${global.repo}`
        )
    }

    if (command === 'whois') {
        const target = m.mentionedJid?.[0] || m.quoted?.sender || m.sender
        const number = target.split('@')[0]
        let pp = null
        try { pp = await waClient.profilePictureUrl(target, 'image') } catch {}
        let about = ''
        try { about = (await waClient.fetchStatus(target))?.[0]?.status?.status || '' } catch {}
        const eco = openStore('economy', { users: {} }).data.users[target]
        const text =
            `*👤 USER INFO*\n\nNumber: *+${number}*\nTag: @${number}\n` +
            `${about ? `About: ${about}\n` : ''}` +
            `${m.isGroup ? `Role: *${target === m.sender ? (m.isAdmin ? 'Admin' : 'Member') : 'Member/Admin'}*\n` : ''}` +
            `${eco ? `Level: *${Math.floor(Math.sqrt(eco.xp / 40))}* | XP: *${eco.xp}*\nWallet: *${eco.wallet}* | Bank: *${eco.bank}*\n` : ''}` +
            `Link: wa.me/${number}`
        if (pp) return waClient.sendMessage(m.chat, { image: { url: pp }, caption: text, mentions: [target] }, { quoted: m })
        return waClient.sendMessage(m.chat, { text, mentions: [target] }, { quoted: m })
    }
}

handler.command = ['botinfo', 'info', 'whois']
handler.category = 'Tools'
export default handler
