/*
- Apple Music Cari + Download (format Kaguya)
- Skrep by *JH a.k.a DHIKA - FIONY BOT*
- Credits to all Fiony's Bot Admin.
- HARGAI WOY JANGAN DIHAPUS!
*/
// .amcari <judul>        → daftar hasil pencarian (iTunes)
// .amplay <judul / url>  → link Apple Music ATAU judul (ambil hasil 1), kirim info + mp3
import axios from 'axios'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const BASE = 'https://aaplmusicdownloader.com'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const APPLE_URL = /^https?:\/\/music\.apple\.com\/\S+/i

const fmtMs = (ms) => {
    if (!ms || isNaN(ms)) return '-'
    const s = Math.round(Number(ms) / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// ambil info (durasi, album, cover) dari link Apple Music lewat iTunes lookup
async function lookupApple(url) {
    try {
        const id = url.match(/[?&]i=(\d+)/)?.[1] || url.match(/\/(\d+)(?:[?#].*)?$/)?.[1]
        if (!id) return null
        const { data } = await axios.get('https://itunes.apple.com/lookup', {
            params: { id, country: 'id' }, headers: { 'User-Agent': UA }, timeout: 15000
        })
        const r = (typeof data === 'string' ? JSON.parse(data) : data)?.results?.[0]
        if (!r) return null
        return {
            album: r.collectionName,
            duration: fmtMs(r.trackTimeMillis),
            thumb: (r.artworkUrl100 || '').replace('100x100bb', '1000x1000bb')
        }
    } catch { return null }
}

// ───────── cari (iTunes Search API) ─────────
async function searchApple(query, limit = 10) {
    const { data } = await axios.get('https://itunes.apple.com/search', {
        params: { term: query, entity: 'song', limit, country: 'id' },
        headers: { Accept: 'application/json', 'User-Agent': UA },
        timeout: 15000
    })
    const results = typeof data === 'string' ? JSON.parse(data).results : data?.results
    if (!results?.length) throw new Error('Lagu tidak ketemu, coba keyword lain.')

    return results.map(i => {
        const slug = i.trackViewUrl?.match(/album\/([^/]+)/)?.[1] || 'song'
        return {
            title: i.trackName || '-',
            artist: i.artistName || '-',
            album: i.collectionName || '-',
            genre: i.primaryGenreName || '-',
            date: i.releaseDate ? i.releaseDate.split('T')[0] : '-',
            duration: fmtMs(i.trackTimeMillis),
            url: i.trackId ? `https://music.apple.com/id/song/${slug}/${i.trackId}` : (i.trackViewUrl || ''),
            thumb: (i.artworkUrl100 || '').replace('100x100bb', '1000x1000bb')
        }
    })
}

// ───────── download (aaplmusicdownloader.com) ─────────
async function downloadApple(url) {
    const h = {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        Origin: BASE,
        Referer: `${BASE}/`,
        'User-Agent': UA,
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    }
    const opt = { headers: h, validateStatus: () => true, timeout: 60000 }
    const form = (o) => new URLSearchParams(o).toString()

    const home = await axios.get(`${BASE}/`, { headers: { ...h, Accept: 'text/html,*/*' }, validateStatus: () => true, timeout: 30000 })
    const cookie = (home.headers['set-cookie'] || []).map(c => String(c).split(';')[0]).join('; ')
    h.Cookie = cookie ? `${cookie}; quality=320; rank=1; dcount=1` : 'quality=320; rank=1; dcount=1'

    const r1 = await axios.get(`${BASE}/api/song_url.php`, { ...opt, params: { url } })
    let meta = r1.data
    if (typeof meta === 'string') { try { meta = JSON.parse(meta) } catch {} }

    const clean = (s) => String(s || '').replace(/&amp;/g, '&').replace(/['"]/g, '')
    const title = clean(meta?.name)
    const artist = clean(meta?.artist)
    const album = meta?.albumname || ''
    const thumb = meta?.thumb || ''
    const token = meta?.token || 'none'
    if (!title) throw new Error('Data lagu tidak ketemu.')

    const r2 = await axios.post(`${BASE}/api/composer/swd.php`,
        form({ song_name: title, artist_name: artist, url, token, zip_download: 'false', quality: '320' }), opt)
    let dlink = r2.data?.dlink

    // cadangan lewat youtube + rapidmp3
    if (!dlink || !String(dlink).trim()) {
        const yt = await axios.get(`${BASE}/api/composer/ytsearch/mytsearch.php`, {
            ...opt, params: { name: title, artist, album, link: url }
        })
        const vid = yt.data?.videoid
        if (vid) {
            let top = null
            for (let i = 0; i < 4; i++) {
                const rap = await axios.get(`${BASE}/api/rapidmp3.php`, {
                    ...opt, params: { q: vid, url, name: title, artist, album }
                })
                if (rap.data?.status === 'ok') { top = rap.data?.link; break }
                if (rap.data?.status === 'processing') await sleep(3000)
                else break
            }
            if (top) {
                const conv = await axios.post(`${BASE}/api/convertRapidAPI.php`, form({ url: top }), opt)
                dlink = conv.data?.dlink
            }
        }
    }
    if (!dlink || !String(dlink).trim()) throw new Error('Server download sedang bermasalah, coba lagi nanti.')

    await sleep(4000)

    const r3 = await axios.post(`${BASE}/api/composer/ffmpeg/saveid3.php`,
        form({ url: dlink, name: title, artist, album, thumb }), opt)
    const filename = String(r3.data || '').trim()
    const mp3 = filename && !filename.includes('<')
        ? `${BASE}/api/composer/ffmpeg/saved/${encodeURIComponent(filename)}`
        : null

    return { title, artist, album, thumb, m4a: dlink, mp3 }
}

const react = (sock, m, text) => sock.sendMessage(m.chat, { react: { text, key: m.key } }).catch(() => null)

let handler = async (m, { sock, text, command, prefix, reply }) => {
    const input = String(text || '').trim()

    // ───────── .amcari ─────────
    if (['amcari', 'applecari'].includes(command)) {
        if (!input) return reply(`*▢ APPLE MUSIC CARI*\n\nContoh:\n${prefix}amcari menuju senja`)
        await react(sock, m, '🕒')
        try {
            const list = await searchApple(input)
            const body = list.map((s, i) =>
                `*${i + 1}. ${s.title}*\n` +
                `   ${s.artist} • ${s.album}\n` +
                `   ${s.genre} • ${s.date}\n` +
                `   ${s.url}`
            ).join('\n\n')
            const caption = `*▢ APPLE MUSIC: ${input}*\n\n${body}\n\n_Ambil lagunya: ${prefix}amplay <judul / url>_`
            if (list[0].thumb) {
                await sock.sendMessage(m.chat, { image: { url: list[0].thumb }, caption }, { quoted: m })
            } else {
                await reply(caption)
            }
            return react(sock, m, '✅')
        } catch (e) {
            await react(sock, m, '❌')
            return reply(`❌ ${e.response?.data?.errorMessage || e.message}`)
        }
    }

    // ───────── .amplay ─────────
    if (!input) return reply(`*▢ APPLE MUSIC PLAY*\n\nContoh:\n${prefix}amplay menuju senja\n${prefix}amplay https://music.apple.com/id/song/menuju-senja/936241610`)
    await react(sock, m, '🕒')
    try {
        let url = input
        let found = null
        if (!APPLE_URL.test(input)) {
            found = (await searchApple(input, 1))[0]
            url = found.url
        }

        const dl = await downloadApple(url)
        const audioUrl = dl.mp3 || dl.m4a
        const extra = found || await lookupApple(url)

        const caption =
            `*▢ APPLE MUSIC*\n\n` +
            `❀ Judul  : ${dl.title}\n` +
            `❀ Artis  : ${dl.artist}\n` +
            `❀ Album  : ${dl.album || extra?.album || '-'}\n` +
            `❀ Durasi : ${extra?.duration || '-'}\n` +
            `❀ Link   : ${url}`
        const cover = dl.thumb || extra?.thumb
        if (cover) await sock.sendMessage(m.chat, { image: { url: cover }, caption }, { quoted: m }).catch(() => reply(caption))
        else await reply(caption)

        await sock.sendMessage(m.chat, {
            audio: { url: audioUrl },
            mimetype: dl.mp3 ? 'audio/mpeg' : 'audio/mp4',
            fileName: `${dl.title}.${dl.mp3 ? 'mp3' : 'm4a'}`
        }, { quoted: m })
        return react(sock, m, '✅')
    } catch (e) {
        await react(sock, m, '❌')
        return reply(`❌ ${e.response?.data?.errorMessage || e.message}`)
    }
}

handler.command = ['applemusicdl', 'amcari', 'amdl', 'amplay', 'applecari', 'applemusic']
handler.as = 'amcari'
handler.help = ['applemusicdl amcari <judul>', 'applemusicdl amplay <judul/url>', 'applemusicdl applemusic <judul/url>']
handler.tags = ['download']
handler.limit = true

export default handler
