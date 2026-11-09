import axios from 'axios';

// PRECIOUS-MD | GitHub User Lookup
// Created by Watson Fourpence

export default [{
  command: 'github',
  aliases: ['gh', 'ghuser'],
  category: 'tools',
  description: 'Get GitHub user information',
  cooldown: 5,

  run: async (ctx) => {
    try {
      const username = ctx.args?.[0];

      if (!username) {
        return ctx.reply('❌ Usage: .github username');
      }

      await ctx.react('🔎');

      const { data } = await axios.get(
        `https://api.github.com/users/${encodeURIComponent(username)}`,
        { timeout: 15000 }
      );

      return ctx.reply(
        `╭━━〔 *GITHUB USER* 〕━━╮\n` +
        `┃ 👤 Name: ${data.name || 'Unknown'}\n` +
        `┃ 🆔 Username: ${data.login}\n` +
        `┃ 📝 Bio: ${data.bio || 'None'}\n` +
        `┃ 📦 Repositories: ${data.public_repos}\n` +
        `┃ 👥 Followers: ${data.followers}\n` +
        `┃ ➡️ Following: ${data.following}\n` +
        `┃ 🌍 Location: ${data.location || 'Unknown'}\n` +
        `┃ 🏢 Company: ${data.company || 'None'}\n` +
        `╰━━━━━━━━━━━━━━━━━━╯\n\n` +
        `🔗 ${data.html_url}\n` +
        `Created by Watson Fourpence`
      );

    } catch (error) {
      await ctx.react('❌');
      return ctx.reply(
        error.response?.status === 404
          ? '❌ GitHub user not found.'
          : '❌ Failed to retrieve GitHub information.'
      );
    }
  }
}];