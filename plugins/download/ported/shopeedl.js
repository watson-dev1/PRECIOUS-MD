// ───────── shopeedl ─────────
// Dipecah dari plugins/download/video.js (dulu digabung dengan fitur lain dalam satu file)

import { wrapPlugin, oneCommand } from '../../../lib/engine/plugins.js'
import fetch from 'node-fetch'

const _shopeedl = (() => {
const pluginConfig = {
  name: "shopeedl",
  alias: [],
  category: "download",
  description: "Download videos from Shopee",
  usage: ".shopeedl <url>",
  example: ".shopeedl https://shopee.co.id/universal-link/video/...",
  isOwner: false,
  isPremium: false,
  isGroup: false,
  isPrivate: false,
  cooldown: 5,
  energi: 2,
  isEnabled: true,
};

const BASE_URL = "https://shopeenowatermark.com";

async function extract(url) {
  const form = new FormData();
  form.append("url", url);

  const res = await fetch(`${BASE_URL}/api/extract`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Extraction failed");
  return data;
}

function bestStream(streams) {
  const order = ["V1080P", "V720P", "V540P", "V360P", "V1080P_H265", "V720P_H265", "V540P_H265", "V360P_H265"];
  for (const q of order) {
    const s = streams.find(s => s.quality === q);
    if (s) return s;
  }
  return streams[0];
}

async function handler(m, { sock }) {
  const url = m.args[0] || m.text?.trim();

  if (!url || !url.includes("shopee")) {
    return m.reply("❌ Enter a valid Shopee video link.\n\nExample: `.shopeedl https://shopee.co.id/...`");
  }

  await m.react("🕕");

  try {
    const data = await extract(url);
    if (!data || !data.streams_array || data.streams_array.length === 0) {
      await m.react("❌");
      return m.reply("⚠️ Failed to extract the video. Make sure the Shopee video link is correct and the post is public.");
    }

    const best = bestStream(data.streams_array);
    const videoUrl = best.stream_url;

    let caption = `🛍️ *SHOPEE VIDEO DOWNLOADER* 🛍️\n\n`;
    if (data.username) caption += `*Username:* ${data.username}\n`;
    caption += `*Kualitas:* ${best.quality}\n`;
    caption += `\n> Dibuat oleh bot kesayanganmu`;

    await sock.sendMessage(m.chat, {
      video: { url: videoUrl },
      caption: caption
    }, { quoted: m });

    await m.react("✅");
  } catch (error) {
    console.error("[Shopee DL]", error.message);
    await m.react("☢");
    m.reply("😔 Shopee video download failed.");
  }
}

const __plugin = wrapPlugin(pluginConfig, handler)

  return __plugin
})()

_shopeedl.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
_shopeedl.limit = true
export default oneCommand(_shopeedl, 'shopeedl')
