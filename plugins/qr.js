import axios from 'axios';

// PRECIOUS-MD | QR Generator
// Created by Watson Fourpence

export default [{
  command: 'qr',
  aliases: ['qrcode', 'makeqr'],
  category: 'tools',
  description: 'Generate QR codes',
  cooldown: 5,

  run: async (ctx) => {
    try {
      const input = ctx.args?.join(' ').trim();

      if (!input) {
        return ctx.reply('❌ Usage: .qr PRECIOUS-MD');
      }

      if (input.length > 2000) {
        return ctx.reply('❌ QR content must not exceed 2000 characters.');
      }

      await ctx.react('📱');

      const response = await axios.get(
        'https://api.qrserver.com/v1/create-qr-code/',
        {
          params: {
            size: '600x600',
            data: input,
            format: 'png',
            ecc: 'H'
          },
          responseType: 'arraybuffer',
          timeout: 20000,
          maxContentLength: 3 * 1024 * 1024
        }
      );

      const buffer = Buffer.from(response.data);

      if (!buffer.length) {
        throw new Error('Empty QR response');
      }

      return ctx.send({
        image: buffer,
        mimetype: 'image/png',
        fileName: 'precious-qr.png',
        caption:
          `╭━━〔 *QR CODE GENERATED* 〕━━╮\n` +
          `┃ 📱 Content: ${input.slice(0, 300)}\n` +
          `┃ ⚡ Powered by PRECIOUS-MD\n` +
          `╰━━━━━━━━━━━━━━━━━━━━╯\n\n` +
          `Created by Watson Fourpence`
      });

    } catch (error) {
      console.error('[QR]', error.message);
      return ctx.reply('❌ QR generation failed.');
    }
  }
}];