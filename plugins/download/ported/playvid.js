// ───────── playvid ─────────
// Dipecah dari plugins/download/youtube.js (dulu digabung dengan fitur lain dalam satu file)

import yts from 'yt-search'
import { wrapClassic, oneCommand } from '../../../lib/engine/plugins.js'
import fetch from 'node-fetch'
import { safeJson } from '../../../lib/engine/plugins.js'

const _ytv = (() => {
let handler = async (m, { conn, text }) => {
   if (!text) throw `Example:\n.playvid dj remix|360\n.ytmp4 dj remix|720`

   await m.reply(global.wait)

   let [query, resolusi] = text.split('|')
   resolusi = resolusi || '360'

   let url = query

   if (!/^https?:\/\//.test(query)) {
      let search = await yts(query)
      let vid = search.videos[0]
      if (!vid) throw 'Video was not found'
      url = vid.url
   }

   let api = `https://api.nexray.web.id/downloader/ytmp4?url=${encodeURIComponent(url)}&resolusi=${resolusi}`

   let res = await fetch(api)
   let json = await safeJson(res, { status: false })

   if (!json.status) throw 'Failed to retrieve the video'

   let data = json.result

   let caption = `*${data.title}*
Durasi: ${data.duration}s
Resolusi: ${data.resolusi}p
🍹 Nih videonya wok~`

   await conn.sendMessage(m.chat, {
      video: { url: data.url },
      caption
   }, { quoted: m })
}

handler.help = ['playvid', 'ytmp4']
handler.tags = ['download']
handler.command = ['playvid']
handler.limit = true

const __plugin = wrapClassic(handler)

  return __plugin
})()

_ytv.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
export default oneCommand(_ytv, 'playvid')
