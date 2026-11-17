/*
# Name : Spotify Cari + Play (format Kaguya)
# Url  : https://spotmp3.net, https://spotsaver.net
# Source : https://whatsapp.com/channel/0029VbDWBmtA89MamPba8q3f
*/
// .spotcari <judul>         → daftar hasil pencarian
// .spotplay <judul / url>   → link Spotify ATAU judul (ambil hasil 1), kirim info + mp3
// Ada cache: lagu yang pernah diputar dikirim langsung dari disk (database/cache/audio)
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import axios from 'axios'

// ───────── cache audio ─────────
// Disimpan di database/cache/audio (dipakai bersama oleh play, play2, dan spotifymp3).
// Lagu yang sudah pernah diunduh dikirim langsung dari disk tanpa pencarian / API / unduh ulang.
// Batas: CACHE_MAX_FILES lagu atau CACHE_MAX_BYTES total, yang paling lama tidak dipakai dihapus dulu.
const CACHE_DIR = path.join(process.cwd(), 'database', 'cache', 'audio')
const CACHE_MAX_FILES = 300
const CACHE_MAX_BYTES = 800 * 1024 * 1024
const CACHE_MAX_ITEM = 40 * 1024 * 1024
const CACHE_MIN_ITEM = 10 * 1024
const CACHE_ALIAS_TTL = 30 * 24 * 3600 * 1000
fs.mkdirSync(CACHE_DIR, { recursive: true })

const audioCache = (() => {
  const P = (...a) => path.join(CACHE_DIR, ...a)
  const safe = k => String(k || '').replace(/[^\w-]/g, '')
  const norm = q => String(q).toLowerCase().replace(/\s+/g, ' ').trim()
  const aliasPath = (ns, q) => P(`q-${crypto.createHash('sha1').update(`${ns}|${norm(q)}`).digest('hex').slice(0, 24)}.json`)
  const readJson = async f => { try { return JSON.parse(await fs.promises.readFile(f, 'utf8')) } catch { return null } }
  const rm = (...files) => Promise.all(files.map(f => fs.promises.unlink(f).catch(() => null)))
  const rmKey = key => rm(P(`${key}.mp3`), P(`${key}.json`), P(`${key}.jpg`))

  async function get(key) {
    key = safe(key)
    if (!key) return null
    const meta = await readJson(P(`${key}.json`))
    if (!meta) return null
    try {
      const audio = await fs.promises.readFile(P(`${key}.mp3`))
      if (audio.length < CACHE_MIN_ITEM) throw new Error('cache rusak')
      const now = new Date()
      fs.promises.utimes(P(`${key}.mp3`), now, now).catch(() => null) // tandai baru dipakai
      const thumb = await fs.promises.readFile(P(`${key}.jpg`)).catch(() => null)
      return { key, meta, audio, thumb }
    } catch {
      await rmKey(key)
      return null
    }
  }

  async function alias(ns, q, key) {
    key = safe(key)
    if (!key || !norm(q)) return
    await fs.promises.writeFile(aliasPath(ns, q), JSON.stringify({ key }))
  }

  async function findByQuery(ns, q) {
    if (!norm(q)) return null
    const a = await readJson(aliasPath(ns, q))
    if (!a?.key) return null
    const hit = await get(a.key)
    if (!hit) await rm(aliasPath(ns, q))
    return hit
  }

  async function prune() {
    const names = await fs.promises.readdir(CACHE_DIR).catch(() => [])
    const now = Date.now()
    const items = []
    for (const f of names) {
      const st = await fs.promises.stat(P(f)).catch(() => null)
      if (!st) continue
      if (f.startsWith('q-')) { if (now - st.mtimeMs > CACHE_ALIAS_TTL) await rm(P(f)); continue }
      if (f.endsWith('.mp3')) items.push({ key: f.slice(0, -4), size: st.size, t: st.mtimeMs })
    }
    items.sort((a, b) => a.t - b.t)
    let total = items.reduce((n, i) => n + i.size, 0)
    let count = items.length
    for (const it of items) {
      if (count <= CACHE_MAX_FILES && total <= CACHE_MAX_BYTES) break
      await rmKey(it.key)
      total -= it.size
      count--
    }
  }

  async function save({ ns, key, meta, audio, thumb, queries = [] }) {
    key = safe(key)
    if (!key || !Buffer.isBuffer(audio) || audio.length < CACHE_MIN_ITEM || audio.length > CACHE_MAX_ITEM) return false
    const tmp = P(`${key}.mp3.tmp-${process.pid}-${Date.now()}`)
    await fs.promises.writeFile(tmp, audio)
    await fs.promises.rename(tmp, P(`${key}.mp3`))
    if (Buffer.isBuffer(thumb) && thumb.length > 1000) await fs.promises.writeFile(P(`${key}.jpg`), thumb)
    await fs.promises.writeFile(P(`${key}.json`), JSON.stringify(meta || {})) // meta terakhir = penanda cache lengkap
    for (const q of queries) await alias(ns, q, key)
    await prune()
    return true
  }

  return { get, alias, findByQuery, save }
})()

const BASE = 'https://spotmp3.net'
const SAVER = 'https://spotsaver.net'
const SPOTIFY_URL = /^https?:\/\/open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]+)/i

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    Origin: SAVER,
    Referer: `${SAVER}/`
}

const fmtDuration = (ms) => {
    if (!ms || isNaN(ms)) return null
    const s = Math.round(Number(ms) / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

async function searchSpotify(query) {
    const { data } = await axios.get(`${BASE}/api/v1/search`, { params: { q: query }, headers, timeout: 30000 })
    const tracks = data?.sections?.find(v => v.type === 'track')?.items || []
    if (!tracks.length) throw new Error('Lagu tidak ditemukan.')

    return tracks.map(item => {
        const tid = item.id || item.url?.match(/track\/([A-Za-z0-9]+)/)?.[1] || null
        return {
            title: item.title || '-',
            artist: item.subtitle || '-',
            album: item.album || '-',
            duration: fmtDuration(item.duration_ms) || '-',
            cover: item.cover || item.image || item.thumbnail || null,
            date: item.date || item.release_date || '-',
            url: item.url || (tid ? `https://open.spotify.com/track/${tid}` : null)
        }
    })
}

async function downloadSpotify(url) {
    const spotify = await axios.get(`${SAVER}/api/spotify/`, { params: { url }, headers, timeout: 30000 })
    const item = spotify.data?.items?.[0]
    if (!item) throw new Error('Track Spotify tidak ditemukan.')

    const cover = item.cover || item.image || item.thumbnail || item.album?.cover || item.album?.image || null
    const json = { ...headers, 'Content-Type': 'application/json' }

    const getId = await axios.post(`${SAVER}/api/get-id/`, { title: item.title, artist: item.artist }, { headers: json, timeout: 30000 })
    const videoId = getId.data?.videoId
    if (!videoId) throw new Error('Video ID tidak ditemukan.')

    const dl = await axios.post(`${SAVER}/api/download/`, {
        videoId,
        candidateIds: [],
        format: 'mp3',
        title: `${item.title} - ${item.artist}`,
        licenseKey: null
    }, { headers: json, timeout: 60000 })

    const d = dl.data
    const download = d?.url || d?.download || d?.downloadUrl || d?.audio || d?.result?.url || d?.result?.download || null
    if (!download) throw new Error('URL download tidak ditemukan.')

    const tid = url.match(/track\/([A-Za-z0-9]+)/)?.[1]
    return {
        title: item.title || '-',
        artist: item.artist || '-',
        album: item.album || '-',
        duration: item.duration || '-',
        cover,
        date: item.release_date || item.date || '-',
        spotify: tid ? `https://open.spotify.com/track/${tid}` : url,
        download
    }
}

// durasi dari spotsaver bisa berupa detik (365) atau "6:05"
const fmtAny = (d) => {
    if (d === null || d === undefined || d === '' || d === '-') return '-'
    if (typeof d === 'string' && d.includes(':')) return d
    const n = Number(d)
    if (isNaN(n)) return String(d)
    const sec = Math.round(n > 100000 ? n / 1000 : n)
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

async function fetchBuffer(url, kind = 'audio') {
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 120000,
        maxContentLength: 100 * 1024 * 1024,
        maxBodyLength: 100 * 1024 * 1024,
        headers: { 'User-Agent': headers['User-Agent'] }
    })
    const type = String(res.headers['content-type'] || '').toLowerCase()
    if (kind === 'audio' && (type.includes('text/html') || type.includes('application/json'))) {
        throw new Error('URL download tidak mengembalikan audio')
    }
    return Buffer.from(res.data)
}

const react = (sock, m, text) => sock.sendMessage(m.chat, { react: { text, key: m.key } }).catch(() => null)
const errMsg = (e) => e.response?.data?.message || e.response?.data?.error || e.message

let handler = async (m, { sock, text, command, prefix, reply }) => {
    const input = String(text || '').trim()

    // ───────── .spotcari ─────────
    if (['spotcari', 'spsearch'].includes(command)) {
        if (!input) return reply(`*▢ SPOTIFY CARI*\n\nContoh:\n${prefix}spotcari shape of you`)
        await react(sock, m, '🕒')
        try {
            const list = (await searchSpotify(input)).slice(0, 10)
            const body = list.map((s, i) =>
                `*${i + 1}. ${s.title}*\n` +
                `   ${s.artist} • ${s.album}\n` +
                `   ${s.duration} • ${s.date}\n` +
                `   ${s.url || '-'}`
            ).join('\n\n')
            const caption = `*▢ SPOTIFY: ${input}*\n\n${body}\n\n_Ambil lagunya: ${prefix}spotplay <judul / url>_`
            if (list[0].cover) await sock.sendMessage(m.chat, { image: { url: list[0].cover }, caption }, { quoted: m })
            else await reply(caption)
            return react(sock, m, '✅')
        } catch (e) {
            await react(sock, m, '❌')
            return reply(`❌ ${errMsg(e)}`)
        }
    }

    // ───────── .spotplay ─────────
    if (!input) return reply(`*▢ SPOTIFY PLAY*\n\nContoh:\n${prefix}spotplay shape of you\n${prefix}spotplay https://open.spotify.com/track/xxxx`)
    await react(sock, m, '🕒')
    try {
        const isUrl = SPOTIFY_URL.test(input)
        let url = input

        // 1) cache dari link / teks pencarian yang sama
        let hit = isUrl
            ? await audioCache.get(`sp-${input.match(SPOTIFY_URL)[1]}`)
            : await audioCache.findByQuery('sp', input)

        // 2) cari dulu; siapa tahu lagunya sudah ada di cache dari pencarian lain
        if (!hit && !isUrl) {
            const first = (await searchSpotify(input))[0]
            if (!first.url) throw new Error('URL Spotify tidak ditemukan.')
            url = first.url
            const tid = url.match(/track\/([A-Za-z0-9]+)/)?.[1]
            if (tid) {
                hit = await audioCache.get(`sp-${tid}`)
                if (hit) audioCache.alias('sp', input, `sp-${tid}`).catch(() => null)
            }
        }

        let r, audio, cover
        if (hit) {
            r = hit.meta
            audio = hit.audio
            cover = hit.thumb
        } else {
            // 3) belum ada di cache: unduh, kirim, lalu simpan di latar belakang
            r = await downloadSpotify(url)
            ;[audio, cover] = await Promise.all([
                fetchBuffer(r.download, 'audio').catch(e => { console.error('[SPOTPLAY DL]', e.message); return null }),
                r.cover ? fetchBuffer(r.cover, 'image').catch(() => null) : null
            ])
            const tid = r.spotify?.match(/track\/([A-Za-z0-9]+)/)?.[1]
            if (audio && tid) {
                audioCache.save({
                    ns: 'sp',
                    key: `sp-${tid}`,
                    meta: { title: r.title, artist: r.artist, album: r.album, duration: r.duration, spotify: r.spotify, cover: r.cover },
                    audio,
                    thumb: cover,
                    queries: [input]
                }).catch(e => console.error('[SPOTPLAY CACHE]', e.message))
            }
        }

        const caption =
            `*▢ SPOTIFY*\n\n` +
            `❀ Judul  : ${r.title}\n` +
            `❀ Artis  : ${r.artist}\n` +
            `❀ Album  : ${r.album}\n` +
            `❀ Durasi : ${fmtAny(r.duration)}\n` +
            `❀ Link   : ${r.spotify}`
        const image = cover || (r.cover ? { url: r.cover } : null)
        if (image) await sock.sendMessage(m.chat, { image, caption }, { quoted: m }).catch(() => reply(caption))
        else await reply(caption)

        await sock.sendMessage(m.chat, {
            audio: audio || { url: r.download },
            mimetype: 'audio/mpeg',
            fileName: `${r.title}.mp3`
        }, { quoted: m })
        return react(sock, m, '✅')
    } catch (e) {
        await react(sock, m, '❌')
        return reply(`❌ ${errMsg(e)}`)
    }
}

handler.command = ['spotifymp3', 'spotcari', 'spdl', 'spotify', 'spotifydl', 'spotifyplay', 'spotplay', 'spplay', 'spsearch']
handler.as = 'spotcari'
handler.help = ['spotifymp3 spotcari <judul>', 'spotifymp3 spotplay <judul/url>', 'spotifymp3 spotifyplay <judul/url>']
handler.tags = ['download']
handler.limit = true

export default handler
