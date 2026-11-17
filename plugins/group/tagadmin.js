import { getGroupMetadata } from '../../lib/myfunc.js'

/**
 * Resolve a participant to a mentionable @s.whatsapp.net JID.
 * Baileys exposes:
 *   - participant.id       → usually @s.whatsapp.net, sometimes @lid
 *   - participant.jid      → sometimes present
 *   - participant.phoneNumber → plain number string (often empty on LID accounts)
 *   - participant.lid      → @lid (NOT mentionable)
 */
function resolveMentionJid(waClient, participant) {
    if (!participant) return null
    const candidates = []

    // 1. phoneNumber is the cleanest — a plain number
    if (typeof participant.phoneNumber === 'string') {
        const digits = participant.phoneNumber.replace(/\D/g, '')
        if (digits.length >= 7) candidates.push(`${digits}@s.whatsapp.net`)
    }

    // 2. jid / id if they're @s.whatsapp.net
    for (const raw of [participant.jid, participant.id]) {
        if (typeof raw !== 'string') continue
        const base = raw.split(':')[0]                    // strip device suffix
        if (base.endsWith('@s.whatsapp.net')) {
            candidates.push(base)
        } else if (base.endsWith('@lid') && typeof waClient?.decodeJid === 'function') {
            try {
                const decoded = waClient.decodeJid(base)
                if (typeof decoded === 'string' && decoded.endsWith('@s.whatsapp.net')) {
                    candidates.push(decoded.split(':')[0])
                }
            } catch {}
        }
    }

    // Return the first valid mention JID
    return candidates[0] || null
}

let handler = async (m, { waClient, text = '' }) => {
    if (!m.isGroup) {
        return m.reply('This command only works in groups.')
    }

    let metadata
    try {
        metadata = await getGroupMetadata(waClient, m.chat, true)
    } catch (err) {
        return m.reply(`❌ Could not fetch group metadata: ${err?.message || err}`)
    }

    const participants = metadata?.participants || []
    const admins = participants.filter(p =>
        p && (p.admin === 'admin' || p.admin === 'superadmin')
    )

    if (!admins.length) {
        return m.reply('⚠️ This group has no admins to tag.')
    }

    // Resolve + dedupe
    const seen = new Set()
    const mentionJids = []
    const unresolvedCount = { value: 0 }

    for (const a of admins) {
        const jid = resolveMentionJid(waClient, a)
        if (!jid) { unresolvedCount.value++; continue }
        if (seen.has(jid)) continue
        seen.add(jid)
        mentionJids.push(jid)
    }

    if (!mentionJids.length) {
        return m.reply(
            `⚠️ Found ${admins.length} admin(s) but could not resolve any mentionable JIDs.\n` +
            `This usually means the group uses LID IDs that haven't synced yet. Try again in a few minutes.`
        )
    }

    const title = String(text || '').trim()
    const header = title ? `*${title}*\n\n` : `*👑 Group Admins*\n\n`
    const list = mentionJids.map(jid => `• @${jid.split('@')[0]}`).join('\n')

    let footer = ''
    if (unresolvedCount.value > 0) {
        footer = `\n\n_(${unresolvedCount.value} admin(s) not mentioned — LID unresolved)_`
    }

    const body = `${header}${list}${footer}`

    try {
        await waClient.sendMessage(m.chat, {
            text: body,
            mentions: mentionJids
        }, { quoted: m })
    } catch (err) {
        console.warn('[TAGADMIN] Send failed:', err?.message || err)
        await m.reply(`❌ Could not send mention message: ${err?.message || err}`).catch(() => {})
    }
}

handler.command = ['tagadmin', 'tagadmins', 'admins']
handler.category = 'Group'
handler.description = 'Mention all group admins'
handler.usage = 'tagadmin [optional message]'
handler.group = true
handler.admin = true
handler.ownerBypassAdmin = true
handler.isBotAdmin = true

export default handler
