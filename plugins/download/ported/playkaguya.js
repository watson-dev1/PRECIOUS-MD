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
import yts from 'yt-search'
import { ytdl, fallbackToMp3Buffer } from '../../../lib/services/scraper.js'
import { wrapClassic, oneCommand } from '../../../lib/engine/plugins.js'

const MAX_BYTES = 100 * 1024 * 1024

const isYtUrl = s => /(?:youtube\.com|youtu\.be)/i.test(s)

const ytId = url => {
    const m = String(url).match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/)([\w-]{11})/)
    return m ? m[1] : null
}

const fmtNum = n => new Intl.NumberFormat('id-ID').format(Number(n) || 0)

// cari video: dari link (ambil id) atau dari kata kunci
async function findVideo(query) {
    if (isYtUrl(query)) {
        const id = ytId(query)
        if (!id) throw new Error('Invalid YouTube link')
        const v = await yts({ videoId: id })
        if (!v) throw new Error('Video was not found')
        return {
            videoId: id,
            url: `https://youtu.be/${id}`,
            title: v.title,
            author: v.author?.name || '-',
            timestamp: v.timestamp || '-',
            views: v.views,
            thumbnail: v.thumbnail
        }
    }

    const res = await yts(query)
    const v = res?.videos?.[0]
    if (!v) throw new Error('Song was not found')
    return {
        videoId: v.videoId,
        url: v.url,
        title: v.title,
        author: v.author?.name || '-',
        timestamp: v.timestamp || '-',
        views: v.views,
        thumbnail: v.thumbnail
    }
}

// ───────── unduh audio ─────────
// BUG LAMA: fallbackToMp3Buffer() dikasih link YouTube (halaman HTML), bukan link file audio,
// jadi ffmpeg selalu gagal ("Command failed: ffmpeg -y -i ...ytfb_xxx.bin"). Sekarang fallback
// hanya dipakai untuk link file audio hasil API, dan tiap sumber dicoba satu-satu.

// cek isi file benar-benar audio (bukan HTML / JSON error)
function sniffAudio(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 12) return null
    if (buf.toString('latin1', 0, 3) === 'ID3') return 'mp3'
    if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3'
    if (buf.toString('latin1', 4, 8) === 'ftyp') return 'mp4'
    if (buf.toString('latin1', 0, 4) === 'OggS') return 'ogg'
    if (buf.toString('latin1', 0, 4) === 'RIFF') return 'wav'
    if (buf.toString('latin1', 0, 4) === 'fLaC') return 'flac'
    if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm'
    return null
}

// daftar sumber link audio (urut dari yang paling cepat)
async function* audioSources(url) {
    try {
        const { data } = await axios.get(
            `https://my.izuka-api.xyz/api/downloader/ytmp3?url=${encodeURIComponent(url)}`,
            { timeout: 60000 }
        )
        const dl = data?.result?.download_url || data?.result?.download
        if (dl) yield { name: 'izuka', dl }
    } catch (e) {
        console.error('[PLAYKAGUYA] izuka:', e.message)
    }

    try {
        const r = await ytdl(url, 'mp3')
        if (r?.status && r?.dl) yield { name: 'ytdl', dl: r.dl }
        else console.error('[PLAYKAGUYA] ytdl:', r?.mess || 'does not exist link')
    } catch (e) {
        console.error('[PLAYKAGUYA] ytdl:', e.message)
    }
}

async function fetchBuffer(dl) {
    const res = await axios.get(dl, {
        responseType: 'arraybuffer',
        timeout: 120000,
        maxContentLength: MAX_BYTES,
        maxBodyLength: MAX_BYTES,
        headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36' }
    })
    const type = String(res.headers['content-type'] || '').toLowerCase()
    if (type.includes('text/html') || type.includes('application/json')) {
        throw new Error('link download bukan file audio')
    }
    return Buffer.from(res.data)
}

async function getAudioBuffer(url) {
    const errors = []

    for await (const src of audioSources(url)) {
        try {
            const buf = await fetchBuffer(src.dl)
            if (buf.length < 10 * 1024) throw new Error('file terlalu kecil')

            const kind = sniffAudio(buf)
            if (kind === 'mp3') return buf

            // audio tapi bukan mp3 (m4a/webm/ogg/dll) → convert lewat ffmpeg dari LINK AUDIO-nya
            if (kind) {
                const mp3 = await fallbackToMp3Buffer(src.dl)
                if (mp3?.length > 10 * 1024) return Buffer.from(mp3)
            }
            throw new Error('isi file bukan audio')
        } catch (e) {
            console.error(`[PLAYKAGUYA] ${src.name} failed:`, e.message)
            errors.push(`${src.name}: ${String(e.message).slice(0, 60)}`)
        }
    }

    throw new Error('Semua sumber download failed' + (errors.length ? ` (${errors.join('; ')})` : ''))
}

async function getThumb(video) {
    const urls = [
        video.videoId ? `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg` : null,
        video.thumbnail
    ].filter(Boolean)

    for (const u of urls) {
        try {
            const res = await axios.get(u, { responseType: 'arraybuffer', timeout: 15000 })
            const buf = Buffer.from(res.data)
            if (buf.length > 1000) return buf
        } catch {}
    }
    return null
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const query = (text || '').trim()
    const p = usedPrefix || '.'

    if (!query) {
        return m.reply(
            `🎵 *PLAY KAGUYA*\n\n` +
            `> Example: ${p}${command} multo\n` +
            `> Example: ${p}${command} https://youtube.com/watch?v=xxxxx`
        )
    }

    await m.react('🎧')

    try {
        await m.reply('🎵 *Kaguya MD:*  searching for the song... please wait 🦋')

        const video = await findVideo(query)

        await m.reply(
            `📥 *Downloading:* ${video.title}\n` +
            `⏱️ *Durasi:* ${video.timestamp}\n\n` +
            `Please wait a little longer.`
        )

        const [audio, thumb] = await Promise.all([
            getAudioBuffer(video.url),
            getThumb(video)
        ])

        const caption =
            `🎵 *${video.title}*\n\n` +
            `👤 *Artist:* ${video.author}\n` +
            `⏱️ *Duration:* ${video.timestamp}\n` +
            `👁️ *Views:* ${fmtNum(video.views)}\n\n` +
            `🦋 *Kaguya MD:* Enjoy! Replay it if you like it! 💕`

        if (thumb) {
            await conn.sendMessage(m.chat, { image: thumb, caption }, { quoted: m })
        } else {
            await m.reply(caption)
        }

        await conn.sendMessage(
            m.chat,
            {
                audio,
                mimetype: 'audio/mpeg',
                ptt: false,
                fileName: `${video.title}.mp3`
            },
            { quoted: m }
        )

        await m.react('✅')
    } catch (err) {
        console.error('[PlayKaguya]', err)
        await m.react('❌')

        const msg = String(err?.message || err)

        if (msg.includes('getaddrinfo') || msg.includes('ENOTFOUND')) {
            return m.reply('❌ *Error:* There is an internet connection problem. Please try again. 🗿')
        }
        if (msg.toLowerCase().includes('signature')) {
            return m.reply('❌ *Error:* YouTube is being updated. Please try again later. 🦋')
        }
        if (/Command failed|ffmpeg/i.test(msg)) {
            return m.reply('❌ *Error: Failed to process audio (the download source is temporarily unavailable). Please try again later.')
        }
        return m.reply(`❌ *Error:* ${msg.substring(0, 150)}\n\n> Please try again later.`)
    }
}

handler.help = ['playkaguya <judul lagu>']
handler.tags = ['download']
handler.command = ['playkaguya', 'yp']
handler.limit = true

// bungkus supaya m.react, conn, usedPrefix, dll. tersedia (sama seperti play.js)
const __plugin = wrapClassic(handler)
__plugin.tags = ['download']

// satu command = nama file
export default oneCommand(__plugin, 'playkaguya')