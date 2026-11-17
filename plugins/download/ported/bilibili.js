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
import axios from 'axios'
import { wrapClassic, oneCommand } from '../../../lib/engine/plugins.js'
import * as cheerio from 'cheerio'
import { exec } from 'child_process'
import fsp from 'fs/promises'
import { promisify } from 'util'
import { f } from '../../../lib/engine/plugins.js'

const _blibili = (() => {

const execPromise = promisify(exec)

async function bilibilidl(url, quality = '480P') {
  try {
    let aid = /\/video\/(\d+)/.exec(url)?.[1]
    if (!aid) throw new Error('ID Video tidak ditemukan')

    const appInfo = await axios.get(url).then(res => res.data)
    const $ = cheerio.load(appInfo)
    const title = $('meta[property="og:title"]').attr('content')?.split('|')[0].trim()
    const description = $('meta[property="og:description"]').attr('content')
    const type = $('meta[property="og:video:type"]').attr('content')
    const cover = $('meta[property="og:image"]').attr('content')
    const like = $('.interactive__btn.interactive__like .interactive__text').text()
    const views = $('.bstar-meta__tips-left .bstar-meta-text').first().text().replace(' Ditonton', '')

    const response = await axios.get('https://api.bilibili.tv/intl/gateway/web/playurl', {
      params: {
        's_locale': 'id_ID',
        'platform': 'web',
        'aid': aid,
        'qn': '64',
        'type': '0',
        'device': 'wap',
        'tf': '0',
        'spm_id': 'bstar-web.ugc-video-detail.0.0',
        'from_spm_id': 'bstar-web.homepage.trending.all',
        'fnval': '16',
        'fnver': '0',
      }
    }).then(res => res.data)

    const selectedVideo = response.data.playurl.video.find(v => v.stream_info.desc_words === quality)
    if (!selectedVideo) throw new Error('Video tidak ditemukan dengan kualitas itu')

    const videoUrl = selectedVideo.video_resource.url || selectedVideo.video_resource.backup_url[0]
    const audioUrl = response.data.playurl.audio_resource[0].url || response.data.playurl.audio_resource[0].backup_url[0]

    async function downloadBuffer(url) {
      let buffers = []
      let start = 0
      let end = 5 * 1024 * 1024
      let fileSize = 0

      while (true) {
        const range = `bytes=${start}-${end}`
        const response = await axios.get(url, {
          headers: {
            'DNT': '1',
            'Origin': 'https://www.bilibili.tv',
            'Referer': `https://www.bilibili.tv/video/`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            Range: range
          },
          responseType: 'arraybuffer'
        })

        if (fileSize === 0) {
          const contentRange = response.headers['content-range']
          if (contentRange) fileSize = parseInt(contentRange.split('/')[1])
        }

        buffers.push(Buffer.from(response.data))
        if (end >= fileSize - 1) break

        start = end + 1
        end = Math.min(start + 5 * 1024 * 1024 - 1, fileSize - 1)
      }

      return Buffer.concat(buffers)
    }

    const videoBuffer = await downloadBuffer(videoUrl)
    const audioBuffer = await downloadBuffer(audioUrl)

    const tempVideoPath = 'temp_video.mp4'
    const tempAudioPath = 'temp_audio.mp3'
    const tempOutputPath = 'temp_output.mp4'

    await fsp.writeFile(tempVideoPath, videoBuffer)
    await fsp.writeFile(tempAudioPath, audioBuffer)

    await execPromise(`ffmpeg -i "${tempVideoPath}" -i "${tempAudioPath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -f mp4 "${tempOutputPath}"`)
    const mergedBuffer = await fsp.readFile(tempOutputPath)

    await Promise.all([
      fsp.unlink(tempVideoPath).catch(() => {}),
      fsp.unlink(tempAudioPath).catch(() => {}),
      fsp.unlink(tempOutputPath).catch(() => {})
    ])

    return { title, description, type, cover, views, like, videoBuffer: mergedBuffer }
  } catch (error) {
    throw new Error(error.message)
  }
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  if (!args[0]) throw `Contoh: ${usedPrefix + command} https://www.bilibili.tv/video/4793817472438784`

  m.reply('wait...')
  try {
    let result = await bilibilidl(args[0], '480P')
    await conn.sendMessage(m.chat, {
      video: result.videoBuffer,
      caption: `🎬 *${result.title}*\n📝 ${result.description}\n👀 ${result.views} tayangan | ❤️ ${result.like}`
    }, { quoted: m })
  } catch (e) {
    throw `yahh error: ${e.message}`
  }
}

handler.help = ['bilibili <url>']
handler.tags = ['download']
handler.command = ['bilibili']
handler.limit = true
handler.register = true

const __plugin = wrapClassic(handler)

  return __plugin
})()

_blibili.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
export default oneCommand(_blibili, 'bilibili')
