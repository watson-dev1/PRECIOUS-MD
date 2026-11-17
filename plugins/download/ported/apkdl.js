// APK Downloader — cari & unduh APK (sumber Aptoide) + metadata Google Play
//   .apkdl <nama app | package id | link Play Store>
import * as cheerio from 'cheerio'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const MAX_SEND = 150 * 1024 * 1024 // batas kirim sebagai dokumen

const fmtBytes = (b) => {
    if (!b || isNaN(b)) return '-'
    const u = ['B', 'KB', 'MB', 'GB']
    const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)))
    return `${parseFloat((b / 1024 ** i).toFixed(2))} ${u[i]}`
}

async function playMeta(pkg) {
    try {
        const res = await fetch(`https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}&hl=id&gl=ID`, {
            headers: { 'User-Agent': UA, 'Accept-Language': 'id-ID,id;q=0.9' }, signal: AbortSignal.timeout(12000)
        })
        if (!res.ok) return null
        const $ = cheerio.load(await res.text())
        return {
            title: $('h1').first().text().trim() || null,
            developer: $('a[href*="/store/apps/dev"]').first().text().trim() || null,
            rating: ($('div.j2ttFe').first().text().trim() || '').replace(/star/i, '').replace(',', '.').trim() || null,
            installs: $('div.ClM7O').first().text().trim() || null
        }
    } catch { return null }
}

async function resolvePackage(input) {
    const s = input.trim()
    const fromUrl = s.match(/play\.google\.com\/store\/apps\/details\?(?:.*&)?id=([a-zA-Z0-9_.]+)/)
    if (fromUrl) return fromUrl[1]
    if (/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+$/.test(s)) return s
    const r = await fetch(`https://ws75.aptoide.com/api/7/apps/search/query=${encodeURIComponent(s)}/limit=1`, { signal: AbortSignal.timeout(15000) })
    const j = await r.json()
    const pkg = j?.datalist?.list?.[0]?.package
    if (!pkg) throw new Error(`Aplikasi "${s}" tidak ditemukan.`)
    return pkg
}

let handler = async (m, { sock, text, reply, prefix, command }) => {
    const input = String(text || m.quoted?.text || '').trim()
    if (!input) return reply(`📦 *APK DOWNLOADER*\n\nPenggunaan: *${prefix + command} <nama app / package id / link Play Store>*\nContoh: ${prefix + command} whatsapp\n${prefix + command} com.snowcorp.stickerly.android`)

    await reply('⏳ Mencari APK…')
    try {
        const pkg = await resolvePackage(input)
        const r = await fetch(`https://ws75.aptoide.com/api/7/app/get/package_name=${encodeURIComponent(pkg)}`, { signal: AbortSignal.timeout(20000) })
        const meta = (await r.json())?.nodes?.meta?.data
        if (!meta?.file?.path) return reply(`❌ APK untuk *${pkg}* tidak tersedia.`)

        const gp = await playMeta(pkg)
        const size = meta.file.filesize || meta.size
        const caption =
            `📦 *${gp?.title || meta.name}*\n\n` +
            `• Package : ${meta.package}\n• Versi : ${meta.file.vername || '-'} (${meta.file.vercode || '-'})\n• Ukuran : ${fmtBytes(size)}\n` +
            `• Developer : ${gp?.developer || meta.developer?.name || '-'}\n` +
            `• Rating : ${gp?.rating || (meta.stats?.rating?.avg ? meta.stats.rating.avg.toFixed(1) : '-')}\n` +
            `• Unduhan : ${gp?.installs || (meta.stats?.downloads ? meta.stats.downloads.toLocaleString('id-ID') + '+' : '-')}\n` +
            `• Min SDK : ${meta.file.hardware?.sdk || '-'}\n• MD5 : ${meta.file.md5sum || '-'}\n` +
            `• Keamanan : ${meta.file.malware?.rank || 'UNKNOWN'}\n• Update : ${meta.modified || meta.updated || '-'}`

        const icon = meta.icon
        if (icon) await sock.sendMessage(m.chat, { image: { url: icon }, caption }, { quoted: m }).catch(() => reply(caption))
        else await reply(caption)

        if (size && size > MAX_SEND) return reply(`⚠️ File terlalu besar untuk dikirim lewat chat (${fmtBytes(size)}).\nUnduh manual:\n${meta.file.path}`)
        return sock.sendMessage(m.chat, {
            document: { url: meta.file.path },
            fileName: `${(gp?.title || meta.name).replace(/[\\/:*?"<>|]/g, '')}_${meta.file.vername || ''}.apk`,
            mimetype: 'application/vnd.android.package-archive'
        }, { quoted: m })
    } catch (e) {
        return reply(`❌ ${e.message || 'Gagal mengambil APK'}`)
    }
}

handler.command = ['apkdl']
handler.help = ['apkdl <nama/package>']
handler.tags = ['download']
handler.limit = true

export default handler
