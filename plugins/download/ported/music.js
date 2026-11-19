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

import { wrapClassic, mergePlugins } from '../../../lib/engine/plugins.js'
import fetch from 'node-fetch'
import { oneCommand } from '../../../lib/engine/plugins.js'

// ── soundcloud ──
const _soundcloud = (() => {

let handler = async (m, { conn, text }) => {
  if (!text) throw 'Enter a song title or SoundCloud link!'

  await m.react('🕒')

  try {
    let res = await fetch(
      'https://kaizenapi.my.id/api/downloader/soundcloud?limit=1&query=' +
        encodeURIComponent(text)
    )

    let json = await res.json()

    if (!json.status || json.result.length === 0)
      throw 'Song was not found.'

    let data = json.result[0]

    let caption = `SOUNDCLOUD DOWNLOADER

Judul: ${data.title}
Artis: ${data.artist}
Plays: ${data.plays}
Durasi: ${data.duration_seconds}s
URL: ${data.url}`

    await conn.sendMessage(
      m.chat,
      {
        image: { url: data.artwork },
        caption
      },
      { quoted: m }
    )

    await conn.sendMessage(
      m.chat,
      {
        audio: { url: data.stream_url },
        mimetype: 'audio/mpeg',
        fileName: `${data.title}.mp3`
      },
      { quoted: m }
    )
  } catch (e) {
    throw 'Yahh error.'
  }
}

handler.help = ['soundcloudplay']
handler.tags = ['download']
handler.command = ['soundcloud']
handler.limit = true

const __plugin = wrapClassic(handler)

  return __plugin
})()

const __plugin = mergePlugins(
    'download',
    _soundcloud
)

// satu command = nama file; command lama jadi sub-command
export default oneCommand(__plugin, 'music')
