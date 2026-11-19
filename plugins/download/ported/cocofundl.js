// ───────── cocofundl ─────────
// Dipecah dari plugins/download/video.js (dulu digabung dengan fitur lain dalam satu file)

import { te, wrapPlugin, oneCommand } from '../../../lib/engine/plugins.js'
import { cocofun } from 'btch-downloader'

const _cocofundl = (() => {
const pluginConfig = {
    name: 'cocofundl',
    alias: [],
    category: 'download',
    description: 'Download video CocoFun',
    usage: '.cocofundl <url>',
    example: '.cocofundl https://www.cocofun.com/share/post/xxx',
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
            `> \`${m.prefix}cocofundl <url>\`\n\n` +
            `> Example:\n` +
            `> \`${m.prefix}cocofundl https://www.cocofun.com/share/post/xxx\``
        )
    }

    if (!url.match(/cocofun\.com/i)) {
        return m.reply(`❌ Invalid URL. Use a CocoFun link.`)
    }

    await m.react('🕕')

    try {
        const data = await cocofun(url)

        if (!data?.status || !data?.result) {
            return m.reply(`❌ Failed to retrieve the video. Try another link.`)
        }

        const result = data.result
        const videoUrl = result.no_watermark || result.watermark

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
    } catch (err) {
        return m.reply(te(m.prefix, m.command, m.pushName))
    }
}

const __plugin = wrapPlugin(pluginConfig, handler)

  return __plugin
})()

_cocofundl.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
_cocofundl.limit = true
export default oneCommand(_cocofundl, 'cocofundl')
