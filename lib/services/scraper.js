import axios from 'axios'
import * as cheerio from 'cheerio'

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36'
const http = axios.create({ timeout: 60000, maxRedirects: 5, headers: { 'User-Agent': UA, Accept: '*/*' } })
const fail = name => ({ status: false, error: `${name} downloader could not retrieve this link. The source service may be unavailable or the link may be private.` })

export async function aiodl(url) {
  const host = new URL(url).hostname.toLowerCase()
  if (/(^|\.)tiktok\.com$/.test(host)) {
    const { data } = await http.get('https://www.tikwm.com/api/', { params: { url, hd: 1 } })
    const d = data?.data
    if (!d) return { media: [] }
    const media = (d.images || []).map(u => ({ type: 'image', url: u }))
    if (d.hdplay || d.play) media.unshift({ type: 'video', url: d.hdplay || d.play })
    if (d.music_info?.play) media.push({ type: 'audio', url: d.music_info.play })
    return { title: d.title || 'TikTok', media }
  }
  throw new Error('No compatible generic downloader is available for this platform in the supplied source archive.')
}

export async function igDownloadAuto(url) {
  const { data: html } = await http.get(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } })
  const $ = cheerio.load(html)
  const video = $('meta[property="og:video"]').attr('content') || $('meta[property="og:video:secure_url"]').attr('content')
  const image = $('meta[property="og:image"]').attr('content')
  const caption = $('meta[property="og:description"]').attr('content') || ''
  const media = video ? [{ type: 'Video', url: video }] : image ? [{ type: 'Image', url: image }] : []
  return { author: 'unknown', caption, media }
}
export const JHICog = async (mode, username) => ({ status: false, error: `Instagram ${mode} lookup for @${username} is not supported by the supplied scraper source.` , data: { username, items: [] } })
export async function mediafire(url) {
  const { data: html } = await http.get(url)
  const $ = cheerio.load(html)
  const link = $('#downloadButton').attr('href') || $('a[aria-label="Download file"]').attr('href')
  if (!link) throw new Error('MediaFire download link not found')
  const match = $('#downloadButton').text().trim().match(/Download\s+(.+?)(?:\s+\(|$)/i)
  const filename = match?.[1] || 'download'
  return { download: { link_download: link, mimetype: 'application/octet-stream' }, filename, url: link }
}
export async function fbdown(url) {
  const { data: html } = await http.get('https://www.getfvid.com/downloader', { params: { url } })
  const $ = cheerio.load(html)
  const medias = []
  $('a').each((_, a) => { const href = $(a).attr('href'); const label = $(a).text().trim(); if (href && /\.mp4|download/i.test(href)) medias.push({ url: href, quality: /hd/i.test(label) ? 'hd' : 'sd' }) })
  if (!medias.length) return { status: false, error: 'No public Facebook video link found.' }
  return { status: true, result: { title: 'Facebook video', medias } }
}
export async function likee(url) { return fail('Likee') }
export async function TeraBoxDL(url) { return fail('TeraBox') }
export async function DailymotionDL(url) { return fail('Dailymotion') }
export async function RedNoteDL(url) { return fail('RedNote') }
export async function sfileSearch(query) { return fail('SFile') }
export async function sfileDownload(url) { return fail('SFile') }
export async function ttdown(url) {
  const { data } = await http.get('https://www.tikwm.com/api/', { params: { url, hd: 1 } })
  const d = data?.data
  if (!d) throw new Error('TikTok media not found')
  const downloads = []
  if (d.music_info?.play || d.music) downloads.push({ type: 'mp3', url: d.music_info?.play || d.music })
  if (d.hdplay) downloads.push({ type: 'nowatermark_hd', url: d.hdplay })
  if (d.play) downloads.push({ type: 'nowatermark', url: d.play })
  return { ...d, downloads }
}
export async function ytdl(url, format = 'mp3') {
  const { data } = await http.get('https://eliteprotech-apis.zone.id/download/ytdl', { params: { url, format } })
  if (data?.success === false) return { status: false, mess: data.message || data.error || 'YouTube download failed' }
  const dl = data?.dl || data?.link || data?.download || data?.url || data?.result?.download_url || data?.result?.url
  return { status: Boolean(dl), dl, title: data?.title || data?.result?.title || 'YouTube media', mess: data?.message || 'Download link unavailable' }
}
export async function fallbackToMp3Buffer(url) {
  const response = await http.get(url, { responseType: 'arraybuffer', maxContentLength: 120 * 1024 * 1024 })
  return Buffer.from(response.data)
}
export async function toPTT(buffer) { return Buffer.from(buffer) }
