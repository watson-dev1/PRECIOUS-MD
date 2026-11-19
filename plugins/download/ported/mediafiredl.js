// ───────── mediafiredl ─────────
// Dipecah dari plugins/download/storage.js (dulu digabung dengan fitur lain dalam satu file)

import { wrapPlugin, te, oneCommand } from '../../../lib/engine/plugins.js'
import { mediafire } from '../../../lib/services/scraper.js'

const _mediafiredl = (() => {
const pluginConfig = {
  name: "mediafiredl",
  alias: [],
  category: "download",
  description: "Download files from MediaFire",
  usage: ".mediafiredl <url>",
  example: ".mediafiredl https://www.mediafire.com/file/xxx",
  isOwner: false,
  isPremium: false,
  isGroup: false,
  isPrivate: false,
  cooldown: 15,
  energi: 1,
  isEnabled: true,
};

function getFileName(result) {
  const directName = result?.meta?.title?.trim();
  const urlName = decodeURIComponent(
    result?.download?.link_download?.split("/").pop()?.split("?")[0] || "",
  );
  const extension = urlName.includes(".") ? `.${urlName.split(".").pop()}` : "";
  if (directName && extension && !directName.includes("."))
    return `${directName}${extension}`;
  return directName || urlName || `mediafire_${Date.now()}${extension}`;
}

async function handler(m, { sock }) {
  const url = m.text?.trim();

  if (!url) {
    return m.reply(
      `⚠️ *ᴄᴀʀᴀ ᴘᴀᴋᴀɪ*\n\n` +
        `> \`${m.prefix}mediafiredl <url>\`\n\n` +
        `> Example:\n` +
        `> \`${m.prefix}mediafiredl https://www.mediafire.com/file/xxx\``,
    );
  }

  if (!url.match(/mediafire\.com/i)) {
    return m.reply(`❌ *Invalid URL. Use a MediaFire link.*`);
  }
  await m.react("🕕");

  try {
    const result = await mediafire(url);
    await sock.sendMessage(
      m.chat,
      {
        document: { url: result.download.link_download },
        fileName: getFileName(result),
        mimetype: result.download.mimetype,
        contextInfo: {
          forwardingScore: 99,
          isForwarded: true,
        },
      },
      { quoted: m },
    );
  } catch (err) {
    return m.reply(te(m.prefix, m.command, m.pushName));
  }
}

const __plugin = wrapPlugin(pluginConfig, handler)

  return __plugin
})()

_mediafiredl.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
_mediafiredl.limit = true
export default oneCommand(_mediafiredl, 'mediafiredl')
