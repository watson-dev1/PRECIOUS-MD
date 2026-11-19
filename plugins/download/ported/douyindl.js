// ───────── douyindl ─────────
// Dipecah dari plugins/download/video.js (dulu digabung dengan fitur lain dalam satu file)

import axios from 'axios'
import { wrapPlugin, oneCommand } from '../../../lib/engine/plugins.js'

const _douyindl = (() => {
const pluginConfig = {
  name: "douyindl",
  alias: [],
  category: "download",
  description: "Download video/audio from Douyin (Chinese TikTok)",
  usage: ".douyindl <url>",
  example: ".douyindl https://v.douyin.com/xxx",
  isOwner: false,
  isPremium: false,
  isGroup: false,
  isPrivate: false,
  cooldown: 10,
  energi: 1,
  isEnabled: true,
};

async function douyinFetch(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.get(`https://api.azbry.com/api/downloader/douyin?url=${encodeURIComponent(url)}`, { timeout: 30000 });
      if (res.data?.status && res.data?.result) {
        return res.data;
      }
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error("Failed to retrieve data from the server");
}

async function handler(m, { sock }) {
  const text = m.text?.trim();
  if (!text) {
    m.react("❌");
    return m.reply(
      `🎵 *Douyin Downloader*\n\n` +
        `Download videos or audio from Douyin (Chinese TikTok).\n\n` +
        `*PENGGUNAAN:*\n` +
        `> *${m.prefix}douyindl <link>*\n\n` +
        `*EXAMPLE:*\n` +
        `> *${m.prefix}douyindl https://v.douyin.com/xxx*`,
    );
  }

  m.react("🕕");

  try {
    const data = await douyinFetch(text);
    const result = data.result;

    let caption = `🎵 *${result.platform || "Douyin"}*\n\n${result.title || ""}`;

    if (result.video) {
      await sock.sendMedia(m.chat, result.video, caption, m, {
        type: "video",
      });
    }

    if (result.audio) {
      await sock.sendMedia(m.chat, result.audio, null, m, {
        type: "audio",
      });
    }

    m.react("✅");
  } catch (e) {
    console.error(e);
    m.react("☢");
    m.reply("❌ Failed to retrieve Douyin data. Please try again later.");
  }
}

const __plugin = wrapPlugin(pluginConfig, handler)

  return __plugin
})()

_douyindl.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
_douyindl.limit = true
export default oneCommand(_douyindl, 'douyindl')
