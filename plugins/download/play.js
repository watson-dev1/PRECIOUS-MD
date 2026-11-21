
import axios from 'axios'
import yts from 'yt-search'
import {
    sendButtons,
    quickReply,
    urlButton,
    listButton
} from '../../lib/buttons.js'

const API_URL = 'https://api.neoxr.eu/api/youtube'
const API_KEY = 'zLDdhq'

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

const apiError = (data, fallback) => {
    if (typeof data === 'string' && data.trim()) return data.trim().slice(0, 200)
    if (typeof data?.error === 'string') return data.error
    if (data?.message) return String(data.message)
    return fallback
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
        buffer.subarray(0, 4).toString() === 'OggS'
    )
}

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

const watch = id => `https://youtube.com/watch?v=${id}`

// Extract download URL from NeoXR response.
const getMediaLink = data => {
    const sources = [
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
        data?.audio,
        data?.result
    ]

    for (const source of sources) {
        if (typeof source === 'string' && isSafeLink(source)) {
            return source
        }

        if (source && typeof source === 'object') {
            const nested = source.url || source.link || source.download

            if (typeof nested === 'string' && isSafeLink(nested)) {
                return nested
            }
        }
    }

    return null
}

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

// NeoXR API request
async function downloadFromNeoXR(url, type) {
    const response = await axios.get(API_URL, {
        params: {
            url,
            type,
            quality: type === 'video' ? '720p' : '128kbps',
            apikey: API_KEY
        },
        timeout: 120000,
        validateStatus: () => true,
        headers: {
            ...BROWSER_HEADERS,
            Accept: 'application/json'
        }
    })

    const data = response.data

    if (
        response.status < 200 ||
        response.status >= 300 ||
        data?.success === false ||
        data?.status === false
    ) {
        throw new Error(apiError(data, `HTTP ${response.status}`))
    }

    const link = getMediaLink(data)

    if (!link) {
        console.log('[NEOXR RESPONSE]', JSON.stringify(data, null, 2).slice(0, 5000))
        throw new Error('NeoXR did not return a valid download link.')
    }

    return {
        link,
        title:
            data?.data?.title ||
            data?.result?.title ||
            data?.title ||
            '',
        data
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

    let video, results

    try {
        ({ video, results } = await findVideo(query))
    } catch (error) {
        return m.reply(`❌ Search failed: ${error.message || error}`)
    }

    if (!video?.videoId) {
        return m.reply(`No results found for "${query}".`)
    }

    if (!video.seconds) {
        return m.reply('Live streams cannot be downloaded.')
    }

    const url = watch(video.videoId)

    // PLAY MENU
    if (command === 'play') {
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
                        description: `${r.timestamp || '-'} • ${r.author?.name || ''}`.slice(0, 72),
                        id: `${prefix}play ${watch(r.videoId)}`
                    }))
                }])
            )
        }

        return sendButtons(waClient, m, {
            image: video.thumbnail,
            title: '🎶 PRECIOUS PLAY',
            body:
                `*${video.title}*\n\n` +
                `👤 ${video.author?.name || 'Unknown'}\n` +
                `⏱️ ${video.timestamp || '-'}\n` +
                `👁️ ${Number(video.views || 0).toLocaleString()} views\n\n` +
                `Choose your download format:`,
            buttons
        })
    }

    // DOWNLOAD
    await m.react?.('⏳')

    try {
        const type = command === 'playvideo' ? 'video' : 'audio'

        const result = await downloadFromNeoXR(url, type)

        const title = result.title || video.title
        const fileName = safeFileName(title)

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
                headers: BROWSER_HEADERS
            })

            const audio = Buffer.from(file.data)

            if (!isAudioFile(audio)) {
                throw new Error('The API returned an invalid audio file.')
            }

            const message = command === 'playdoc'
                ? {
                    document: audio,
                    mimetype: 'audio/mpeg',
                    fileName: `${fileName}.mp3`
                }
                : {
                    audio,
                    mimetype: 'audio/mpeg',
                    fileName: `${fileName}.mp3`,
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
        console.error('[NEOXR YOUTUBE ERROR]', error)

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
