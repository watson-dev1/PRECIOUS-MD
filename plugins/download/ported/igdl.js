// ───────── igdl ─────────
// Scraper: JHFastDL (fastdl.app) → fallback JHSssIG (sssinstagram.com)
// Skrep by JH a.k.a Dhika - FIONY BOT (lib/services/scraper.js)

import { wrapClassic, oneCommand, sendAlbum } from '../../../lib/engine/plugins.js'
import { igDownloadAuto } from '../../../lib/services/scraper.js'

const _ig = (() => {
let handler = async (m, { conn, args, text, command, usedPrefix }) => {
  const input = (text || args?.[0] || '').trim()
  if (!input) return m.reply(`*Example:* ${usedPrefix || '.'}${command} https://www.instagram.com/p/xxxx/\n_Untuk story cukup kirim username, contoh:_ ${usedPrefix || '.'}${command} jkt48.fiony`)

  try {
    await m.react('🕒')
    const res = await igDownloadAuto(input, 'fastdl')

    let caption = `📸 *Instagram Downloader*`
    if (res.author && res.author !== 'unknown') caption += `\n\n👤 *Author*: @${res.author}`
    if (res.caption) caption += `\n📝 *Caption*:\n${res.caption}`
    caption = caption.trim()

    if (res.media.length > 1) {
      await sendAlbum(conn, m.chat, res.media.map((it, i) => ({
        type: it.type === 'Video' ? 'video' : 'image',
        url: it.url,
        caption: i === 0 ? caption : ''
      })), { quoted: m })
      return await m.react('✅')
    }

    for (const item of res.media) {
      if (item.type === 'Video') {
        await conn.sendMessage(m.chat, { video: { url: item.url }, caption }, { quoted: m })
      } else {
        await conn.sendMessage(m.chat, { image: { url: item.url }, caption }, { quoted: m })
      }
      caption = ''
    }
    await m.react('✅')
  } catch (e) {
    console.log(e)
    await m.react('❌')
    m.reply(`❌ Gagal: ${e?.message || e}`)
  }
}

handler.help = ['igdl']
handler.command = ['igdl']
handler.tags = ['download']
handler.limit = true

const __plugin = wrapClassic(handler)

  return __plugin
})()

_ig.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
export default oneCommand(_ig, 'igdl')
