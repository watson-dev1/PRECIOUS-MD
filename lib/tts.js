
import { getAudioBase64 } from 'google-tts-api'

/**
 * PRECIOUS-MD Text-to-Speech
 * Google TTS - no API key required.
 */

export async function generateTTS(text, options = {}) {
    if (!text || typeof text !== 'string') {
        throw new Error('TTS text is required')
    }

    const result = await getAudioBase64(text, {
        lang: options.lang || global.config?.TTS_LANG || 'en',
        slow: false,
        host: 'https://translate.google.com'
    })

    if (!result?.audioContent) {
        throw new Error('Google TTS returned empty audio')
    }

    return Buffer.from(result.audioContent, 'base64')
}

export default generateTTS
