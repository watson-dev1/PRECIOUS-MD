import { generateWAMessageFromContent, prepareWAMessageMedia } from '@whiskeysockets/baileys'
import { getGroupMetadata } from '../../lib/myfunc.js'

let handler = async (m, { waClient }) => {
    try {
        const [code, metadata] = await Promise.all([
            waClient.groupInviteCode(m.chat),
            getGroupMetadata(waClient, m.chat)
        ])
        const link = `https://chat.whatsapp.com/${code}`
        const subject = metadata?.subject || 'This Group'

        let imageMessage
        try {
            const imageUrl = await waClient.profilePictureUrl(m.chat, 'image')
            const media = await prepareWAMessageMedia(
                { image: { url: imageUrl } },
                { upload: waClient.waUploadToServer }
            )
            imageMessage = media.imageMessage
        } catch {}

        const header = imageMessage
            ? { imageMessage, hasMediaAttachment: true }
            : { title: `👥 ${subject}`, hasMediaAttachment: false }

        const text = `👥 *${subject}*\n\nInvite your friends using the link below.\n\n🔗 ${link}\n\n👇 Tap *Join Group* to join instantly or *Copy Link* to share it.`
        const message = generateWAMessageFromContent(
            m.chat,
            {
                interactiveMessage: {
                    header,
                    body: { text },
                    footer: { text: `POWERED BY PRECIOUS-MD 🇿🇼` },
                    nativeFlowMessage: {
                        buttons: [
                            {
                                name: 'cta_url',
                                buttonParamsJson: JSON.stringify({
                                    display_text: 'Join Group 👥',
                                    url: link,
                                    merchant_url: link
                                })
                            },
                            {
                                name: 'cta_copy',
                                buttonParamsJson: JSON.stringify({
                                    display_text: 'Copy Link 📋',
                                    copy_code: link
                                })
                            }
                        ],
                        messageParamsJson: ''
                    },
                    contextInfo: { pairedMediaType: 0 }
                }
            },
            {
                userJid: waClient.user.id,
                quoted: m
            }
        )

        await waClient.relayMessage(m.chat, message.message, {
            messageId: message.key.id,
            additionalNodes: [
                {
                    tag: 'biz',
                    attrs: {},
                    content: [
                        {
                            tag: 'interactive',
                            attrs: { type: 'native_flow', v: '1' },
                            content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
                        }
                    ]
                }
            ]
        })
        await waClient.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
    } catch (error) {
        await m.reply(`Unable to create the group invite: ${error.message || String(error)}`)
    }
}

handler.command = ['invite', 'grouplink', 'linkgroup']
handler.group = true
handler.admin = true
handler.isBotAdmin = true

export default handler
