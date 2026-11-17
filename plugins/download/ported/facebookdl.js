// ───────── facebookdl ─────────
// Dipecah dari plugins/download/social.js (dulu digabung dengan fitur lain dalam satu file)

import { te, wrapPlugin, oneCommand } from '../../../lib/engine/plugins.js'
import { fbdown } from '../../../lib/services/scraper.js'

const _facebookdl = (() => {
const pluginConfig = {
    name: 'facebookdl',
    alias: [],
    category: 'download',
    description: 'Download video Facebook',
    usage: '.facebookdl <url>',
    example: '.facebookdl https://www.facebook.com/watch?v=xxx',
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
            `⚠️ *CARA PAKAI*\n\n` +
            `- \`${m.prefix}facebookdl <url>\`\n\n` +
            `*Contoh:*\n` +
            `- \`${m.prefix}facebookdl https://www.facebook.com/watch?v=xxx\``
        )
    }

    if (!url.match(/facebook\.com|fb\.watch|fb\.com/i)) {
        return m.reply(`❌ URL tidak valid. Gunakan link Facebook.`)
    }

    await m.react('🕕')

    try {
        const data = await fbdown(url)

        if (!data?.status || !data.result || !data.result.medias || data.result.medias.length === 0) {
            await m.react('❌')
            return m.reply(`❌ Gagal mengambil video. Coba link lain atau pastikan postingan bersifat publik.\n\n_Catatan: Sistem saat ini belum mendukung download foto Facebook, hanya video._`)
        }

        // Find HD if available, else SD, else first item
        let video = data.result.medias.find(m => m.quality === "hd") ||
                    data.result.medias.find(m => m.quality === "sd") ||
                    data.result.medias[0];

        if (!video || !video.url) {
            await m.react('❌')
            return m.reply(`❌ Video tidak ditemukan di link tersebut.\n\n_Catatan: Sistem saat ini belum mendukung download foto Facebook, hanya video._`)
        }

        let caption = `🎥 *FACEBOOK DOWNLOADER*\n\n`
        caption += `*Judul:* ${data.result.title || "Video Facebook"}\n`
        caption += `*Kualitas:* ${video.quality ? video.quality.toUpperCase() : "Normal"}\n`
        if (video.formattedSize) {
            caption += `*Ukuran:* ${video.formattedSize}\n`
        }
        caption += `\n_Catatan: Fitur ini tidak mensupport postingan foto._`

        await sock.sendMedia(m.chat, video.url, caption, m, {
            type: 'video',
            contextInfo: {
                forwardingScore: 99,
                isForwarded: true
            }
        })

        await m.react('✅')
    } catch (err) {
        await m.react('❌')
        return m.reply(te(m.prefix, m.command, m.pushName))
    }
}

const __plugin = wrapPlugin(pluginConfig, handler)

  return __plugin
})()

_facebookdl.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
_facebookdl.limit = true
export default oneCommand(_facebookdl, 'facebookdl')
