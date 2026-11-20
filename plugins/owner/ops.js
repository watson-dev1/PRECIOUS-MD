import { getFeature, setFeature, getTimezone, isValidTimezone, localNow } from '../../lib/featurestore.js'
import { getCmdStats } from '../../lib/cmdstats.js'
import { buildBackup, restoreBackup } from '../../lib/backup.js'

const onOff = value => ({ on: true, enable: true, off: false, disable: false }[String(value || '').toLowerCase()])
const fmtUptime = s => { s = Math.floor(s); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), mi = Math.floor(s % 3600 / 60); return `${d ? d + 'd ' : ''}${h ? h + 'h ' : ''}${mi}m` }

let handler = async (m, { waClient, command, args, text }) => {
    const prefix = global.prefix || '.'

    if (command === 'cmdstats') {
        const stats = getCmdStats(10)
        if (!stats.total) return m.reply('No command usage recorded yet.')
        const cmds = stats.topCommands.map((c, i) => `${i + 1}. ${prefix}${c.name} — *${c.count}*`).join('\n')
        const users = stats.topUsers.slice(0, 5).map((u, i) => `${i + 1}. ${u.user} — *${u.count}*`).join('\n')
        return m.reply(`*📈 COMMAND STATS*\nTotal commands run: *${stats.total}*\n\n*Top commands*\n${cmds}\n\n*Top users*\n${users}`)
    }

    if (command === 'backup') {
        const { buffer, count } = buildBackup()
        await waClient.sendMessage(m.sender || m.chat, {
            document: buffer, mimetype: 'application/json',
            fileName: `precious-md-backup-${localNow().date}.json`,
            caption: `💾 Backup of ${count} database file(s).\nThe WhatsApp session is NOT included.`
        }, { quoted: m })
        return m.chat !== m.sender ? m.reply('💾 Backup sent to your DM.') : undefined
    }

    if (command === 'restorebackup') {
        const quoted = m.quoted
        if (!quoted || !/document/i.test(quoted.mtype || '')) return m.reply(`Reply to a backup .json file with ${prefix}restorebackup`)
        try {
            const count = restoreBackup(await quoted.download())
            return m.reply(`✅ Restored ${count} file(s). Restart the bot (${prefix}restart) to load them everywhere.`)
        } catch (error) {
            return m.reply(`Restore failed: ${error.message}`)
        }
    }

    if (command === 'autobackup' || command === 'healthalerts' || command === 'ratelimit' || command === 'levelup') {
        const key = { autobackup: 'autoBackup', healthalerts: 'healthAlerts', ratelimit: 'rateLimit', levelup: 'levelUpMessages' }[command]
        const next = args[0] === undefined ? !getFeature(key) : onOff(args[0])
        if (next === undefined) return m.reply(`*${command}* is *${getFeature(key) ? 'ON' : 'OFF'}*.\nUse: ${prefix}${command} on | off`)
        setFeature(key, next)
        const hints = {
            autobackup: 'A database backup is sent to your DM every day at 03:00.',
            healthalerts: 'You will get a DM when the bot reconnects or memory is high.',
            ratelimit: 'Per-user cooldowns and flood protection are active.',
            levelup: 'Level-up messages are shown in groups.'
        }
        return m.reply(`*${command}* is now *${next ? 'ON' : 'OFF'}*.${next ? `\n${hints[command]}` : ''}`)
    }

    if (command === 'settz' || command === 'timezone') {
        if (!args[0]) return m.reply(`Timezone: *${getTimezone()}* (local time ${localNow().time})\nUse: ${prefix}settz Africa/Harare`)
        if (!isValidTimezone(args[0])) return m.reply('Invalid timezone. Use an IANA name like Africa/Harare or Europe/London.')
        setFeature('timezone', args[0])
        return m.reply(`✅ Timezone set to *${args[0]}* (local time ${localNow(args[0]).time}).`)
    }

    if (command === 'health') {
        const mem = process.memoryUsage()
        return m.reply(
            `*🩺 BOT HEALTH*\n\nUptime: *${fmtUptime(process.uptime())}*\nMemory (RSS): *${Math.round(mem.rss / 1048576)} MB*\nHeap used: *${Math.round(mem.heapUsed / 1048576)} MB*\n` +
            `Node: *${process.version}*\nTimezone: *${getTimezone()}*\n\nRate limit: ${getFeature('rateLimit') ? 'ON' : 'OFF'} | Alerts: ${getFeature('healthAlerts') ? 'ON' : 'OFF'} | Auto-backup: ${getFeature('autoBackup') ? 'ON' : 'OFF'}`
        )
    }
}

handler.command = ['cmdstats', 'backup', 'restorebackup', 'autobackup', 'healthalerts', 'ratelimit', 'levelup', 'settz', 'timezone', 'health']
handler.category = 'Owner'
handler.owner = true
handler.ownerBypassAdmin = true
export default handler
