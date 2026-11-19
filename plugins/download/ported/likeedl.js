// ───────── likeedl ─────────
// Dipecah dari plugins/download/video.js (dulu digabung dengan fitur lain dalam satu file)

import { te, wrapPlugin, oneCommand } from '../../../lib/engine/plugins.js'
import { likee } from '../../../lib/services/scraper.js'

const _likeedl = (() => {
const pluginConfig = {
    name: 'likeedl',
    alias: [],
    category: 'download',
    description: 'Download video Likee',
    usage: '.likeedl <url>',
    example: '.likeedl https://likee.video/@xxx',
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
            `> \`${m.prefix}likeedl <url>\`\n\n` +
            `> Example:\n` +
            `> \`${m.prefix}likeedl https://likee.video/@xxx\``
        )
    }

    if (!url.match(/likee\.(video|com)/i)) {
        return m.reply(`❌ Invalid URL. Use a Likee link.`)
    }

    await m.react('🕕')

    try {
        const data = await likee(url)

        if (!data) {
            return m.reply(`❌ Failed to retrieve the video. Try another link.`)
        }

        const videoUrl = data.without_watermark || data.with_watermark

        if (!videoUrl) {
            return m.reply(`❌ Video was not found.`)
        }

        await sock.sendMedia(m.chat, videoUrl, null, m, {
            type: 'video',
            contextInfo: {
                forwardingScore: 99,
                isForwarded: true
            }
        })

        await m.react('✅')
    } catch (err) {
        return m.reply(te(m.prefix, m.command, m.pushName))
    }
}

const __plugin = wrapPlugin(pluginConfig, handler)

  return __plugin
})()

_likeedl.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
_likeedl.limit = true
export default oneCommand(_likeedl, 'likeedl')
