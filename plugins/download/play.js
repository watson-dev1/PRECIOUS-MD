import axios from 'axios'
import yts from 'yt-search'
import { sendButtons, quickReply, urlButton, listButton } from '../../lib/buttons.js'

const API_URL = 'https://knightbotapi.stream/api/download/ytaudio?apikey=knight&format=128kbps&url='
const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
    Accept: '*/*'
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const getVideoId = value => {
    try {
        const url = new URL(value)
        const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, '')
        if (host === 'youtu.be') return url.pathname.slice(1).split('/')[0] || ''
        if (host === 'youtube.com' || host === 'music.youtube.com') {
            if (url.pathname === '/watch') return url.searchParams.get('v') || ''
            const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/)
            return match?.[1] || ''
        }
    } catch {}
    return ''
}

const apiError = (data, fallback) => {
    if (typeof data === 'string' && data.trim()) return data.trim().slice(0, 300)
    if (typeof data?.error === 'string') return data.error
    if (data?.message) return String(data.message)
    return fallback
}

const safeFileName = title => String(title || 'audio')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || 'audio'

const isAudioFile = buffer => {
    if (!buffer || buffer.length < 10 * 1024) return false
    if (buffer.subarray(0, 3).toString() === 'ID3') return true
    if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return true
    return buffer.subarray(4, 8).toString() === 'ftyp' || buffer.subarray(0, 4).toString() === 'OggS'
}

const isSafeLink = value => {
    try {
        const url = new URL(value)
        const host = url.hostname.toLowerCase()
        return url.protocol === 'https:' && host !== 'localhost' && !/^[\d.]+$/.test(host)
    } catch {
        return false
    }
}

const getDownloadUrl = data => {
    if (typeof data === 'string' && /^https?:\/\//i.test(data.trim())) return data.trim()
    return data?.link ||
        data?.url ||
        data?.downloadUrl ||
        data?.download_url ||
        data?.result?.link ||
        data?.result?.url ||
        data?.data?.link ||
        data?.data?.url ||
        data?.audio?.url ||
        data?.audio?.link ||
        ''
}

const watch = id => `https://youtube.com/watch?v=${id}`

async function searchWithRetry(query, attempts = 3) {
    let lastError

    for (let i = 0; i < attempts; i++) {
        try {
            return await yts(query)
        } catch (error) {
            lastError = error
            const isRateLimited = String(error?.message || error).includes('429')
            if (!isRateLimited || i === attempts - 1) break
            await sleep(3000 * (i + 1))
        }
    }

    throw lastError
}

async function findVideo(query) {
    const videoId = getVideoId(query)

    // Direct YouTube links do not need yt-search, avoiding 429 errors.
    if (videoId) {
        let video = null
        try {
            video = await yts({ videoId })
        } catch {
            video = {
                videoId,
                title: 'YouTube Audio',
                seconds: 1,
                thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                author: { name: 'YouTube' }
            }
        }

        return { video, results: [] }
    }

    const search = await searchWithRetry(query)
    return {
        video: search.videos?.[0],
        results: (search.videos || []).slice(1, 6)
    }
}

let handler = async (m, { waClient, text = '', command }) => {
    const prefix = global.prefix || '.'
    const query = String(text).trim()
    if (!query) return m.reply(`*Usage:* ${prefix}${command} <song name or YouTube link>`)

    let video, results
    try {
        ({ video, results } = await findVideo(query))
    } catch (error) {
        const message = String(error?.message || error)

        if (message.includes('429')) {
            return m.reply('YouTube search is temporarily rate-limited. Please send a direct YouTube link, or try again in a few minutes.')
        }

        return m.reply(`Search failed: ${message}`)
    }

    if (!video?.videoId) return m.reply(`No results found for "${query}".`)
    if (!video.seconds) return m.reply('That is a live stream, so I cannot download it as audio.')

    const url = watch(video.videoId)

    // ---- .play: show a result card with action buttons ----
    if (command === 'play') {
        const buttons = [
            quickReply('🎵 Audio', `${prefix}playaudio ${url}`),
            quickReply('🎬 Video', `${prefix}playvideo ${url}`),
            quickReply('📄 Audio as file', `${prefix}playdoc ${url}`),
            urlButton('▶️ Open on YouTube', url)
        ]

        if (results.length) {
            buttons.push(listButton('🔎 More results', [{
                title: 'Other matches',
                rows: results.map(r => ({
                    title: String(r.title).slice(0, 24),
                    description: `${r.timestamp || '-'} • ${r.author?.name || ''}`.slice(0, 72),
                    id: `${prefix}play ${watch(r.videoId)}`
                }))
            }]))
        }

        return sendButtons(waClient, m, {
            image: video.thumbnail,
            title: '🎶 PLAY',
            body: `*${video.title}*\n\n👤 ${video.author?.name || 'Unknown'}\n⏱️ ${video.timestamp || '-'}\n👁️ ${Number(video.views || 0).toLocaleString()} views\n\nChoose a format:`,
            buttons
        })
    }

    // ---- .playaudio / .playdoc / .ytmp3 / .yta: download the audio ----
    await m.react?.('⏳')

    try {
        const apiUrl = `${API_URL}${encodeURIComponent(url)}`
        const response = await axios.get(apiUrl, {
            responseType: 'arraybuffer',
            timeout: 120000,
            validateStatus: () => true,
            headers: {
                ...BROWSER_HEADERS,
                Accept: 'application/json, audio/mpeg, audio/*, */*'
            }
        })

        const contentType = String(response.headers['content-type'] || '').toLowerCase()
        const raw = Buffer.from(response.data || [])

        // KnightBot may return the MP3 file directly.
        if (response.status >= 200 && response.status < 300 && isAudioFile(raw)) {
            const fileName = `${safeFileName(video.title)}.mp3`
            const message = command === 'playdoc'
                ? { document: raw, mimetype: 'audio/mpeg', fileName }
                : { audio: raw, mimetype: 'audio/mpeg', fileName }

            await waClient.sendMessage(m.chat, message, { quoted: m })
            await m.react?.('✅')
            return
        }

        // Otherwise, parse the JSON response and locate its download link.
        let data
        try {
            data = JSON.parse(raw.toString('utf8'))
        } catch {
            data = raw.toString('utf8')
        }

        if (response.status < 200 || response.status >= 300) {
            return m.reply(`Audio download failed: ${apiError(data, `HTTP ${response.status}`)}`)
        }

        const downloadUrl = getDownloadUrl(data)

        if (!isSafeLink(downloadUrl)) {
            const keys = typeof data === 'object' && data ? Object.keys(data).join(', ') : typeof data
            return m.reply(
                `The API did not return a usable audio link.\n\nHTTP: ${response.status}\nContent-Type: ${contentType || 'unknown'}\nResponse keys: ${keys}\n\nResponse:\n${String(JSON.stringify(data, null, 2) || data).slice(0, 800)}`
            )
        }

        const file = await axios.get(downloadUrl, {
            responseType: 'arraybuffer',
            timeout: 180000,
            maxRedirects: 5,
            headers: BROWSER_HEADERS
        })

        const audio = Buffer.from(file.data)
        if (!isAudioFile(audio)) {
            return m.reply('The download link did not return a valid audio file. Try again in a moment.')
        }

        const fileName = `${safeFileName(data?.title || video.title)}.mp3`
        const message = command === 'playdoc'
            ? { document: audio, mimetype: 'audio/mpeg', fileName }
            : { audio, mimetype: 'audio/mpeg', fileName }

        await waClient.sendMessage(m.chat, message, { quoted: m })
        await m.react?.('✅')
    } catch (error) {
        return m.reply(`Audio download failed: ${apiError(error.response?.data, error.message || 'Unable to reach the download service.')}`)
    }
}

handler.command = ['play', 'playaudio', 'playdoc', 'ytmp3', 'yta']
handler.category = 'Download'

export default handler
