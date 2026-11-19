// ───────── alightmotiondl ─────────
// Dipecah dari plugins/download/video.js (dulu digabung dengan fitur lain dalam satu file)

import axios from 'axios'
import { config, te, wrapPlugin, oneCommand } from '../../../lib/engine/plugins.js'

const _alightmotion = (() => {
const pluginConfig = {
    name: "alightmotiondl",
    alias: [],
    category: "download",
    description: "Download project/preset Alight Motion",
    usage: ".alightmotiondl <link>",
    example: ".alightmotiondl https://alight.link/...",
    isOwner: false,
    isPremium: false,
    isGroup: false,
    isPrivate: false,
    cooldown: 10,
    energi: 2,
    isEnabled: true,
};

async function handler(m, { sock, text }) {
    if (!text) {
        let help = `📥 *ALIGHT MOTION DOWNLOADER*\n\n`
        help += `This feature lets you easily download Alight Motion projects or presets!\n\n`
        help += `*Cara Usage:*\n`
        help += `- Ketik *${m.prefix}alightmotiondl <link_alight_motion>*\n\n`
        help += `*Example:* ${m.prefix}alightmotiondl https://alight.link/xxxxx`
        return m.reply(help);
    }

    await m.react("🕕");

    try {
        const targetUrl = text.trim();

        const apiUrl = `https://kyzznekoo.zone.id/api/alightmotion/download?url=${encodeURIComponent(targetUrl)}`;

        const response = await axios.get(apiUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
                "Content-Type": "application/json"
            },
            data: {},
            timeout: 60000
        });

        const data = response.data;

        if (!data || !data.status || !data.data || !data.data.url) {
            await m.react("❌");
            return m.reply(`Sorry, that Alight Motion link is invalid or the project has been deleted.`);
        }

        const downloadUrl = data.data.url;

        await sock.sendMessage(m.chat, {
            document: { url: downloadUrl },
            mimetype: "application/zip",
            fileName: `AlightMotion_${config.bot.name}.zip`,
            caption: `✅ Alight Motion preset downloaded successfully!`
        }, { quoted: m });

        await m.react("✅");
    } catch (error) {
        console.error("[AMDL Plugin Error]", error);
        await m.react("☢");
        m.reply(te(m.prefix, m.command, m.pushName));
    }
}

const __plugin = wrapPlugin(pluginConfig, handler)

  return __plugin
})()

_alightmotion.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
_alightmotion.limit = true
export default oneCommand(_alightmotion, 'alightmotiondl')
