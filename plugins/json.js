// PRECIOUS-MD | JSON Formatter
// Created by Watson Fourpence

export default [{
  command: 'json',
  aliases: ['beautifyjson', 'formatjson'],
  category: 'tools',
  description: 'Format and validate JSON',
  cooldown: 3,

  run: async (ctx) => {
    try {
      const input = ctx.args?.join(' ').trim();

      if (!input) {
        return ctx.reply(
          '❌ *JSON FORMATTER*\n\n' +
          'Usage:\n' +
          '.json {"name":"Watson","bot":"PRECIOUS-MD"}'
        );
      }

      const parsed = JSON.parse(input);
      const formatted = JSON.stringify(parsed, null, 2);

      if (formatted.length > 60000) {
        return ctx.reply('❌ JSON is too large to display.');
      }

      await ctx.react('✅');

      return ctx.reply(
        `╭━━〔 *JSON VALIDATOR* 〕━━╮\n` +
        `┃ ✅ Valid JSON\n` +
        `┃ 📏 Characters: ${formatted.length}\n` +
        `╰━━━━━━━━━━━━━━━━━━╯\n\n` +
        '```json\n' +
        formatted +
        '\n```\n\n' +
        'Created by Watson Fourpence'
      );

    } catch (error) {
      return ctx.reply(
        `❌ *INVALID JSON*\n\n` +
        `Error: ${error.message}`
      );
    }
  }
}];