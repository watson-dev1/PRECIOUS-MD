// ───────── sfile ─────────
// Dipecah dari plugins/download/storage.js (dulu digabung dengan fitur lain dalam satu file)

import { wrapClassic, oneCommand } from '../../../lib/engine/plugins.js'
import { sfileSearch, sfileDownload } from '../../../lib/services/scraper.js'

const _sfile = (() => {
let handler = async (m, { conn, text, command }) => {
  if (!text) throw 'Masukkan query atau link!'

  if (command === 'sfile') {
    const results = await sfileSearch(text)

    if (!results.length) throw 'File tidak ditemukan'

    let msg = '🔎 Hasil pencarian:\n\n'

    results.slice(0, 10).forEach((v, i) => {
      msg += `${i + 1}. ${v.title}\n`
      msg += `📦 ${v.size}\n`
      msg += `🔗 ${v.link}\n\n`
    })

    m.reply(msg)
  }

  if (command === 'sfiledl') {
    if (!text.includes('sfile.co')) throw 'Link tidak valid'

    const { metadata, download } = await sfileDownload(text, true)

    const caption = `📄 Nama: ${metadata.filename}
📦 Tipe: ${metadata.mimetype}
⬇️ Download: ${metadata.download_count}
👤 Author: ${metadata.author_name}`

    await conn.sendFile(m.chat, download, metadata.filename, caption, m)
  }
}

handler.help = ['sfile <query>', 'sfiledl <link>']
handler.tags = ['download']
handler.command = ['sfile', 'sfiledl']
handler.limit = true

const __plugin = wrapClassic(handler)

  return __plugin
})()

_sfile.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file; command lain jadi sub-command
export default oneCommand(_sfile, 'sfile')
