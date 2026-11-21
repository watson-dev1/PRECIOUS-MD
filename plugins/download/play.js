
import axios from 'axios'
import yts from 'yt-search'
import {
    sendButtons,
    quickReply,
    urlButton,
    listButton
} from '../../lib/buttons.js'

const API_URL = 'https://knightbotapi.stream/api/download/ytaudio'
const API_KEY = 'knight'
const AUDIO_FORMAT = '128kbps'

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36',
    Accept: 'application/json, text/plain, */*'
}

// Alternative YouTube search providers
const SEARCH_PROVIDERS = [
    'https://inv.nadeko.net',
    'https://invidious.nerdvpn.de',
    'https://invidious.privacyredirect.com'
]

const getVideoId = value => {
    try {
        const url = new URL(value)
        const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, '')

        if (host === 'youtu.be') {
            return url.pathname.slice(1).split('/')[0] || ''
        }

        if (
            host === 'youtube.com' ||
            host === 'music.youtube.com'
        ) {
            if (url.pathname === '/watch') {
                return url.searchParams.get('v') || ''
            }

            const match = url.pathname.match(
                /^\/(?:shorts|embed|live)\/([\w-]{6,})/
            )

            return match?.[1] || ''
        }
    } catch {}

    return ''
}

const watch = id => `https://youtube.com/watch?v=${id}`

const safeFileName = title =>
    String(title || 'audio')
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100) || 'audio'

const apiError = (data, fallback = 'Unknown API error') => {
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data)
        } catch {
            return data.trim().slice(0, 300) || fallback
        }
    }

    if (typeof data?.error === 'string') return data.error
    if (data?.error?.message) return data.error.message
    if (data?.message) return String(data.message)
    if (data?.msg) return String(data.msg)

    return fallback
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

const isAudioFile = buffer => {
    if (!Buffer.isBuffer(buffer) || buffer.length < 1024) {
        return false
    }

    if (buffer.subarray(0, 3).toString() === 'ID3') return true

    if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
        return true
    }

    if (buffer.subarray(4, 8).toString() === 'ftyp') return true
    if (buffer.subarray(0, 4).toString() === 'OggS') return true
    if (buffer.subarray(0, 4).toString() === 'fLaC') return true

    if (
        buffer.subarray(0, 4).toString() === 'RIFF' &&
        buffer.subarray(8, 12).toString() === 'WAVE'
    ) return true

    return false
}

// Normalize results from different search providers
function normalizeVideo(video) {
    if (!video) return null

    const videoId = video.videoId || video.video_id

    if (!videoId) return null

    const seconds = Number(
        video.seconds ??
        video.lengthSeconds ??
        video.length_seconds ??
        0
    )

    const thumbnails = video.videoThumbnails || []

    return {
        videoId,
        title: video.title || 'Unknown title',
        author: {
            name:
                video.author?.name ||
                video.author ||
                video.uploader ||
                'Unknown'
        },
        seconds,
        timestamp:
            video.timestamp ||
            video.duration ||
            formatDuration(seconds),
        views: Number(
            video.views ??
            video.viewCount ??
            video.view_count ??
            0
        ),
        thumbnail:
            video.thumbnail ||
            video.videoThumbnails?.[video.videoThumbnails.length - 1]?.url ||
            thumbnails[0]?.url ||
            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    }
}

function formatDuration(seconds) {
    if (!seconds) return '-'

    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60

    return h
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`
}

// Search using Invidious providers
async function searchInvidious(query) {
    let lastError

    for (const instance of SEARCH_PROVIDERS) {
        try {
            const response = await axios.get(
                `${instance}/api/v1/search`,
                {
                    params: {
                        q: query,
                        type: 'video'
                    },
                    timeout: 12000,
                    headers: BROWSER_HEADERS
                }
            )

            if (!Array.isArray(response.data)) {
                throw new Error('Invalid search response')
            }

            const videos = response.data
                .filter(item => item.type === 'video' || item.videoId)
                .map(normalizeVideo)
                .filter(Boolean)

            if (videos.length) {
                return {
                    video: videos[0],
                    results: videos.slice(1, 6)
                }
            }

            lastError = new Error('No search results')
        } catch (error) {
            lastError = error
            console.error(
                `[SEARCH PROVIDER] ${instance}:`,
                error.message
            )
        }
    }

    throw lastError || new Error('All search providers failed')
}

// Get YouTube video details using Invidious
async function getInvidiousVideo(videoId) {
    let lastError

    for (const instance of SEARCH_PROVIDERS) {
        try {
            const response = await axios.get(
                `${instance}/api/v1/videos/${videoId}`,
                {
                    timeout: 12000,
                    headers: BROWSER_HEADERS
                }
            )

            const video = normalizeVideo(response.data)

            if (video) return video

        } catch (error) {
            lastError = error
            console.error(
                `[VIDEO DETAILS] ${instance}:`,
                error.message
            )
        }
    }

    throw lastError || new Error('Unable to retrieve video details')
}

// Main search function with automatic fallback
async function findVideo(query) {
    const videoId = getVideoId(query)

    // Direct YouTube link: no search required
    if (videoId) {
        try {
            const video = await getInvidiousVideo(videoId)

            return {
                video,
                results: []
            }
        } catch (invidiousError) {
            console.error(
                '[INVIDIOUS DETAILS FAILED]',
                invidiousError.message
            )

            // Last fallback
            try {
                const result = await yts({ videoId })
                const video = normalizeVideo(result)

                if (video) {
                    return {
                        video,
                        results: []
                    }
                }
            } catch (error) {
                console.error('[YT-SEARCH DETAILS]', error.message)
            }

            throw new Error(
                'Could not retrieve YouTube video information. Try again later.'
            )
        }
    }

    // First try alternative search providers
    try {
        return await searchInvidious(query)
    } catch (error) {
        console.error(
            '[INVIDIOUS SEARCH FAILED]',
            error.message
        )
    }

    // Fallback to original yt-search
    try {
        const search = await yts(query)

        const videos = (search.videos || [])
            .map(normalizeVideo)
            .filter(Boolean)

        if (videos.length) {
            return {
                video: videos[0],
                results: videos.slice(1, 6)
            }
        }
    } catch (error) {
        console.error('[YT-SEARCH FALLBACK]', error.message)
    }

    throw new Error(
        'All YouTube search providers failed. Try a direct YouTube link instead.'
    )
}

// Extract download URL from different API response formats
function extractAudioLink(data) {
    if (!data) return ''

    if (typeof data === 'string') {
        try {
            return extractAudioLink(JSON.parse(data))
        } catch {
            const value = data.trim()
            return isSafeLink(value) ? value : ''
        }
    }

    if (Array.isArray(data)) {
        for (const item of data) {
            const link = extractAudioLink(item)
            if (link) return link
        }

        return ''
    }

    const links = [
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

    for (const link of links) {
        if (typeof link === 'string' && isSafeLink(link)) {
            return link
        }
    }

    return ''
}

function extractTitle(data, fallback) {
    return (
        data?.title ||
        data?.data?.title ||
        data?.result?.title ||
        fallback ||
        'audio'
    )
}

// Request KnightBot audio API
async function requestAudioAPI(youtubeUrl) {
    const endpoint = new URL(API_URL)

    endpoint.searchParams.set('apikey', API_KEY)
    endpoint.searchParams.set('format', AUDIO_FORMAT)
    endpoint.searchParams.set('url', youtubeUrl)

    const response = await axios.get(endpoint.toString(), {
        timeout: 120000,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: BROWSER_HEADERS
    })

    if (response.status < 200 || response.status >= 300) {
        throw new Error(
            apiError(
                response.data,
                `KnightBot HTTP ${response.status}`
            )
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
        throw new Error(
            apiError(data, 'KnightBot rejected the download')
        )
    }

    const link = extractAudioLink(data)

    if (!link) {
        throw new Error(
            `No audio URL found: ${JSON.stringify(data).slice(0, 350)}`
        )
    }

    return {
        link,
        title: extractTitle(data, 'audio')
    }
}

// Download actual audio bytes
async function downloadAudioFile(link) {
    if (!isSafeLink(link)) {
        throw new Error('Invalid audio download URL')
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
        const type = response.headers?.['content-type'] || 'unknown'

        throw new Error(
            `Invalid audio file returned. Content-Type: ${type}`
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

    // SEARCH YOUTUBE
    let video, results

    try {
        ;({ video, results } = await findVideo(query))
    } catch (error) {
        console.error('[PLAY SEARCH ERROR]', error)

        return m.reply(
            `❌ Search failed.\n\nReason: ${error.message || error}\n\n` +
            `You can also try a direct YouTube link.`
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

    // PLAY RESULT CARD
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
                        description:
                            `${r.timestamp || '-'} • ${r.author?.name || ''}`.slice(0, 72),
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

    // AUDIO DOWNLOAD
    await m.react?.('⏳')

    try {
        const result = await requestAudioAPI(url)
        const audio = await downloadAudioFile(result.link)

        const fileName =
            `${safeFileName(result.title || video.title)}.mp3`

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
