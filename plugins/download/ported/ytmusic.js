/**

* Kaguya Multi Device — WhatsApp & Tele Bot
* 
* Library      : whiskeysockets baileys
* Type         : Plugins | ESM Modules
* Creator      : YannRzy Tech
* Recode       : (Your Name)
* 
* Official Channels:
* • https://whatsapp.com/channel/0029VaoMGuLA89MbfGh62V16
* 
* Copyright © YannRzy Tech 2026
* All Rights Reserved.
  */

import axios from 'axios'
import { wrapClassic, oneCommand } from '../../../lib/engine/plugins.js'

const _ytmusic = (() => {
const GL = 'ID'
const HL = 'en'
const TIMEOUT = 30000
const MAX_ATTEMPTS = 4
const MAX_FILE_BYTES = 40 * 1024 * 1024
const LIST_SIZE = 8

const UA_DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const UA_IOS = 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)'
const UA_VR = 'com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip'
const MUSIC_API = 'https://music.youtube.com/youtubei/v1/'
const YT_API = 'https://www.youtube.com/youtubei/v1/'
const SONGS_FILTER = 'EgWKAQIIAWoMEA4QChADEAQQCRAF' // filter "Songs" YouTube Music

const state = { clientVersion: '1.20261027.10.00', ready: false }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function withRetry(fn, attempts = MAX_ATTEMPTS) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      const status = e?.response?.status
      const retriable = !status || status >= 500 || [400, 403, 429].includes(status)
      if (i < attempts - 1 && retriable) {
        const base = Math.min(8000, 1000 * Math.pow(2, i))
        await sleep(base * (0.75 + Math.random() * 0.5))
      } else break
    }
  }
  throw lastErr
}

async function ensureSession() {
  if (state.ready) return
  try {
    const res = await withRetry(() => axios.get('https://music.youtube.com/', {
      headers: { 'User-Agent': UA_DESKTOP, 'Accept-Language': `${HL},en;q=0.9` },
      timeout: TIMEOUT,
      responseType: 'text'
    }), 2)
    const m = String(res.data).match(/INNERTUBE_CLIENT_VERSION\\?"\s*:\s*\\?"([\d.]+)/)
    if (m) state.clientVersion = m[1]
  } catch {}
  state.ready = true
}

const webRemixContext = () => ({ context: { client: { hl: HL, gl: GL, clientName: 'WEB_REMIX', clientVersion: state.clientVersion } } })

async function searchSongs(query) {
  await ensureSession()
  const body = { ...webRemixContext(), query, params: SONGS_FILTER }
  const res = await withRetry(() => axios.post(`${MUSIC_API}search?prettyPrint=false`, body, {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA_DESKTOP,
      Origin: 'https://music.youtube.com',
      'X-Youtube-Client-Name': '67',
      'X-Youtube-Client-Version': state.clientVersion,
      'Accept-Language': `${HL},en;q=0.9`
    },
    timeout: TIMEOUT,
    responseType: 'json'
  }))
  return res.data
}

// ───────── parser hasil pencarian ─────────
function parseHMS(text) {
  if (!text || typeof text !== 'string') return null
  const m = text.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/)
  if (!m) return null
  return (m[1] ? parseInt(m[1], 10) : 0) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10)
}

const runsOf = (col) => col?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []

function findVideoId(it) {
  if (it.playlistItemData?.videoId) return it.playlistItemData.videoId
  const playNav = it.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint
  if (playNav?.watchEndpoint?.videoId) return playNav.watchEndpoint.videoId
  for (const col of it.flexColumns || []) {
    for (const r of runsOf(col)) {
      const v = r.navigationEndpoint?.watchEndpoint?.videoId
      if (v) return v
    }
  }
  return null
}

function parseSongs(data) {
  const rows = []
  ;(function walk(o) {
    if (!o || typeof o !== 'object') return
    if (Array.isArray(o)) { o.forEach(walk); return }
    if (o.musicResponsiveListItemRenderer) rows.push(o.musicResponsiveListItemRenderer)
    for (const k in o) {
      const v = o[k]
      if (v && typeof v === 'object') walk(v)
    }
  })(data)

  const out = []
  const seen = new Set()
  for (const it of rows) {
    const videoId = findVideoId(it)
    if (!videoId || seen.has(videoId)) continue
    seen.add(videoId)

    const title = runsOf(it.flexColumns?.[0]).map((r) => r.text).join('').trim()
    const info = runsOf(it.flexColumns?.[1])
    const artistRun = info.find((r) => /^UC/.test(r.navigationEndpoint?.browseEndpoint?.browseId || ''))
    const albumRun = info.find((r) => /^MPREb/.test(r.navigationEndpoint?.browseEndpoint?.browseId || ''))
    const plain = info.map((r) => (r.text || '').trim()).filter((t) => t && t !== '•')
    const duration = [...plain].reverse().find((t) => parseHMS(t) != null) || null
    const explicit = JSON.stringify(it.badges || []).includes('MUSIC_EXPLICIT_BADGE')

    out.push({
      videoId,
      title: title || '-',
      artist: artistRun?.text || plain.find((t) => !/^song$/i.test(t) && parseHMS(t) == null) || '-',
      album: albumRun?.text || null,
      duration,
      seconds: duration ? parseHMS(duration) : null,
      explicit
    })
  }
  return out
}

// ───────── ambil stream audio ─────────
const PLAYER_CLIENTS = [
  {
    id: 'IOS',
    ua: UA_IOS,
    extra: { 'X-Ios-Bundle-Identifier': 'com.google.ios.youtube' },
    ctx: () => ({ context: { client: { clientName: 'IOS', clientVersion: '20.10.4', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.3.2.21E236', hl: HL, gl: GL } } })
  },
  {
    id: 'ANDROID_VR',
    ua: UA_VR,
    extra: {},
    ctx: () => ({ context: { client: { clientName: 'ANDROID_VR', clientVersion: '1.61.48', deviceMake: 'Oculus', deviceModel: 'Quest 3', osName: 'Android', osVersion: '12L', androidSdkVersion: 32, hl: HL, gl: GL } } })
  }
]

async function getAudioStream(videoId) {
  for (const c of PLAYER_CLIENTS) {
    try {
      const body = { ...c.ctx(), videoId, contentCheckOk: true, racyCheckOk: true }
      const res = await withRetry(() => axios.post(`${YT_API}player?prettyPrint=false`, body, {
        headers: { 'Content-Type': 'application/json', 'User-Agent': c.ua, 'Accept-Language': `${HL},en;q=0.9`, ...c.extra },
        timeout: 20000,
        responseType: 'json'
      }), 2)
      const d = res.data
      if (d?.playabilityStatus?.status !== 'OK') continue
      const sd = d.streamingData || {}
      const audios = [].concat(sd.adaptiveFormats || [], sd.formats || [])
        .filter((f) => /^audio\//.test(f.mimeType || '') && f.url)
      if (!audios.length) continue
      // prioritas: m4a (kompatibel WhatsApp), lalu bitrate tertinggi
      audios.sort((a, b) => {
        const am = /audio\/mp4/.test(a.mimeType) ? 1 : 0
        const bm = /audio\/mp4/.test(b.mimeType) ? 1 : 0
        return bm - am || (b.bitrate || 0) - (a.bitrate || 0)
      })
      const best = audios[0]
      return {
        url: best.url,
        mime: (best.mimeType || 'audio/mp4').split(';')[0],
        size: best.contentLength ? parseInt(best.contentLength, 10) : null,
        ua: c.ua,
        title: d.videoDetails?.title || null
      }
    } catch {}
  }
  return null
}

async function downloadAudio(stream) {
  const headers = { 'User-Agent': stream.ua, Origin: 'https://www.youtube.com', Referer: 'https://www.youtube.com/' }
  if (stream.size && stream.size > MAX_FILE_BYTES) throw new Error('File audio terlalu besar')

  // unduh per potongan (googlevideo membatasi request tunggal besar)
  if (stream.size) {
    const CHUNK = 4 * 1024 * 1024
    const parts = []
    for (let start = 0; start < stream.size; start += CHUNK) {
      const end = Math.min(start + CHUNK - 1, stream.size - 1)
      const res = await withRetry(() => axios.get(`${stream.url}&range=${start}-${end}`, {
        headers,
        timeout: 40000,
        responseType: 'arraybuffer'
      }), 3)
      parts.push(Buffer.from(res.data))
    }
    return Buffer.concat(parts)
  }
  const res = await withRetry(() => axios.get(stream.url, {
    headers: { ...headers, Range: 'bytes=0-' },
    timeout: 60000,
    responseType: 'arraybuffer',
    maxContentLength: MAX_FILE_BYTES
  }), 3)
  return Buffer.from(res.data)
}

// ───────── handler ─────────
let handler = async (m, { conn, text, usedPrefix, command }) => {
  let query = (m.quoted?.text || text || '').trim()
  let listOnly = false
  const mList = query.match(/^(list|cari|search)\s+(.+)/i)
  if (mList) {
    listOnly = true
    query = mList[2].trim()
  }

  if (!query) {
    return m.reply(
      `*YouTube Music*\n\n` +
      `Search for and play songs from YouTube Music.\n\n` +
      `Example:\n${usedPrefix + command} bernadya satu bulan\n${usedPrefix + command} list bernadya`
    )
  }

  await m.react('🎵')
  try {
    const data = await searchSongs(query)
    const songs = parseSongs(data)
    if (!songs.length) {
      await m.react('❌')
      return m.reply(`Song for \`${query}\` was not found.`)
    }

    if (listOnly) {
      const lines = songs.slice(0, LIST_SIZE).map((s, i) =>
        `${i + 1}. *${s.title}*${s.explicit ? ' 🅴' : ''}\n   ${s.artist}${s.album ? ' • ' + s.album : ''}${s.duration ? ' • ' + s.duration : ''}\n   https://music.youtube.com/watch?v=${s.videoId}`
      )
      await m.react('✅')
      return m.reply(`*— YOUTUBE MUSIC —*\n_Results for:_ ${query}\n\n${lines.join('\n\n')}`)
    }

    const song = songs[0]
    const stream = await getAudioStream(song.videoId)
    if (!stream) throw new Error('Audio stream is unavailable for this song')

    const caption =
      `*— YOUTUBE MUSIC —*\n\n` +
      `❀ Judul : ${song.title}\n` +
      `❀ Artis : ${song.artist}\n` +
      (song.album ? `❀ Album : ${song.album}\n` : '') +
      (song.duration ? `❀ Durasi : ${song.duration}\n` : '') +
      `❀ Link : https://music.youtube.com/watch?v=${song.videoId}`

    try {
      await conn.sendMessage(m.chat, {
        image: { url: `https://i.ytimg.com/vi/${song.videoId}/hqdefault.jpg` },
        caption
      }, { quoted: m })
    } catch {
      await m.reply(caption)
    }

    const audio = await downloadAudio(stream)
    const safeName = song.title.replace(/[\\/:*?"<>|]/g, '').slice(0, 80) || 'audio'
    await conn.sendMessage(m.chat, {
      audio,
      mimetype: stream.mime === 'audio/webm' ? 'audio/webm' : 'audio/mp4',
      fileName: `${safeName}.${stream.mime === 'audio/webm' ? 'webm' : 'm4a'}`
    }, { quoted: m })
    await m.react('✅')
  } catch (e) {
    await m.react('❌')
    throw String(e?.message || e)
  }
}

handler.help = ['ytmusic <judul lagu>', 'ytmusic list <judul lagu>']
handler.tags = ['download']
handler.command = ['ytmusic']
handler.limit = true

const __plugin = wrapClassic(handler)

  return __plugin
})()

_ytmusic.tags = ['download']

// satu command = nama file
export default oneCommand(_ytmusic, 'ytmusic')
