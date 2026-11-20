import { openStore } from './featurestore.js'

const store = () => openStore('economy', { users: {} })

export const levelFromXp = xp => Math.floor(Math.sqrt(Math.max(0, xp) / 40))
export const xpForLevel = level => level * level * 40

export function getAccount(jid) {
    const users = store().data.users
    const account = users[jid] ||= {}
    for (const [key, value] of Object.entries({ wallet: 0, bank: 0, xp: 0, lastDaily: 0, lastWork: 0, streak: 0 })) {
        if (typeof account[key] !== 'number') account[key] = value
    }
    return account
}

export const saveEconomy = () => store().save()
export const allAccounts = () => store().data.users
export const fmtCoins = n => `🪙 ${Math.floor(n).toLocaleString()}`

export function fmtDuration(ms) {
    const s = Math.ceil(ms / 1000)
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
    return [h && `${h}h`, m && `${m}m`, !h && `${sec}s`].filter(Boolean).join(' ')
}
