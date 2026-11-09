import axios from 'axios';

// PRECIOUS-MD | Dictionary
// Created by Watson Fourpence

export default [{
  command: 'define',
  aliases: ['meaning', 'dictionary'],
  category: 'tools',
  description: 'Find word definitions',
  cooldown: 5,

  run: async (ctx) => {
    try {
      const word = ctx.args?.join(' ').trim();
      if (!word) return ctx.reply('❌ Usage: .define beautiful');

      await ctx.react('📖');

      const { data } = await axios.get(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
        { timeout: 15000 }
      );

      const entry = data[0];
      const meanings = (entry.meanings || []).slice(0, 3);

      const result = meanings.map((item, i) => {
        const definitions = (item.definitions || [])
          .slice(0, 2)
          .map((d, n) => `   ${n + 1}. ${d.definition}`)
          .join('\n');

        return `${i + 1}. *${item.partOfSpeech}*\n${definitions}`;
      }).join('\n\n');

      return ctx.reply(
        `╭━━〔 *DICTIONARY* 〕━━╮\n` +
        `┃ Word: ${entry.word}\n` +
        `┃ Phonetic: ${entry.phonetic || 'N/A'}\n` +
        `╰━━━━━━━━━━━━━━━━━━╯\n\n` +
        `${result}\n\n` +
        `Created by Watson Fourpence`
      );

    } catch (error) {
      return ctx.reply(
        error.response?.status === 404
          ? '❌ Word not found.'
          : '❌ Dictionary service unavailable.'
      );
    }
  }
}];