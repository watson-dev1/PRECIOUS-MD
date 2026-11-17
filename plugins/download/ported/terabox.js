// ───────── terabox ─────────
// Dipecah dari plugins/download/storage.js (dulu digabung dengan fitur lain dalam satu file)

import { wrapPlugin, oneCommand } from '../../../lib/engine/plugins.js'
import path from 'path'
import fs from 'fs'
import axios from 'axios'
import os, { tmpdir } from 'os'
import { TeraBoxDL } from '../../../lib/services/scraper.js'
import { execFile } from 'child_process'
import { promisify } from 'util'

const _terabox = (() => {
const exec = promisify(execFile);

const pluginConfig = {
  name: "terabox",
  alias: [],
  category: "download",
  description: "Download video/file dari TeraBox",
  usage: ".terabox <url>",
  example: ".terabox https://terabox.com/s/xxx",
  isOwner: false,
  isPremium: false,
  isGroup: false,
  isPrivate: false,
  cooldown: 15,
  energi: 2,
  isEnabled: true,
};

async function handler(m, { sock }) {
  const text = m.text?.trim();
  if (!text) {
    m.react("❌");
    return m.reply(
      `📦 *TeraBox Downloader*\n\n` +
        `Download video atau file dari TeraBox.\n\n` +
        `*PENGGUNAAN:*\n` +
        `> *${m.prefix}terabox <link>*\n\n` +
        `*CONTOH:*\n` +
        `> *${m.prefix}terabox https://terabox.com/s/xxx*\n\n` +
        `_File dikirim sebagai dokumen, mungkin agak lama_`,
    );
  }

  m.react("🕕");

  try {
    const result = await TeraBoxDL(text);

    if (!result.status) {
      m.react("☢");
      return m.reply(`❌ *TeraBox Gagal*\n\n> ${result.error}`);
    }

    let caption =
      `📦 *TeraBox*\n\n` +
      `> 📌 ${result.file_name}\n` +
      `> 📏 Size: ${result.file_size}\n` +
      `> ⏱️ Durasi: ${result.duration}`;

    if (result.thumbnail) {
      await sock.sendMedia(m.chat, result.thumbnail, caption, m, {
        type: "image",
      });
    }

    if (result.stream_url && result.stream_url.endsWith(".m3u8")) {
      const tmpFile = path.join(os.tmpdir(), `tb_${Date.now()}.mp4`);

      await exec(
        "ffmpeg",
        [
          "-y",
          "-i",
          result.stream_url,
          "-c",
          "copy",
          "-bsf:a",
          "aac_adtstoasc",
          tmpFile,
        ],
        { timeout: 120000 },
      );

      const buffer = fs.readFileSync(tmpFile);
      fs.unlinkSync(tmpFile);

      await sock.sendMessage(
        m.chat,
        {
          document: buffer,
          mimetype: "video/mp4",
          fileName:
            (result.file_name || "video").replace(/[<>:"/\\|?*]/g, "") + ".mp4",
          caption,
        },
        { quoted: m },
      );
    } else if (result.download_url) {
      const res = await axios.get(result.download_url, {
        responseType: "arraybuffer",
        timeout: 120000,
        maxContentLength: 200 * 1024 * 1024,
      });

      const ext = result.extension || ".mp4";
      const fileName =
        (result.file_name || "file").replace(/[<>:"/\\|?*]/g, "") + ext;

      await sock.sendMessage(
        m.chat,
        {
          document: Buffer.from(res.data),
          mimetype: "application/zip",
          fileName,
          caption,
        },
        { quoted: m },
      );
    }

    m.react("✅");
  } catch (e) {
    console.error(e);
    m.react("☢");
    m.reply("❌ Gagal mengambil data TeraBox, coba lagi nanti");
  }
}

const __plugin = wrapPlugin(pluginConfig, handler)

  return __plugin
})()

_terabox.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
_terabox.limit = true
export default oneCommand(_terabox, 'terabox')
