import axios from 'axios';

// PRECIOUS-MD | Wikipedia Search
// Created by Watson Fourpence

export default [{
  command: 'wiki',
  aliases: ['wikipedia', 'wik'],
  category: 'tools',
  description: 'Search Wikipedia',
  cooldown: 5,

  run: async (ctx) => {
    try {
      const query = ctx.args?.join(' ').trim();
      if (!query) return ctx.reply('❌ Usage: .wiki WhatsApp');

      await ctx.react('🔎');

      const { data: search } = await axios.get(
        'https://en.wikipedia.org/w/api.php',
        {
          params: {
            action: 'query',
            list: 'search',
            srsearch: query,
            srlimit: 1,
            format: 'json'
          },
          timeout: 15000
        }
      );

      const title = search.query?.search?.[0]?.title;

      if (!title) return ctx.reply('❌ No Wikipedia result found.');

      const { data } = await axios.get(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
        { timeout: 15000 }
      );

      return ctx.reply(
        `╭━━〔 *WIKIPEDIA* 〕━━╮\n` +
        `┃ 📚 ${data.title}\n` +
        `╰━━━━━━━━━━━━━━━━━━╯\n\n` +
        `${data.extract || 'No summary available.'}\n\n` +
        `🔗 ${data.content_urls?.desktop?.page || ''}\n\n` +
        `Created by Watson Fourpence`
      );

    } catch (error) {
      console.error('[WIKI]', error.message);
      return ctx.reply('❌ Wikipedia search failed.');
    }
  }
}];