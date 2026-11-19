// ───────── ttmp3 ─────────
// Dipecah dari plugins/download/tiktok.js (dulu digabung dengan fitur lain dalam satu file)

import axios from 'axios'
import { wrapPlugin, oneCommand } from '../../../lib/engine/plugins.js'
import fs from 'fs'
import path from 'path'
import { ttdown } from '../../../lib/services/scraper.js'
import ffmpeg from 'fluent-ffmpeg'
import { createRequire } from 'module'

const _ttmp3 = (() => {
let ffmpegBin = 'ffmpeg'; // Termux & sejenisnya: pakai ffmpeg sistem kalau binary bawaan does not exist
try { ffmpegBin = createRequire(import.meta.url)('@ffmpeg-installer/ffmpeg').path || 'ffmpeg' } catch {}
ffmpeg.setFfmpegPath(ffmpegBin);

const pluginConfig = {
  name: ["ttmp3"],
  alias: [],
  category: "download",
  description: "Download audio TikTok",
  usage: ".ttmp3 <url>",
  example: ".ttmp3 https://vt.tiktok.com/xxx",
  isOwner: false,
  isPremium: false,
  isGroup: false,
  isPrivate: false,
  cooldown: 10,
  energi: 1,
  isEnabled: true,
};

function getTempDir() {
  const tmpDir = path.join(process.cwd(), 'database', 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

async function extractAudioFromVideo(videoUrl) {
  const tmpDir = getTempDir();
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const inputFile = path.join(tmpDir, `ttmp3_${stamp}.mp4`);
  const outputFile = path.join(tmpDir, `ttmp3_${stamp}.mp3`);

  const res = await axios.get(videoUrl, {
    responseType: "arraybuffer",
    timeout: 60000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      Referer: "https://www.tiktok.com/",
    },
  });

  fs.writeFileSync(inputFile, Buffer.from(res.data));

  await new Promise((resolve, reject) => {
    ffmpeg(inputFile)
      .noVideo()
      .audioCodec("libmp3lame")
      .format("mp3")
      .on("end", resolve)
      .on("error", reject)
      .save(outputFile);
  });

  if (!fs.existsSync(outputFile) || fs.statSync(outputFile).size <= 0) {
    throw new Error("Failed to extract TikTok audio");
  }

  return {
    buffer: fs.readFileSync(outputFile),
    files: [inputFile, outputFile],
  };
}

async function handler(m, { sock }) {
  const url = m.text?.trim();
  let cleanupFiles = [];

  const cleanupTempFiles = () => {
    for (const file of cleanupFiles) {
      if (!file) continue;
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch {}
    }
    cleanupFiles = [];
  };

  if (!url) {
    return m.reply(
      `╭┈┈⬡「 🎵 *ᴛɪᴋᴛᴏᴋ ᴅᴏᴡɴʟᴏᴀᴅ* 」
┃ ㊗ ᴜsᴀɢᴇ: \`${m.prefix}ttmp3 <url>\`
╰┈┈⬡

> Example: ${m.prefix}ttmp3 https://vt.tiktok.com/xxx`,
    );
  }

  if (!url.match(/tiktok\.com|vt\.tiktok/i)) {
    return m.reply("❌ Invalid URL. Use a TikTok link.");
  }

  m.react("🕕");

  try {
    const result = await ttdown(url);
    const audioDownload = result.downloads.find((d) => d.type === "mp3");
    let audioSource = audioDownload?.url || null;

    if (!audioSource) {
      const videoDownload =
        result.downloads.find((d) => d.type === "nowatermark_hd") ||
        result.downloads.find((d) => d.type === "nowatermark");

      if (!videoDownload?.url) {
        throw new Error("TikTok audio was not found.");
      }

      const extractedAudio = await extractAudioFromVideo(videoDownload.url);
      cleanupFiles = extractedAudio.files;
      audioSource = extractedAudio.buffer;
    }

    await sock.sendMedia(m.chat, audioSource, null, m, {
      type: "audio",
      mimetype: "audio/mpeg",
      fileName: `TikTok_Audio_${Date.now()}.mp3`,
    });

    m.react("✅");

    // cleanup
    cleanupTempFiles();
  } catch (err) {
    cleanupTempFiles();
    console.error("[TikTokDL] Error:", err);
    m.react("❌");
    m.reply(`❌ *ɢᴀɢᴀʟ ᴍᴇɴɢᴜɴᴅᴜʜ*\n\n> ${err.message}`);
  }
}

const __plugin = wrapPlugin(pluginConfig, handler)

  return __plugin
})()

_ttmp3.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
_ttmp3.limit = true
export default oneCommand(_ttmp3, 'ttmp3')
