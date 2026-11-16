import { getGroupMetadata } from '../myfunc.js'
import { formatGroupTemplate, getGroupSettings } from '../groupsettings.js'

let handler = async (waClient, { id, participants, action }) => {
    if (!id || !['add', 'remove'].includes(action) || !participants?.length) return

    const settings = getGroupSettings(id)
    let panelSettings = {}
    try { panelSettings = JSON.parse((await import('fs')).readFileSync(new URL('../../database/settings.json', import.meta.url), 'utf8')) } catch {}
    const enabled = action === 'add'
        ? (settings.welcome || panelSettings.welcomeEnabled === true)
        : (settings.goodbye || panelSettings.goodbyeEnabled === true)
    if (!enabled) return

    const metadata = await getGroupMetadata(waClient, id, true)
    const template = action === 'add'
        ? (panelSettings.welcomeEnabled ? panelSettings.welcomeMessage : settings.welcomeMessage)
        : (panelSettings.goodbyeEnabled ? panelSettings.goodbyeMessage : settings.goodbyeMessage)
    let groupPicture = null
    try {
        groupPicture = await waClient.profilePictureUrl(id, 'image')
    } catch {}

    for (const participant of participants) {
        const rawJid = typeof participant === 'string'
            ? participant
            : participant?.phoneNumber || participant?.id || participant?.lid
        if (!rawJid) continue

        const jid = waClient.decodeJid(rawJid)
        const text = formatGroupTemplate(template, {
            jid,
            group: metadata?.subject,
            count: metadata?.participants?.length
        })
        let picture = null
        try {
            picture = await waClient.profilePictureUrl(jid, 'image')
        } catch {}

        const image = picture || groupPicture
        const content = image
            ? { image: { url: image }, caption: text, mentions: [jid] }
            : { text, mentions: [jid] }
        await waClient.sendMessage(id, content).catch(() => {})
    }
}

handler.on = 'group-participants.update'

export default handler
