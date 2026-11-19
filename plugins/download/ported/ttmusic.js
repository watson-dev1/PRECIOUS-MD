// ───────── ttmusic ─────────
// Dipecah dari plugins/download/tiktok.js (dulu digabung dengan fitur lain dalam satu file)

import axios from 'axios'
import { wrapClassic, oneCommand } from '../../../lib/engine/plugins.js'

const _ttmusic = (() => {
async function searchTikTok(query) {
  const { data } = await axios.get(
    'https://tikwm.com/api/feed/search',
    {
      params: {
        keywords: query,
        count: 1
      },
      timeout: 20000
    }
  )

  if (!data || data.code !== 0 || !data.data?.videos?.length) {
    throw 'No results found'
  }

  const v = data.data.videos[0]
  return `https://www.tiktok.com/@${v.author.unique_id}/video/${v.video_id}`
}

async function getTikTok(url) {
  const { data } = await axios.get(
    'https://tikwm.com/api/',
    {
      params: { url, hd: 1 },
      timeout: 20000
    }
  )

  if (!data || data.code !== 0) {
    throw 'Failed to retrieve TikTok data'
  }

  return data.data
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  await m.react('🎵')

  const input = m.quoted ? m.quoted.text : text

  if (!input) {
    return m.reply(
      `Example:\n` +
      `${usedPrefix + command} https://vt.tiktok.com/xxxx\n` +
      `${usedPrefix + command} kurumi edit`
    )
  }

  try {
    let url = input

    if (!/^https?:\/\//i.test(input)) {
      url = await searchTikTok(input)
    }

    const res = await getTikTok(url)

    if (!res.music) {
      throw 'Audio TikTok was not found'
    }

    const title = (res.title || '-').replace(/\s+/g, ' ').trim()
    const uploader = res.author?.nickname || res.author?.unique_id || '-'
    const duration = formatDuration(res.duration)

    const caption = `
— TIKTOK MUSIC —

❀ Judul : ${title.length > 80 ? title.slice(0, 80) + '...' : title}
❀ Uploader : ${uploader}
❀ Durasi : ${duration}
`.trim()

    await conn.sendMessage(
      m.chat,
      {
        audio: { url: res.music },
        mimetype: 'audio/mpeg',
        fileName: `${title}.mp3`
      },
      { quoted: m }
    )

    await m.reply(caption)
    await m.react('✅')
  } catch (e) {
    await m.react('❌')
    throw String(e)
  }
}

handler.help = ['tiktokmusic', 'ttmusic', 'ttmp3']
handler.tags = ['download']
handler.command = ['ttmusic']
handler.limit = true

const __plugin = wrapClassic(handler)
function formatDuration(sec = 0) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = Math.floor(sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

  return __plugin
})()

_ttmusic.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
export default oneCommand(_ttmusic, 'ttmusic')
