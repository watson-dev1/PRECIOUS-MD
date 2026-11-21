import { getFeature, setFeature, numberOf, ownerJid } from '../../lib/featurestore.js'
import { statusToPayload, statusKind } from '../../lib/statusutil.js'

const onOff = value => ({ on: true, enable: true, off: false, disable: false }[String(value || '').toLowerCase()])
const digits = value => String(value || '').replace(/\D/g, '')

let handler = async (m, { waClient, command, args }) => {
    const prefix = global.prefix || '.'
    const flag = args[0]

    if (command === 'autosavestatus' || command === 'antideletestatus') {
        const key = command === 'autosavestatus' ? 'autoSaveStatus' : 'antiDeleteStatus'
        const label = command === 'autosavestatus' ? 'Auto-save status' : 'Anti-delete status'
        const next = flag === undefined ? !getFeature(key) : onOff(flag)
        if (next === undefined) return m.reply(`${label}: *${getFeature(key) ? 'ON' : 'OFF'}*\n\nUse: ${prefix}${command} on | off`)
        setFeature(key, next)
        const note = command === 'autosavestatus'
            ? 'Every status that arrives is forwarded to your DM.'
            : 'Deleted statuses are re-sent to your DM (media is cached while this is on).'
        return m.reply(`${label} is now *${next ? 'ON' : 'OFF'}*.\n${next ? note : ''}`.trim())
    }

    if (command === 'statusignore' || command === 'statusonly') {
        const key = command === 'statusignore' ? 'statusIgnore' : 'statusOnly'
        const list = new Set(getFeature(key, []).map(String))
        const action = flag?.toLowerCase()
        const number = digits(args[1] || m.mentionedJid?.[0] || m.quoted?.sender)
        if (action === 'add' || action === 'del' || action === 'remove') {
            if (number.length < 7) return m.reply(`Use: ${prefix}${command} ${action} <number with country code>`)
            if (action === 'add') list.add(number); else list.delete(number)
            setFeature(key, [...list])
            return m.reply(`✅ ${action === 'add' ? 'Added' : 'Removed'} *${number}*.\nTotal: ${list.size}`)
        }
        if (action === 'clear') { setFeature(key, []); return m.reply('🗑️ List cleared.') }
        const hint = command === 'statusignore'
            ? 'These contacts are skipped (no view, no reaction, no save).'
            : 'When this list is not empty, ONLY these contacts are viewed, reacted to and saved.'
        return m.reply(`*${command === 'statusignore' ? 'Status ignore list' : 'Status only list'}*\n${hint}\n\n${[...list].map(n => `• ${n}`).join('\n') || '(empty)'}\n\n${prefix}${command} add <number>\n${prefix}${command} del <number>\n${prefix}${command} clear`)
    }

    // .statussave — reply to a status (or any media) to save it to your DM
    if (command === 'statussave' || command === 'ssave') {
        const quoted = m.quoted
        if (!quoted) return m.reply(`Reply to a status with ${prefix}${command}`)
        try {
            const fake = quoted.fakeObj || { key: m.key, message: quoted.message }
            let payload
            if (statusKind(fake)) payload = await statusToPayload(waClient, fake, '💾 Saved status')
            else {
                const buffer = await quoted.download()
                const mt = quoted.mtype || ''
                if (/image/i.test(mt)) payload = { image: buffer, caption: '💾 Saved' }
                else if (/video/i.test(mt)) payload = { video: buffer, caption: '💾 Saved' }
                else if (/audio/i.test(mt)) payload = { audio: buffer, mimetype: 'audio/mpeg' }
                else payload = { text: quoted.text || 'Nothing to save.' }
            }
            await waClient.sendMessage(ownerJid(), payload)
            return m.reply('💾 Saved to your DM.')
        } catch (error) {
            return m.reply(`Could not save that: ${error?.message || error}`)
        }
    }

    // .statusmenu — current status settings with buttons
    const { sendButtons, quickReply } = await import('../../lib/buttons.js')
    return sendButtons(waClient, m, {
        title: '📱 STATUS AUTOMATION',
        body:
            `💾 Auto save: *${getFeature('autoSaveStatus') ? 'ON' : 'OFF'}*\n🗑️ Anti-delete: *${getFeature('antiDeleteStatus') ? 'ON' : 'OFF'}*\n` +
            `🚫 Ignored: *${getFeature('statusIgnore', []).length}* | 🎯 Only: *${getFeature('statusOnly', []).length}*`,
        buttons: [
            quickReply(getFeature('autoSaveStatus') ? '💾 Save OFF' : '💾 Save ON', `${prefix}autosavestatus ${getFeature('autoSaveStatus') ? 'off' : 'on'}`),
            quickReply(getFeature('antiDeleteStatus') ? '🗑️ AntiDel OFF' : '🗑️ AntiDel ON', `${prefix}antideletestatus ${getFeature('antiDeleteStatus') ? 'off' : 'on'}`)
        ]
    })
}

handler.command = ['autosavestatus', 'antideletestatus', 'statusignore', 'statusonly', 'statussave', 'ssave', 'statusmenu', 'statussettings']
handler.category = 'Owner'
handler.owner = true
handler.ownerBypassAdmin = true
export default handler
