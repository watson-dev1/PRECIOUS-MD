// ───────── rednotedl ─────────
// Dipecah dari plugins/download/video.js (dulu digabung dengan fitur lain dalam satu file)

import { wrapPlugin, oneCommand } from '../../../lib/engine/plugins.js'
import { RedNoteDL } from '../../../lib/services/scraper.js'

const _rednotedl = (() => {
const pluginConfig = {
  name: "rednotedl",
  alias: [],
  category: "download",
  description: "Download videos/photos from RedNote (XiaoHongShu)",
  usage: ".rednotedl <url>",
  example: ".rednotedl https://www.xiaohongshu.com/xxx",
  isOwner: false,
  isPremium: false,
  isGroup: false,
  isPrivate: false,
  cooldown: 10,
  energi: 1,
  isEnabled: true,
};

async function handler(m, { sock }) {
  const text = m.text?.trim();
  if (!text) {
    m.react("❌");
    return m.reply(
      `📕 *RedNote Downloader*\n\n` +
        `Download videos or photos from XiaoHongShu (RedNote).\n\n` +
        `*PENGGUNAAN:*\n` +
        `> *${m.prefix}rednotedl <link>*\n\n` +
        `*EXAMPLE:*\n` +
        `> *${m.prefix}rednotedl https://www.xiaohongshu.com/xxx*`,
    );
  }

  m.react("🕕");

  try {
    const result = await RedNoteDL(text);

    if (!result.status) {
      m.react("☢");
      return m.reply(`❌ *RedNote download failed*\n\n> ${result.error}`);
    }

    if (result.type === "video" && result.results?.[0]) {
      await sock.sendMedia(m.chat, result.results[0], result.title, m, {
        type: "video",
      });
    } else if (result.results?.length > 0) {
      for (let i = 0; i < Math.min(result.results.length, 5); i++) {
        await sock.sendMedia(m.chat, result.results[i], "", m, {
          type: "image",
        });
      }
      if (result.results.length > 5) {
        await m.reply(
          `_${result.results.length - 5} more photos are available; a maximum of 5 can be sent_`,
        );
      }
    }

    m.react("✅");
  } catch (e) {
    console.error(e);
    m.react("☢");
    m.reply("❌ Failed to retrieve RedNote data. Please try again later.");
  }
}

const __plugin = wrapPlugin(pluginConfig, handler)

  return __plugin
})()

_rednotedl.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
_rednotedl.limit = true
export default oneCommand(_rednotedl, 'rednotedl')
