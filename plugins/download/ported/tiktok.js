// ───────── tiktok ─────────
// Engine diganti ke versi .tiktokall (resolve link pendek + TikWM + fallback SSR parser).
// Perilaku tetap: kirim video / slide foto, lalu kirim MP3. Pencarian kata kunci tetap ada.

import axios from 'axios'
import * as cheerio from 'cheerio'
import { wrapClassic, oneCommand, sendAlbum } from '../../../lib/engine/plugins.js'

const _tiktok = (() => {

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
const HEADERS = {
  'User-Agent': DESKTOP_UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
}
const MAX_SLIDES = 10

// ───────── helper ─────────
async function resolveUrl(raw) {
  let url = String(raw || '').trim()
  const mt = url.match(/https?:\/\/[^\s]+/)
  if (!mt) throw new Error('Link TikTok tidak valid.')
  url = mt[0]

  if (/(vt|vm)\.tiktok\.com/.test(url)) {
    try {
      const res = await axios.get(url, {
        headers: HEADERS, maxRedirects: 5, timeout: 10000,
        validateStatus: (s) => s >= 200 && s < 400
      })
      url = res.request?.res?.responseUrl || res.headers?.location || url
    } catch (e) {
      if (e.response?.headers?.location) url = e.response.headers.location
    }
  }
  return url.split('?')[0].replace(/\/$/, '')
}

function deepFind(root, predicate, max = 10) {
  const out = []
  const seen = new Set()
  const walk = (node) => {
    if (!node || typeof node !== 'object' || seen.has(node) || out.length >= max) return
    seen.add(node)
    try { if (predicate(node)) out.push(node) } catch {}
    for (const k of Object.keys(node)) walk(node[k])
  }
  walk(root)
  return out
}

function jsonBlocks(html) {
  if (!html) return []
  const $ = cheerio.load(html)
  const blocks = []
  $('script').each((_, el) => {
    const raw = $(el).html()?.trim()
    if (!raw) return
    if (raw.startsWith('{') && raw.endsWith('}')) {
      try { blocks.push(JSON.parse(raw)); return } catch {}
    }
    for (const mt of raw.match(/(=|const|let|var)\s*({[\s\S]*?});/g) || []) {
      try { blocks.push(JSON.parse(mt.replace(/^[^{]*/, '').replace(/;$/, ''))) } catch {}
    }
  })
  return blocks
}

function parseSsr(html) {
  for (const block of jsonBlocks(html)) {
    const nodes = deepFind(block, (n) =>
      (n.video && n.author) || (n.imagePost && n.author) || (n.aweme_id && n.video) || n.itemStruct?.video)
    if (!nodes.length) continue

    let item = nodes[0]
    if (item.itemStruct) item = item.itemStruct

    const a = item.author || {}
    const author = {
      uniqueId: a.uniqueId || a.unique_id || a.shortId || '',
      nickname: a.nickname || a.uniqueId || ''
    }
    const mu = item.music || {}
    const music = {
      title: mu.title || 'Original Sound',
      author: mu.authorName || mu.author || author.nickname,
      playUrl: mu.playUrl || mu.play_url?.url_list?.[0] || null
    }
    const s = item.stats || item.statsV2 || item.statistics || {}
    const base = {
      id: item.id || item.aweme_id || '',
      description: item.desc || item.title || '',
      author, music,
      views: Number(s.playCount || s.play_count || 0),
      audioUrl: music.playUrl
    }

    const rawImages = item.imagePost?.images || item.image_post_info?.images || item.images
    if (Array.isArray(rawImages) && rawImages.length) {
      const images = rawImages
        .map((img) => typeof img === 'string' ? img :
          (img.imageURL?.urlList || img.displayImage?.urlList || img.urlList || [])[0] || '')
        .filter(Boolean)
      return { ...base, type: 'photo', images, videoUrl: null }
    }

    const v = item.video || {}
    let videoUrl = v.playAddr || v.play_addr?.url_list?.[0] || v.downloadAddr || null
    if (Array.isArray(v.bitrateInfo)) {
      const best = [...v.bitrateInfo].sort((x, y) => (y.Bitrate || 0) - (x.Bitrate || 0))[0]
      const list = best?.PlayAddr?.UrlList || []
      videoUrl = list.find((u) => u.includes('aweme/v1/play')) || list[0] || videoUrl
    }
    return { ...base, type: 'video', images: [], videoUrl, duration: v.duration || 0 }
  }
  return null
}

// TikWM: coba host tanpa www dulu, lalu www (pakai Origin/Referer biar tidak 403)
async function tikwmGet(path, params) {
  let lastErr
  for (const host of ['https://tikwm.com', 'https://www.tikwm.com']) {
    try {
      const res = await axios.get(`${host}${path}`, {
        params,
        headers: {
          'User-Agent': DESKTOP_UA,
          Accept: 'application/json, text/plain, */*',
          Origin: host,
          Referer: `${host}/`
        },
        timeout: 20000
      })
      if (res.data && res.data.code === 0) return res
      lastErr = new Error(res.data?.msg || 'Respon TikWM tidak valid.')
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

async function tikwm(url) {
  const res = await tikwmGet('/api/', { url, hd: 1 })
  const d = res.data?.data
  if (!d) throw new Error(res.data?.msg || 'Data kosong dari TikWM.')
  const abs = (u) => !u ? null : /^https?:/.test(u) ? u : `https://www.tikwm.com${u}`
  const isPhoto = Array.isArray(d.images) && d.images.length > 0
  return {
    type: isPhoto ? 'photo' : 'video',
    description: d.title || '',
    author: { uniqueId: d.author?.unique_id || '', nickname: d.author?.nickname || '' },
    music: {
      title: d.music_info?.title || 'Original Sound',
      author: d.music_info?.author || d.author?.nickname || ''
    },
    views: Number(d.play_count || 0),
    duration: d.duration || 0,
    videoUrl: isPhoto ? null : abs(d.hdplay || d.play),
    images: isPhoto ? d.images : [],
    audioUrl: abs(d.music_info?.play || d.music)
  }
}

async function extractTikTok(input) {
  const url = await resolveUrl(input)
  let tikwmErr = null
  try {
    return { ...(await tikwm(url)), url }
  } catch (e) {
    tikwmErr = e
  }
  try {
    const res = await axios.get(url, { headers: HEADERS, timeout: 15000 })
    const p = parseSsr(res.data)
    const cookie = (res.headers?.['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ')
    if (p && (p.videoUrl || p.images?.length)) return { ...p, url, cookie }
  } catch {}
  throw new Error(`Gagal mengekstrak media: ${tikwmErr?.message || 'konten tidak ditemukan / private.'}`)
}

async function searchTikTok(query) {
  const res = await tikwmGet('/api/feed/search', { keywords: query, count: 1 })
  const v = res.data?.data?.videos?.[0]
  if (!v) throw new Error('Hasil tidak ditemukan')
  return `https://www.tiktok.com/@${v.author.unique_id}/video/${v.video_id}`
}

// unduh jadi buffer (CDN TikTok butuh Referer; file TikWM butuh Referer tikwm)
async function getBuffer(url, cookie) {
  const isTikwm = /tikwm\.com/.test(url)
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: {
      'User-Agent': DESKTOP_UA,
      Referer: isTikwm ? 'https://www.tikwm.com/' : 'https://www.tiktok.com/',
      ...(cookie ? { Cookie: cookie } : {})
    },
    timeout: 60000,
    maxContentLength: 100 * 1024 * 1024
  })
  return Buffer.from(res.data)
}

// ───────── handler ─────────
let handler = async (m, { conn, text, usedPrefix, command }) => {
  await m.react('✨')

  const input = (m.quoted ? m.quoted.text : text)?.trim()
  if (!input) {
    return m.reply(
      `Contoh:\n` +
      `${usedPrefix + command} https://vt.tiktok.com/xxxx\n` +
      `${usedPrefix + command} kaguya edit`
    )
  }

  try {
    const url = /https?:\/\//i.test(input) ? input : await searchTikTok(input)
    const r = await extractTikTok(url)

    const title = (r.description || '-').replace(/\s+/g, ' ').trim()
    const uploader = r.author?.nickname || r.author?.uniqueId || '-'
    const caption = `
— DOWNLOADER TIKTOK —

❀ Judul : ${title.length > 80 ? title.slice(0, 80) + '...' : title}
❀ Uploader : ${uploader}
❀ Durasi : ${formatDuration(r.duration)}
❀ Views : ${formatNumber(r.views)}
`.trim()

    // ── slide foto ──
    if (r.type === 'photo' && r.images?.length) {
      const imgs = r.images.slice(0, MAX_SLIDES)
      const bufs = []
      for (const img of imgs) {
        const image = await getBuffer(img, r.cookie).catch(() => null)
        if (image) bufs.push(image)
      }
      if (!bufs.length) throw new Error('Gagal mengunduh foto slide.')

      const cap = (i) => i === 0 ? `${caption}\n\n🖼️ Slide ${r.images.length} foto` : `Slide ${i + 1}/${r.images.length}`

      await sendAlbum(conn, m.chat, bufs.map((buffer, i) => ({ type: 'image', buffer, caption: cap(i) })), { quoted: m })
    } else {
      // ── video ──
      if (!r.videoUrl) throw new Error('URL video tidak ditemukan.')
      const video = await getBuffer(r.videoUrl, r.cookie)
      await conn.sendMessage(m.chat, { video, mimetype: 'video/mp4', caption }, { quoted: m })
    }

    // ── mp3 (tetap dikirim) ──
    if (r.audioUrl) {
      try {
        const audio = await getBuffer(r.audioUrl, r.cookie)
        await conn.sendMessage(m.chat, { audio, mimetype: 'audio/mpeg' }, { quoted: m })
      } catch {
        await conn.sendMessage(m.chat, { audio: { url: r.audioUrl }, mimetype: 'audio/mpeg' }, { quoted: m })
      }
    }

    await m.react('✅')
  } catch (e) {
    await m.react('❌')
    throw String(e?.message || e)
  }
}

handler.help = ['tt', 'tiktok']
handler.tags = ['download']
handler.command = ['tt']
handler.limit = true
handler.register = false

const __plugin = wrapClassic(handler)

function formatNumber(num = 0) {
  return Number(num).toLocaleString()
}

function formatDuration(sec = 0) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = Math.floor(sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

  return __plugin
})()

_tiktok.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file; command lain jadi sub-command
export default oneCommand(_tiktok, 'tiktok')
