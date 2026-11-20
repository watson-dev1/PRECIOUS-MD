import { smsg } from '../myfunc.js'
import { getGroupSettings, updateGroupSettings } from '../groupsettings.js'

const TLDS = 'com|net|org|io|co|me|xyz|info|biz|app|dev|site|online|club|link|live|shop|store|tech|top|vip|ly|gl|gg|tv|cc|ws|to|fm|ai|ink|click|icu|cfd|sbs|mobi|pro|ml|ga|cf|tk|ru|in|us|uk|za|zw|ng|ke|gh|tz|zm|bw'
const ZERO_WIDTH = /[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g

const URL_RE = new RegExp(
    `(?:https?:\\/\\/|www\\.)[^\\s<>()]+|(?<![@\\w.-])(?:[a-z0-9-]+\\.)+(?:${TLDS})(?![a-z0-9-])(?:\\/[^\\s<>()]*)?`,
    'gi'
)
const WA_RE = /chat\.whatsapp\.com\/[A-Za-z0-9]{8,}|whatsapp\.com\/channel\/|wa\.me\/channel\/|whatsapp\.com\/invite/i

const noticeAt = new Map()

function normalise(text) {
    return String(text || '')
        .replace(ZERO_WIDTH, '')
        .replace(/\[\s*\.\s*\]|\(\s*dot\s*\)|\{\s*dot\s*\}/gi, '.')
        .replace(/h[x]{2}ps?:\/\//gi, match => (match.toLowerCase().endsWith('s://') ? 'https://' : 'http://'))
}

function hostOf(link) {
    try {
        const withScheme = /^https?:\/\//i.test(link) ? link : `https://${link}`
        return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, '')
    } catch { return '' }
}

export function findLinks(text, settings) {
    const clean = normalise(text)
    const found = clean.match(URL_RE) || []
    const allow = (settings.antiLinkAllow || []).map(d => String(d).toLowerCase().replace(/^www\./, ''))
    const links = found.filter(link => {
        const host = hostOf(link)
        if (!host) return false
        if (allow.some(domain => host === domain || host.endsWith(`.${domain}`))) return false
        if (settings.antiLinkType === 'whatsapp') return WA_RE.test(link)
        return true
    })
    if (settings.antiLinkType === 'whatsapp' && !links.length && WA_RE.test(clean) && !allow.some(d => 'whatsapp.com'.endsWith(d))) {
        return [clean.match(WA_RE)[0]]
    }
    return links
}

function collectText(m, raw) {
    const parts = [m.text || '']
    const ctx = m.msg?.contextInfo
    if (m.msg?.matchedText) parts.push(m.msg.matchedText)
    if (ctx?.externalAdReply?.sourceUrl) parts.push(ctx.externalAdReply.sourceUrl)
    const buttons = raw.message?.buttonsMessage || raw.message?.templateMessage
    if (buttons) parts.push(JSON.stringify(buttons).slice(0, 4000))
    return parts.filter(Boolean).join('\n')
}

let handler = async (waClient, { messages, type }) => {
    if (type !== 'notify') return

    for (const raw of messages || []) {
        try {
            if (!raw?.message || raw.key?.fromMe) continue
            const chat = raw.key?.remoteJid
            if (!chat?.endsWith('@g.us')) continue

            const settings = getGroupSettings(chat)
            if (!settings.antiLink || settings.antiLink === 'off') continue

            const m = await smsg(waClient, raw)
            if (!m?.isGroup || m.isAdmin || m.isOwner) continue

            const links = findLinks(collectText(m, raw), settings)
            if (!links.length) continue

            const mode = settings.antiLink
            const wantDelete = mode.includes('delete')
            const wantWarn = mode.includes('warn')
            const wantKick = mode.includes('kick')
            const user = m.sender
            const tag = `@${user.split('@')[0]}`

            if (!m.isBotAdmin && (wantDelete || wantKick)) {
                const last = noticeAt.get(m.chat) || 0
                if (Date.now() - last > 5 * 60 * 1000) {
                    noticeAt.set(m.chat, Date.now())
                    await waClient.sendMessage(m.chat, { text: '⚠️ Anti-link is on but I am not an admin, so I cannot delete messages or remove members. Please make me admin.' }).catch(() => {})
                }
            }

            if (wantDelete && m.isBotAdmin) {
                await waClient.sendMessage(m.chat, { delete: raw.key }).catch(() => {})
            }

            let count = 0
            const limit = Math.max(1, Number(settings.antiLinkLimit) || 3)
            if (wantWarn) {
                const users = { ...getGroupSettings(m.chat).antiLinkUsers }
                count = (users[user] || 0) + 1
                users[user] = count
                updateGroupSettings(m.chat, { antiLinkUsers: users })
            }

            const shouldKick = wantKick && (!wantWarn || count >= limit)
            if (shouldKick) {
                if (m.isBotAdmin) {
                    try {
                        await waClient.groupParticipantsUpdate(m.chat, [user], 'remove')
                        const users = { ...getGroupSettings(m.chat).antiLinkUsers }
                        delete users[user]
                        updateGroupSettings(m.chat, { antiLinkUsers: users })
                        await waClient.sendMessage(m.chat, { text: `🚫 ${tag} was removed for sending links.`, mentions: [user] }).catch(() => {})
                    } catch (error) {
                        console.error('[ANTILINK] kick failed:', error?.message || error)
                    }
                }
                continue
            }

            if (wantWarn) {
                await waClient.sendMessage(m.chat, {
                    text: `⚠️ ${tag}, links are not allowed here.\nWarning *${count}/${limit}*${wantKick ? ` — you will be removed at ${limit}.` : '.'}`,
                    mentions: [user]
                }).catch(() => {})
            } else if (wantDelete && m.isBotAdmin) {
                await waClient.sendMessage(m.chat, { text: `🚫 ${tag}, links are not allowed here.`, mentions: [user] }).catch(() => {})
            }
        } catch (error) {
            console.error('[ANTILINK] error:', error?.message || error)
        }
    }
}

handler.on = 'messages.upsert'

export default handler
