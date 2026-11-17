// SoundCloud resolver: info + kirim audio (track) / daftar lagu (playlist)
// Catatan: command .soundcloud sudah dipakai music.js, jadi fitur ini pakai .scdl
//   .scdl <link track>              kirim cover + audio MP3
//   .scdl <link playlist>           daftar lagu
//   .scdl <link playlist> <nomor>   kirim lagu ke-N dari playlist
// Mendukung: soundcloud.com, m.soundcloud.com, on.soundcloud.com, snd.sc
import axios from 'axios'
import { reactTo } from '../../../lib/core/file.js'

const API = 'https://api-v2.soundcloud.com'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const LINE = '─────────────────────'
const MAX_BYTES = 60 * 1024 * 1024
let cachedClientId = null

async function fetchClientId(force = false) {
    if (cachedClientId && !force) return cachedClientId
    const html = await (await fetch('https://soundcloud.com/', { headers: { 'User-Agent': UA } })).text()
    const scripts = [...html.matchAll(/<script[^>]+src="(https:\/\/[^"]+\.js)"/g)].map(x => x[1]).reverse()
    for (const src of scripts) {
        try {
            const js = await (await fetch(src, { headers: { 'User-Agent': UA } })).text()
            const mm = js.match(/client_id\s*:\s*"([0-9a-zA-Z]{32})"/)
            if (mm) return (cachedClientId = mm[1])
        } catch {}
    }
    throw new Error('Gagal mengambil client_id SoundCloud')
}

async function api(path, params = {}, retry = true) {
    const client_id = await fetchClientId()
    const u = path.startsWith('http') ? new URL(path) : new URL(path, API)
    u.searchParams.set('client_id', client_id)
    for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, String(v))
    const res = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'application/json' }, redirect: 'follow' })
    if ((res.status === 401 || res.status === 403) && retry) { await fetchClientId(true); return api(path, params, false) }
    if (!res.ok) throw new Error(`SoundCloud API ${res.status}`)
    return res.json()
}

function normalizeUrl(input) {
    let url = String(input || '').trim().replace(/^['"<]|['">]$/g, '').replace(/\s+/g, '')
    if (!url) throw new Error('URL kosong')
    url = url.replace(/^https?:\/\/m\.soundcloud\.com/i, 'https://soundcloud.com')
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    url = url.replace(/^http:/i, 'https:')
    let p
    try { p = new URL(url) } catch { throw new Error('Format URL tidak dikenali') }
    if (!/(^|\.)soundcloud\.com$|(^|\.)snd\.sc$/i.test(p.hostname)) throw new Error('Bukan URL SoundCloud')
    p.hash = ''; p.search = ''
    return (p.origin + p.pathname).replace(/\/+$/, '')
}

async function resolve(url) {
    let clean = normalizeUrl(url)
    if (/on\.soundcloud\.com|snd\.sc/i.test(clean)) {
        try {
            const r = await fetch(clean, { redirect: 'manual', headers: { 'User-Agent': UA } })
            const loc = r.headers.get('location')
            if (loc) clean = normalizeUrl(loc)
        } catch {}
    }
    let data = await api('/resolve', { url: clean }).catch(() => null)
    if (!data?.kind) data = await api('/resolve', { url: clean.replace('://soundcloud.com', '://www.soundcloud.com') }).catch(() => null)
    if (!data?.kind) throw new Error('Link tidak ditemukan / tidak bisa di-resolve.')
    return data
}

async function streamUrl(tr) {
    if (!tr?.url) return null
    try { return (await api(tr.url))?.url || null } catch { return null }
}

const meta = (t) => ({
    id: t.id, title: t.title, artist: t.user?.username || t.user?.full_name || '-', artistUrl: t.user?.permalink_url,
    durationSec: Math.round((t.duration || 0) / 1000), genre: t.genre, url: t.permalink_url,
    artwork: (t.artwork_url || t.user?.avatar_url || '').replace('-large', '-t500x500') || null,
    plays: t.playback_count, likes: t.likes_count, created: t.created_at, media: t.media
})

async function audioOf(t) {
    const trans = t.media?.transcodings || []
    const prog = trans.find(x => x.format?.protocol === 'progressive' && x.format?.mime_type?.includes('mpeg'))
    const hls = trans.find(x => x.format?.protocol === 'hls' && /mpeg|mp4/.test(x.format?.mime_type || ''))
    const progUrl = await streamUrl(prog)
    if (progUrl) return { url: progUrl, direct: true }
    const hlsUrl = await streamUrl(hls)
    return hlsUrl ? { url: hlsUrl, direct: false } : null
}

async function loadTrack(t) {
    // Track dari playlist kadang hanya berisi id (tanpa media) → ambil lengkap
    if (!t.media) t = await api(`/tracks/${t.id}`)
    return t
}

const dur = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const nf = (n) => Number(n || 0).toLocaleString('id-ID')

async function sendTrack(sock, m, reply, raw) {
    const t = meta(await loadTrack(raw))
    const cap = [`*🎧 ${t.title}*`, LINE, `Artis  : ${t.artist}`, `Durasi : ${dur(t.durationSec)}`, t.genre && `Genre  : ${t.genre}`,
        `Putar  : ${nf(t.plays)} • ❤️ ${nf(t.likes)}`, `Link   : ${t.url}`].filter(Boolean).join('\n')
    if (t.artwork) { try { await sock.sendMessage(m.chat, { image: { url: t.artwork }, caption: cap }, { quoted: m }) } catch { await reply(cap) } }
    else await reply(cap)

    const a = await audioOf(t)
    if (!a) throw new Error('Stream audio tidak tersedia (track mungkin premium / diblokir wilayah).')
    if (!a.direct) throw new Error(`Track hanya tersedia dalam format HLS, tidak bisa dikirim langsung.\nDengarkan: ${t.url}`)
    if (t.durationSec > 20 * 60) throw new Error(`Track terlalu panjang (${dur(t.durationSec)}). Dengarkan: ${t.url}`)
    const r = await axios.get(a.url, { responseType: 'arraybuffer', timeout: 120000, maxContentLength: MAX_BYTES, headers: { 'User-Agent': UA } })
    await sock.sendMessage(m.chat, { audio: Buffer.from(r.data), mimetype: 'audio/mpeg', fileName: `${t.artist} - ${t.title}.mp3` }, { quoted: m })
}

let handler = async (m, { sock, text, prefix, command, reply }) => {
    const parts = String(text || '').trim().split(/\s+/).filter(Boolean)
    if (!parts[0]) return reply(`*🎧 SOUNDCLOUD*\n${LINE}\n${prefix}${command} <link track>\n${prefix}${command} <link playlist>\n${prefix}${command} <link playlist> <nomor lagu>\n\nMendukung soundcloud.com, m.soundcloud.com, on.soundcloud.com`)
    try {
        await reactTo(sock, m, '⏳')
        const data = await resolve(parts[0])

        if (data.kind === 'track') {
            await sendTrack(sock, m, reply, data)
        } else if (data.kind === 'playlist' || data.kind === 'system-playlist') {
            const list = data.tracks || []
            if (!list.length) throw new Error('Playlist kosong.')
            const n = parseInt(parts[1], 10)
            if (n) {
                if (n < 1 || n > list.length) throw new Error(`Nomor harus 1–${list.length}.`)
                await sendTrack(sock, m, reply, list[n - 1])
            } else {
                // judul/artis track playlist bisa tidak lengkap → lengkapi 25 pertama dalam 1 request
                const shown = list.slice(0, 25), ids = shown.map(x => x.id).filter(Boolean)
                let full = []
                try { const d = await api('/tracks', { ids: ids.join(','), limit: ids.length }); full = Array.isArray(d) ? d : d?.collection || [] } catch {}
                const map = new Map(full.map(x => [x.id, x]))
                const lines = shown.map((x, i) => { const t = map.get(x.id) || x; return `${i + 1}. *${t.title || '(belum dimuat)'}*${t.user?.username ? ` — ${t.user.username}` : ''}${t.duration ? ` (${dur(Math.round(t.duration / 1000))})` : ''}` })
                await reply(`*💿 ${data.title || data.short_title || 'Playlist'}*\n${LINE}\nOleh: ${data.user?.username || 'SoundCloud'} • ${data.track_count || list.length} lagu\n\n${lines.join('\n')}${list.length > 25 ? `\n… dan ${list.length - 25} lagu lain` : ''}\n\nKirim lagu: *${prefix}${command} ${parts[0]} <nomor>*`)
            }
        } else {
            throw new Error(`Jenis link "${data.kind}" belum didukung. Kirim link lagu atau playlist.`)
        }
        await reactTo(sock, m, '✅')
    } catch (e) {
        await reactTo(sock, m, '❌')
        reply(`❌ ${e.response?.status ? `HTTP ${e.response.status}: ` : ''}${e.message || 'Gagal memproses.'}`)
    }
}

handler.command = ['soundcloud-dl']
handler.help = ['scdl <link soundcloud> [nomor]']
handler.tags = ['download']
handler.limit = true

export default handler
export { resolve as scResolve }
