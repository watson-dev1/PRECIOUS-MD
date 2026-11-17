/**

* Kaguya Multi Device — WhatsApp & Tele Bot
* 
* Library      : whiskeysockets baileys
* Type         : Plugins | ESM Modules
* Creator      : YannRzy Tech
* Recode       : (Your Name)
* 
* Developer Channels:
* • https://whatsapp.com/channel/0029VaoMGuLA89MbfGh62V16
*
* Info Update Kaguya Channels:
* • https://whatsapp.com/channel/0029VabymHd4CrfnqPLPzk3n
* 
* Copyright © YannRzy Tech 2026
* All Rights Reserved.
  */

import { wrapClassic, oneCommand, sendAlbum } from '../../../lib/engine/plugins.js'

const _ttimg = (() => {

async function getSlide(url) {
  const res = await fetch(`https://www.tikwm.com/api/?url=${url}&hd=1`)
  const json = await res.json()
  return json?.data
}

let handler = async (m, { text, usedPrefix, command, conn }) => {
  if (!text) {
    return m.reply(`Contoh:\n${usedPrefix + command} https://vt.tiktok.com/xxxx`)
  }

  await m.react('✨')

  try {
    const regex = /(https:\/\/(vt|vm)\.tiktok\.com\/[^\s]+|https:\/\/www\.tiktok\.com\/@[\w.-]+\/video\/\d+)/
    const url = text.match(regex)?.[0]

    if (!url) return m.reply('❌ Link TikTok tidak valid.')

    const data = await getSlide(url)
    if (!data) return m.reply('❌ Gagal mengambil data.')

    const images = data.images || []
    if (!images.length) return m.reply('❌ Post ini bukan slideshow foto.')

    const link = `https://www.tiktok.com/@${data.author.unique_id || 'user'}/video/${data.video_id}`
    const caption =
`*TIKTOK PHOTO*

Judul: ${data.title || '-'}
Uploader: ${data.author.nickname}
Total: ${images.length}
Link: ${link}`

    const slides = images.slice(0, 6)
    await sendAlbum(conn, m.chat, slides.map((url, i) => ({ type: 'image', url, caption: i === 0 ? caption : '' })), { quoted: m })
  } catch (e) {
    console.error(e)
    m.reply('❌ Gagal mengambil slide.')
  }
}

handler.help = ['ttimg', 'tiktokimg']
handler.tags = ['download']
handler.command = ['ttimg']
handler.limit = true
handler.register = true

const __plugin = wrapClassic(handler)

  return __plugin
})()

_ttimg.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
export default oneCommand(_ttimg, 'ttimg')
