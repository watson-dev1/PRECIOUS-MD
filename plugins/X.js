
// plugins/autobio.js

let handler = m => m

handler.all = async function (m) {
    try {
        const waClient = this.waClient || this
        const botJid = waClient?.user?.id

        if (!botJid) return

        const settings = global.db?.data?.settings
        if (!settings) return

        const setting = settings[botJid] || (settings[botJid] = {})

        if (!setting.autoBio) return

        const uptime = formatUptime(process.uptime())

        const bio = [
            `⌚ Time Active: ${uptime}`,
            '',
            '┃ 🛡️ PRECIOUS-MD 🛡️',
            'Created by Watson Fourpence'
        ].join('\n')

        if (typeof waClient.updateProfileStatus !== 'function') {
            console.warn('[AUTOBIO] updateProfileStatus is unavailable.')
            return
        }

        await waClient.updateProfileStatus(bio)

        setting.status = Date.now()

    } catch (err) {
        console.error('[AUTOBIO] Error:', err?.message || err)
    }
}

handler.command = []
handler.category = 'Owner'
handler.description = 'Automatically updates the WhatsApp profile bio with bot uptime'
handler.ownerBypassAdmin = true

export default handler

function formatUptime(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0))

    const days = Math.floor(total / 86400)
    const hours = Math.floor((total % 86400) / 3600)
    const minutes = Math.floor((total % 3600) / 60)

    return `${days} Day(s) ${hours} Hour(s) ${minutes} Minute(s)`
}
