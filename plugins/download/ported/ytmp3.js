// ───────── ytmp3 ─────────
// Dipecah dari plugins/download/youtube.js (dulu digabung dengan fitur lain dalam satu file)

import axios from 'axios'
import { fallbackToMp3Buffer, ytdl } from '../../../lib/services/scraper.js'
import { wrapPlugin, oneCommand } from '../../../lib/engine/plugins.js'

const _ytmp3 = (() => {
const pluginConfig = {
  name: "ytmp3dl",
  alias: [],
  category: "download",
  description: "Download audio YouTube",
  usage: ".ytmp3dl <url>",
  example: ".ytmp3dl https://youtube.com/watch?v=xxx",
  cooldown: 20,
  energi: 2,
  isEnabled: true,
};

async function getAudioDownload(url) {
  try {
    const { data } = await axios.get(
      `https://my.izuka-api.xyz/api/downloader/ytmp3?url=${encodeURIComponent(url)}`, { timeout: 60000 }
    );
    const download = data?.result?.download_url;
    const title = data?.result?.title;
    if (download) {
      return { download, title };
    }
  } catch {}

  const fallback = await ytdl(url, "mp3");
  if (fallback?.status && fallback?.dl) {
    return { download: fallback.dl, title: fallback.title, isFallback: true };
  }

  throw new Error(fallback?.mess || "Gagal mendapatkan audio download URL");
}

async function handler(m, { sock }) {
  const url = m.text?.trim();
  if (!url)
    return m.reply(`Contoh: ${m.prefix}ytmp3 https://youtube.com/watch?v=xxx`);
  if (!url.includes("youtube.com") && !url.includes("youtu.be"))
    return m.reply("❌ URL harus YouTube");

  m.react("🕕");

  try {
    const result = await getAudioDownload(url);

    if (result.isFallback) {
      const mp3Buffer = await fallbackToMp3Buffer(result.download);
      await sock.sendMessage(
        m.chat,
        {
          audio: mp3Buffer,
          mimetype: "audio/mpeg",
          ptt: false,
          fileName: `${result.title || "audio"}.mp3`,
        },
        { quoted: m },
      );
    } else {
      await sock.sendMedia(m.chat, result.download, null, m, {
        type: "audio",
        mimetype: "audio/mpeg",
        ptt: false,
        fileName: result.title || "audio.mp3",
      });
    }
    m.react("✅");
  } catch (err) {
    console.error("[YTMP3]", err);
    m.react("❌");
    m.reply("Gagal mengunduh audio.");
  }
}

const __plugin = wrapPlugin(pluginConfig, handler)

  return __plugin
})()

_ytmp3.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
_ytmp3.limit = true
export default oneCommand(_ytmp3, 'ytmp3dl')
