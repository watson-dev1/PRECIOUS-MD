// ───────── instagramdl ─────────
// URL      → JHFastDL → fallback JHSssIG
// username → JHICog (instacognito): profile | posts | reels | stories | highlights | highlightstories
// Skrep by JH a.k.a Dhika - FIONY BOT (lib/services/scraper.js)

import { wrapPlugin, oneCommand, sendAlbum } from '../../../lib/engine/plugins.js'
import { igDownloadAuto, JHICog } from '../../../lib/services/scraper.js'

const _instagramdl = (() => {
const pluginConfig = {
  name: "instagramdl",
  alias: [],
  category: "download",
  description: "Download Instagram videos/photos (URLs, stories, posts, Reels, and highlights)",
  usage: ".instagramdl <url | username [mode]>",
  example: ".instagramdl https://www.instagram.com/reel/xxx",
  isOwner: false,
  isPremium: false,
  isGroup: false,
  isPrivate: false,
  cooldown: 10,
  energi: 1,
  isEnabled: true,
};

const IG_REGEX = /instagram\.com\/(p|reel|reels|stories|tv)\//i;
const MODES = ['profile', 'posts', 'reels', 'stories', 'highlights', 'highlightstories'];
const MAX_ITEMS = 10;

async function sendMedia(sock, m, kind, url, caption) {
  const content = kind === "video" ? { video: { url }, caption } : { image: { url }, caption };
  await sock.sendMessage(m.chat, content, { quoted: m });
}

async function handler(m, { sock }) {
  const raw = (m.text || '').trim();

  if (!raw) {
    return m.reply(
      `📸 *ɪɴsᴛᴀɢʀᴀᴍ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ*\n\n` +
        `> \`${m.prefix}instagramdl <url>\`\n` +
        `> \`${m.prefix}instagramdl <username> [mode]\`\n\n` +
        `*ᴄᴏɴᴛᴏʜ:*\n` +
        `> \`${m.prefix}instagramdl https://www.instagram.com/reel/xxx\`\n` +
        `> \`${m.prefix}instagramdl jkt48.fiony stories\`\n\n` +
        `*ᴍᴏᴅᴇ:* ${MODES.join(', ')}`,
    );
  }

  await m.react("🕕");

  try {
    // ───── mode URL ─────
    if (/instagram\.com/i.test(raw)) {
      if (!IG_REGEX.test(raw)) {
        await m.react("❌");
        return m.reply(`❌ Invalid URL. Use an Instagram Reel, post, or story link.`);
      }

      const result = await igDownloadAuto(raw, 'fastdl');
      const isStory = raw.includes("/stories/");
      let caption = `📸 *Instagram ${isStory ? "Story" : "Downloader"}*\n\n`;
      if (result.author && result.author !== "unknown") caption += `👤 *Author*: @${result.author}\n`;
      if (result.caption) caption += `📝 *Caption*:\n${result.caption}\n`;
      caption = caption.trim();

      if (result.media.length > 1) {
        await sendAlbum(sock, m.chat, result.media.map((it, i) => ({
          type: it.type === "Video" ? "video" : "image",
          url: it.url,
          caption: i === 0 ? caption : ''
        })), { quoted: m });
        await m.react("✅");
        return;
      }

      for (const item of result.media) {
        await sendMedia(sock, m, item.type === "Video" ? "video" : "image", item.url, caption);
        caption = "";
      }
      await m.react("✅");
      return;
    }

    // ───── mode username (JHICog) ─────
    const [uname, modeRaw, extraId] = raw.split(/\s+/);
    const mode = (modeRaw || 'stories').toLowerCase();
    if (!MODES.includes(mode)) {
      await m.react("❌");
      return m.reply(`❌ Unknown mode.\n\n*Mode:* ${MODES.join(', ')}`);
    }

    const res = await JHICog(mode, uname, extraId);
    if (!res.status) throw new Error(res.error || 'Failed to retrieve data');

    const items = res.data.items || [];
    if (!items.length) {
      await m.react("❌");
      return m.reply(`❌ No ${mode} found for @${res.data.username}.`);
    }

    if (mode === 'profile') {
      const p = items[0];
      const cap = `👤 *@${p.username}*\n` +
        `📛 ${p.full_name || '-'}\n` +
        `📝 ${p.bio || '-'}\n\n` +
        `📸 Post: ${p.posts}\n👥 Followers: ${p.followers}\n➡️ Following: ${p.following}`;
      if (p.profile_pic_hd || p.profile_pic) await sendMedia(sock, m, "image", p.profile_pic_hd || p.profile_pic, cap);
      else await m.reply(cap);
      await m.react("✅");
      return;
    }

    if (mode === 'highlights') {
      const list = items.map((h, i) => `${i + 1}. *${h.title || '-'}*\n   ID: \`${h.id}\``).join('\n');
      await m.reply(`✨ *Highlights @${res.data.username}*\n\n${list}\n\n> Ambil isi: \`${m.prefix}instagramdl ${res.data.username} highlightstories <ID>\``);
      await m.react("✅");
      return;
    }

    // semua post (+ isi carousel) dikumpulkan jadi 1 album
    const flat = [];
    let count = 0;
    for (const it of items) {
      if (count >= MAX_ITEMS) break;
      for (const g of [it, ...(it.carousel || [])]) {
        const vid = g.video_hd_url || g.video_url;
        const img = g.image_hd_url || g.image_url;
        if (vid) flat.push({ type: 'video', url: vid, caption: g.caption || '' });
        else if (img) flat.push({ type: 'image', url: img, caption: g.caption || '' });
      }
      count++;
    }
    if (!flat.length) throw new Error('There is no media available to send');
    flat[0].caption = `📸 *Instagram ${mode}* @${res.data.username}\n📦 Total: ${items.length}${items.length > MAX_ITEMS ? ` (dikirim ${MAX_ITEMS})` : ''}`;
    await sendAlbum(sock, m.chat, flat, { quoted: m });
    await m.react("✅");
  } catch (err) {
    await m.react("❌");
    return m.reply(`❌ *ɢᴀɢᴀʟ ᴍᴇɴɢᴜɴᴅᴜʜ*\n\n> ${err.message}`);
  }
}

const __plugin = wrapPlugin(pluginConfig, handler)

  return __plugin
})()

_instagramdl.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
_instagramdl.limit = true
export default oneCommand(_instagramdl, 'instagramdl')
