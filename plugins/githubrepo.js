import axios from 'axios';

// PRECIOUS-MD | GitHub Repository Information
// Created by Watson Fourpence

export default [{
  command: 'githubrepo',
  aliases: ['repoinfo', 'ghrepo'],
  category: 'tools',
  description: 'Get GitHub repository details',
  cooldown: 5,

  run: async (ctx) => {
    try {
      const input = ctx.args?.join(' ').trim();

      if (!input) {
        return ctx.reply(
          '❌ Usage:\n' +
          '.githubrepo watson-dev1/PRECIOUS-MD'
        );
      }

      const clean = input
        .replace(/^https?:\/\/github\.com\//i, '')
        .replace(/\/+$/, '')
        .replace(/\.git$/i, '');

      const parts = clean.split('/');

      if (
        parts.length !== 2 ||
        parts.some(part => !/^[a-zA-Z0-9_.-]+$/.test(part))
      ) {
        return ctx.reply('❌ Enter a valid owner/repository.');
      }

      await ctx.react('🔎');

      const { data } = await axios.get(
        `https://api.github.com/repos/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`,
        {
          timeout: 15000,
          headers: {
            accept: 'application/vnd.github+json'
          }
        }
      );

      const topics = (data.topics || []).slice(0, 8).join(', ') || 'None';

      return ctx.reply(
        `╭━━〔 *GITHUB REPOSITORY* 〕━━╮\n` +
        `┃ 📦 Name: ${data.full_name}\n` +
        `┃ 👤 Owner: ${data.owner?.login || 'Unknown'}\n` +
        `┃ 📝 Description: ${data.description || 'None'}\n` +
        `┃ ⭐ Stars: ${data.stargazers_count}\n` +
        `┃ 🍴 Forks: ${data.forks_count}\n` +
        `┃ 👁 Watchers: ${data.watchers_count}\n` +
        `┃ 🐛 Open Issues: ${data.open_issues_count}\n` +
        `┃ 💻 Language: ${data.language || 'Unknown'}\n` +
        `┃ 🔒 Private: ${data.private ? 'Yes' : 'No'}\n` +
        `┃ 🏷 Topics: ${topics}\n` +
        `┃ 🔗 ${data.html_url}\n` +
        `╰━━━━━━━━━━━━━━━━━━━━╯\n\n` +
        `Created by Watson Fourpence`
      );

    } catch (error) {
      console.error('[GITHUBREPO]', error.message);

      return ctx.reply(
        error.response?.status === 404
          ? '❌ Repository not found or inaccessible.'
          : '❌ GitHub repository lookup failed.'
      );
    }
  }
}];