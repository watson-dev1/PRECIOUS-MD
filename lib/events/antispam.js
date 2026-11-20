import { smsg } from '../myfunc.js'
import { getGroupSettings } from '../groupsettings.js'
import { addWarn } from '../warns.js'

// chat:sender -> [{ t, key }]
const recent = new Map()
const cooling = new Map()

let handler = async (waClient, { messages, type }) => {
    if (type !== 'notify') return

    for (const raw of messages || []) {
        try {
            if (!raw?.message || raw.key?.fromMe) continue
            const chat = raw.key?.remoteJid
            if (!chat?.endsWith('@g.us')) continue

            const settings = getGroupSettings(chat)
            const spamOn = settings.antiSpam && settings.antiSpam !== 'off'
            const mentionOn = settings.antiMention && settings.antiMention !== 'off'
            if (!spamOn && !mentionOn) continue

            const m = await smsg(waClient, raw)
            if (!m?.isGroup || m.isAdmin || m.isOwner) continue
            const tag = `@${m.sender.split('@')[0]}`

            // ---- mass-mention / tag-all spam ----
            if (mentionOn) {
                const limit = Math.max(3, Number(settings.antiMentionLimit) || 10)
                const mentions = new Set(m.mentionedJid || [])
                if (mentions.size >= limit) {
                    if (m.isBotAdmin) await waClient.sendMessage(m.chat, { delete: raw.key }).catch(() => {})
                    const result = m.isBotAdmin ? await addWarn(waClient, m, m.sender, `Mentioned ${mentions.size} people`) : null
                    await waClient.sendMessage(m.chat, {
                        text: result?.kicked
                            ? `🚫 ${tag} was removed for mass-tagging.`
                            : `⚠️ ${tag}, mass-tagging is not allowed.${result ? ` Warning *${result.count}/${result.limit}*.` : ''}`,
                        mentions: [m.sender]
                    }).catch(() => {})
                    continue
                }
            }

            // ---- flood / spam ----
            if (spamOn) {
                const limit = Math.max(3, Number(settings.antiSpamCount) || 6)
                const windowMs = Math.max(3, Number(settings.antiSpamWindow) || 8) * 1000
                const key = `${m.chat}:${m.sender}`
                const now = Date.now()
                const list = (recent.get(key) || []).filter(item => now - item.t < windowMs)
                list.push({ t: now, key: raw.key })
                recent.set(key, list)

                if (list.length >= limit && (cooling.get(key) || 0) < now) {
                    cooling.set(key, now + 10000)
                    recent.delete(key)
                    if (m.isBotAdmin) {
                        for (const item of list.slice(-12)) await waClient.sendMessage(m.chat, { delete: item.key }).catch(() => {})
                    }
                    if (settings.antiSpam === 'kick' && m.isBotAdmin) {
                        await waClient.groupParticipantsUpdate(m.chat, [m.sender], 'remove').catch(() => {})
                        await waClient.sendMessage(m.chat, { text: `🚫 ${tag} was removed for spamming.`, mentions: [m.sender] }).catch(() => {})
                    } else {
                        const result = m.isBotAdmin ? await addWarn(waClient, m, m.sender, 'Spamming') : null
                        await waClient.sendMessage(m.chat, {
                            text: result?.kicked
                                ? `🚫 ${tag} was removed after reaching the warning limit.`
                                : `⚠️ ${tag}, slow down — spamming is not allowed.${result ? ` Warning *${result.count}/${result.limit}*.` : ''}`,
                            mentions: [m.sender]
                        }).catch(() => {})
                    }
                }

                if (recent.size > 4000) recent.clear()
                if (cooling.size > 4000) cooling.clear()
            }
        } catch (error) {
            console.error('[ANTISPAM] error:', error?.message || error)
        }
    }
}

handler.on = 'messages.upsert'
export default handler
