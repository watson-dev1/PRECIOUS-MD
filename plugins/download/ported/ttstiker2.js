/**

* Kaguya Multi Device — WhatsApp & Tele Bot
* 
* Library      : whiskeysockets baileys
* Type         : Plugins | ESM Modules
* Creator      : YannRzy Tech
* Recode       : (Your Name)
* 
* Developer Channels:
* • https://whatsapp.com/channel/0029VaoMGuLA89MbfGh62V16
*
* Info Update Kaguya Channels:
* • https://whatsapp.com/channel/0029VabymHd4CrfnqPLPzk3n
* 
* Copyright © YannRzy Tech 2026
* All Rights Reserved.
  */

import axios from 'axios'
import { reactTo } from '../../../lib/core/file.js'
import { sendStickerPack } from '../../../lib/engine/plugins.js'

// ════════════════════════════════════════════════════════════
// KONFIGURASI
// ════════════════════════════════════════════════════════════
const API_COMMENT = 'https://www.tiktok.com/api/comment/list/'
const API_REPLY   = 'https://www.tiktok.com/api/comment/list/reply/'
const COUNT       = 50

const DEFAULT_PACK  = 30          // isi pack default
const HARD_MAX_PACK = 60          // batas isi pack
const MAX_ROOT_PAGES = 60         // maks halaman komentar utama (60 x 50)
const MAX_REPLY_THREADS = 60      // maks thread balasan yang dibuka
const SCAN_BUDGET_MS = 75_000     // batas waktu nyari stiker
const REQUEST_DELAY = 220

const LIMIT_STATIC = 900_000      // target ukuran stiker statis (byte)
const LIMIT_ANIM   = 500_000      // target ukuran stiker animasi (byte)
const HARD_BYTES   = 1_000_000    // batas keras ukuran stiker = 1 MB

const EMOJIS = ['😀', '😂', '😍', '🔥', '👍', '🎉', '😎', '🤩', '💯', '🥳']
const BACKOFF = [0, 500, 1100, 2400, 4200, 7600]

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
]

const activeChats = new Set()

// ════════════════════════════════════════════════════════════
// HELPER UMUM
// ════════════════════════════════════════════════════════════
const sleep = (ms) => new Promise((r) => setTimeout(r, ms + Math.floor(Math.random() * 180)))
const pickUa = (i) => UA_POOL[(i >= 0 ? i : 0) % UA_POOL.length]

function mkHeaders(ua, referer) {
  return {
    'User-Agent': ua,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
    'Referer': referer || 'https://www.tiktok.com/',
    'Origin': 'https://www.tiktok.com',
  }
}

let _sharp
async function getSharp() {
  if (_sharp !== undefined) return _sharp
  try {
    const mod = await import('sharp')
    _sharp = mod.default || mod
  } catch {
    _sharp = null
  }
  return _sharp
}

// ════════════════════════════════════════════════════════════
// SCRAPER: HTTP
// ════════════════════════════════════════════════════════════
async function httpJson(url, params, referer, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await axios.get(url, {
        params,
        headers: mkHeaders(pickUa(i), referer),
        timeout: 25000,
        maxRedirects: 5,
        validateStatus: () => true,
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

async function downloadAsset(url, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await axios.get(url, {
        headers: mkHeaders(pickUa(i), 'https://www.tiktok.com/'),
        timeout: 40000,
        maxRedirects: 5,
        maxContentLength: 8 * 1024 * 1024,
        responseType: 'arraybuffer',
        validateStatus: () => true,
      })
      const ct = String(res.headers?.['content-type'] || '').toLowerCase()
      if (res.status === 200 && res.data && res.data.length > 0 && !ct.includes('text/html')) {
        return Buffer.from(res.data)
      }
      throw new Error('HTTP ' + res.status)
    } catch {
      if (i < attempts - 1) await sleep(BACKOFF[Math.min(i + 1, BACKOFF.length - 1)] + 400)
    }
  }
  return null
}

// ════════════════════════════════════════════════════════════
// SCRAPER: RESOLVE URL
// ════════════════════════════════════════════════════════════
function isTiktokHost(hostname) {
  return /(?:^|\.)tiktok\.com$/i.test(hostname)
}

function extractVideoId(text) {
  if (!text) return null
  const patterns = [/(?:video|photo|v)\/(\d{6,})/, /item_id=(\d{6,})/, /aweme_id=(\d{6,})/, /player\/v1\/(\d{6,})/, /\/(\d{15,})/]
  for (const p of patterns) {
    const m = String(text).match(p)
    if (m) return m[1]
  }
  return null
}

async function resolveTikTokUrl(input) {
  let u
  try {
    u = new URL(/^https?:\/\//i.test(input) ? input : 'https://' + input)
  } catch {
    throw new Error('Invalid URL')
  }
  if (!isTiktokHost(u.hostname)) throw new Error('The URL is not from TikTok')

  let videoId = extractVideoId(u.pathname) || extractVideoId(u.search)
  let author = (u.pathname.match(/\/@([^/]+)/) || [])[1] || null

  const direct = videoId && /\/(video|photo|player)\//.test(u.pathname)
  if (!direct) {
    // short link (vt/vm) → ikuti redirect
    try {
      const res = await axios.get(u.toString(), {
        headers: mkHeaders(pickUa(0), 'https://www.tiktok.com/'),
        timeout: 30000,
        maxRedirects: 8,
        validateStatus: () => true,
        responseType: 'text',
      })
      const finalUrl = res.request?.res?.responseUrl || null
      const html = typeof res.data === 'string' ? res.data : ''
      if (finalUrl) {
        videoId = videoId || extractVideoId(finalUrl)
        author = author || (finalUrl.match(/\/@([^/?]+)/) || [])[1] || null
      }
      if (!videoId && html) {
        const can = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
          || html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)
        if (can) {
          videoId = extractVideoId(can[1])
          author = author || (can[1].match(/\/@([^/?]+)/) || [])[1] || null
        }
        if (!videoId) {
          const m = html.match(/"(?:videoId|vid|awemeId|item_id|itemId)"\s*:\s*"?(\d{15,})"?/)
          if (m) videoId = m[1]
        }
      }
    } catch { /* lanjut, dicek di bawah */ }
  }

  if (!videoId) throw new Error('video_id was not found in that link')
  return {
    videoId,
    author,
    canonical: `https://www.tiktok.com/@${author || 'user'}/video/${videoId}`,
  }
}

async function fetchVideoInfo(videoId) {
  const info = { title: null, author: null }
  try {
    const res = await axios.get('https://www.tiktok.com/oembed', {
      params: { url: `https://www.tiktok.com/@user/video/${videoId}` },
      headers: mkHeaders(UA_POOL[0], 'https://www.tiktok.com/'),
      timeout: 20000,
      validateStatus: () => true,
    })
    if (res.status === 200 && res.data && typeof res.data === 'object') {
      info.title = res.data.title || null
      info.author = (res.data.author_name || '').replace(/\s+/g, '').toLowerCase() || null
    }
  } catch { /* oembed opsional */ }
  return info
}

// ════════════════════════════════════════════════════════════
// SCRAPER: EKSTRAK STIKER DARI KOMENTAR
// ════════════════════════════════════════════════════════════
function eachResolution(bucket) {
  const out = []
  if (!bucket || typeof bucket !== 'object') return out
  for (const k of ['high_resolution_url', 'mid_resolution_url', 'low_resolution_url']) {
    const node = bucket[k]
    if (node && typeof node === 'object' && Array.isArray(node.url_list) && typeof node.url_list[0] === 'string') {
      out.push({ url: node.url_list[0] })
    }
  }
  return out
}

function collectAssets(node, out, depth, originKey) {
  if (!node || typeof node !== 'object' || depth > 4) return
  if (out.length >= 24) return
  if (Array.isArray(node)) {
    for (const v of node) collectAssets(v, out, depth + 1, originKey)
    return
  }
  for (const k of Object.keys(node)) {
    if (node[k] === null || node[k] === undefined) continue
    let hitKey = originKey
    if (k === 'animated_url' || k === 'animation_url') hitKey = 'animated'
    else if (['static_url', 'image_url', 'webp_url', 'high_resolution_url'].includes(k)) hitKey = originKey === 'animated' ? 'animated' : 'static'

    if (Array.isArray(node[k])) {
      const urls = node[k].filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u))
      if (urls.length) {
        out.push({ url: urls[0], via: hitKey || k })
        continue
      }
    } else if (typeof node[k] === 'string' && /^https?:\/\//i.test(node[k])) {
      out.push({ url: node[k], via: hitKey || k })
      continue
    } else if (typeof node[k] === 'object') {
      const rs = eachResolution(node[k])
      if (rs.length) {
        for (const r of rs) out.push({ url: r.url, via: hitKey || k })
        continue
      }
    }
    collectAssets(node[k], out, depth + 1, hitKey)
  }
}

function extractStickerFromComment(c) {
  const holder = c.cmt_sticker_struct || c.composer_sticker || c.cmt_emote_struct || c.sticker
    || c.composer_emote || c.emote || c.gif_sticker || null
  if (!holder || typeof holder !== 'object') return null
  const assets = []
  collectAssets(holder, assets, 0, null)
  if (!assets.length) return null

  const animated = assets.filter((a) => a.via === 'animated' || /\.awebp|\.lottie/i.test(a.url))
  const statics = assets.filter((a) => a.via !== 'animated' && !/\.awebp/i.test(a.url))
  const pool = animated.length ? animated : statics
  const best = pool[0]
  if (!best?.url) return null

  const id = String(holder.id ?? holder.sticker_id ?? holder.emote_id ?? '') || null
  return { id, url: best.url, animatedHint: animated.length > 0 }
}

// ════════════════════════════════════════════════════════════
// SCRAPER: SCAN KOMENTAR (root + balasan)
// ════════════════════════════════════════════════════════════
async function scrapeCommentStickers(inputUrl, { cap, scanReplies }) {
  const t0 = Date.now()
  const timeUp = () => Date.now() - t0 > SCAN_BUDGET_MS

  const resolved = await resolveTikTokUrl(inputUrl)
  const info = await fetchVideoInfo(resolved.videoId)
  const referer = resolved.canonical

  const found = new Map()       // key (sticker_id || url) → { url, animatedHint }
  const seen = new Set()
  const threads = []
  let scanned = 0
  let verification = false

  const inspect = (c, parentCid) => {
    if (!c || c.cid === undefined || c.cid === null) return
    const cid = String(c.cid)
    if (seen.has(cid)) return
    seen.add(cid)
    scanned++
    if (parentCid == null && Number(c.reply_comment_total) > 0) threads.push(cid)
    const st = extractStickerFromComment(c)
    if (!st) return
    const key = st.id || st.url
    if (!found.has(key)) found.set(key, { url: st.url, animatedHint: st.animatedHint })
  }

  // ── komentar utama ──
  let cursor = 0
  let hasMore = true
  let pages = 0
  let fail = 0
  while (hasMore && pages < MAX_ROOT_PAGES && found.size < cap && !timeUp()) {
    const page = await httpJson(API_COMMENT, { aid: 1988, aweme_id: resolved.videoId, count: COUNT, cursor }, referer)
    if (!page) {
      if (++fail >= 3) break
      cursor += COUNT
      continue
    }
    fail = 0
    if (page.status_code === 10204) { verification = true; break }
    const list = Array.isArray(page.comments) ? page.comments : []
    for (const c of list) inspect(c, null)
    pages++
    const nc = Number(page.cursor)
    cursor = Number.isFinite(nc) && nc > cursor ? nc : cursor + COUNT
    hasMore = page.has_more === 1 || page.has_more === true
    if (!list.length) break
    await sleep(REQUEST_DELAY)
  }

  // ── balasan (kalau stiker belum cukup) ──
  if (scanReplies && !verification) {
    for (let i = 0; i < Math.min(threads.length, MAX_REPLY_THREADS); i++) {
      if (found.size >= cap || timeUp()) break
      let rc = 0
      let more = true
      let jail = 0
      while (more && jail < 3 && found.size < cap && !timeUp()) {
        const page = await httpJson(API_REPLY, { aid: 1988, item_id: resolved.videoId, comment_id: threads[i], count: COUNT, cursor: rc }, referer, 4)
        if (!page) { jail++; rc += COUNT; continue }
        const list = Array.isArray(page.comments) ? page.comments : []
        for (const c of list) inspect(c, threads[i])
        const n = Number(page.cursor)
        rc = Number.isFinite(n) && n > rc ? n : rc + COUNT
        more = page.has_more === 1 || page.has_more === true
        if (!list.length) break
      }
      await sleep(Math.min(REQUEST_DELAY, 180))
    }
  }

  return {
    video: { id: resolved.videoId, url: resolved.canonical, author: resolved.author || info.author, title: info.title },
    stickers: [...found.values()],
    scanned,
    verification,
  }
}

// ════════════════════════════════════════════════════════════
// KONVERSI KE WEBP STIKER
// ════════════════════════════════════════════════════════════
function isWebp(b) {
  return b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP'
}

function isAnimatedWebp(b) {
  if (!isWebp(b)) return false
  let off = 12
  while (off < b.length - 8) {
    const tag = b.toString('ascii', off, off + 4)
    const size = b.readUInt32LE(off + 4)
    if ((tag === 'VP8X' && (b[off + 8] & 0x02) !== 0) || tag === 'ANIM' || tag === 'ANMF') return true
    off += 8 + size + (size % 2)
  }
  return false
}

function sniff(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 16) return { format: 'unknown', animated: false }
  if (isWebp(buf)) return { format: 'webp', animated: isAnimatedWebp(buf) }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return { format: 'gif', animated: true }
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { format: 'png', animated: buf.includes(Buffer.from('acTL')) }
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) return { format: 'jpeg', animated: false }
  return { format: 'unknown', animated: false }
}

async function toStickerWebp(buf) {
  const det = sniff(buf)
  if (det.format === 'unknown') return null
  const sharp = await getSharp()

  if (sharp) {
    try {
      const target = det.animated ? LIMIT_ANIM : LIMIT_STATIC
      let best = null
      for (const q of det.animated ? [80, 60, 45, 30] : [90, 75, 55]) {
        const out = await sharp(buf, { animated: det.animated })
          .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .webp({ quality: q, effort: 3, loop: 0 })
          .toBuffer()
        if (!best || out.length < best.length) best = out
        if (out.length <= target) break
      }
      if (best && best.length <= HARD_BYTES) return { buf: best, animated: isAnimatedWebp(best) }
    } catch { /* fallback ke file asli di bawah */ }
  }

  if (det.format === 'webp' && buf.length <= HARD_BYTES) return { buf, animated: det.animated }
  return null
}

// ════════════════════════════════════════════════════════════
// PARSE INPUT
// ════════════════════════════════════════════════════════════
function parseInput(args) {
  const out = { url: null, limit: DEFAULT_PACK, mode: 'auto' }
  for (const raw of args) {
    const t = String(raw).trim()
    if (!t) continue
    if (/^https?:\/\//i.test(t) || /tiktok\.com/i.test(t)) { if (!out.url) out.url = t; continue }
    if (/^\d{1,3}$/.test(t)) { out.limit = Math.max(1, Math.min(HARD_MAX_PACK, Number(t))); continue }
    const low = t.toLowerCase()
    if (['anim', 'animasi', 'animated', 'gif'].includes(low)) out.mode = 'anim'
    else if (['static', 'statis', 'diam', 'png'].includes(low)) out.mode = 'static'
  }
  return out
}

// ════════════════════════════════════════════════════════════
// HANDLER
// ════════════════════════════════════════════════════════════
let handler = async (m, { sock, text, prefix, command, reply }) => {
  const p = prefix || '.'
  const cmd = command || 'ttstiker2'
  const { url, limit, mode } = parseInput(String(text || '').split(/\s+/))

  // ── Cek input ──
  if (!url) {
    return reply(
      '📦 *TIKTOK STICKER PACK*\n\n' +
      '*Cara pakai:*\n' +
      `> ${p}${cmd} <url> [jumlah] [anim|static]\n\n` +
      '*Example:*\n' +
      `> ${p}${cmd} https://vt.tiktok.com/xxxx\n` +
      `> ${p}${cmd} https://vt.tiktok.com/xxxx 20 anim\n\n` +
      '*Info:*\n' +
      `Download stickers from video comments; default ${DEFAULT_PACK} stickers (maximum ${HARD_MAX_PACK})\n` +
      '> A sticker pack cannot mix animated and static stickers\n' +
      '> `anim` / `static` buat milih jenisnya (default: otomatis)'
    )
  }

  if (activeChats.has(m.chat)) {
    return reply('⏳ A process is already running in this chat. Please wait.')
  }
  activeChats.add(m.chat)
  await reactTo(sock, m, '⏳')

  try {
    // ── 1. Scrape komentar ──
    const cap = Math.min(limit * 2, 90) // kumpulin lebih biar bisa milih animasi/statis
    const scraped = await scrapeCommentStickers(url, { cap, scanReplies: true })

    if (!scraped.stickers.length) {
      await reactTo(sock, m, '❌')
      return reply(
        scraped.verification
          ? '❌ TikTok requires verification or is rate-limiting requests. Try again in a few minutes.'
          : `❌ No stickers were found in this video’s comments.\n\n> Comments scanned: ${scraped.scanned}`
      )
    }

    // ── 2. Download + convert ──
    const items = []
    for (const s of scraped.stickers) {
      const raw = await downloadAsset(s.url)
      if (!raw) continue
      const conv = await toStickerWebp(raw)
      if (conv) items.push(conv)
      await sleep(120)
    }
    if (!items.length) {
      await reactTo(sock, m, '❌')
      return reply('❌ Stickers were found, but downloading/conversion failed. Please try again later.')
    }

    // ── 3. Pilih grup (a pack cannot mix types) ──
    const anim = items.filter((x) => x.animated)
    const stat = items.filter((x) => !x.animated)
    let chosen
    if (mode === 'anim') chosen = anim
    else if (mode === 'static') chosen = stat
    else chosen = anim.length >= stat.length ? anim : stat

    if (!chosen.length) {
      await reactTo(sock, m, '❌')
      return reply(`❌ No ${mode === 'anim' ? 'animated' : 'static'} stickers were found in this video.\n\n> Found: ${anim.length} animated, ${stat.length} static`)
    }
    const isAnim = chosen === anim
    const final = chosen.slice(0, limit)
    const skipped = isAnim ? stat.length : anim.length

    // ── 4. Kirim Sticker Pack (helper bawaan bot, ada fallback kirim satuan) ──
    const author = scraped.video.author ? `@${scraped.video.author}` : 'TikTok'
    await sendStickerPack(sock, m.chat, final.map((x) => x.buf), m, {
      name: `📦 Stiker ${author}`.slice(0, 40),
      publisher: global.namebot || 'TikTok Sticker Pack',
      description: `Stiker komentar TikTok • ${scraped.video.url}`.slice(0, 120),
      emojis: [EMOJIS[0], EMOJIS[1]],
    })

    await reactTo(sock, m, '✅')

    let info = `✅ *Sticker Pack TikTok*\n\n` +
      `> Isi: ${final.length} stiker ${isAnim ? 'animasi' : 'statis'}\n` +
      `> From: ${author}`
    if (skipped && mode === 'auto') {
      info += `\n\nℹ️ ${skipped} ${isAnim ? 'static' : 'animated'} stickers were omitted (a pack cannot mix types). ` +
        `Pake \`${p}${cmd} <url> ${isAnim ? 'static' : 'anim'}\` buat versi satunya.`
    }
    return reply(info)
  } catch (error) {
    console.error('[TTSTIKER2 ERROR]', error)
    await reactTo(sock, m, '❌')
    const msg = error?.response?.data?.message || error?.message || 'Failed to retrieve stickers.'
    return reply(`❌ *Failed*\n\n> ${msg}`)
  } finally {
    activeChats.delete(m.chat)
  }
}

handler.command = ['ttstiker2']
handler.help = ['ttstiker2 <url tiktok> [jumlah] [anim|static]']
handler.tags = ['sticker']

export default handler
