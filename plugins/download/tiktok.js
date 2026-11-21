
import axios from 'axios'

const API_URL = 'https://api.neoxr.eu/api/tiktok'

const isTikTokUrl = value => {
    try {
        const url = new URL(value)
        const host = url.hostname.toLowerCase()

        return url.protocol === 'https:' &&
            (host === 'tiktok.com' || host.endsWith('.tiktok.com'))
    } catch {
        return false
    }
}

const apiError = (data, fallback) => {
    if (typeof data === 'string' && data.trim()) return data.trim()
    if (typeof data?.error === 'string') return data.error
    if (data?.message) return String(data.message)
    return fallback
}

let handler = async (m, { text, waClient }) => {
    const url = String(text || '').trim()

    if (!url) {
        return await m.reply(
            `Usage: ${global.prefix || '.'}tiktok <TikTok link>`
        )
    }

    if (!isTikTokUrl(url)) {
        return await m.reply('Send a valid TikTok link.')
    }

    try {
        await m.reply('⏳ Downloading TikTok video...')

        const response = await axios.get(API_URL, {
            params: { url },
            timeout: 90000,
            validateStatus: () => true,
            headers: {
                Accept: 'application/json',
                'User-Agent': 'Mozilla/5.0'
            }
        })

        const data = response.data

        if (
            response.status < 200 ||
            response.status >= 300 ||
            data?.success === false
        ) {
            return await m.reply(
                `❌ TikTok download failed: ${apiError(data, `HTTP ${response.status}`)}`
            )
        }

        // NeoXR response compatibility
        const video =
            data?.data?.video ||
            data?.data?.url ||
            data?.video ||
            data?.url ||
            data?.result?.video ||
            data?.result?.url

        if (!video || typeof video !== 'string') {
            return await m.reply(
                `❌ No downloadable video found.\nAPI response: ${apiError(data, 'Invalid API response')}`
            )
        }

        const caption =
            data?.data?.title ||
            data?.title ||
            data?.result?.title ||
            'Downloaded by PRECIOUS-MD'

        return await waClient.sendMessage(
            m.chat,
            {
                video: { url: video },
                mimetype: 'video/mp4',
                caption: String(caption).trim()
            },
            { quoted: m }
        )

    } catch (error) {
        console.error('[TIKTOK DOWNLOAD]', error)

        return await m.reply(
            `❌ TikTok download failed:\n${apiError(
                error.response?.data,
                error.message || 'Unable to reach NeoXR API.'
            )}`
        )
    }
}

handler.command = ['tiktok8', 'ttdl']

export default handler
