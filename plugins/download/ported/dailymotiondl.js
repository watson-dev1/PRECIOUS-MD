// ───────── dailymotiondl ─────────
// Dipecah dari plugins/download/video.js (dulu digabung dengan fitur lain dalam satu file)

import { wrapPlugin, oneCommand } from '../../../lib/engine/plugins.js'
import { exec, execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { DailymotionDL } from '../../../lib/services/scraper.js'

const _dailymotiondl = (() => {
const exec = promisify(execFile);

const pluginConfig = {
  name: "dailymotiondl",
  alias: [],
  category: "download",
  description: "Download video dari Dailymotion",
  usage: ".dailymotiondl <url>",
  example: ".dailymotiondl https://www.dailymotion.com/video/xxx",
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
      `🎬 *Dailymotion Downloader*\n\n` +
        `Download video dari Dailymotion, otomatis dikonversi ke MP4.\n\n` +
        `*PENGGUNAAN:*\n` +
        `> *${m.prefix}dailymotiondl <link>*\n\n` +
        `*CONTOH:*\n` +
        `> *${m.prefix}dailymotiondl https://www.dailymotion.com/video/xxx*\n\n` +
        `_Proses konversi mungkin agak lama_`,
    );
  }

  m.react("🕕");

  try {
    const result = await DailymotionDL(text);

    if (!result.status) {
      m.react("☢");
      return m.reply(`❌ *Dailymotion Gagal*\n\n> ${result.error}`);
    }

    let caption =
      `🎬 *Dailymotion*\n\n` +
      `> 📌 ${result.title}\n` +
      `> ⏱️ Durasi: ${result.duration}\n` +
      `> 📺 Kualitas: ${result.quality}`;

    if (result.thumbnail) {
      await sock.sendMedia(m.chat, result.thumbnail, caption, m, {
        type: "image",
      });
    }

    if (result.video) {
      const tmpFile = path.join(os.tmpdir(), `dm_${Date.now()}.mp4`);

      await exec(
        "ffmpeg",
        [
          "-y",
          "-i",
          result.video,
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
            (result.title || "video").replace(/[<>:"/\\|?*]/g, "") + ".mp4",
          caption,
        },
        { quoted: m },
      );
    }

    m.react("✅");
  } catch (e) {
    console.error(e);
    m.react("☢");
    m.reply("❌ Gagal mengambil data Dailymotion, coba lagi nanti");
  }
}

const __plugin = wrapPlugin(pluginConfig, handler)

  return __plugin
})()

_dailymotiondl.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
_dailymotiondl.limit = true
export default oneCommand(_dailymotiondl, 'dailymotiondl')
