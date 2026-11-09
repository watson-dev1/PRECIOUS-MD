
import axios from 'axios';

// ==================================================
// PRECIOUS-MD WHATSAPP PROFILE PICTURE
// Created by Watson Fourpence
// ==================================================

const API_URL = 'https://wa-api.b-cdn.net/wa-dp/';

function normalizeNumber(input = '') {
  return String(input).replace(/\D/g, '');
}

async function fetchImage(url) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 20000,
    maxContentLength: 15 * 1024 * 1024,
    headers: {
      'user-agent': 'Mozilla/5.0',
      accept: 'image/*'
    }
  });

  return Buffer.from(response.data);
}

export default [
  {
    command: 'ppwa',
    aliases: ['getpp', 'waip', 'profilewa'],
    category: 'tools',
    description: 'Get a WhatsApp profile picture by phone number',
    cooldown: 5,

    run: async (ctx) => {
      try {
        const input = ctx.args?.join(' ') || '';

        if (!input.trim()) {
          return ctx.reply(
            '❌ *ENTER A PHONE NUMBER*\n\n' +
            'Example:\n' +
            '`.ppwa 263771234567`\n\n' +
            'Include the country code.'
          );
        }

        const nomor = normalizeNumber(input);

        if (!/^\d{7,15}$/.test(nomor)) {
          return ctx.reply('❌ Invalid phone number. Use 7–15 digits with country code.');
        }

        await ctx.react('🔎');

        let imageBuffer = null;
        let source = '';

        // ------------------------------------------
        // METHOD 1: EXTERNAL PROFILE PICTURE API
        // ------------------------------------------

        try {
          const { data } = await axios.get(API_URL, {
            params: { phone: nomor },
            timeout: 15000,
            headers: {
              accept: '*/*',
              'accept-language': 'en-US,en;q=0.9',
              origin: 'https://snaplytics.io',
              referer: 'https://snaplytics.io/',
              'user-agent':
                'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
            }
          });

          if (data?.profilePicture) {
            const imageUrl = data.profilePicture;

            if (
              typeof imageUrl === 'string' &&
              imageUrl.startsWith('https://')
            ) {
              imageBuffer = await fetchImage(imageUrl);
              source = 'External API';
            }
          }
        } catch (error) {
          console.log('[PPWA API FALLBACK]', error.message);
        }

        // ------------------------------------------
        // METHOD 2: BAILEYS FALLBACK
        // ------------------------------------------

        if (!imageBuffer) {
          try {
            const jid = `${nomor}@s.whatsapp.net`;

            const ppUrl = await ctx.sock.profilePictureUrl(
              jid,
              'image'
            );

            if (ppUrl) {
              imageBuffer = await fetchImage(ppUrl);
              source = 'WhatsApp';
            }
          } catch (error) {
            console.log('[PPWA BAILEYS FALLBACK]', error.message);
          }
        }

        // ------------------------------------------
        // RESULT
        // ------------------------------------------

        if (!imageBuffer?.length) {
          await ctx.react('❌');

          return ctx.reply(
            '❌ *PROFILE PICTURE NOT FOUND*\n\n' +
            `Number: ${nomor}\n\n` +
            'The number may not be registered, or its profile picture may not be publicly accessible.'
          );
        }

        await ctx.send({
          image: imageBuffer,
          mimetype: 'image/jpeg',
          fileName: 'pp.jpg',
          caption:
            '╭━━━〔 *PRECIOUS-MD* 〕━━━╮\n' +
            '┃\n' +
            '┃  ✅ *WHATSAPP PROFILE PICTURE*\n' +
            `┃  Number: ${nomor}\n` +
            `┃  Source: ${source}\n` +
            '┃\n' +
            '╰━━━━━━━━━━━━━━━━━━━━╯\n\n' +
            'Created by Watson Fourpence'
        });

        await ctx.react('✅');

      } catch (error) {
        console.error('[PRECIOUS PPWA ERROR]', error);

        return ctx.reply(
          '❌ Failed to retrieve the WhatsApp profile picture. Please try again later.'
        );
      }
    }
  }
];
