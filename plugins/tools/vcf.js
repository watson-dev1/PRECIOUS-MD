import { getGroupMetadata } from '../../lib/myfunc.js'

function escapeVCard(value) {
    return String(value || '')
        .replace(/[\u0000-\u001f]/g, ' ')
        .replace(/\\/g, '\\\\')
        .replace(/([,;])/g, '\\$1')
        .trim()
}

function toNumber(jid = '') {
    const number = String(jid).split('@')[0].split(':')[0].replace(/\D/g, '')
    return number.length >= 7 && number.length <= 15 ? number : ''
}

function buildCard(name, number) {
    const safeName = escapeVCard(name.slice(0, 80)) || `+${number}`
    return `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:${safeName}\r\nN:;${safeName};;;\r\nTEL;type=CELL;type=VOICE;waid=${number}:+${number}\r\nEND:VCARD\r\n`
}

function fileSafe(name) {
    const clean = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100)
    return clean || 'Group'
}

async function resolveNumber(waClient, participant) {
    const candidates = [participant.phoneNumber, participant.id, participant.jid].filter(Boolean)
    for (const jid of candidates) {
        if (!jid.endsWith('@lid')) {
            const number = toNumber(jid)
            if (number) return number
        }
    }

    for (const jid of [participant.id, participant.lid].filter(jid => jid?.endsWith('@lid'))) {
        try {
            const resolved = await waClient.resolveLidToJid(jid)
            if (resolved && !resolved.endsWith('@lid')) {
                const number = toNumber(resolved)
                if (number) return number
            }
        } catch {}
    }

    return ''
}

function findName(waClient, participant, number) {
    const botName = String(waClient.user?.name || '').trim().toLocaleLowerCase()
    const directNames = [participant.notify, participant.name, participant.verifiedName, participant.username]
    const keys = [
        `${number}@s.whatsapp.net`,
        participant.phoneNumber,
        participant.id,
        participant.lid
    ].filter(Boolean)

    for (const key of keys) {
        const normalizedKey = waClient.decodeJid?.(key) || key
        const contact = waClient.contacts?.[key] || waClient.contacts?.[normalizedKey]
        const chat = waClient.chats?.[key] || waClient.chats?.[normalizedKey]
        directNames.push(
            contact?.notify,
            contact?.name,
            contact?.verifiedName,
            chat?.notify,
            chat?.name
        )
    }

    for (const candidate of directNames) {
        const name = String(candidate || '').replace(/[\u0000-\u001f]/g, ' ').trim()
        if (!name || name === `+${number}` || name.replace(/\s+/g, ' ').toLocaleLowerCase() === botName) continue
        return name
    }
    return ''
}

async function sendGroupFile(waClient, m) {
    if (!m.isAdmin && !m.isOwner) return m.reply('Only group admins can export the full group contact file.')

    const metadata = await getGroupMetadata(waClient, m.chat)
    const participants = metadata?.participants || []
    if (!participants.length) return m.reply('I could not read the member list of this group.')

    const botNumber = toNumber(waClient.decodeJid(waClient.user?.id))
    const groupName = metadata.subject || 'Group'
    const seen = new Set()
    const cards = []
    let skipped = 0

    for (const participant of participants) {
        const number = await resolveNumber(waClient, participant)
        if (!number) {
            skipped++
            continue
        }
        if (number === botNumber || seen.has(number)) continue
        seen.add(number)
        cards.push(buildCard(findName(waClient, participant, number) || `+${number}`, number))
    }

    if (!cards.length) return m.reply('None of the members have a phone number I can resolve.')

    const caption = `${groupName}\nSaved: ${cards.length} contacts${skipped ? `\nSkipped: ${skipped} (number not available)` : ''}`
    return waClient.sendMessage(m.chat, {
        document: Buffer.from(cards.join(''), 'utf-8'),
        mimetype: 'text/x-vcard',
        fileName: `${fileSafe(groupName)}.vcf`,
        caption
    }, { quoted: m })
}

let handler = async (m, { waClient, text = '' }) => {
    const typed = String(text).trim()
    const match = typed.match(/^(\+?\d{7,15})(?:\s+(.+))?$/)

    if (match) {
        const number = match[1].replace(/\D/g, '')
        const name = match[2]?.trim() || `Contact ${number}`
        return waClient.sendMessage(m.chat, {
            contacts: { displayName: name, contacts: [{ vcard: buildCard(name, number).replace(/\r\n$/, '') }] }
        }, { quoted: m })
    }

    if (!m.isGroup) return m.reply(`Use ${global.prefix || '.'}vcf inside a group to get all its contacts as a file.`)
    return sendGroupFile(waClient, m)
}

handler.command = ['vcf', 'contactcard']

export default handler
