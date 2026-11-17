// ───────── ytmp4 ─────────
// Dipecah dari plugins/download/youtube.js (dulu digabung dengan fitur lain dalam satu file)

import axios from 'axios'
import { ytdl } from '../../../lib/services/scraper.js'
import { wrapPlugin, oneCommand } from '../../../lib/engine/plugins.js'

const _ytmp4 = (() => {
const pluginConfig = {
  name: "ytmp4dl",
  alias: [],
  category: "download",
  description: "Download video YouTube",
  usage: ".ytmp4dl <url>",
  example: ".ytmp4dl https://youtube.com/watch?v=xxx",
  cooldown: 20,
  energi: 2,
  isEnabled: true,
};

async function getVideoDownloadUrl(url) {
  try {
    const { data } = await axios.get(
      `https://my.izuka-api.xyz/api/downloader/ytmp4?url=${encodeURIComponent(url)}`
    );

    if (data?.status && data?.result?.video_normal) {
      const videos = data.result.video_normal.filter(v => v.ext === "mp4");
      if (videos.length > 0) {
        videos.sort((a, b) => parseInt(b.quality) - parseInt(a.quality));
        if (videos[0] && videos[0].url) {
          return videos[0].url;
        }
      }
    }
  } catch (e) {
    console.error("[YTMP4 Izuka API Error]", e.message);
  }

  const fallback = await ytdl(url, "mp4");
  if (fallback?.status && fallback?.dl) {
    return fallback.dl;
  }

  throw new Error(fallback?.mess || "Gagal mendapatkan video download URL");
}

async function handler(m, { sock }) {
  const url = m.text?.trim();
  if (!url)
    return m.reply(`Contoh: ${m.prefix}ytmp4 https://youtube.com/watch?v=xxx`);
  if (!url.includes("youtube.com") && !url.includes("youtu.be"))
    return m.reply("❌ URL harus YouTube");

  m.react("🕕");

  try {
    const downloadUrl = await getVideoDownloadUrl(url);

    await sock.sendMedia(m.chat, downloadUrl, null, m, {
      type: "video",
    });
    m.react("✅");
  } catch (err) {
    console.error("[YTMP4]", err);
    m.react("❌");
    m.reply("Gagal mengunduh video.");
  }
}

const __plugin = wrapPlugin(pluginConfig, handler)

  return __plugin
})()

_ytmp4.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
_ytmp4.limit = true
export default oneCommand(_ytmp4, 'ytmp4dl')
