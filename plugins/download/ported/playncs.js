/**
 * Kaguya Multi Device — WhatsApp & Tele Bot
 * Plugin  : Download — NCS Player (cari & putar lagu dari ncs.io)
 * Type    : Plugins | ESM Modules
 *
 * Example:
 *   .playncs [judul]    → cari & kirim lagu langsung (kosong = random)
 *   .ncssearch [judul]  → tampilkan daftar hasil pencarian
 *   .ncsplay [nomor]    → putar lagu dari hasil pencarian sebelumnya
 */

import axios from 'axios'
import * as cheerio from 'cheerio'
import { wrapClassic, oneCommand } from '../../../lib/engine/plugins.js'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0 Safari/537.36'

// hasil .ncssearch per user (disimpan di modul, bukan di conn)
const searchResults = new Map()

class NCS {
    constructor() {
        this.baseUrl = 'https://ncs.io'
    }

    async searchTracks(query = '') {
        try {
            const url = `${this.baseUrl}/music-search${query ? `?q=${encodeURIComponent(query)}` : ''}`
            const { data } = await axios.get(url, { headers: { 'User-Agent': UA }, timeout: 30000 })
            const $ = cheerio.load(data)
            const tracks = []

            $('table.tablesorter tbody tr').each((_, el) => {
                const $row = $(el)
                const $play = $row.find('.player-play')

                const tid = $play.attr('data-tid') || ''
                const title = $play.attr('data-track') || ''
                const artist = $play.attr('data-artistraw') || ''
                const image = $row.find('td img[alt]').attr('src') || ''
                const releaseDate = $row.find('td:nth-child(6)').text().trim()

                if (tid && title) tracks.push({ tid, title, artist, image, releaseDate })
            })
            return tracks
        } catch (err) {
            console.error('[NCS] search:', err.message)
            return []
        }
    }

    async getDownloadInfo(tid) {
        try {
            const { data } = await axios.get(`${this.baseUrl}/track/info/${tid}`, {
                headers: { 'User-Agent': UA, Referer: `${this.baseUrl}/music-search` },
                timeout: 30000
            })
            const $ = cheerio.load(data)
            const info = { tid, title: '', artist: '', downloadUrl: '', imageUrl: '', copyText: '' }

            const $h5 = $('h5')
            if ($h5.length) {
                info.title = $h5.contents().first().text().trim()
                info.artist = $h5.find('span').text().trim()
            }

            const $btn = $("a.btn.black[href*='/track/download/']")
            if ($btn.length) info.downloadUrl = `${this.baseUrl}${$btn.attr('href')}`

            const style = $('.cover .img').attr('style') || ''
            const match = style.match(/url\('([^']+)'\)/)
            if (match) info.imageUrl = match[1]

            info.copyText = $('#panel-copy').text().trim()
            return info
        } catch (err) {
            console.error('[NCS] info:', err.message)
            return null
        }
    }
}

const ncs = new NCS()

async function sendTrack(m, conn, track) {
    const info = await ncs.getDownloadInfo(track.tid)
    if (!info || !info.downloadUrl) return m.reply('🚫 Failed to retrieve the song download link.')

    const caption =
        `🎧 *NCS Music*\n\n` +
        `✨ Judul: ${track.title}\n` +
        `🍢 Artis: ${track.artist}\n` +
        `🥧 Rilis: ${track.releaseDate}\n` +
        `🍭 Link: ${info.downloadUrl}\n\n` +
        `💿 Source: ncs.io`

    try {
        const cover = info.imageUrl || track.image
        if (cover) await conn.sendFile(m.chat, cover, 'ncs.jpg', caption, m)
        else await m.reply(caption)

        await conn.sendMessage(m.chat, {
            audio: { url: info.downloadUrl },
            mimetype: 'audio/mpeg',
            fileName: `${track.title} - ${track.artist}.mp3`,
            ptt: false
        }, { quoted: m })
    } catch (e) {
        console.error('[NCS] kirim:', e)
        await m.reply('🍬 Failed to send the audio file.\nManual link:\n' + info.downloadUrl)
    }
}

let handler = async (m, { conn, text, command, usedPrefix }) => {
    const p = usedPrefix || '.'
    const q = (text || '').trim()

    if (command === 'playncs') {
        let tracks
        if (q) {
            await m.reply('🍭 Searching for NCS music...')
            tracks = await ncs.searchTracks(q)
            if (!tracks.length) return m.reply('🍬 No results were found on NCS.io.')
        } else {
            await m.reply('🍭 Getting a random track...')
            tracks = await ncs.searchTracks('')
            if (!tracks.length) return m.reply('🍬 Unable to retrieve the NCS song list.')
            tracks = [tracks[Math.floor(Math.random() * tracks.length)]]
        }
        return sendTrack(m, conn, tracks[0])
    }

    if (command === 'ncssearch') {
        if (!q) return m.reply(`❀ Example: *${p}ncssearch Invincible*`)

        await m.reply('🍭 Searching for songs on NCS.io...')
        const results = await ncs.searchTracks(q)
        if (!results.length) return m.reply('🍬 No results were found.')

        let list = `🎶 *NCS search results for:* ${q}\n\n`
        results.slice(0, 10).forEach((v, i) => {
            list += `*${i + 1}.* ${v.title} - ${v.artist}\n📅 ${v.releaseDate}\n\n`
        })
        list += `Type *${p}ncsplay [number]* to play a song from the search results.\nExample: *${p}ncsplay 1*`

        searchResults.set(m.sender, results.slice(0, 10))
        return m.reply(list)
    }

    if (command === 'ncsplay') {
        const num = parseInt(q)
        if (isNaN(num)) return m.reply(`🍬 Enter a search result number. Example: *${p}ncsplay 1*`)

        const results = searchResults.get(m.sender)
        if (!results) return m.reply(`🍬 You have not searched yet. First use *${p}ncssearch [title]*.`)

        const track = results[num - 1]
        if (!track) return m.reply('⚠️ Invalid number.')

        await m.reply('🍭 Getting the track...')
        return sendTrack(m, conn, track)
    }
}

handler.help = ['playncs', 'ncssearch', 'ncsplay']
handler.tags = ['download']
handler.command = ['playncs', 'ncssearch', 'ncsplay']
handler.limit = true
handler.register = true

const __plugin = wrapClassic(handler)
__plugin.tags = ['download']

// satu command = nama file; ncssearch & ncsplay jadi sub-command (tetap bisa dipanggil langsung)
export default oneCommand(__plugin, 'playncs')
