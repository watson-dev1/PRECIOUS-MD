import { requestRestart } from '../../index.js'

let handler = async (m, { waClient }) => {
    await m.reply('Restarting bot...')
    setTimeout(() => {
        try {
            waClient.ev.removeAllListeners()
            waClient.ws?.close?.()
        } catch {}
        requestRestart()
    }, 750)
}

handler.command = ['restart', 'reboot']
handler.owner = true
handler.silentDeny = true

export default handler
