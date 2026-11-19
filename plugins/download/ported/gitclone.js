// ───────── gitclone ─────────
// Dipecah dari plugins/download/storage.js (dulu digabung dengan fitur lain dalam satu file)

import { wrapClassic, oneCommand } from '../../../lib/engine/plugins.js'

const _gitclone = (() => {
const regex = /(?:https|git)(?::\/\/|@)github\.com[\/:]([^\/:]+)\/(.+)/i
var handler = async (m, { conn, args, usedPrefix, command }) => {
    if (!args[0]) throw `Example user ${usedPrefix}${command} https://github.com/ImYanXiao/Elaina-MultiDevice`
    if (!regex.test(args[0])) throw 'Invalid URL! '
    let [_, user, repo] = args[0].match(regex) || []
    repo = repo.split(/[\/?#]/)[0].replace(/\.git$/, '')
    let url = `https://api.github.com/repos/${user}/${repo}/zipball`
    let head = await fetch(url, { method: 'HEAD' })
    let disposition = head.headers.get('content-disposition')
    if (!head.ok || !disposition) throw 'Repository not found or it is private!'
    let filename = disposition.match(/attachment; filename=(.*)/)?.[1] || `${repo}.zip`
    await m.reply(`D o w n l o a d i n g. . .`)
    await conn.sendFile(m.chat, url, filename, null, m)
}
handler.help = ['gitclone'].map(v => v + ' <url>')
handler.tags = ['download']
handler.command = ['gitclone2']
handler.limit = true

const __plugin = wrapClassic(handler)

  return __plugin
})()

_gitclone.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
export default oneCommand(_gitclone, 'gitclone')
