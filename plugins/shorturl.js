import axios from 'axios';

// PRECIOUS-MD | URL Shortener
// Created by Watson Fourpence

export default [{
  command: 'shorturl',
  aliases: ['tinyurl', 'shorten'],
  category: 'tools',
  description: 'Shorten a long URL',
  cooldown: 5,

  run: async (ctx) => {
    try {
      const url = ctx.args?.join(' ').trim();

      if (!url) {
        return ctx.reply(
          '❌ Usage: .shorturl https://example.com'
        );
      }

      let parsed;

      try {
        parsed = new URL(url);
      } catch {
        return ctx.reply('❌ Invalid URL.');
      }

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return ctx.reply('❌ Only HTTP and HTTPS URLs are supported.');
      }

      await ctx.react('🔗');

      const { data } = await axios.get(
        'https://is.gd/create.php',
        {
          params: {
            format: 'simple',
            url: parsed.href
          },
          timeout: 15000,
          responseType: 'text'
        }
      );

      const shortUrl = String(data).trim();

      if (!/^https:\/\/is\.gd\/[a-zA-Z0-9]+$/.test(shortUrl)) {
        throw new Error('Invalid short URL response');
      }

      return ctx.reply(
        `╭━━〔 *URL SHORTENER* 〕━━╮\n` +
        `┃ Original:\n` +
        `┃ ${parsed.href}\n\n` +
        `┃ Short URL:\n` +
        `┃ ${shortUrl}\n` +
        `╰━━━━━━━━━━━━━━━━━━╯\n\n` +
        `Created by Watson Fourpence`
      );

    } catch (error) {
      console.error('[SHORTURL]', error.message);
      return ctx.reply('❌ URL shortening failed.');
    }
  }
}];