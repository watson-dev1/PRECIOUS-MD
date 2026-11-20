/**
 * PRECIOUS-MD — Jadibot Manager
 * Uses the existing clone-session manager in index.js.
 * The existing Jadibot pairing and reconnect implementation is not duplicated.
 */
import { startJadibot, stopJadibot, listJadibot, jadibotSessions } from '../../index.js'

const digits = value => String(value || '').replace(/\D/g, '')
const formatPhone = value => {
    const n = digits(value)
    return n ? `+${n}` : String(value || '')
}
const quickLines = (prefix) => [
    `${prefix}pair 2637XXXXXXXX`,
    `${prefix}jadibotqr`,
    `${prefix}listjadibot`,
    `${prefix}stopjadibot 2637XXXXXXXX`
].join('\n')

async function waitForPairing(record, timeout = 15000) {
    const until = Date.now() + timeout
    while (Date.now() < until) {
        if (record.pairingCode || record.qr || record.state === 'error' || record.state === 'connected') break
        await new Promise(resolve => setTimeout(resolve, 300))
    }
    return record
}

const handler = async (m, { waClient, args = [], text = '', command = '', usedPrefix, prefix, isOwner }) => {
    const p = usedPrefix || prefix || global.prefix || '.'
    const input = String(text || args.join(' ') || '').trim()

    if (command === 'pair' || command === 'jadibot') {
        if (!input) return m.reply(
            `*PRECIOUS-MD JADIBOT*\n\n` +
            `Pair a WhatsApp number:\n*${p}pair 2637XXXXXXXX*\n\n` +
            `Or start QR pairing:\n*${p}jadibotqr*\n\n` +
            `Management:\n*${p}listjadibot*\n*${p}stopjadibot NUMBER*`
        )

        const number = digits(input)
        if (number.length < 8 || number.length > 15) {
            return m.reply(`❌ Invalid number. Include country code.\nExample: *${p}pair 2637XXXXXXXX*`)
        }

        const existing = jadibotSessions.get(number)
        if (existing) {
            return m.reply(`⚠️ A Jadibot session for ${formatPhone(number)} already exists.\nState: ${existing.state}\nUse *${p}listjadibot* to inspect it.`)
        }

        await m.reply(`⏳ Starting Jadibot pairing for ${formatPhone(number)}...`)
        try {
            const record = await startJadibot(number, number)
            await waitForPairing(record)
            if (record.pairingCode) {
                return m.reply(
                    `✅ *PAIRING CODE READY*\n\n` +
                    `Number: ${formatPhone(number)}\n` +
                    `Code: *${record.pairingCode}*\n\n` +
                    `On that phone: WhatsApp → Linked devices → Link a device → Link with phone number.`
                )
            }
            if (record.state === 'connected') return m.reply(`✅ ${formatPhone(number)} connected successfully as a Jadibot.`)
            if (record.qr) {
                const data = record.qr.split(',')[1]
                if (data) return waClient.sendMessage(m.chat, {
                    image: Buffer.from(data, 'base64'),
                    caption: `Scan this QR code to connect ${formatPhone(number)}.`
                }, { quoted: m })
            }
            return m.reply(`Jadibot session started.\nState: ${record.state}\n${record.lastError || 'Pairing code is not ready yet. Check again with .listjadibot.'}`)
        } catch (error) {
            return m.reply(`❌ Jadibot pairing failed: ${error.message}`)
        }
    }

    if (command === 'jadibotqr') {
        const id = `qr-${Date.now().toString(36)}`
        await m.reply('⏳ Creating a Jadibot QR session...')
        try {
            const record = await startJadibot(id, '')
            await waitForPairing(record)
            if (record.qr) {
                const data = record.qr.split(',')[1]
                if (data) return waClient.sendMessage(m.chat, {
                    image: Buffer.from(data, 'base64'),
                    caption: `Scan this QR code to connect the Jadibot.\nSession: ${id}`
                }, { quoted: m })
            }
            return m.reply(`Session ${id} started. State: ${record.state}. Use .listjadibot to check it.`)
        } catch (error) {
            return m.reply(`❌ QR pairing failed: ${error.message}`)
        }
    }

    if (command === 'listjadibot') {
        const list = listJadibot()
        if (!list.length) return m.reply('There are no Jadibot sessions.')
        const lines = list.map((s, i) =>
            `${i + 1}. ${s.number} — ${s.state}${s.pairingCode ? ` — code: ${s.pairingCode}` : ''}${s.lastError ? `\n   Error: ${s.lastError}` : ''}`
        )
        return m.reply(`*ACTIVE JADIBOT SESSIONS (${list.length})*\n\n${lines.join('\n')}`)
    }

    if (command === 'stopjadibot') {
        if (!input) return m.reply(`Usage: *${p}stopjadibot NUMBER*\n\n${quickLines(p)}`)
        const id = input.toLowerCase().startsWith('qr-') ? input.toLowerCase() : digits(input)
        if (!jadibotSessions.has(id)) return m.reply('❌ No Jadibot session found for that number/session ID.')
        const session = jadibotSessions.get(id)
        if (!isOwner && session?.requester && session.requester !== m.sender) {
            return m.reply('❌ You can only stop a Jadibot session you started.')
        }
        try {
            await stopJadibot(id, false)
            return m.reply(`✅ Jadibot session *${id}* stopped. Credentials were retained.`)
        } catch (error) {
            return m.reply(`❌ Could not stop session: ${error.message}`)
        }
    }
}

handler.command = ['pair', 'jadibot', 'jadibotqr', 'listjadibot', 'stopjadibot']
handler.category = 'Owner'
handler.description = 'Pair, list and stop WhatsApp Jadibot sessions'
handler.owner = true
handler.ownerBypassAdmin = true

export default handler
