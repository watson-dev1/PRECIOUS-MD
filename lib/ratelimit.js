import { getFeature } from './featurestore.js'

const recent = new Map()    // sender -> [timestamps]
const lastRun = new Map()   // sender:command -> ts
const blocked = new Map()   // sender -> until
const notified = new Set()

const MIN_GAP_MS = 800
const BURST_WINDOW_MS = 15000
const BURST_MAX = 10
const BLOCK_MS = 45000

const HEAVY = new Set([
    'play', 'playaudio', 'playvideo', 'playdoc', 'ytmp3', 'yta', 'ytmp4', 'video', 'ai', 'deepseek', 'imagine',
    'tiktok', 'ig', 'igdl', 'facebook', 'fb', 'twitter', 'terabox', 'mediafire', 'apk', 'hdimage', 'tts', 'broadcast'
])

export function checkRate(m, command, handler) {
    if (!getFeature('rateLimit', true)) return { limited: false }
    if (m.isOwner || m.fromMe) return { limited: false }

    const sender = m.sender || m.chat
    const now = Date.now()

    const until = blocked.get(sender) || 0
    if (until > now) {
        const first = !notified.has(sender)
        notified.add(sender)
        return { limited: true, notify: false, silent: !first, wait: Math.ceil((until - now) / 1000) }
    }
    if (until) { blocked.delete(sender); notified.delete(sender) }

    const list = (recent.get(sender) || []).filter(t => now - t < BURST_WINDOW_MS)
    list.push(now)
    recent.set(sender, list)
    if (list.length > BURST_MAX) {
        blocked.set(sender, now + BLOCK_MS)
        recent.delete(sender)
        notified.add(sender)
        return { limited: true, notify: true, wait: Math.ceil(BLOCK_MS / 1000) }
    }

    const key = `${sender}:${command}`
    const cooldown = Number(handler?.cooldown) || (HEAVY.has(command) ? 8 : 0)
    const gap = Math.max(MIN_GAP_MS, cooldown * 1000)
    const last = lastRun.get(key) || 0
    if (now - last < gap) {
        return { limited: true, notify: cooldown > 0 && now - last > 1500, wait: Math.ceil((gap - (now - last)) / 1000) }
    }
    lastRun.set(key, now)

    if (lastRun.size > 5000) for (const k of [...lastRun.keys()].slice(0, 2500)) lastRun.delete(k)
    if (recent.size > 5000) recent.clear()
    return { limited: false }
}
