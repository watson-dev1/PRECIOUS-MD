import { openStore } from './featurestore.js'

const store = () => openStore('cmdstats', { commands: {}, users: {}, daily: {} })

export function recordCommand(command, sender) {
    try {
        const { data } = store()
        const name = String(command || '').toLowerCase().slice(0, 40)
        if (!name) return
        data.commands[name] = (data.commands[name] || 0) + 1
        if (sender) {
            const user = String(sender).split('@')[0].split(':')[0]
            data.users[user] = (data.users[user] || 0) + 1
        }
        const day = new Date().toISOString().slice(0, 10)
        data.daily[day] = (data.daily[day] || 0) + 1
        const days = Object.keys(data.daily).sort()
        for (const old of days.slice(0, Math.max(0, days.length - 60))) delete data.daily[old]
        store().save()
    } catch {}
}

export function getCmdStats(limit = 10) {
    const { data } = store()
    const top = obj => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, limit)
    return {
        total: Object.values(data.commands).reduce((n, v) => n + v, 0),
        topCommands: top(data.commands).map(([name, count]) => ({ name, count })),
        topUsers: top(data.users).map(([user, count]) => ({ user, count })),
        daily: data.daily
    }
}
