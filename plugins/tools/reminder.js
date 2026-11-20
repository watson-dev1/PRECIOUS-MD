import { openStore } from '../../lib/featurestore.js'

const store = () => openStore('reminders', { list: [] })
const UNITS = { s: 1, sec: 1, m: 60, min: 60, h: 3600, hr: 3600, d: 86400, w: 604800 }

function parseDuration(token) {
    const match = String(token || '').toLowerCase().match(/^(\d+(?:\.\d+)?)(s|sec|m|min|h|hr|d|w)$/)
    if (!match) return 0
    return Math.round(Number(match[1]) * UNITS[match[2]] * 1000)
}

const fmt = ms => {
    const s = Math.max(0, Math.round(ms / 1000))
    if (s < 90) return `${s}s`
    if (s < 5400) return `${Math.round(s / 60)}m`
    if (s < 129600) return `${(s / 3600).toFixed(1)}h`
    return `${(s / 86400).toFixed(1)}d`
}

let handler = async (m, { command, args }) => {
    const prefix = global.prefix || '.'
    const { data } = store()

    if (command === 'reminders' || command === 'myreminders') {
        const mine = data.list.filter(r => r.sender === m.sender).sort((a, b) => a.at - b.at)
        if (!mine.length) return m.reply(`You have no reminders.\nExample: ${prefix}remind 30m drink water`)
        return m.reply(`*⏰ YOUR REMINDERS*\n\n${mine.map(r => `*${r.id}* — in ${fmt(r.at - Date.now())}\n${r.text.slice(0, 80)}`).join('\n\n')}\n\nCancel: ${prefix}delremind <id>`)
    }

    if (command === 'delremind' || command === 'unremind') {
        const id = String(args[0] || '').toLowerCase()
        const before = data.list.length
        data.list = data.list.filter(r => !(r.id === id && (r.sender === m.sender || m.isOwner)))
        store().save()
        return m.reply(data.list.length < before ? '🗑️ Reminder removed.' : `No reminder with id "${id}" found.`)
    }

    const ms = parseDuration(args[0])
    const text = args.slice(1).join(' ').trim() || (m.quoted?.text || '').trim()
    if (!ms || !text) return m.reply(`Use: ${prefix}remind <time> <message>\nExamples:\n${prefix}remind 10m call John\n${prefix}remind 2h submit report\n${prefix}remind 1d pay rent`)
    if (ms < 5000 || ms > 30 * 86400000) return m.reply('Choose a time between 5 seconds and 30 days.')
    if (data.list.filter(r => r.sender === m.sender).length >= 15) return m.reply('You already have 15 reminders. Delete one first.')

    const id = Math.random().toString(36).slice(2, 6)
    data.list.push({ id, chat: m.chat, sender: m.sender, text: text.slice(0, 500), at: Date.now() + ms })
    store().save()
    return m.reply(`⏰ Okay! I'll remind you in *${fmt(ms)}*.\nID: *${id}*`)
}

handler.command = ['remind', 'reminder', 'reminders', 'myreminders', 'delremind', 'unremind']
handler.category = 'Tools'
export default handler
