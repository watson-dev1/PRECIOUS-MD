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
import crypto from 'crypto'
import { reactTo } from '../../../lib/core/file.js'

const CDN_FINDER = 'https://media.savetube.vip/api/random-cdn'
const AES_KEY = Buffer.from('C5D58EF67A7584E4A29F6C35BBC4EB12', 'hex')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
const HOSTS = { savetube: 'https://save-tube.com', ytshortdown: 'https://ytshortdown.com' }
const YT_RE = /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i

const hdr = (host) => ({ 'Content-Type': 'application/json', 'User-Agent': UA, Origin: host, Referer: `${host}/` })

function decryptPayload(b64) {
    const raw = Buffer.from(String(b64).replace(/\s/g, ''), 'base64')
    if (raw.length < 17) throw new Error('Invalid encrypted payload.')
    const decipher = crypto.createDecipheriv('aes-128-cbc', AES_KEY, raw.subarray(0, 16))
    return JSON.parse(Buffer.concat([decipher.update(raw.subarray(16)), decipher.final()]).toString('utf8'))
}

async function getJson(url, opt) {
    const res = await fetch(url, { ...opt, signal: AbortSignal.timeout(30000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
}

async function download(mediaUrl, { host, audio, quality }) {
    const cdnRes = await getJson(CDN_FINDER, { headers: hdr(host) })
    const cdn = cdnRes?.cdn
    if (!cdn) throw new Error('CDN is unavailable.')

    const info = await getJson(`https://${cdn}/v2/info`, { method: 'POST', headers: hdr(host), body: JSON.stringify({ url: mediaUrl }) })
    if (!info.status || !info.data) throw new Error(info.message || 'Video was not found or is not supported.')
    const meta = decryptPayload(info.data)

    const type = audio ? 'audio' : 'video'
    const q = String(quality || (audio ? '128' : '720'))
    const dl = await getJson(`https://${cdn}/download`, {
        method: 'POST', headers: hdr(host),
        body: JSON.stringify({ downloadType: type, quality: q, key: meta.key })
    })
    const url = dl?.data?.downloadUrl
    if (!dl.status || !url) throw new Error('The server is busy or the selected quality is unavailable. Try again or choose another quality.')

    const qualities = (meta.video_formats || []).map(f => f.quality || f.height).filter(Boolean)
    return { title: meta.title, duration: meta.durationLabel, thumbnail: meta.thumbnail, url, type, quality: q, qualities }
}

function parseArgs(text) {
    const parts = String(text || '').trim().split(/\s+/).filter(Boolean)
    const url = parts.find(p => /^https?:\/\//i.test(p)) || ''
    const rest = parts.filter(p => p !== url).map(p => p.toLowerCase().replace(/^--?/, '').replace(/p$/, ''))
    const audio = rest.some(p => p === 'audio' || p === 'mp3')
    const quality = rest.find(p => /^\d{3,4}$/.test(p))
    return { url, audio, quality }
}

let handler = async (m, { sock, text, prefix, command, reply }) => {
    const { url, audio, quality } = parseArgs(text)
    if (!url || !YT_RE.test(url)) {
        return reply(`Enter a YouTube or Shorts link.\n\nExample:\n${prefix}${command} https://youtu.be/dQw4w9WgXcQ\n${prefix}${command} https://youtu.be/dQw4w9WgXcQ 1080\n${prefix}${command} https://youtu.be/dQw4w9WgXcQ audio`)
    }
    try {
        await reactTo(sock, m, '⏳')
        const r = await download(url, { host: HOSTS[command] || HOSTS.savetube, audio, quality })
        const caption = `*▶️ ${String(r.title || 'YouTube').slice(0, 120)}*\n⏱️ ${r.duration || '-'}\n🎚️ ${r.type === 'audio' ? `MP3 ${r.quality}kbps` : `${r.quality}p`}` +
            (r.type === 'video' && r.qualities.length ? `\n📺 Tersedia: ${[...new Set(r.qualities)].join(', ')}p` : '')

        if (r.type === 'audio') {
            await sock.sendMessage(m.chat, { audio: { url: r.url }, mimetype: 'audio/mpeg', fileName: `${String(r.title || 'audio').slice(0, 60)}.mp3` }, { quoted: m })
        } else {
            await sock.sendMessage(m.chat, { video: { url: r.url }, mimetype: 'video/mp4', caption }, { quoted: m })
        }
        await reactTo(sock, m, '✅')
    } catch (e) {
        await reactTo(sock, m, '❌')
        reply(`❌ ${e.message || 'Download failed.'}`)
    }
}

handler.command = ['ytsave', 'savetube', 'ytshortdown']
handler.as = 'savetube'
handler.help = ['savetube <link youtube> [audio|720|1080]', 'ytshortdown <link youtube> [audio|720|1080]']
handler.tags = ['download']
handler.limit = true

export default handler
