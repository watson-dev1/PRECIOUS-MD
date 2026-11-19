// ───────── douyin downloader ─────────
// Sumber: snapdouyin.app
import { wrapPlugin } from '../../../lib/engine/plugins.js'

const BASE = 'https://snapdouyin.app'
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const calculateHash = (url, salt) =>
  Buffer.from(url).toString('base64') + (url.length + 1000) + Buffer.from(salt).toString('base64')

const parseCookies = (list) => (list?.length ? list.map(c => c.split(';')[0]).join('; ') : '')

async function getSessionAndToken() {
  const res = await fetch(BASE + '/', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) })
  const html = await res.text()
  const cookie = parseCookies(res.headers.getSetCookie?.() || [])
  const match = html.match(/id="token"[^>]*value="([^"]+)"/)
  if (!match) throw new Error('Token was not found on the page')
  return { cookie, token: match[1] }
}

async function getVideoData(videoUrl, retries = 2) {
  let lastErr
  for (let i = 0; i <= retries; i++) {
    try {
      const { cookie: initialCookie, token } = await getSessionAndToken()
      const body = new URLSearchParams({
        url: videoUrl,
        token,
        hash: calculateHash(videoUrl, 'aio-dl')
      })

      const res = await fetch(BASE + '/wp-json/mx-downloader/video-data/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: BASE,
          Referer: BASE + '/',
          Cookie: initialCookie,
          'User-Agent': UA
        },
        body,
        signal: AbortSignal.timeout(30000)
      })

      if (!res.ok) throw new Error(`video-data request failed (status ${res.status})`)

      const newCookie = parseCookies(res.headers.getSetCookie?.() || [])
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      data._cookie = newCookie || initialCookie
      return data
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

async function downloadMedia(mediaUrl, cookie) {
  const res = await fetch(mediaUrl + (mediaUrl.includes('?') ? '&' : '?') + 'bandwidth_saving=1', {
    headers: {
      accept: '*/*',
      'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      Cookie: cookie,
      'User-Agent': UA
    },
    signal: AbortSignal.timeout(60000)
  })
  if (!res.ok) throw new Error(`download failed (status ${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}

const pluginConfig = {
  name: 'douyin',
  alias: [],
  category: 'download',
  description: 'Download video Douyin',
  usage: '.douyin <url> [nomor kualitas]',
  example: '.douyin https://v.douyin.com/xxxx',
  isOwner: false,
  isPremium: false,
  isGroup: false,
  isPrivate: false,
  cooldown: 10,
  energi: 1,
  isEnabled: true
}

async function handler(m, { sock }) {
  const args = String(m.text || m.quoted?.text || '').trim().split(/\s+/).filter(Boolean)
  const url = args.find(a => /^https?:\/\//i.test(a))
  const idxArg = args.find(a => /^\d+$/.test(a))

  if (!url) {
    m.react('❌')
    return m.reply(
      `📌 Example:\n*${m.prefix + m.command} https://v.douyin.com/xxxx*\n` +
      `*${m.prefix + m.command} https://v.douyin.com/xxxx 2* (select quality)`
    )
  }

  m.react('🕕')
  try {
    const data = await getVideoData(url)
    const medias = Array.isArray(data.medias) ? data.medias : []
    if (!medias.length) throw new Error('Media was not found')

    let media
    if (idxArg !== undefined) {
      media = medias[Number(idxArg) - 1]
      if (!media) {
        const list = medias.map((x, i) => `${i + 1}. ${x.quality} (${x.extension}${x.formattedSize ? ', ' + x.formattedSize : ''})`).join('\n')
        return m.reply(`❌ Invalid quality number.\n\n*Options:*\n${list}`)
      }
    } else {
      media = medias.find(x => /mp4/i.test(x.extension)) || medias[0]
    }

    const buffer = await downloadMedia(media.url, data._cookie)
    const caption =
      `🎬 *DOUYIN DOWNLOADER*\n\n` +
      `- Judul: ${data.title || '-'}\n` +
      `- Durasi: ${data.duration || '-'}\n` +
      `- Kualitas: ${media.quality || '-'}\n` +
      `- Ukuran: ${media.formattedSize || '-'}`

    const ext = String(media.extension || 'mp4').toLowerCase()
    if (/^(mp4|mov|webm)$/.test(ext)) {
      await sock.sendMessage(m.chat, { video: buffer, mimetype: 'video/mp4', caption }, { quoted: m })
    } else if (/^(mp3|m4a|aac)$/.test(ext)) {
      await sock.sendMessage(m.chat, { audio: buffer, mimetype: 'audio/mpeg' }, { quoted: m })
    } else if (/^(jpg|jpeg|png|webp)$/.test(ext)) {
      await sock.sendMessage(m.chat, { image: buffer, caption }, { quoted: m })
    } else {
      await sock.sendMessage(m.chat, { document: buffer, mimetype: 'application/octet-stream', fileName: `douyin-${Date.now()}.${ext}`, caption }, { quoted: m })
    }

    if (idxArg === undefined && medias.length > 1) {
      const list = medias.map((x, i) => `${i + 1}. ${x.quality} (${x.extension})`).join('\n')
      await m.reply(`💡 Kualitas lain:\n${list}\n\nUse: *${m.prefix + m.command} <url> <number>*`)
    }
    m.react('✅')
  } catch (e) {
    console.error('[Douyin] Error:', e)
    m.react('❌')
    m.reply(`❌ *Download failed*\n\n> ${e.message}`)
  }
}

const __limitedPlugin = wrapPlugin(pluginConfig, handler)
__limitedPlugin.limit = true
export default __limitedPlugin