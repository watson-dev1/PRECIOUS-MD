// ───────── aio2 ─────────
// Dipecah dari plugins/download/aio.js (dulu digabung dengan fitur lain dalam satu file)

import { wrapClassic, oneCommand } from '../../../lib/engine/plugins.js'
import fetch from 'node-fetch'

const _aio2 = (() => {
let handler = async (m, { conn, text, usedPrefix, command }) => {
  await m.react('✨')

  if (!text) {
    return conn.reply(
      m.chat,
      `Example : ${usedPrefix + command} https://vt.tiktok.com/xxxx`,
      m
    )
  }

  try {
    let api = `${global.APIs.faa}/faa/aio?url=${encodeURIComponent(text)}`
    let res = await fetch(api)
    let json = await res.json()

    if (!json.status) throw 'Gagal mengambil data.'

    let data = json.result
    let videoUrl = data.download_url

    await conn.sendMessage(m.chat, {
      video: { url: videoUrl },
      caption: data.title || 'Video berhasil diunduh'
    }, { quoted: m })
  } catch (e) {
    console.error(e)
    conn.reply(m.chat, '⚠️ Gagal mengambil video.', m)
  }
}

handler.help = ['aio2 <url>']
handler.tags = ['download']
handler.command = ['aio2']
handler.limit = true

const __plugin = wrapClassic(handler)

  return __plugin
})()

_aio2.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
export default oneCommand(_aio2, 'aio2')
