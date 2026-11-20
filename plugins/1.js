
// plugins/readviewonce.js

let handler = async (m, { waClient }) => {
    if (!waClient?.user?.id) {
        return m.reply('❌ Bot is not fully connected yet. Try again shortly.')
    }

    if (!m.quoted) {
        return m.reply(
            '✳️ Reply to a View Once image, video, or audio message with .readviewonce'
        )
    }

    try {
        const quoted = m.quoted

        // Detect quoted media type
        const mime = String(
            quoted.mimetype ||
            quoted.msg?.mimetype ||
            quoted.message?.imageMessage?.mimetype ||
            quoted.message?.videoMessage?.mimetype ||
            quoted.message?.audioMessage?.mimetype ||
            ''
        ).toLowerCase()

        const messageType = String(
            quoted.mtype ||
            quoted.type ||
            ''
        ).toLowerCase()

        const isImage = mime.includes('image') || messageType.includes('image')
        const isVideo = mime.includes('video') || messageType.includes('video')
        const isAudio = mime.includes('audio') || messageType.includes('audio')

        if (!isImage && !isVideo && !isAudio) {
            return m.reply(
                '❌ Unsupported media. Reply to a View Once image, video, or audio.'
            )
        }

        // Check View Once wrapper
        const rawMessage = quoted.message || quoted.msg || {}
        const isViewOnce =
            Boolean(rawMessage.viewOnceMessage) ||
            Boolean(rawMessage.viewOnceMessageV2) ||
            Boolean(rawMessage.viewOnceMessageV2Extension) ||
            Boolean(rawMessage.imageMessage?.viewOnce) ||
            Boolean(rawMessage.videoMessage?.viewOnce) ||
            Boolean(rawMessage.audioMessage?.viewOnce) ||
            Boolean(quoted.viewOnce)

        if (!isViewOnce) {
            return m.reply(
                '⚠️ This does not appear to be a View Once message. Reply directly to the original View Once media.'
            )
        }

        // Download quoted media
        if (typeof quoted.download !== 'function') {
            return m.reply(
                '❌ Your message handler does not support quoted.download().'
            )
        }

        const media = await quoted.download()

        if (!media || !media.length) {
            throw new Error('Failed to download View Once media.')
        }

        const caption = [
            '✅ *VIEW ONCE MEDIA RECOVERED*',
            '',
            '> PRECIOUS-MD by Watson Fourpence'
        ].join('\n')

        // Send image
        if (isImage) {
            await waClient.sendMessage(
                m.chat,
                {
                    image: media,
                    caption,
                    mimetype: mime || 'image/jpeg'
                },
                { quoted: m }
            )
        }

        // Send video
        else if (isVideo) {
            await waClient.sendMessage(
                m.chat,
                {
                    video: media,
                    caption,
                    mimetype: mime || 'video/mp4'
                },
                { quoted: m }
            )
        }

        // Send audio as voice note when appropriate
        else if (isAudio) {
            await waClient.sendMessage(
                m.chat,
                {
                    audio: media,
                    mimetype: mime || 'audio/ogg; codecs=opus',
                    ptt: true
                },
                { quoted: m }
            )
        }

    } catch (err) {
        console.error('[READVIEWONCE] Error:', err?.stack || err)

        await m.reply(
            `❌ Failed to recover View Once media.\n\nReason: ${err?.message || 'Unknown error'}`
        ).catch(() => {})
    }
}

handler.command = [
    'readviewonce',
    'readvo',
    'v',
    'read'
]

handler.category = 'Tools'
handler.description = 'Recover View Once media from a quoted message'
handler.usage = 'Reply to View Once media with .readviewonce'
handler.ownerBypassAdmin = true

export default handler
