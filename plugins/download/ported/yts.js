// ───────── yts ─────────
// Dipecah dari plugins/download/youtube.js (dulu digabung dengan fitur lain dalam satu file)

import yts from 'yt-search'
import { wrapClassic, oneCommand } from '../../../lib/engine/plugins.js'

const _yts = (() => {
let handler = async (m, { text, conn, usedPrefix, command }) => {
  if (!text) throw `Masukkan judul!

Contoh:
${usedPrefix + command} dj 30 detik`

  let search = await yts(text)
  let videos = search.videos.slice(0, 10)

  if (!videos.length) throw 'Video tidak ditemukan.'

  let caption = `*YouTube Search*\n`
  caption += `Query: ${text}\n\n`

  for (let i = 0; i < videos.length; i++) {
    let v = videos[i]
    caption += `*${i + 1}. ${v.title}*\n`
    caption += `⏱ ${v.timestamp} | ${v.views.toLocaleString()}\n`
    caption += `📎 ${v.url}\n\n`
  }

  await conn.sendMessage(m.chat, {
    text: caption,
    contextInfo: {
      externalAdReplyOffOffOff: {
        title: "YouTube Search",
        body: text,
        thumbnailUrl: videos[0].thumbnail,
        sourceUrl: videos[0].url,
        mediaType: 1,
        renderLargerThumbnail: true
      }
    }
  }, { quoted: m })
}

handler.help = ['yts', 'youtubesearch']
handler.tags = ['search']
handler.command = ['ytsfind']
handler.limit = true

const __plugin = wrapClassic(handler)

  return __plugin
})()

_yts.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
export default oneCommand(_yts, 'yts')
