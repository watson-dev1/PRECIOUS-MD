import { getGroupSettings, updateGroupSettings } from './groupsettings.js'

/** Add a warning to `user` in the group. Kicks when the limit is reached (if the bot is admin). */
export async function addWarn(waClient, m, user, reason = 'No reason given') {
    const settings = getGroupSettings(m.chat)
    const warns = { ...settings.warns }
    const entry = warns[user] || { count: 0, reasons: [] }
    entry.count += 1
    entry.reasons = [...(entry.reasons || []), { reason: String(reason).slice(0, 120), at: Date.now() }].slice(-10)
    warns[user] = entry
    const limit = Math.max(1, Number(settings.warnLimit) || 3)

    let kicked = false
    if (entry.count >= limit && m.isBotAdmin) {
        try {
            await waClient.groupParticipantsUpdate(m.chat, [user], 'remove')
            kicked = true
            delete warns[user]
        } catch {}
    }
    updateGroupSettings(m.chat, { warns })
    return { count: entry.count, limit, kicked }
}

export function resetWarns(chat, user) {
    const warns = { ...getGroupSettings(chat).warns }
    const had = warns[user]?.count || 0
    delete warns[user]
    updateGroupSettings(chat, { warns })
    return had
}
