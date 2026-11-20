import { getGroupMetadata } from '../../lib/myfunc.js'
import { getGroupSettings, updateGroupSettings } from '../../lib/groupsettings.js'
import { openStore } from '../../lib/featurestore.js'

const stats = () => openStore('groupstats', { groups: {} })

let handler = async (m, { waClient, command, args }) => {
    const prefix = global.prefix || '.'

    if (command === 'groupinfo' || command === 'ginfo') {
        const meta = await getGroupMetadata(waClient, m.chat, true)
        const participants = meta?.participants || []
        const admins = participants.filter(p => p.admin)
        const settings = getGroupSettings(m.chat)
        const created = meta?.creation ? new Date(meta.creation * 1000).toDateString() : 'Unknown'
        const group = stats().data.groups[m.chat]
        const text =
            `*📋 GROUP INFO*\n\n` +
            `*Name:* ${meta?.subject || 'Unknown'}\n` +
            `*ID:* ${m.chat}\n` +
            `*Created:* ${created}\n` +
            `*Members:* ${participants.length}\n` +
            `*Admins:* ${admins.length}\n` +
            `*Messages tracked:* ${group?.total || 0}\n` +
            `*Messaging:* ${meta?.announce ? 'Admins only' : 'Everyone'}\n` +
            `*Edit info:* ${meta?.restrict ? 'Admins only' : 'Everyone'}\n\n` +
            `*Protection*\nAnti-link: ${settings.antiLink} | Anti-spam: ${settings.antiSpam}\nAnti-mention: ${settings.antiMention} | Warn limit: ${settings.warnLimit}\n\n` +
            `*Description*\n${meta?.desc || 'No description.'}`
        return m.reply(text.slice(0, 3500))
    }

    if (command === 'groupstats' || command === 'top' || command === 'active') {
        const group = stats().data.groups[m.chat]
        if (!group?.total) return m.reply('No messages have been tracked in this group yet.')
        const limit = Math.min(Math.max(Number.parseInt(args[0], 10) || 10, 3), 25)
        const ranked = Object.entries(group.users).sort((a, b) => b[1].count - a[1].count).slice(0, limit)
        const medals = ['🥇', '🥈', '🥉']
        const lines = ranked.map(([jid, u], i) => `${medals[i] || `${i + 1}.`} @${jid.split('@')[0]} — *${u.count}*`)
        return waClient.sendMessage(m.chat, {
            text: `*📊 MOST ACTIVE MEMBERS*\nTotal tracked messages: *${group.total}*\n\n${lines.join('\n')}`,
            mentions: ranked.map(([jid]) => jid)
        }, { quoted: m })
    }

    if (command === 'inactive') {
        const meta = await getGroupMetadata(waClient, m.chat, true)
        const group = stats().data.groups[m.chat]
        const days = Math.min(Math.max(Number.parseInt(args[0], 10) || 7, 1), 90)
        const cutoff = Date.now() - days * 86400000
        const quiet = (meta?.participants || [])
            .map(p => p.phoneNumber || p.id)
            .filter(jid => !(group?.users?.[jid]?.last > cutoff))
            .slice(0, 40)
        if (!quiet.length) return m.reply(`Everyone has been active in the last ${days} day(s).`)
        return waClient.sendMessage(m.chat, {
            text: `*😴 INACTIVE ${days}+ DAYS* (showing ${quiet.length})\n\n${quiet.map(j => `• @${j.split('@')[0]}`).join('\n')}\n\n_Counting starts when the bot started tracking._`,
            mentions: quiet
        }, { quoted: m })
    }

    if (command === 'setbirthday') {
        const match = String(args[0] || '').match(/^(0?[1-9]|[12]\d|3[01])[/-](0?[1-9]|1[0-2])$/)
        if (!match) return m.reply(`Use: ${prefix}setbirthday DD/MM  (example: ${prefix}setbirthday 25/12)`)
        const dm = `${match[1].padStart(2, '0')}/${match[2].padStart(2, '0')}`
        const birthdays = { ...getGroupSettings(m.chat).birthdays, [m.sender]: dm }
        updateGroupSettings(m.chat, { birthdays })
        return m.reply(`🎂 Saved! I'll wish you happy birthday on *${dm}* at 08:00.`)
    }

    if (command === 'birthdays') {
        const list = Object.entries(getGroupSettings(m.chat).birthdays || {})
        if (!list.length) return m.reply(`No birthdays saved. Members can add theirs with ${prefix}setbirthday DD/MM`)
        const sorted = list.sort((a, b) => a[1].split('/').reverse().join('').localeCompare(b[1].split('/').reverse().join('')))
        return waClient.sendMessage(m.chat, {
            text: `*🎂 BIRTHDAYS*\n\n${sorted.map(([jid, dm]) => `• ${dm} — @${jid.split('@')[0]}`).join('\n')}`,
            mentions: sorted.map(([jid]) => jid)
        }, { quoted: m })
    }
}

handler.command = ['groupinfo', 'ginfo', 'groupstats', 'top', 'active', 'inactive', 'setbirthday', 'birthdays']
handler.category = 'Group'
handler.group = true
export default handler
