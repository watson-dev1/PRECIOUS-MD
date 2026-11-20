import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const DB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'database')
const stores = new Map()

function writeAtomic(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
    fs.renameSync(tmp, file)
}

/** Small JSON-file store with debounced atomic writes. `store.data` is a plain object. */
export function openStore(name, defaults = {}) {
    if (stores.has(name)) return stores.get(name)
    const file = path.join(DB_DIR, `${name}.json`)
    let data
    try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
        data = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch { data = {} }
    for (const [key, value] of Object.entries(defaults)) {
        if (data[key] === undefined) data[key] = structuredClone(value)
    }
    let timer = null
    const store = {
        name, file, data,
        save() {
            if (timer) return
            timer = setTimeout(() => store.flush(), 800)
            timer.unref?.()
        },
        flush() {
            if (timer) { clearTimeout(timer); timer = null }
            try { writeAtomic(file, store.data) } catch (error) { console.error(`[STORE:${name}] write failed:`, error.message) }
        }
    }
    stores.set(name, store)
    return store
}

export function flushAllStores() {
    for (const store of stores.values()) store.flush()
}
process.once('exit', flushAllStores)
process.once('SIGTERM', flushAllStores)
process.once('SIGINT', flushAllStores)

// ---- global feature flags (owner toggles) ----
const FEATURE_DEFAULTS = {
    autoSaveStatus: false,
    antiDeleteStatus: false,
    statusIgnore: [],
    statusOnly: [],
    rateLimit: true,
    autoBackup: false,
    healthAlerts: true,
    memAlertMB: 450,
    timezone: '',
    levelUpMessages: true,
    persona: ''
}
const features = () => openStore('features', FEATURE_DEFAULTS)

export function getFeature(key, fallback) {
    const value = features().data[key]
    return value === undefined ? (fallback ?? FEATURE_DEFAULTS[key]) : value
}

export function setFeature(key, value) {
    const store = features()
    store.data[key] = value
    store.save()
    return value
}

export function getTimezone() {
    const tz = getFeature('timezone') || process.env.TIMEZONE || 'Africa/Harare'
    try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return tz } catch { return 'UTC' }
}

export function isValidTimezone(tz) {
    try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return true } catch { return false }
}

export function localNow(tz = getTimezone()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }).formatToParts(new Date())
    const get = type => parts.find(p => p.type === type)?.value || '00'
    return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}`, dm: `${get('day')}/${get('month')}` }
}

export const ownerJid = () => `${String(global.ownerNumber || '').replace(/\D/g, '')}@s.whatsapp.net`
export const bareJid = jid => {
    if (typeof jid !== 'string' || !jid.includes('@')) return ''
    const [user, server] = jid.split('@')
    return `${user.split(':')[0]}@${server}`
}
export const numberOf = jid => bareJid(jid).split('@')[0]
