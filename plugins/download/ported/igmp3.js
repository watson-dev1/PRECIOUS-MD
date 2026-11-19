// ───────── igaudio ─────────
// Ambil video lewat JHFastDL → fallback JHSssIG, lalu ekstrak audio jadi mp3 (ffmpeg)
// Skrep by JH a.k.a Dhika - FIONY BOT (lib/services/scraper.js)

import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { wrapClassic, oneCommand } from '../../../lib/engine/plugins.js'
import { igDownloadAuto } from '../../../lib/services/scraper.js'

const _igaudio = (() => {
const run = (cmd) => new Promise((resolve, reject) => exec(cmd, (err, _o, stderr) => err ? reject(new Error(stderr || err.message)) : resolve()))

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) throw `Example:\n${usedPrefix + command} https://www.instagram.com/reel/xxxxx/`

  const tmpDir = path.join(process.cwd(), 'database', 'tmp')
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
  const id = `${Date.now()}_${Math.floor(Math.random() * 100000)}`
  const inPath = path.join(tmpDir, `igaudio_${id}.mp4`)
  const outPath = path.join(tmpDir, `igaudio_${id}.mp3`)

  await m.react('🕒')

  try {
    const res = await igDownloadAuto(text.trim(), 'fastdl')
    const video = res.media.find(v => v.type === 'Video')
    if (!video) throw 'Audio is unavailable; this link does not contain a video or Reel.'

    const { data } = await axios.get(video.url, { responseType: 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0' } })
    fs.writeFileSync(inPath, Buffer.from(data))

    await run(`ffmpeg -hide_banner -loglevel error -y -i "${inPath}" -vn -ac 2 -ar 44100 -c:a libmp3lame -b:a 192k "${outPath}"`)

    await conn.sendMessage(m.chat, {
      audio: fs.readFileSync(outPath),
      mimetype: 'audio/mpeg'
    }, { quoted: m })
    await m.react('✅')
  } catch (e) {
    console.log(e)
    await m.react('❌')
    m.reply(typeof e === 'string' ? e : `❌ Failed to retrieve Instagram audio.\n> ${e?.message || ''}`)
  } finally {
    try { fs.unlinkSync(inPath) } catch {}
    try { fs.unlinkSync(outPath) } catch {}
  }
}

handler.help = ['igaudio <url>', 'igmp3 <url>']
handler.tags = ['download']
handler.command = ['igaudio', 'igmp3']
handler.limit = true

const __plugin = wrapClassic(handler)

  return __plugin
})()

_igaudio.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
export default oneCommand(_igaudio, 'igaudio')
