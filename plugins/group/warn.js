import { getGroupSettings, updateGroupSettings } from '../../lib/groupsettings.js'
import { addWarn, resetWarns } from '../../lib/warns.js'

const targetOf = m => m.mentionedJid?.[0] || m.quoted?.sender || null

let handler = async (m, { waClient, command, args, text }) => {
    const prefix = global.prefix || '.'
    const settings = getGroupSettings(m.chat)

    if (command === 'setwarnlimit') {
        const limit = Number.parseInt(args[0], 10)
        if (!Number.isInteger(limit) || limit < 1 || limit > 20) return m.reply(`Use: ${prefix}setwarnlimit <1-20>\nCurrent: *${settings.warnLimit}*`)
        updateGroupSettings(m.chat, { warnLimit: limit })
        return m.reply(`✅ Warning limit set to *${limit}*. Members are removed when they reach it.`)
    }

    if (command === 'warnings' || command === 'warns') {
        const target = targetOf(m) || m.sender
        const entry = settings.warns?.[target]
        if (!entry?.count) return waClient.sendMessage(m.chat, { text: `@${target.split('@')[0]} has no warnings.`, mentions: [target] }, { quoted: m })
        const reasons = (entry.reasons || []).slice(-5).map((r, i) => `${i + 1}. ${r.reason}`).join('\n')
        return waClient.sendMessage(m.chat, {
            text: `⚠️ @${target.split('@')[0]} has *${entry.count}/${settings.warnLimit}* warnings.\n\n${reasons}`,
            mentions: [target]
        }, { quoted: m })
    }

    if (command === 'resetwarn' || command === 'unwarn') {
        const target = targetOf(m)
        if (!target) return m.reply(`Tag or reply to a member: ${prefix}${command} @user`)
        const had = resetWarns(m.chat, target)
        return waClient.sendMessage(m.chat, { text: `✅ Cleared ${had} warning(s) for @${target.split('@')[0]}.`, mentions: [target] }, { quoted: m })
    }

    // .warn
    const target = targetOf(m)
    if (!target) return m.reply(`Tag or reply to a member: ${prefix}warn @user [reason]`)
    if (target === m.sender) return m.reply('You cannot warn yourself.')
    const botJid = waClient.decodeJid(waClient.user.id)
    if (target === botJid) return m.reply('I cannot warn myself.')
    const reason = text.replace(/@\d+/g, '').trim() || 'No reason given'
    const result = await addWarn(waClient, m, target, reason)
    const tag = `@${target.split('@')[0]}`
    return waClient.sendMessage(m.chat, {
        text: result.kicked
            ? `🚫 ${tag} reached *${result.limit}* warnings and was removed.\nReason: ${reason}`
            : `⚠️ ${tag} has been warned.\nWarning *${result.count}/${result.limit}*\nReason: ${reason}${!m.isBotAdmin && result.count >= result.limit ? '\n\n(I am not admin, so I cannot remove them.)' : ''}`,
        mentions: [target]
    }, { quoted: m })
}

handler.command = ['warn', 'warnings', 'warns', 'resetwarn', 'unwarn', 'setwarnlimit']
handler.category = 'Group'
handler.group = true
handler.admin = true
handler.ownerBypassAdmin = true
export default handler
