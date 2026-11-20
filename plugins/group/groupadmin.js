import { getGroupSettings, updateGroupSettings } from '../../lib/groupsettings.js'
import { getTimezone } from '../../lib/featurestore.js'

const parseTime = value => {
    const match = String(value || '').match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
    return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null
}

let handler = async (m, { command, args }) => {
    const prefix = global.prefix || '.'
    const settings = getGroupSettings(m.chat)
    const sub = args[0]?.toLowerCase()

    if (command === 'antispam') {
        if (!sub) {
            return m.reply(
                `*Anti-spam* — *${settings.antiSpam}*\nTrigger: *${settings.antiSpamCount}* messages in *${settings.antiSpamWindow}s*\n\n` +
                `${prefix}antispam off | warn | kick\n${prefix}antispam set <messages> <seconds>\n\n` +
                `warn = delete flood + warn (kick at the warn limit)\nkick = delete flood + remove member`
            )
        }
        if (sub === 'set') {
            const count = Number.parseInt(args[1], 10)
            const seconds = Number.parseInt(args[2], 10)
            if (!(count >= 3 && count <= 30) || !(seconds >= 3 && seconds <= 60)) return m.reply(`Use: ${prefix}antispam set <3-30 messages> <3-60 seconds>`)
            updateGroupSettings(m.chat, { antiSpamCount: count, antiSpamWindow: seconds })
            return m.reply(`✅ Anti-spam triggers at *${count}* messages in *${seconds}s*.`)
        }
        if (!['off', 'warn', 'kick', 'on'].includes(sub)) return m.reply(`Use: ${prefix}antispam off | warn | kick`)
        const mode = sub === 'on' ? 'warn' : sub
        updateGroupSettings(m.chat, { antiSpam: mode })
        return m.reply(`✅ Anti-spam is now *${mode}*.${mode !== 'off' && !m.isBotAdmin ? '\n⚠️ Make me admin so I can delete and remove.' : ''}`)
    }

    if (command === 'antimention' || command === 'antitagall') {
        if (!sub) return m.reply(`*Anti-mention* — *${settings.antiMention}* (limit *${settings.antiMentionLimit}*)\n\n${prefix}${command} on | off\n${prefix}${command} limit <3-100>`)
        if (sub === 'limit') {
            const limit = Number.parseInt(args[1], 10)
            if (!(limit >= 3 && limit <= 100)) return m.reply(`Use: ${prefix}${command} limit <3-100>`)
            updateGroupSettings(m.chat, { antiMentionLimit: limit })
            return m.reply(`✅ Messages tagging *${limit}+* people will be deleted and warned.`)
        }
        if (!['on', 'off'].includes(sub)) return m.reply(`Use: ${prefix}${command} on | off`)
        updateGroupSettings(m.chat, { antiMention: sub })
        return m.reply(`✅ Anti-mention is now *${sub}*.`)
    }

    if (command === 'schedule') {
        const sched = settings.schedule || { open: null, close: null }
        if (!sub || sub === 'list') {
            return m.reply(
                `*Group schedule* (${getTimezone()})\n\nOpen: *${sched.open || 'not set'}*\nClose: *${sched.close || 'not set'}*\n\n` +
                `${prefix}schedule open 06:00\n${prefix}schedule close 22:00\n${prefix}schedule clear`
            )
        }
        if (sub === 'clear') {
            updateGroupSettings(m.chat, { schedule: { open: null, close: null } })
            return m.reply('🗑️ Group schedule cleared.')
        }
        if (sub === 'open' || sub === 'close') {
            const time = parseTime(args[1])
            if (!time) return m.reply(`Use 24-hour time, for example: ${prefix}schedule ${sub} ${sub === 'open' ? '06:00' : '22:00'}`)
            updateGroupSettings(m.chat, { schedule: { ...sched, [sub]: time } })
            return m.reply(`✅ The group will *${sub}* every day at *${time}* (${getTimezone()}).${!m.isBotAdmin ? '\n⚠️ I must be admin to change group settings.' : ''}`)
        }
        return m.reply(`Use: ${prefix}schedule open|close HH:MM, or ${prefix}schedule clear`)
    }
}

handler.command = ['antispam', 'antimention', 'antitagall', 'schedule']
handler.category = 'Group'
handler.group = true
handler.admin = true
handler.ownerBypassAdmin = true
export default handler
