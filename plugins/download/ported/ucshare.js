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
import * as cheerio from 'cheerio'

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
const BACKEND = 'https://m-intldrive.ucweb.com/1/clouddrive/share/sharepage/video_preview'
const MAX_SEND = 60 * 1024 * 1024 // video lebih besar dari ini dikirim sebagai link stream
const LIST_MAX = 15

// ───────── format ─────────

function formatSize(bytes) {
    if (!bytes) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
    return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i]
}

function formatDuration(seconds) {
    if (!seconds) return '-'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) return `${h}j ${m}m ${s}d`
    if (m > 0) return `${m}m ${s}d`
    return `${s}d`
}

function formatDate(ts) {
    if (!ts) return '-'
    return new Date(ts).toISOString().replace('T', ' ').slice(0, 19)
}

function safeDecode(str) {
    if (!str) return str
    try {
        return str.includes('%') ? decodeURIComponent(str) : str
    } catch {
        return str
    }
}

function isVideoFile(item) {
    if (item.obj_category === 'video') return true
    if (typeof item.format_type === 'string' && item.format_type.toLowerCase().includes('video')) return true
    return /\.(mp4|mov|mkv|avi|webm|3gp|flv|m4v)$/i.test(item.file_name || '')
}

// ───────── parsing halaman ─────────

function extractInitialProps(html) {
    const start = html.indexOf('window.__INITIAL_PROPS__')
    if (start === -1) return null

    const braceStart = html.indexOf('{', start)
    if (braceStart === -1) return null

    let depth = 0
    let inStr = false
    let esc = false
    for (let i = braceStart; i < html.length; i++) {
        const ch = html[i]
        if (inStr) {
            if (esc) esc = false
            else if (ch === '\\') esc = true
            else if (ch === '"') inStr = false
            continue
        }
        if (ch === '"') inStr = true
        else if (ch === '{') depth++
        else if (ch === '}') {
            depth--
            if (depth === 0) {
                try {
                    return JSON.parse(html.slice(braceStart, i + 1))
                } catch {
                    return null
                }
            }
        }
    }
    return null
}

function findStoken(html, props) {
    const candidates = [
        props?.initialData?.stokenDetail?.stoken,
        props?.initialData?.shareDetail?.stoken,
        props?.initialData?.shareDetail?.share?.stoken,
        props?.initialData?.shareInfo?.stoken
    ]
    for (const c of candidates) {
        if (c) return safeDecode(c)
    }
    const m = html.match(/"stoken"\s*:\s*"([^"]+)"/)
    return m ? safeDecode(m[1]) : null
}

function parseFromJson(props) {
    if (!props?.initialData) return null

    try {
        const data = props.initialData
        const share = data.shareDetail?.share || {}
        const list = data.shareDetail?.list || []
        const author = data.stokenDetail?.author || {}

        const files = list
            .filter(item => !item.dir)
            .map((item, i) => ({
                no: i + 1,
                file_name: item.file_name,
                fid: item.fid,
                size: item.size,
                size_formatted: formatSize(item.size),
                is_video: isVideoFile(item),
                duration: item.duration || 0,
                duration_formatted: formatDuration(item.duration),
                resolution: item.video_max_resolution || '-',
                thumbnail: item.thumbnail || null,
                share_fid_token: item.share_fid_token
            }))

        const folders = list
            .filter(item => item.dir)
            .map(item => ({ name: item.file_name, items_count: item.include_items || 0 }))

        return {
            method: 'json',
            share: {
                title: share.title || data.stokenDetail?.title,
                pwd_id: share.pwd_id,
                author: author.nick_name || '-',
                file_num: share.file_num || list.length,
                total_size: formatSize(share.size),
                expired_at: formatDate(share.expired_at),
                is_permanent: share.expired_type === 1
            },
            folders,
            files
        }
    } catch {
        return null
    }
}

// cadangan kalau JSON tidak ada: hanya bisa menampilkan daftar, tanpa fid sehingga video tidak bisa diambil
function parseFromHtml(html) {
    const $ = cheerio.load(html)

    const title = $('meta[property="og:title"]').attr('content')?.replace(' - Pembagian UC Drive', '').trim()
        || $('title').text().replace(' - Pembagian UC Drive', '').trim()
        || '-'
    const author = $('.author-name').text().replace('Dibagikan oleh', '').trim() || '-'

    const files = []
    const folders = []
    $('.file-item').each((i, el) => {
        const name = $(el).find('.item-tit').attr('title') || $(el).find('.item-tit').text().trim()
        const subs = $(el).find('.item-sub-tit span')
        const sizeOrCount = $(subs[1]).text().trim()
        if (/items?/i.test(sizeOrCount)) {
            folders.push({ name, items_count: parseInt(sizeOrCount) || 0 })
        } else {
            files.push({
                no: files.length + 1,
                file_name: name,
                size_formatted: sizeOrCount || '-',
                is_video: /\.(mp4|mov|mkv|avi|webm|3gp|flv|m4v)$/i.test(name || ''),
                duration: 0,
                duration_formatted: '-',
                resolution: '-'
            })
        }
    })

    return {
        method: 'html',
        share: { title, author, file_num: files.length + folders.length },
        folders,
        files
    }
}

// ───────── request ─────────

function normalizeUrl(input) {
    let t = String(input).trim()
    if (!/^https?:\/\//i.test(t)) {
        if (!/^[A-Za-z0-9]{6,32}$/.test(t)) throw Error('Link atau kode UC Share tidak valid.')
        t = `https://uc-share.com/s/${t}`
    }

    const u = new URL(t)
    if (!/(^|\.)uc-share\.com$/i.test(u.hostname)) throw Error('Hanya link uc-share.com yang didukung.')
    u.searchParams.set('la', 'id')
    return u.toString()
}

async function fetchShare(input) {
    const url = normalizeUrl(input)

    const { data: html } = await axios.get(url, {
        headers: {
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8'
        },
        timeout: 15000,
        maxRedirects: 5
    })

    const props = extractInitialProps(html)
    const result = parseFromJson(props) || parseFromHtml(html)
    if (!result.files.length && !result.folders.length && result.share.title === '-') {
        throw Error('Halaman tidak bisa dibaca. Link mungkin sudah kedaluwarsa atau salah.')
    }

    result.url = url
    result.pwd_id = result.share.pwd_id || url.match(/\/s\/([^/?#]+)/)?.[1]
    result.stoken = findStoken(html, props)
    return result
}

async function getVideoPreview(share, file) {
    const { data } = await axios.get(BACKEND, {
        params: {
            pr: 'UCBrowser',
            fr: 'h5',
            __t: Date.now(),
            pwd_id: share.pwd_id,
            stoken: share.stoken,
            fid: file.fid,
            fid_token: file.share_fid_token
        },
        headers: {
            'User-Agent': UA,
            'Accept': 'application/json, text/plain, */*',
            'Referer': share.url,
            'Origin': 'https://uc-share.com'
        },
        timeout: 15000
    })

    if (data?.code !== 0 || !data?.data?.play_info?.url) {
        throw Error(`Video tidak bisa diambil (code ${data?.code}, ${data?.message || 'tanpa pesan'}).`)
    }

    const play = data.data.play_info
    return {
        video_url: play.url,
        thumbnail_url: data.data.preview_url || null,
        duration: formatDuration(play.duration),
        size_bytes: Number(play.size) || 0,
        resolution: play.width && play.height ? `${play.width}x${play.height}` : '-',
        codec: play.codec || '-'
    }
}

// ───────── tampilan ─────────

function listText(share, prefix) {
    const s = share.share
    const lines = [
        `*▢ UC SHARE*`,
        ``,
        `• Judul: ${s.title || '-'}`,
        `• Pemilik: ${s.author || '-'}`,
        `• Isi: ${share.files.length} file${share.folders.length ? `, ${share.folders.length} folder` : ''}`
    ]
    if (s.total_size) lines.push(`• Total: ${s.total_size}`)
    if (s.expired_at && s.expired_at !== '-') lines.push(`• Berlaku: ${s.is_permanent ? 'permanen' : `sampai ${s.expired_at}`}`)
    lines.push('')

    for (const f of share.files.slice(0, LIST_MAX)) {
        const detail = f.is_video
            ? [f.size_formatted, f.duration_formatted !== '-' ? f.duration_formatted : null, f.resolution !== '-' ? f.resolution : null].filter(Boolean).join(' • ')
            : f.size_formatted
        lines.push(`${f.no}. ${f.is_video ? '🎬' : '📄'} ${f.file_name}`)
        lines.push(`    ${detail}`)
    }
    if (share.files.length > LIST_MAX) lines.push(`... dan ${share.files.length - LIST_MAX} file lain`)
    if (share.folders.length) {
        lines.push('')
        lines.push(`📁 Folder (isinya belum bisa dibuka): ${share.folders.slice(0, 5).map(f => f.name).join(', ')}`)
    }

    if (share.files.some(f => f.is_video && f.fid)) {
        lines.push('')
        lines.push(`Ambil video: ${prefix}ucshare ${share.pwd_id || '<link>'} <nomor>`)
    }
    return lines.join('\n')
}

// ───────── handler ─────────

let handler = async (m, { sock, text, prefix, reply }) => {
    const [link, noRaw] = String(text || '').trim().split(/\s+/)

    if (!link) {
        return reply(
            `*▢ UC SHARE*\n\n` +
            `Lihat isi link UC Drive lalu ambil videonya.\n\n` +
            `${prefix}ucshare <link / kode>\n` +
            `${prefix}ucshare <link / kode> <nomor>\n\n` +
            `Contoh:\n${prefix}ucshare https://uc-share.com/s/6e1505b566c14\n${prefix}ucshare 6e1505b566c14 1`
        )
    }

    try {
        await reply(global.mess?.wait || '⏳ Sedang mengambil data...')
        const share = await fetchShare(link)

        const no = noRaw ? parseInt(noRaw, 10) : 0
        if (!no) return reply(listText(share, prefix))

        const file = share.files.find(f => f.no === no)
        if (!file) return reply(`❌ Nomor ${no} tidak ada. Pilih 1-${share.files.length}.`)
        if (!file.is_video) return reply('❌ File itu bukan video.')
        if (!file.fid) return reply('❌ Video ini tidak bisa diambil (data file tidak lengkap di halaman).')
        if (!share.stoken) return reply('❌ Token halaman tidak ditemukan, video tidak bisa diambil.')

        const pv = await getVideoPreview(share, file)
        const sizeBytes = pv.size_bytes || file.size || 0

        const caption =
            `*▢ UC SHARE VIDEO*\n\n` +
            `• Nama: ${file.file_name}\n` +
            `• Durasi: ${pv.duration}\n` +
            `• Resolusi: ${pv.resolution}\n` +
            `• Ukuran: ${formatSize(sizeBytes)}\n` +
            `• Codec: ${pv.codec}`

        const thumb = pv.thumbnail_url || file.thumbnail
        if (thumb) {
            await sock.sendMessage(m.chat, { image: { url: thumb }, caption }, { quoted: m }).catch(() => reply(caption))
        } else {
            await reply(caption)
        }

        const streamInfo = `🔗 Link stream:\n${pv.video_url}`
        if (sizeBytes && sizeBytes > MAX_SEND) {
            return reply(`📎 Videonya ${formatSize(sizeBytes)}, terlalu besar untuk dikirim lewat WhatsApp.\n\n${streamInfo}`)
        }
        if (/\.m3u8(\?|$)/i.test(pv.video_url)) {
            return reply(`📎 Videonya berbentuk stream HLS, tidak bisa dikirim langsung.\n\n${streamInfo}`)
        }

        try {
            const res = await axios.get(pv.video_url, {
                responseType: 'arraybuffer',
                maxContentLength: MAX_SEND,
                timeout: 180000,
                headers: { 'User-Agent': UA, 'Referer': share.url }
            })
            if (/mpegurl/i.test(String(res.headers?.['content-type'] || ''))) throw Error('HLS')

            return await sock.sendMessage(m.chat, {
                video: Buffer.from(res.data),
                mimetype: 'video/mp4',
                caption: file.file_name
            }, { quoted: m })
        } catch (e) {
            console.warn('[UCSHARE] kirim video gagal:', e.message)
            return reply(`📎 Videonya tidak bisa dikirim langsung.\n\n${streamInfo}`)
        }
    } catch (e) {
        console.error('[UCSHARE ERROR]', e)
        return reply(`❌ ${e.response?.status ? `Gagal (HTTP ${e.response.status}). ` : ''}${e.message}`)
    }
}

handler.command = ['ucshare']
handler.help = ['ucshare <link / kode> [nomor]']
handler.tags = ['download']
handler.limit = true

export default handler
