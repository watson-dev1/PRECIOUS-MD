import axios from 'axios';

// PRECIOUS-MD | Website Screenshot
// Created by Watson Fourpence

export default [{
  command: 'screenshot',
  aliases: ['ssweb', 'webshot'],
  category: 'tools',
  description: 'Capture a website screenshot',
  cooldown: 15,

  run: async (ctx) => {
    try {
      let url = ctx.args?.join(' ').trim();

      if (!url) {
        return ctx.reply(
          '❌ Usage: .screenshot https://example.com'
        );
      }

      if (!/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
      }

      let parsed;

      try {
        parsed = new URL(url);
      } catch {
        return ctx.reply('❌ Invalid website URL.');
      }

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return ctx.reply('❌ Unsupported URL protocol.');
      }

      if (
        parsed.hostname === 'localhost' ||
        parsed.hostname.endsWith('.localhost') ||
        parsed.hostname.endsWith('.local') ||
        /^\d{1,3}(\.\d{1,3}){3}$/.test(parsed.hostname)
      ) {
        return ctx.reply('❌ Private and local addresses are not supported.');
      }

      await ctx.react('📸');

      const screenshotURL =
        `https://image.thum.io/get/width/1200/crop/900/noanimate/${encodeURIComponent(url)}`;

      const response = await axios.get(screenshotURL, {
        responseType: 'arraybuffer',
        timeout: 60000,
        maxContentLength: 12 * 1024 * 1024
      });

      const buffer = Buffer.from(response.data);

      if (!buffer.length) {
        throw new Error('Empty screenshot');
      }

      return ctx.send({
        image: buffer,
        mimetype: 'image/png',
        fileName: 'website.png',
        caption:
          `📸 *WEBSITE SCREENSHOT*\n\n` +
          `🌐 ${url}\n\n` +
          `Created by Watson Fourpence`
      });

    } catch (error) {
      console.error('[SCREENSHOT]', error.message);
      return ctx.reply(
        '❌ Screenshot failed. The website may be unavailable or the screenshot service may be busy.'
      );
    }
  }
}];