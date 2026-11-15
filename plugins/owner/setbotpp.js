import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'

const preciousPicPath = fileURLToPath(new URL('../../lib/precious-md.jpg', import.meta.url))

let handler = async (m, { waClient }) => {
    if (!m.quoted) return await m.reply('Reply to the image you want to use for the bot menu.')

    const mime = m.quoted.mimetype || m.quoted.msg?.mimetype || ''
    if (m.quoted.mtype !== 'imageMessage' && !mime.startsWith('image/')) {
        return await m.reply('Reply to an image.')
    }

    try {
        await waClient.sendMessage(m.chat, { react: { text: '🖼️', key: m.key } })
        const media = await m.quoted.download()

        writeFileSync(preciousPicPath, media)
        await waClient.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
        await m.reply('Bot menu image updated successfully.')
    } catch (error) {
        await waClient.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
        await m.reply(`Failed to update the bot menu image: ${error.message || String(error)}`)
    }
}

handler.command = ['setbotimage', 'setbotpp']
handler.owner = true

export default handler
