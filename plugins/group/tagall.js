import { getGroupMetadata } from '../../lib/myfunc.js'

// WhatsApp renders mentions by JID prefix. Prefer @s.whatsapp.net JIDs.
// Some Baileys versions expose phoneNumber on participants; fall back to id.
function resolveParticipantJid(waClient, p) {
    try {
        if (!p) return null

        // Already a clean JID
        if (typeof p.jid === 'string' && p.jid.endsWith('@s.whatsapp.net')) {
            return p.jid.split(':')[0] + '@s.whatsapp.net'
        }

        // phoneNumber is a plain number string
        if (typeof p.phoneNumber === 'string' && p.phoneNumber.replace(/\D/g, '').length >= 7) {
            return p.phoneNumber.replace(/\D/g, '') + '@s.whatsapp.net'
        }

        // Baileys sometimes includes an id that is already a s.whatsapp.net JID
        if (typeof p.id === 'string') {
            if (p.id.endsWith('@s.whatsapp.net')) {
                return p.id.split(':')[0] + '@s.whatsapp.net'
            }
            // If it's a @lid, try to map via decodeJid (does nothing useful on stock)
            // but at least return it so caller can decide.
            if (p.id.endsWith('@lid') && typeof waClient?.decodeJid === 'function') {
                try {
                    const decoded = waClient.decodeJid(p.id)
                    if (typeof decoded === 'string' && decoded.endsWith('@s.whatsapp.net')) {
                        return decoded.split(':')[0] + '@s.whatsapp.net'
                    }
                } catch {}
            }
            // Last resort — return as-is, caller will still include it if it looks like a JID
            if (p.id.includes('@')) return p.id.split(':')[0] + '@' + p.id.split('@')[1]
        }
    } catch {}
    return null
}

// WhatsApp tolerates ~50 mentions reliably. Beyond that it can drop the whole message.
const MENTIONS_PER_CHUNK = 45

let handler = async (m, { waClient, text }) => {
    if (!m.isGroup) {
        return m.reply('This command only works in groups.')
    }

    let metadata
    try {
        metadata = await getGroupMetadata(waClient, m.chat, true)
    } catch (err) {
        console.warn('[TAGALL] getGroupMetadata failed:', err?.message || err)
        return m.reply('❌ Could not fetch group members. Try again.')
    }

    const participants = metadata?.participants || []
    if (!participants.length) {
        return m.reply('⚠️ No participants found in this group.')
    }

    // Resolve the message to prepend
    let customMessage = String(text || '').trim()
    if (!customMessage && m.quoted) {
        customMessage = String(
            m.quoted.text ||
            m.quoted.conversation ||
            m.quoted.extendedTextMessage?.text ||
            m.quoted.caption ||
            m.quoted.imageMessage?.caption ||
            m.quoted.videoMessage?.caption ||
            ''
        ).trim()
    }

    const header = customMessage
        ? `*${customMessage}*\n\n`
        : `*📣 Tagging all members*\n\n`

    // Build the unique mention list — preserve order, strip duplicates
    const seenJids = new Set()
    const uniqueJids = []
    for (const p of participants) {
        const jid = resolveParticipantJid(waClient, p)
        if (!jid) continue
        if (seenJids.has(jid)) continue
        seenJids.add(jid)
        uniqueJids.push(jid)
    }

    if (!uniqueJids.length) {
        return m.reply('⚠️ Could not resolve any member JIDs. Try again later.')
    }

    // Split into chunks so WhatsApp doesn't drop the whole message
    const totalMembers = uniqueJids.length
    const chunks = []
    for (let i = 0; i < uniqueJids.length; i += MENTIONS_PER_CHUNK) {
        chunks.push(uniqueJids.slice(i, i + MENTIONS_PER_CHUNK))
    }

    const totalChunks = chunks.length
    let sent = 0

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        let body = i === 0 ? header : `*…continued (${i + 1}/${totalChunks})*\n\n`
        for (const jid of chunk) {
            body += `➤ @${jid.split('@')[0]}\n`
        }
        if (i === chunks.length - 1) {
            body += `\n*Total:* ${totalMembers} member(s)`
        }

        try {
            await waClient.sendMessage(m.chat, {
                text: body,
                mentions: chunk
            }, { quoted: i === 0 ? m : undefined })
            sent += chunk.length
        } catch (err) {
            console.warn('[TAGALL] Chunk send failed:', err?.message || err)
        }

        // Small delay between chunks to avoid rate limits
        if (i < chunks.length - 1) {
            await new Promise(r => setTimeout(r, 700))
        }
    }

    if (!sent) {
        await m.reply('❌ Failed to send mentions. Check the console for details.')
    }
}

handler.command = ['tagall', 'everyone']
handler.category = 'Group'
handler.description = 'Mention every member in the group'
handler.usage = 'tagall [message] (or reply to a message)'
handler.group = true
handler.admin = true
handler.ownerBypassAdmin = true
handler.isBotAdmin = true

export default handler
