
import axios from 'axios'
import {
    sendButtons,
    quickReply,
    urlButton,
    listButton
} from '../../lib/buttons.js'

const API_KEY = 'zLDdhq'
const PLAY_API = 'https://api.neoxr.eu/api/play'
const YOUTUBE_API = 'https://api.neoxr.eu/api/youtube'

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
    Accept: 'application/json, */*'
}

const apiError = (data, fallback) => {
    if (typeof data === 'string' && data.trim()) return data.trim().slice(0, 200)
    if (typeof data?.error === 'string') return data.error
    if (data?.message) return String(data.message)
    return fallback
}

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

const watch = id => `https://www.youtube.com/watch?v=${id}`

const isSafeLink = value => {
    try {
        const url = new URL(value)
        const host = url.hostname.toLowerCase()

        return (
            url.protocol === 'https:' &&
            host !== 'localhost' &&
            !/^[\d.]+$/.test(host) &&
            !host.includes(':')
        )
    } catch {
        return false
    }
}

const safeFileName = title =>
    String(title || 'audio')
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100) || 'audio'

const isAudioFile = buffer => {
    if (buffer.length < 10 * 1024) return false

    if (buffer.subarray(0, 3).toString() === 'ID3') return true

    if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
        return true
    }

    return (
        buffer.subarray(4, 8).toString() === 'ftyp' ||
        buffer.subarray(0, 4).toString() === 'OggS' ||
        buffer.subarray(0, 4).toString() === 'RIFF'
    )
}

// Extract possible NeoXR data arrays.
const getItems = data => {
    const candidates = [
        data?.data,
        data?.result,
        data?.results,
        data?.videos,
        data?.items
    ]

    for (const candidate of candidates) {
        if (Array.isArray(candidate)) return candidate

        if (candidate && typeof candidate === 'object') {
            if (Array.isArray(candidate.results)) return candidate.results
            if (Array.isArray(candidate.videos)) return candidate.videos
            if (Array.isArray(candidate.items)) return candidate.items
        }
    }

    return []
}

// Normalize search results.
const normalizeVideo = item => {
    if (!item || typeof item !== 'object') return null

    const url =
        item.url ||
        item.link ||
        item.videoUrl ||
        item.video_url ||
        ''

    const id =
        item.videoId ||
        item.video_id ||
        item.id ||
        getVideoId(url)

    if (!id || typeof id !== 'string') return null

    return {
        videoId: id,
        title: String(item.title || item.name || 'Unknown title'),
        thumbnail:
            item.thumbnail ||
            item.image ||
            item.thumb ||
            item.thumbnailUrl ||
            '',
        author: {
            name:
                item.author?.name ||
                item.channel ||
                item.author ||
                item.uploader ||
                'Unknown'
        },
        timestamp:
            item.timestamp ||
            item.duration ||
            item.time ||
            '-',
        seconds: Number(item.seconds || item.durationSeconds || 0),
        views: Number(item.views || item.viewCount || 0)
    }
}

// Search exclusively through NeoXR.
async function searchVideo(query) {
    const directId = getVideoId(query)

    if (directId) {
        return {
            video: {
                videoId: directId,
                title: 'YouTube Video',
                thumbnail: '',
                author: { name: 'YouTube' },
                timestamp: '-',
                seconds: 1,
                views: 0
            },
            results: []
        }
    }

    const response = await axios.get(PLAY_API, {
        params: {
            q: query,
            apikey: API_KEY
        },
        timeout: 90000,
        validateStatus: () => true,
        headers: HEADERS
    })

    const data = response.data

    if (
        response.status < 200 ||
        response.status >= 300 ||
        data?.success === false ||
        data?.status === false
    ) {
        throw new Error(
            apiError(data, `NeoXR search HTTP ${response.status}`)
        )
    }

    const items = getItems(data)

    // Some API responses return one result instead of an array.
    const rawItems = items.length
        ? items
        : [
            data?.data,
            data?.result,
            data?.video,
            data
        ].filter(item =>
            item &&
            !Array.isArray(item) &&
            typeof item === 'object' &&
            (item.videoId || item.video_id || item.id || item.url || item.link)
        )

    const normalized = rawItems
        .map(normalizeVideo)
        .filter(Boolean)

    if (!normalized.length) {
        console.log(
            '[NEOXR SEARCH RESPONSE]',
            JSON.stringify(data, null, 2).slice(0, 5000)
        )

        throw new Error('NeoXR returned no recognizable YouTube results.')
    }

    return {
        video: normalized[0],
        results: normalized.slice(1, 6)
    }
}

// Extract download URL from NeoXR.
const getMediaLink = data => {
    const candidates = [
        data?.data?.url,
        data?.data?.link,
        data?.data?.download,
        data?.data?.video,
        data?.data?.audio,
        data?.result?.url,
        data?.result?.link,
        data?.result?.download,
        data?.result?.video,
        data?.result?.audio,
        data?.url,
        data?.link,
        data?.download,
        data?.video,
        data?.audio
    ]

    for (const candidate of candidates) {
        if (typeof candidate === 'string' && isSafeLink(candidate)) {
            return candidate
        }

        if (candidate && typeof candidate === 'object') {
            const nested = candidate.url || candidate.link || candidate.download

            if (typeof nested === 'string' && isSafeLink(nested)) {
                return nested
            }
        }
    }

    return null
}

// Download using NeoXR.
async function downloadFromNeoXR(url, type) {
    const response = await axios.get(YOUTUBE_API, {
        params: {
            url,
            type,
            quality: type === 'video' ? '720p' : '128kbps',
            apikey: API_KEY
        },
        timeout: 120000,
        validateStatus: () => true,
        headers: HEADERS
    })

    const data = response.data

    if (
        response.status < 200 ||
        response.status >= 300 ||
        data?.success === false ||
        data?.status === false
    ) {
        throw new Error(
            apiError(data, `NeoXR download HTTP ${response.status}`)
        )
    }

    const link = getMediaLink(data)

    if (!link) {
        console.log(
            '[NEOXR DOWNLOAD RESPONSE]',
            JSON.stringify(data, null, 2).slice(0, 5000)
        )

        throw new Error('No downloadable media link was returned.')
    }

    return {
        link,
        title:
            data?.data?.title ||
            data?.result?.title ||
            data?.title ||
            ''
    }
}

let handler = async (m, {
    waClient,
    text = '',
    command
}) => {
    const prefix = global.prefix || '.'
    const query = String(text).trim()

    if (!query) {
        return m.reply(
            `*Usage:* ${prefix}${command} <song name or YouTube link>`
        )
    }

    // SEARCH USING NEOXR ONLY
    if (command === 'play') {
        let video, results

        try {
            await m.react?.('🔎')

            const search = await searchVideo(query)

            video = search.video
            results = search.results

        } catch (error) {
            console.error('[NEOXR SEARCH ERROR]', error)

            await m.react?.('❌')

            return m.reply(
                `❌ Search failed: ${error.message || error}`
            )
        }

        if (!video?.videoId) {
            return m.reply('❌ No YouTube results found.')
        }

        const url = watch(video.videoId)

        const buttons = [
            quickReply('🎵 Audio 128kbps', `${prefix}playaudio ${url}`),
            quickReply('🎬 Video 720p', `${prefix}playvideo ${url}`),
            quickReply('📄 Audio Document', `${prefix}playdoc ${url}`),
            urlButton('▶️ Open YouTube', url)
        ]

        if (results.length) {
            buttons.push(
                listButton('🔎 More results', [{
                    title: 'Other matches',
                    rows: results.map(r => ({
                        title: String(r.title).slice(0, 24),
                        description:
                            `${r.timestamp || '-'} • ${r.author.name}`.slice(0, 72),
                        id: `${prefix}play ${watch(r.videoId)}`
                    }))
                }])
            )
        }

        await m.react?.('✅')

        return sendButtons(waClient, m, {
            image: video.thumbnail || undefined,
            title: '🎶 PRECIOUS PLAY',
            body:
                `*${video.title}*\n\n` +
                `👤 ${video.author.name}\n` +
                `⏱️ ${video.timestamp}\n` +
                `👁️ ${video.views.toLocaleString()} views\n\n` +
                `Choose your download format:`,
            buttons
        })
    }

    // AUDIO / VIDEO DOWNLOAD
    const type = command === 'playvideo' ? 'video' : 'audio'
    const videoId = getVideoId(query)

    if (!videoId) {
        return m.reply(
            '❌ Send a valid YouTube link for downloading.'
        )
    }

    const url = watch(videoId)

    try {
        await m.react?.('⏳')

        const result = await downloadFromNeoXR(url, type)
        const title = safeFileName(result.title || 'PRECIOUS-MD')

        if (type === 'video') {
            await waClient.sendMessage(
                m.chat,
                {
                    video: { url: result.link },
                    mimetype: 'video/mp4',
                    caption:
                        `🎬 *${title}*\n\n` +
                        `📺 Quality: 720p\n` +
                        `⚡ Downloaded by PRECIOUS-MD`
                },
                { quoted: m }
            )
        } else {
            const file = await axios.get(result.link, {
                responseType: 'arraybuffer',
                timeout: 180000,
                maxRedirects: 5,
                headers: HEADERS
            })

            const audio = Buffer.from(file.data)

            if (!isAudioFile(audio)) {
                throw new Error('The API returned an invalid audio file.')
            }

            const message = command === 'playdoc'
                ? {
                    document: audio,
                    mimetype: 'audio/mpeg',
                    fileName: `${title}.mp3`
                }
                : {
                    audio,
                    mimetype: 'audio/mpeg',
                    fileName: `${title}.mp3`,
                    ptt: false
                }

            await waClient.sendMessage(
                m.chat,
                message,
                { quoted: m }
            )
        }

        await m.react?.('✅')

    } catch (error) {
        console.error('[NEOXR DOWNLOAD ERROR]', error)

        await m.react?.('❌')

        return m.reply(
            `❌ ${type === 'video' ? 'Video' : 'Audio'} download failed:\n${error.message || error}`
        )
    }
}

handler.command = [
    'play',
    'playaudio',
    'playvideo',
    'playdoc',
    'ytmp3',
    'yta'
]

handler.category = 'Download'

export default handler
