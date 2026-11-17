// ───────── douyin2 ─────────
// Dipecah dari plugins/download/video.js (dulu digabung dengan fitur lain dalam satu file)

import { wrapClassic, oneCommand } from '../../../lib/engine/plugins.js'
import fetch from 'node-fetch'

const _douyin = (() => {
// Douyin downloader
// API : https://api-faa.my.id

let handler = async (m, { conn, args }) => {
  if (!args[0]) {
    return m.reply('Masukkan link Douyin!\n\nContoh:\n.douyin https://v.douyin.com/xxxxx')
  }

  try {
    let url = encodeURIComponent(args[0])
    let api = `https://api-faa.my.id/faa/douyin-down?url=${url}`

    let res = await fetch(api)
    let json = await res.json()

    if (!json.status || !json.result) {
      throw 'Gagal mengambil data Douyin'
    }

    let data = json.result
    let title = data.title || '-'
    let thumbnail = data.thumbnail
    let medias = data.medias || []

    let video = medias.find(v => v.type === 'video')

    if (!video?.url) {
      return m.reply('Video tidak ditemukan')
    }

    let caption = `
*DOUYIN DOWNLOADER*

📌 *Judul:* ${title}
`.trim()

    let thumbBuffer = null
    if (thumbnail) {
      let t = await fetch(thumbnail)
      thumbBuffer = await t.buffer()
    }

    await conn.sendMessage(m.chat, {
      video: { url: video.url },
      caption,
      jpegThumbnail: thumbBuffer
    }, { quoted: m })
  } catch (e) {
    console.error(e)
    m.reply('Terjadi kesalahan saat mengambil video')
  }
}

handler.help = ['douyin <url>']
handler.tags = ['download']
handler.command = ['douyin']
handler.limit = true

const __plugin = wrapClassic(handler)

  return __plugin
})()

_douyin.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
export default oneCommand(_douyin, 'douyin2', { subs: false, as: 'douyin' })
