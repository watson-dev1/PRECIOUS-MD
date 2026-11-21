
import axios from 'axios'
import yts from 'yt-search'
import { sendButtons, quickReply, urlButton, listButton } from '../../lib/buttons.js'

const API_URL = 'https://knightbotapi.stream/api/download/ytaudio'
const API_KEY = 'knight'
const AUDIO_FORMAT = '128kbps'

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
    Accept: '*/*'
}

const getVideoId = value => {
    try {
        const url = new URL(value)
        const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, '')

        if (host === 'youtu.be') {
            return url.pathname.slice(1).split('/')[0] || ''
        }

        if (host === 'youtube.com' || host === 'music.youtube.com') {
            if (url.pathname === '/watch') {
                return url.searchParams.get('v') || ''
            }

            const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/)
            return match?.[1] || ''
        }
    } catch {}

    return ''
}

const apiError = (data, fallback = 'Unknown API error') => {
    if (typeof data === 'string' && data.trim()) {
        try {
            data = JSON.parse(data)
        } catch {
            return data.trim().slice(0, 300)
        }
    }

    if (typeof data?.error === 'string') return data.error
    if (data?.error?.message) return data.error.message
    if (data?.message) return String(data.message)
    if (data?.msg) return String(data.msg)

    return fallback
}

const safeFileName = title =>
    String(title || 'audio')
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100) || 'audio'

const isAudioFile = buffer => {
    if (!Buffer.isBuffer(buffer) || buffer.length < 1024) return false

    // MP3 ID3
    if (buffer.subarray(0, 3).toString() === 'ID3') return true

    // MP3 frame sync
    if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return true

    // MP4 / M4A
    if (buffer.subarray(4, 8).toString() === 'ftyp') return true

    // OGG
    if (buffer.subarray(0, 4).toString() === 'OggS') return true

    // WAV
    if (
        buffer.subarray(0, 4).toString() === 'RIFF' &&
        buffer.subarray(8, 12).toString() === 'WAVE'
    ) return true

    // FLAC
    if (buffer.subarray(0, 4).toString() === 'fLaC') return true

    return false
}

const isSafeLink = value => {
    try {
        const url = new URL(value)

        return (
            url.protocol === 'https:' &&
            !url.username &&
            !url.password &&
            url.hostname !== 'localhost' &&
            !/^[\d.]+$/.test(url.hostname) &&
            !url.hostname.includes(':')
        )
    } catch {
        return false
    }
}

const watch = id => `https://youtube.com/watch?v=${id}`

async function findVideo(query) {
    const videoId = getVideoId(query)

    if (videoId) {
        return {
            video: await yts({ videoId }),
            results: []
        }
    }

    const search = await yts(query)

    return {
        video: search.videos?.[0],
        results: (search.videos || []).slice(1, 6)
    }
}

// Extract audio link from different possible API response formats
function extractAudioLink(data) {
    if (!data) return ''

    if (typeof data === 'string') {
        try {
            return extractAudioLink(JSON.parse(data))
        } catch {
            const trimmed = data.trim()
            return isSafeLink(trimmed) ? trimmed : ''
        }
    }

    if (Array.isArray(data)) {
        for (const item of data) {
            const link = extractAudioLink(item)
            if (link) return link
        }

        return ''
    }

    const possibleLinks = [
        data.link,
        data.url,
        data.download,
        data.downloadUrl,
        data.download_url,
        data.audio,
        data.audioUrl,
        data.result,
        data.data,
        data.result?.link,
        data.result?.url,
        data.result?.download,
        data.result?.downloadUrl,
        data.data?.link,
        data.data?.url,
        data.data?.download,
        data.data?.downloadUrl,
        data.data?.audio
    ]

    for (const value of possibleLinks) {
        if (typeof value === 'string' && isSafeLink(value)) {
            return value
        }
    }

    return ''
}

function extractTitle(data, fallback) {
    return (
        data?.title ||
        data?.data?.title ||
        data?.result?.title ||
        data?.metadata?.title ||
        fallback ||
        'audio'
    )
}

// Request KnightBot API
async function requestAudioAPI(youtubeUrl) {
    const endpoint = new URL(API_URL)

    endpoint.searchParams.set('apikey', API_KEY)
    endpoint.searchParams.set('format', AUDIO_FORMAT)
    endpoint.searchParams.set('url', youtubeUrl)

    const response = await axios.get(endpoint.toString(), {
        timeout: 120000,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: {
            ...BROWSER_HEADERS,
            Accept: 'application/json, text/plain, */*'
        }
    })

    if (response.status < 200 || response.status >= 300) {
        throw new Error(
            apiError(response.data, `KnightBot HTTP ${response.status}`)
        )
    }

    let data = response.data

    if (typeof data === 'string') {
        try {
            data = JSON.parse(data)
        } catch {
            throw new Error(
                `Invalid API response: ${data.slice(0, 250)}`
            )
        }
    }

    if (
        data?.success === false ||
        data?.status === false ||
        data?.status === 'error'
    ) {
        throw new Error(apiError(data, 'KnightBot rejected the download'))
    }

    const link = extractAudioLink(data)

    if (!link) {
        throw new Error(
            `No audio URL found. API response: ${JSON.stringify(data).slice(0, 400)}`
        )
    }

    return {
        link,
        title: extractTitle(data, 'audio')
    }
}

// Download actual audio file
async function downloadAudioFile(link) {
    if (!isSafeLink(link)) {
        throw new Error('Invalid or unsafe audio download URL')
    }

    const response = await axios.get(link, {
        responseType: 'arraybuffer',
        timeout: 180000,
        maxRedirects: 5,
        validateStatus: status => status >= 200 && status < 300,
        headers: BROWSER_HEADERS,
        maxContentLength: 100 * 1024 * 1024,
        maxBodyLength: 100 * 1024 * 1024
    })

    const audio = Buffer.from(response.data)

    if (!isAudioFile(audio)) {
        const contentType = response.headers?.['content-type'] || 'unknown'

        throw new Error(
            `The server returned invalid audio. Content-Type: ${contentType}`
        )
    }

    return audio
}

let handler = async (m, { waClient, text = '', command }) => {
    const prefix = global.prefix || '.'
    const query = String(text).trim()

    if (!query) {
        return m.reply(
            `*Usage:* ${prefix}${command} <song name or YouTube link>`
        )
    }

    // ---- SEARCH YOUTUBE ----
    let video, results

    try {
        ;({ video, results } = await findVideo(query))
    } catch (error) {
        console.error('[PLAY SEARCH ERROR]', error)
        return m.reply(
            `❌ Search failed: ${error.message || error}`
        )
    }

    if (!video?.videoId) {
        return m.reply(`No results found for "${query}".`)
    }

    if (!video.seconds) {
        return m.reply(
            'That is a live stream, so I cannot download it as audio.'
        )
    }

    const url = watch(video.videoId)

    // ---- .PLAY RESULT CARD ----
    if (command === 'play') {
        const buttons = [
            quickReply('🎵 Audio', `${prefix}playaudio ${url}`),
            quickReply('🎬 Video', `${prefix}playvideo ${url}`),
            quickReply('📄 Audio as file', `${prefix}playdoc ${url}`),
            urlButton('▶️ Open on YouTube', url)
        ]

        if (results.length) {
            buttons.push(
                listButton('🔎 More results', [{
                    title: 'Other matches',
                    rows: results.map(r => ({
                        title: String(r.title).slice(0, 24),
                        description: `${r.timestamp || '-'} • ${r.author?.name || ''}`.slice(0, 72),
                        id: `${prefix}play ${watch(r.videoId)}`
                    }))
                }])
            )
        }

        return sendButtons(waClient, m, {
            image: video.thumbnail,
            title: '🎶 PLAY',
            body:
                `*${video.title}*\n\n` +
                `👤 ${video.author?.name || 'Unknown'}\n` +
                `⏱️ ${video.timestamp || '-'}\n` +
                `👁️ ${Number(video.views || 0).toLocaleString()} views\n\n` +
                `Choose a format:`,
            buttons
        })
    }

    // ---- AUDIO DOWNLOAD ----
    await m.react?.('⏳')

    try {
        // Request download from KnightBot
        const result = await requestAudioAPI(url)

        // Download actual audio bytes
        const audio = await downloadAudioFile(result.link)

        const fileName =
            `${safeFileName(result.title || video.title)}.mp3`

        // Send as document or audio
        const message = command === 'playdoc'
            ? {
                document: audio,
                mimetype: 'audio/mpeg',
                fileName
            }
            : {
                audio,
                mimetype: 'audio/mpeg',
                fileName,
                ptt: false
            }

        await waClient.sendMessage(
            m.chat,
            message,
            { quoted: m }
        )

        await m.react?.('✅')

    } catch (error) {
        console.error(
            '[KNIGHTBOT AUDIO ERROR]',
            error.response?.data || error
        )

        await m.react?.('❌')

        return m.reply(
            `❌ Audio download failed.\n\n` +
            `Reason: ${String(error.message || error).slice(0, 500)}`
        )
    }
}

handler.command = [
    'play',
    'playaudio',
    'playdoc',
    'ytmp3',
    'yta'
]

handler.category = 'Download'

export default handler
