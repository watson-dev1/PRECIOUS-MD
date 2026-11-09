import axios from 'axios';

// PRECIOUS-MD | Random Facts
// Created by Watson Fourpence

export default [{
  command: 'fact',
  aliases: ['facts', 'randomfact'],
  category: 'entertainment',
  description: 'Get a random interesting fact',
  cooldown: 5,

  run: async (ctx) => {
    try {
      await ctx.react('🧠');

      const { data } = await axios.get(
        'https://uselessfacts.jsph.pl/api/v2/facts/random',
        {
          params: {
            language: 'en'
          },
          timeout: 15000,
          headers: {
            accept: 'application/json'
          }
        }
      );

      if (!data?.text) {
        throw new Error('No fact returned');
      }

      return ctx.reply(
        `╭━━〔 *DID YOU KNOW?* 〕━━╮\n` +
        `┃\n` +
        `┃ 🧠 ${data.text}\n` +
        `┃\n` +
        `╰━━━━━━━━━━━━━━━━━━╯\n\n` +
        `📚 Source: Useless Facts\n` +
        `Created by Watson Fourpence`
      );

    } catch (error) {
      console.error('[FACT]', error.message);
      return ctx.reply(
        '❌ Could not retrieve a random fact. Please try again.'
      );
    }
  }
}];