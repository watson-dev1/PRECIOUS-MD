import { getAntiCallSettings } from '../anticall.js'

const matchesCall = (waClient, call, settings) => {
    const from = waClient.decodeJid(call?.from || call?.participant || call?.fromJid || '')
    const group = waClient.decodeJid(call?.groupJid || call?.chatId || (from.endsWith('@g.us') ? from : ''))
    const isGroup = Boolean(call?.isGroup || group?.endsWith('@g.us'))

    if (settings.scope === 'all') return true
    if (settings.scope === 'dm') return !isGroup
    if (settings.scope === 'group') return isGroup
    if (settings.scope === 'selectednumber') {
        return settings.numbers.includes(from.split('@')[0])
    }
    if (settings.scope === 'selectedgroup') {
        return Boolean(group && settings.groups.includes(group))
    }
    return false
}

let handler = async (waClient, calls) => {
    const settings = getAntiCallSettings()
    if (settings.action === 'off') return

    for (const call of Array.isArray(calls) ? calls : [calls]) {
        if (call?.status && call.status !== 'offer') continue
        if (!call?.id || !matchesCall(waClient, call, settings)) continue
        const from = waClient.decodeJid(call.from || call.participant || call.fromJid || '')

        await waClient.rejectCall(call.id, from).catch(() => {})
        if (settings.action === 'block' && from && !from.endsWith('@g.us')) {
            await waClient.updateBlockStatus(from, 'block').catch(() => {})
        }
    }
}

handler.on = 'call'

export default handler
