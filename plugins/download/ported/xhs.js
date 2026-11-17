// ───────── xhs ─────────
// Dipecah dari plugins/download/video.js (dulu digabung dengan fitur lain dalam satu file)

import axios from 'axios'
import { wrapClassic, oneCommand, sendAlbum } from '../../../lib/engine/plugins.js'
import fetch from 'node-fetch'

const _Xhs = (() => {
async function redNote(url) {
    try {
        const { data } = await axios.get(url);

        const extractMeta = (pattern) => (data.match(pattern) || [])[1]?.trim() || "";

        const noteId = extractMeta(/<meta\s+name="og:url"\s+content="(.*?)"/i).split('/').pop();
        const nickname = extractMeta(/<meta\s+name="og:title"\s+content="(.*?)"/i).split(" - ")[0];
        const title = extractMeta(/<title>(.*?)<\/title>/i);
        const description = extractMeta(/<meta\s+name="description"\s+content="(.*?)"/i);
        const keywords = extractMeta(/<meta\s+name="keywords"\s+content="(.*?)"/i);
        const duration = extractMeta(/<meta\s+name="og:videotime"\s+content="(.*?)"/i);
        const videoUrl = extractMeta(/<meta\s+name="og:video"\s+content="(.*?)"/i);
        const likes = extractMeta(/<meta\s+name="og:xhs:note_like"\s+content="(.*?)"/i);
        const comments = extractMeta(/<meta\s+name="og:xhs:note_comment"\s+content="(.*?)"/i);
        const collects = extractMeta(/<meta\s+name="og:xhs:note_collect"\s+content="(.*?)"/i);

        const images = [...data.matchAll(/<meta\s+name="og:image"\s+content="(.*?)"/gi)].map((match) => match[1]?.trim());

        return {
            metadata: {
                noteId,
                nickname,
                title,
                description,
                keywords,
                duration,
                likes,
                comments,
                collects,
            },
            media: {
                videoUrl,
                images,
            },
        };
    } catch (err) {
        console.error("Failed to fetch data:", err.message);
        return null;
    }
}

let handler = async (m, { text, conn, usedPrefix, command }) => {
    if (!text) return m.reply("Mana Url Nyah!");

    // Validasi: xhs hanya untuk RedNote / XiaoHongShu
    if (/(?:x|twitter)\.com\//i.test(text)) {
        return m.reply(`Link itu dari X/Twitter, bukan RedNote.\nPakai: *${usedPrefix || '.'}twitter ${text.split(/\s+/)[0]}*`);
    }
    if (!/(xiaohongshu\.com|xhslink\.com)/i.test(text)) {
        return m.reply("URL harus dari xiaohongshu.com atau xhslink.com");
    }

    const result = await redNote(text.trim());
    if (!result) return m.reply("Terkadi Kesalahan Pastikan URL valid!");

    let { media } = result;

    if (!media.videoUrl && !(media.images && media.images.length)) {
        return m.reply("Media tidak ditemukan di link tersebut.");
    }

    // Stiker hanya hiasan: gagal fetch (catbox down/diblokir) tidak boleh menggagalkan download
    try {
        await conn.sendMessage(m.chat, {
            sticker: { url: "https://files.catbox.moe/0ksa1n.webp" }
        }, { quoted: m });
    } catch (e) {
        console.warn("[xhs] sticker dilewati:", e.message);
    }

    if (media.videoUrl) {
        await conn.sendMessage(m.chat, { video: { url: media.videoUrl } }, { quoted: m });
    } else {
        await sendAlbum(conn, m.chat, media.images.map(img => ({ type: 'image', url: img })), { quoted: m });
    }
};

handler.help = ['xhs'];
handler.tags = ['download']
handler.command = ['xhs']
handler.limit = true;

const __plugin = wrapClassic(handler)

  return __plugin
})()

_Xhs.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
export default oneCommand(_Xhs, 'xhs')
