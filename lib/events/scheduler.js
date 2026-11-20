import { openStore, getFeature, localNow, ownerJid } from '../featurestore.js'
import { getAllGroupSettings } from '../groupsettings.js'
import { buildBackup } from '../backup.js'

// One shared scheduler per process, survives hot-reloads of this file.
const state = (global.__preciousScheduler ||= { client: null, timer: null, fired: new Set(), downSince: 0, lastCode: '', lastMemAlert: 0, lastBackupDay: '' })

const reminders = () => openStore('reminders', { list: [] })

async function safeSend(client, jid, content) {
    try { await client.sendMessage(jid, content) } catch (error) { console.error('[SCHEDULER] send failed:', error?.message || error) }
}

const once = key => {
    if (state.fired.has(key)) return false
    state.fired.add(key)
    if (state.fired.size > 800) state.fired = new Set([...state.fired].slice(-300))
    return true
}

async function tick() {
    const client = state.client
    if (!client?.user) return
    const now = Date.now()
    const local = localNow()

    // ---- reminders ----
    try {
        const store = reminders()
        const due = store.data.list.filter(item => item.at <= now)
        if (due.length) {
            store.data.list = store.data.list.filter(item => item.at > now)
            store.save()
            for (const item of due) {
                await safeSend(client, item.chat, {
                    text: `⏰ *Reminder* for @${item.sender.split('@')[0]}\n\n${item.text}`,
                    mentions: [item.sender]
                })
            }
        }
    } catch (error) { console.error('[SCHEDULER] reminders:', error?.message || error) }

    // ---- group open/close + birthdays ----
    try {
        const groups = getAllGroupSettings()
        for (const [chat, settings] of Object.entries(groups)) {
            if (!chat.endsWith('@g.us')) continue
            const sched = settings.schedule || {}
            if (sched.open && sched.open === local.time && once(`open:${chat}:${local.date}:${local.time}`)) {
                try {
                    await client.groupSettingUpdate(chat, 'not_announcement')
                    await safeSend(client, chat, { text: '🔓 *Group opened.* Everyone can send messages now.' })
                } catch {}
            }
            if (sched.close && sched.close === local.time && once(`close:${chat}:${local.date}:${local.time}`)) {
                try {
                    await client.groupSettingUpdate(chat, 'announcement')
                    await safeSend(client, chat, { text: '🔒 *Group closed.* Only admins can send messages until it reopens.' })
                } catch {}
            }
            if (local.time === '08:00') {
                const celebrants = Object.entries(settings.birthdays || {}).filter(([, dm]) => dm === local.dm).map(([jid]) => jid)
                if (celebrants.length && once(`bday:${chat}:${local.date}`)) {
                    await safeSend(client, chat, {
                        text: `🎂🎉 *Happy Birthday* ${celebrants.map(j => `@${j.split('@')[0]}`).join(', ')}! Wishing you an amazing day! 🥳`,
                        mentions: celebrants
                    })
                }
            }
        }
    } catch (error) { console.error('[SCHEDULER] groups:', error?.message || error) }

    // ---- daily backup to owner (03:00) ----
    try {
        if (getFeature('autoBackup', false) && local.time === '03:00' && state.lastBackupDay !== local.date) {
            state.lastBackupDay = local.date
            const { buffer, count } = buildBackup()
            await safeSend(client, ownerJid(), {
                document: buffer, mimetype: 'application/json',
                fileName: `precious-md-backup-${local.date}.json`,
                caption: `💾 Daily backup — ${count} database file(s).\nThe WhatsApp session is never included.`
            })
        }
    } catch (error) { console.error('[SCHEDULER] backup:', error?.message || error) }

    // ---- memory health alert (max once per hour) ----
    try {
        if (getFeature('healthAlerts', true)) {
            const rssMb = Math.round(process.memoryUsage().rss / 1048576)
            if (rssMb > Number(getFeature('memAlertMB', 450)) && now - state.lastMemAlert > 3600000) {
                state.lastMemAlert = now
                await safeSend(client, ownerJid(), { text: `⚠️ *Health alert*\nMemory usage is high: *${rssMb} MB*.\nConsider restarting the bot (.restart).` })
            }
        }
    } catch {}
}

function ensureTimer() {
    if (state.timer) return
    state.timer = setInterval(() => { tick().catch(error => console.error('[SCHEDULER] tick:', error?.message || error)) }, 20000)
    state.timer.unref?.()
}

function markUp(waClient) {
    state.client = waClient
    ensureTimer()
    if (state.downSince && getFeature('healthAlerts', true)) {
        const minutes = Math.max(1, Math.round((Date.now() - state.downSince) / 60000))
        const reason = state.lastCode ? ` (code ${state.lastCode})` : ''
        state.downSince = 0
        setTimeout(() => safeSend(waClient, ownerJid(), { text: `✅ *Bot reconnected* after ~${minutes} min offline${reason}.` }), 4000)
    }
}

// The dispatcher is wired while the socket is already opening, so the literal `open`
// update can be missed. Any later update from a socket that has a user counts as "up".
let handler = async (waClient, update) => {
    const { connection, lastDisconnect } = update || {}
    if (connection === 'close') {
        if (!state.downSince) state.downSince = Date.now()
        state.lastCode = lastDisconnect?.error?.output?.statusCode || ''
        return
    }
    if (waClient?.user && (connection === 'open' || update?.receivedPendingNotifications || !state.client || state.downSince)) {
        markUp(waClient)
    }
}

handler.on = 'connection.update'
export default handler
