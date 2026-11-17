import { requestRestart } from '../../index.js'

let handler = async (m, { waClient }) => {
    // ---- 1. Send confirmation BEFORE restart ----
    try {
        await m.reply('♻️ Restarting bot... back in a moment.')
    } catch {}

    // ---- 2. Give WhatsApp time to actually deliver the reply ----
    // 750ms is too short on slow networks; 1500ms is safer.
    setTimeout(() => {
        console.log('[RESTART] Restart requested by', m.sender)

        // ---- 3. Detach socket cleanly ----
        try {
            waClient?.ev?.removeAllListeners()
        } catch {}
        try {
            waClient?.ws?.close?.()
        } catch {}
        try {
            waClient?.end?.(new Error('restart'))
        } catch {}

        // ---- 4. Trigger supervisor restart ----
        try {
            requestRestart()
        } catch (err) {
            console.error('[RESTART] requestRestart threw:', err?.message || err)
        }

        // ---- 5. Hard fallback ----
        // If requestRestart didn't send an IPC message to a supervisor
        // (i.e. we're in a single-process deployment), exit so hosting
        // (Render, Heroku, PM2) can respawn us. This runs 1s later so
        // requestRestart has time to do its thing first.
        setTimeout(() => {
            console.warn('[RESTART] process still alive after requestRestart — forcing exit(0)')
            process.exit(0)
        }, 1000)
    }, 1500)
}

handler.command = ['restart', 'reboot']
handler.category = 'Owner'
handler.description = 'Restart the bot process'
handler.usage = 'restart'
handler.owner = true
handler.silentDeny = true
handler.ownerBypassAdmin = true

export default handler
