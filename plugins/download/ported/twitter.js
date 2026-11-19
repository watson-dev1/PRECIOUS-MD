/**

* Kaguya Multi Device — WhatsApp & Tele Bot
* 
* Library      : whiskeysockets baileys
* Type         : Plugins | ESM Modules
* Creator      : YannRzy Tech
* Recode       : (Your Name)
* 
* Developer Channels:
* • https://whatsapp.com/channel/0029VaoMGuLA89MbfGh62V16
*
* Info Update Kaguya Channels:
* • https://whatsapp.com/channel/0029VabymHd4CrfnqPLPzk3n
* 
* Copyright © YannRzy Tech 2026
* All Rights Reserved.
  */

import { wrapClassic, oneCommand } from '../../../lib/engine/plugins.js'

const _twitter = (() => {

let handler = async (m, { conn, text, usedPrefix, command }) => {
    try {
        if (!text) {
            return m.reply(`*Example: ${usedPrefix + command} https://x.com/...*`);
        }

        await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

        const body = new URLSearchParams({
            q: text,
            lang: 'id',
            cftoken: ''
        });

        const res = await fetch('https://savetwitter.net/api/ajaxSearch', {
            method: 'POST',
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'Origin': 'https://savetwitter.net',
                'Referer': 'https://savetwitter.net/id3'
            },
            body
        });

        const json = await res.json();
        const html = json?.data;

        if (!html) {
            return m.reply('*Failed to retrieve video data 🍂*');
        }

        const title = html.match(/<h3>(.*?)<\/h3>/)?.[1]?.trim() || 'Twitter Video';
        const duration = html.match(/<p>(\d+:\d+)<\/p>/)?.[1] || '-';
        const thumbnail = html.match(/<img src="([^"]+)"/)?.[1];

        const mp4 = [...html.matchAll(/href="(https:\/\/dl\.snapcdn\.app\/get\?token=[^"]+)".*?MP4\s*\(([^)]+)\)/g)]
            .map(v => ({
                quality: v[2],
                url: v[1]
            }));

        if (!mp4.length) {
            return m.reply('*Video was not found 🍂*');
        }

        const best = mp4[0];

        let caption = `*🐦 Twitter Downloader*\n\n`;
        caption += `*📌 Judul:* ${title}\n`;
        caption += `*⏱️ Durasi:* ${duration}\n`;
        caption += `*🎞️ Kualitas:* ${best.quality}\n`;

        // Unduh video jadi Buffer dulu (lebih stabil daripada kirim url token snapcdn)
        const vres = await fetch(best.url, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://savetwitter.net/' }
        });
        if (!vres.ok) throw new Error(`Failed to download video (HTTP ${vres.status})`);
        const videoBuffer = Buffer.from(await vres.arrayBuffer());
        if (!videoBuffer.length) throw new Error('File video kosong');

        // Thumbnail opsional, harus Buffer (bukan ArrayBuffer), kalau gagal dilewati
        let thumb
        try {
            if (thumbnail) {
                const tres = await fetch(thumbnail)
                if (tres.ok) thumb = Buffer.from(await tres.arrayBuffer())
            }
        } catch {}

        const content = { video: videoBuffer, mimetype: 'video/mp4', caption }
        if (thumb) content.jpegThumbnail = thumb

        await conn.sendMessage(m.chat, content, { quoted: m });
    } catch (e) {
        await m.reply(`*An error occurred while processing the video 🍂*\n\n${e.message}`);
    } finally {
        await conn.sendMessage(m.chat, { react: { text: '', key: m.key } });
    }
};

handler.help = ['twitter'];
handler.tags = ['download']
handler.command = ['twitter']
handler.limit = true;
handler.register = false; // true kan jika ada fitur register atau daftar di bot mu.

const __plugin = wrapClassic(handler)

  return __plugin
})()

_twitter.tags = ['download']   // kategori menu (dulu dari mergePlugins)

// satu command = nama file
export default oneCommand(_twitter, 'twitter')
