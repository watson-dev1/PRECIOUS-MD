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
import { wrapClassic, oneCommand } from '../../../lib/engine/plugins.js'
import { capcut } from 'btch-downloader'
import fetch from 'node-fetch'

const _capcut = (() => {

async function getCapcutVideo(url) {
  const res = await fetch(
    "https://capdownloader.com/wp-json/aio-dl/video-data/",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": "https://capdownloader.com",
        "referer": "https://capdownloader.com/",
        "user-agent": "Mozilla/5.0"
      },
      body: JSON.stringify({ url })
    }
  )

  if (!res.ok) throw "The server did not respond"

  const data = await res.json().catch(() => ({}))
  const video = data?.medias?.[0]?.url

  if (!video) throw "Media is unavailable"

  return video
}

let handler = async (m, { text, conn }) => {
  if (!text) throw "Enter a CapCut link"
  if (!/capcut\.com/.test(text)) throw "Invalid link"

  await m.react("✨")

  try {
    const videoUrl = await getCapcutVideo(text)

    await conn.sendMessage(
      m.chat,
      { video: { url: videoUrl } },
      { quoted: m }
    )

    await m.react("✅")
  } catch (e) {
    console.log(e)
    await m.react("❌")
    m.reply("Failed to retrieve the video")
  }
}

handler.help = ["capcut <link>"]
handler.tags = ['download']
handler.command = ['capcut']
handler.limit = true
handler.register = true

const __plugin = wrapClassic(handler)

  return __plugin
})()

_capcut.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
export default oneCommand(_capcut, 'capcut')
