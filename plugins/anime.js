import axios from 'axios';

// PRECIOUS-MD | Anime Search
// Created by Watson Fourpence

export default [{
  command: 'anime',
  aliases: ['animesearch', 'animelookup'],
  category: 'entertainment',
  description: 'Search anime information',
  cooldown: 5,

  run: async (ctx) => {
    try {
      const query = ctx.args?.join(' ').trim();
      if (!query) return ctx.reply('❌ Usage: .anime Naruto');

      await ctx.react('🔎');

      const { data } = await axios.get(
        'https://api.jikan.moe/v4/anime',
        {
          params: { q: query, limit: 3 },
          timeout: 20000
        }
      );

      if (!data.data?.length) {
        return ctx.reply('❌ No anime found.');
      }

      const results = data.data.map((anime, i) =>
        `${i + 1}. *${anime.title}*\n` +
        `┃ Japanese: ${anime.title_japanese || 'N/A'}\n` +
        `┃ Type: ${anime.type || 'N/A'}\n` +
        `┃ Episodes: ${anime.episodes ?? 'Unknown'}\n` +
        `┃ Score: ${anime.score ?? 'N/A'}\n` +
        `┃ Status: ${anime.status || 'N/A'}\n` +
        `┃ Year: ${anime.year || 'Unknown'}\n` +
        `┃ Link: ${anime.url || 'N/A'}`
      ).join('\n\n');

      return ctx.reply(
        `╭━━〔 *ANIME SEARCH* 〕━━╮\n` +
        `┃ Query: ${query}\n` +
        `╰━━━━━━━━━━━━━━━━━━╯\n\n` +
        `${results}\n\n` +
        `Created by Watson Fourpence`
      );

    } catch (error) {
      console.error('[ANIME]', error.message);
      return ctx.reply('❌ Anime search failed. Try again later.');
    }
  }
}];