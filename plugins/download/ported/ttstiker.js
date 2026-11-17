/**

* Kaguya Multi Device — WhatsApp & Tele Bot
* 
* Library      : whiskeysockets baileys
* Type         : Plugins | ESM Modules
* Creator      : YannRzy Tech
* Recode       : (Your Name)
* 
* Official Channels:
* • https://whatsapp.com/channel/0029VaoMGuLA89MbfGh62V16
* 
* Copyright © YannRzy Tech 2026
* All Rights Reserved.
  */

import axios from 'axios'
import sharp from 'sharp'
import { wrapClassic, oneCommand, sendStickerPack } from '../../../lib/engine/plugins.js'

const _ttstiker = (() => {
const API_COMMENT = 'https://www.tiktok.com/api/comment/list/'
const API_REPLY = 'https://www.tiktok.com/api/comment/list/reply/'
const COUNT = 50
const MAX_PAGES = 6          // maksimal halaman komentar root yang dipindai
const MAX_REPLY_THREADS = 10 // maksimal thread balasan yang dipindai
const DEFAULT_LIMIT = 3
const MAX_LIMIT = 10

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
]
const BACKOFF = [0, 500, 1100, 2400, 4200]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms + Math.floor(Math.random() * 180)))
const pickUa = (i) => UA_POOL[(i >= 0 ? i : 0) % UA_POOL.length]

const mkHeaders = (ua, referer) => ({
  'User-Agent': ua,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
  Referer: referer || 'https://www.tiktok.com/',
  Origin: 'https://www.tiktok.com'
})

async function httpJson(url, params, referer, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await axios.get(url, {
        params,
        headers: mkHeaders(pickUa(i), referer),
        timeout: 25000,
        maxRedirects: 5,
        validateStatus: () => true
      })
      if (res.status === 200 && res.data && typeof res.data === 'object' && !Array.isArray(res.data)) {
        if ('comments' in res.data || 'has_more' in res.data || 'status_code' in res.data) return res.data
        throw new Error('bukan payload komentar')
      }
      throw new Error('HTTP ' + res.status)
    } catch {
      if (i < attempts - 1) await sleep(BACKOFF[Math.min(i + 1, BACKOFF.length - 1)])
    }
  }
  return null
}

// ───────── resolve URL ─────────
function extractVideoId(text) {
  if (!text) return null
  const patterns = [/(?:video|photo|v)\/(\d{6,})/, /item_id=(\d{6,})/, /aweme_id=(\d{6,})/, /player\/v1\/(\d{6,})/, /\/(\d{15,})/]
  for (const p of patterns) {
    const m = String(text).match(p)
    if (m) return m[1]
  }
  return null
}

async function resolveVideo(input) {
  let u
  try {
    u = new URL(/^https?:\/\//i.test(input) ? input : 'https://' + input)
  } catch {
    throw new Error('URL tidak valid')
  }
  if (!/(?:^|\.)tiktok\.com$/i.test(u.hostname)) throw new Error('URL bukan TikTok')

  let videoId = extractVideoId(u.pathname) || extractVideoId(u.search)
  let author = (u.pathname.match(/\/@([^/]+)/) || [])[1] || null

  if (!videoId) {
    // short link (vt/vm/t.tiktok.com) → ikuti redirect
    const res = await axios.get(u.toString(), {
      headers: mkHeaders(pickUa(0)),
      timeout: 30000,
      maxRedirects: 8,
      validateStatus: () => true,
      responseType: 'text'
    })
    const finalUrl = res.request?.res?.responseUrl || ''
    videoId = extractVideoId(finalUrl)
    author = author || (finalUrl.match(/\/@([^/]+)/) || [])[1] || null
    if (!videoId && typeof res.data === 'string') {
      const c = res.data.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)
      if (c) {
        videoId = extractVideoId(c[1])
        author = author || (c[1].match(/\/@([^/]+)/) || [])[1] || null
      }
      if (!videoId) {
        const m = res.data.match(/"(?:videoId|awemeId|item_id|itemId)"\s*:\s*"?(\d{15,})"?/)
        if (m) videoId = m[1]
      }
    }
  }
  if (!videoId) throw new Error('video_id tidak ditemukan dari URL')
  return { videoId, author, canonical: `https://www.tiktok.com/@${author || 'user'}/video/${videoId}` }
}

// ───────── ekstrak stiker dari komentar ─────────
function eachResolution(bucket) {
  const out = []
  if (!bucket || typeof bucket !== 'object') return out
  for (const k of ['high_resolution_url', 'mid_resolution_url', 'low_resolution_url']) {
    const node = bucket[k]
    if (node && Array.isArray(node.url_list) && typeof node.url_list[0] === 'string') out.push({ url: node.url_list[0] })
  }
  return out
}

function collectAssets(node, out, depth, originKey) {
  if (!node || typeof node !== 'object' || depth > 4 || out.length >= 24) return
  if (Array.isArray(node)) {
    for (const v of node) collectAssets(v, out, depth + 1, originKey)
    return
  }
  for (const k of Object.keys(node)) {
    let hit = originKey
    const val = node[k]
    if (val === null || val === undefined) continue
    if (k === 'animated_url' || k === 'animation_url') hit = 'animated'
    else if (['static_url', 'image_url', 'webp_url', 'high_resolution_url'].includes(k)) hit = originKey === 'animated' ? 'animated' : 'static'

    if (Array.isArray(val)) {
      const urls = val.filter((x) => typeof x === 'string' && /^https?:\/\//i.test(x))
      if (urls.length) {
        out.push({ url: urls[0], via: hit || k })
        continue
      }
    } else if (typeof val === 'string' && /^https?:\/\//i.test(val)) {
      out.push({ url: val, via: hit || k })
      continue
    } else if (typeof val === 'object') {
      const rs = eachResolution(val)
      if (rs.length) {
        for (const r of rs) out.push({ url: r.url, via: hit || k })
        continue
      }
    }
    collectAssets(val, out, depth + 1, hit)
  }
}

function extractSticker(c) {
  const holder = c.cmt_sticker_struct || c.composer_sticker || c.cmt_emote_struct || c.sticker || c.composer_emote || c.emote || c.gif_sticker || null
  if (!holder || typeof holder !== 'object') return null
  const assets = []
  collectAssets(holder, assets, 0, null)
  if (!assets.length) return null
  const animated = assets.filter((a) => a.via === 'animated' || /\.awebp|\.lottie/i.test(a.url))
  const statics = assets.filter((a) => a.via !== 'animated' && !/\.awebp/i.test(a.url))
  const pool = animated.length ? animated : statics
  return {
    url: pool[0].url,
    animated: animated.length > 0,
    name: holder.name || holder.sticker_display_name || null
  }
}

// ───────── pindai komentar ─────────
async function scanStickers(videoId, referer, limit) {
  const found = []
  const seenCid = new Set()
  const seenUrl = new Set()
  const threads = []
  let scanned = 0

  const inspect = (c, isRoot) => {
    if (!c || c.cid === undefined || c.cid === null) return
    const cid = String(c.cid)
    if (seenCid.has(cid)) return
    seenCid.add(cid)
    scanned++
    if (isRoot && Number(c.reply_comment_total) > 0) threads.push(cid)
    const st = extractSticker(c)
    if (!st || seenUrl.has(st.url)) return
    seenUrl.add(st.url)
    found.push({ ...st, user: c.user?.unique_id || c.user?.nickname || null })
  }

  let cursor = 0
  let hasMore = true
  let fail = 0
  let pages = 0
  while (hasMore && pages < MAX_PAGES && found.length < limit) {
    const page = await httpJson(API_COMMENT, { aid: 1988, aweme_id: videoId, count: COUNT, cursor }, referer)
    if (!page) {
      if (++fail >= 2) break
      cursor += COUNT
      continue
    }
    if (page.status_code === 10204) throw new Error('TikTok minta verifikasi, coba lagi nanti')
    fail = 0
    pages++
    for (const c of page.comments || []) inspect(c, true)
    const nc = Number(page.cursor)
    cursor = Number.isFinite(nc) && nc > cursor ? nc : cursor + COUNT
    hasMore = page.has_more === 1 || page.has_more === true
    await sleep(220)
  }

  for (const cid of threads.slice(0, MAX_REPLY_THREADS)) {
    if (found.length >= limit) break
    let rc = 0
    let more = true
    let tries = 0
    while (more && tries < 3 && found.length < limit) {
      const page = await httpJson(API_REPLY, { aid: 1988, item_id: videoId, comment_id: cid, count: COUNT, cursor: rc }, referer, 3)
      if (!page) {
        tries++
        rc += COUNT
        continue
      }
      for (const c of page.comments || []) inspect(c, false)
      const nc = Number(page.cursor)
      rc = Number.isFinite(nc) && nc > rc ? nc : rc + COUNT
      more = page.has_more === 1 || page.has_more === true
    }
    await sleep(180)
  }

  return { stickers: found.slice(0, limit), scanned }
}

// ───────── unduh + konversi ─────────
function detectFormat(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return 'unknown'
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  if (buf.toString('ascii', 0, 4) === 'GIF8') return 'gif'
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png'
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpeg'
  return 'unknown'
}

async function download(url, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await axios.get(url, {
        headers: mkHeaders(pickUa(i)),
        timeout: 40000,
        maxRedirects: 5,
        responseType: 'arraybuffer',
        validateStatus: () => true
      })
      const ct = String(res.headers?.['content-type'] || '').toLowerCase()
      if (res.status === 200 && res.data?.length && !ct.includes('text/html')) return Buffer.from(res.data)
    } catch {}
    if (i < attempts - 1) await sleep(BACKOFF[i + 1] + 400)
  }
  return null
}

async function toStickerWebp(buf) {
  const fmt = detectFormat(buf)
  if (fmt === 'webp') return buf // sudah webp (termasuk animasi), kirim apa adanya
  return sharp(buf, { animated: fmt === 'gif' })
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp()
    .toBuffer()
}

// ───────── handler ─────────
let handler = async (m, { conn, text, usedPrefix, command }) => {
  const input = (m.quoted?.text || text || '').trim()
  const parts = input.split(/\s+/).filter(Boolean)
  const url = parts.find((p) => /tiktok\.com/i.test(p)) || parts[0]
  const numArg = parts.find((p) => /^\d{1,2}$/.test(p))

  if (!url) {
    return m.reply(
      `*TikTok Stiker Komentar*\n\n` +
      `Ambil stiker yang dikirim orang di kolom komentar video TikTok (support animasi).\n\n` +
      `Contoh:\n${usedPrefix + command} https://vt.tiktok.com/xxxx\n${usedPrefix + command} https://vt.tiktok.com/xxxx 5\n\n` +
      `Jumlah default ${DEFAULT_LIMIT}, maksimal ${MAX_LIMIT}.`
    )
  }

  const limit = Math.min(Math.max(parseInt(numArg || DEFAULT_LIMIT, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT)

  await m.react('🕕')
  try {
    const video = await resolveVideo(url)
    const { stickers, scanned } = await scanStickers(video.videoId, video.canonical, limit)

    if (!stickers.length) {
      await m.react('❌')
      return m.reply(`Tidak ada stiker di komentar yang berhasil dipindai (${scanned} komentar). Coba video lain.`)
    }

    // download + konversi semua → kirim sebagai 1 sticker pack
    const bufs = []
    for (const st of stickers.slice(0, 30)) {
      const buf = await download(st.url)
      if (!buf) continue
      try { bufs.push(await toStickerWebp(buf)) } catch {}
    }
    const sent = bufs.length
    if (!sent) throw new Error('semua stiker gagal diunduh')
    await sendStickerPack(conn, m.chat, bufs, m, {
      name: 'TikTok Stiker',
      publisher: global.namebot || 'Bot',
      description: `Stiker komentar TikTok (${sent})`,
      emojis: ['😀']
    })
    await m.reply(`✅ ${sent} stiker dari ${scanned} komentar dipindai.`)
    await m.react('✅')
  } catch (e) {
    await m.react('❌')
    throw String(e?.message || e)
  }
}

handler.help = ['ttstiker <url tiktok> [jumlah]']
handler.tags = ['download']
handler.command = ['ttstiker']
handler.limit = true

const __plugin = wrapClassic(handler)

  return __plugin
})()

_ttstiker.tags = ['download']

// satu command = nama file
export default oneCommand(_ttstiker, 'ttstiker')
