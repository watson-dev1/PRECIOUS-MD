import axios from 'axios';

// PRECIOUS-MD | NPM Package Search
// Created by Watson Fourpence

export default [{
  command: 'npm',
  aliases: ['npmsearch', 'npmview'],
  category: 'tools',
  description: 'Search npm packages',
  cooldown: 5,

  run: async (ctx) => {
    try {
      const query = ctx.args?.join(' ').trim();

      if (!query) {
        return ctx.reply('❌ Usage: .npm axios');
      }

      await ctx.react('🔎');

      const { data } = await axios.get(
        'https://registry.npmjs.org/-/v1/search',
        {
          params: {
            text: query,
            size: 5
          },
          timeout: 15000
        }
      );

      if (!data.objects?.length) {
        return ctx.reply('❌ No npm packages found.');
      }

      const results = data.objects.map((item, index) => {
        const pkg = item.package;

        return (
          `\n${index + 1}. *${pkg.name}*\n` +
          `┃ Version: ${pkg.version || 'Unknown'}\n` +
          `┃ Description: ${pkg.description || 'None'}\n` +
          `┃ Author: ${pkg.publisher?.username || 'Unknown'}\n` +
          `┃ Link: https://www.npmjs.com/package/${pkg.name}`
        );
      }).join('\n');

      return ctx.reply(
        `╭━━〔 *NPM SEARCH* 〕━━╮\n` +
        `┃ Query: ${query}\n` +
        `╰━━━━━━━━━━━━━━━━━━╯\n` +
        results +
        '\n\nCreated by Watson Fourpence'
      );

    } catch (error) {
      console.error('[NPM]', error.message);
      return ctx.reply('❌ npm search failed.');
    }
  }
}];