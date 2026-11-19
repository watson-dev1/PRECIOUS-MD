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

import { wrapClassic, oneCommand } from '../../../lib/engine/plugins.js'
import path from 'path'
import fs, { writeFileSync } from 'fs'
import axios from 'axios'
import os, { tmpdir } from 'os'

const _googledrive = (() => {

let handler = async (m, { args, usedPrefix, command, conn }) => {
  const url = args[0]
  if (!url) throw `Example: ${usedPrefix + command} https://drive.google.com/file/d/xxxxxxxxx/view`

  const fileId = await extractGDrive(url)
  if (!fileId) throw 'Invalid Google Drive URL!'

  try {
    const apiKey = 'AIzaSyAA9ERw-9LZVEohRYtCWka_TQc6oXmvcVU'
    const metaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,size,mimeType&key=${apiKey}`
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`

    const metadata = await axios.get(metaUrl)
    const { name, size, mimeType } = metadata.data

    m.reply(`Mendownload file...\n\n• Nama: ${name}\n• Ukuran: ${await formatSize(size)}\n• Tipe: ${mimeType}`)

    const res = await axios.get(downloadUrl, { responseType: 'arraybuffer' })

    if (res.status !== 200) {
      throw `Failed to download file: ${res.status} ${res.statusText}`
    }

    const buffer = Buffer.from(res.data, 'binary')
    const tmpPath = path.join(tmpdir(), name)
    writeFileSync(tmpPath, buffer)

    await conn.sendMessage(m.chat, {
      document: { url: tmpPath },
      fileName: name,
      mimetype: mimeType || 'application/octet-stream',
      caption: `File downloaded successfully!\n\n• Nama: ${name}\n• Ukuran: ${await formatSize(size)}`
    }, { quoted: m })
  } catch (err) {
    console.error(err)
    throw typeof err === 'string' ? err : `An error occurred: ${err.response?.status} ${err.response?.statusText}`
  }
}

handler.help = ['gdrive <url>']
handler.tags = ['download']
handler.command = ['drivedl']
const __plugin = wrapClassic(handler)
//module export= handler
async function extractGDrive(url) {
  const match = url.match(/\/d\/([^/]+)|open\?id=([^&]+)/)
  return match ? (match[1] || match[2]) : null
}

async function formatSize(bytes) {
  const sizes = ['B', 'KB', 'MB', 'GB']
  if (bytes === 0) return '0 B'
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i]
}

  return __plugin
})()

_googledrive.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
_googledrive.limit = true
export default oneCommand(_googledrive, 'drivedl')
