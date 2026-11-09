import axios from 'axios';

// PRECIOUS-MD | Random Meme
// Created by Watson Fourpence

export default [{
  command: 'meme',
  aliases: ['memes', 'randommeme'],
  category: 'entertainment',
  description: 'Get a random meme',
  cooldown: 10,

  run: async (ctx) => {
    try {
      await ctx.react('😂');

      const { data } = await axios.get(
        'https://meme-api.com/gimme',
        {
          timeout: 15000,
          headers: {
            'user-agent': 'PRECIOUS-MD/1.0'
          }
        }
      );

      if (
        !data?.url ||
        data.nsfw ||
        !/^https:\/\//i.test(data.url)
      ) {
        return ctx.reply(
          '❌ No suitable meme found. Try again.'
        );
      }

      const response = await axios.get(data.url, {
        responseType: 'arraybuffer',
        timeout: 20000,
        maxContentLength: 8 * 1024 * 1024
      });

      const buffer = Buffer.from(response.data);

      if (!buffer.length) {
        throw new Error('Empty meme image');
      }

      return ctx.send({
        image: buffer,
        mimetype: 'image/jpeg',
        fileName: 'precious-meme.jpg',
        caption:
          `😂 *${data.title || 'RANDOM MEME'}*\n\n` +
          `📌 Subreddit: ${data.subreddit || 'Unknown'}\n` +
          `⬆️ Upvotes: ${data.ups ?? 'Unknown'}\n\n` +
          `Created by Watson Fourpence`
      });

    } catch (error) {
      console.error('[MEME]', error.message);
      return ctx.reply(
        '❌ Failed to retrieve a meme. Please try again later.'
      );
    }
  }
}];