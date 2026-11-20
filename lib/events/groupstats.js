import { smsg } from '../myfunc.js'
import { openStore, getFeature } from '../featurestore.js'

const stats = () => openStore('groupstats', { groups: {} })
const economy = () => openStore('economy', { users: {} })
const xpCooldown = new Map()

export const levelFromXp = xp => Math.floor(Math.sqrt(Math.max(0, xp) / 40))

let handler = async (waClient, { messages, type }) => {
    if (type !== 'notify') return

    for (const raw of messages || []) {
        try {
            if (!raw?.message || raw.key?.fromMe) continue
            const chat = raw.key?.remoteJid
            if (!chat?.endsWith('@g.us')) continue
            const m = await smsg(waClient, raw)
            if (!m?.isGroup || !m.sender) continue

            // message counters
            const store = stats()
            const group = store.data.groups[m.chat] ||= { total: 0, users: {} }
            const user = group.users[m.sender] ||= { count: 0, last: 0 }
            group.total += 1
            user.count += 1
            user.last = Date.now()
            store.save()

            // XP / levels (60s cooldown per user)
            const now = Date.now()
            if ((xpCooldown.get(m.sender) || 0) > now) continue
            xpCooldown.set(m.sender, now + 60000)
            if (xpCooldown.size > 5000) xpCooldown.clear()

            const eco = economy()
            const account = eco.data.users[m.sender] ||= { wallet: 0, bank: 0, xp: 0, lastDaily: 0, lastWork: 0 }
            const before = levelFromXp(account.xp)
            account.xp += 5 + Math.floor(Math.random() * 11)
            const after = levelFromXp(account.xp)
            eco.save()

            if (after > before && getFeature('levelUpMessages', true)) {
                await waClient.sendMessage(m.chat, {
                    text: `🎉 @${m.sender.split('@')[0]} reached *level ${after}*!`,
                    mentions: [m.sender]
                }).catch(() => {})
            }
        } catch (error) {
            console.error('[GROUPSTATS] error:', error?.message || error)
        }
    }
}

handler.on = 'messages.upsert'
export default handler
