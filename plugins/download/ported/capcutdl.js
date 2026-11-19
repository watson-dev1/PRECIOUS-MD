// ───────── capcutdl ─────────
// Dipecah dari plugins/download/video.js (dulu digabung dengan fitur lain dalam satu file)

import { te, wrapPlugin, oneCommand } from '../../../lib/engine/plugins.js'
import { capcut } from 'btch-downloader'

const _capcutdl = (() => {
const pluginConfig = {
    name: 'capcutdl',
    alias: [],
    category: 'download',
    description: 'Download video CapCut',
    usage: '.capcutdl <url>',
    example: '.capcutdl https://www.capcut.com/t/xxx',
    isOwner: false,
    isPremium: false,
    isGroup: false,
    isPrivate: false,
    cooldown: 10,
    energi: 1,
    isEnabled: true
}

async function handler(m, { sock }) {
    const url = m.text?.trim()

    if (!url) {
        return m.reply(
            `⚠️ *ᴄᴀʀᴀ ᴘᴀᴋᴀɪ*\n\n` +
            `> \`${m.prefix}capcutdl <url>\`\n\n` +
            `> Example:\n` +
            `> \`${m.prefix}capcutdl https://www.capcut.com/t/xxx\``
        )
    }

    if (!url.match(/capcut\.com/i)) {
        return m.reply(`❌ Invalid URL. Use a CapCut link.`)
    }

    await m.react('🕕')

    try {
        const data = await capcut(url)

        if (!data?.status || !data?.originalVideoUrl) {
            return m.reply(`❌ Failed to retrieve the video. Try another link.`)
        }

        await sock.sendMedia(m.chat, data.originalVideoUrl, null, m, {
            type: 'video',
            contextInfo: {
                forwardingScore: 99,
                isForwarded: true
            }
        })
    } catch (err) {
        return m.reply(te(m.prefix, m.command, m.pushName))
    }
}

const __plugin = wrapPlugin(pluginConfig, handler)

  return __plugin
})()

_capcutdl.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
_capcutdl.limit = true
export default oneCommand(_capcutdl, 'capcutdl')
