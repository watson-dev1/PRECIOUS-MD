import axios from 'axios';

// PRECIOUS-MD | NPM Statistics
// Created by Watson Fourpence

export default [{
  command: 'npmstats',
  aliases: ['npmdetails', 'npminfo'],
  category: 'tools',
  description: 'Get npm package statistics',
  cooldown: 5,

  run: async (ctx) => {
    try {
      const name = ctx.args?.join(' ').trim();

      if (!name) {
        return ctx.reply('❌ Usage: .npmstats axios');
      }

      if (name.length > 214) {
        return ctx.reply('❌ Invalid package name.');
      }

      await ctx.react('📦');

      const encodedName = encodeURIComponent(name);

      const [metadata, downloads] = await Promise.all([
        axios.get(
          `https://registry.npmjs.org/${encodedName}`,
          { timeout: 15000 }
        ),
        axios.get(
          `https://api.npmjs.org/downloads/point/last-month/${encodedName}`,
          { timeout: 15000 }
        ).catch(() => ({ data: {} }))
      ]);

      const pkg = metadata.data;
      const latest = pkg['dist-tags']?.latest;
      const version = pkg.versions?.[latest] || {};

      const maintainers = (pkg.maintainers || [])
        .slice(0, 5)
        .map(m => m.name)
        .join(', ') || 'Unknown';

      return ctx.reply(
        `╭━━〔 *NPM STATISTICS* 〕━━╮\n` +
        `┃ 📦 Package: ${pkg.name}\n` +
        `┃ 🏷 Version: ${latest || 'Unknown'}\n` +
        `┃ 📥 Downloads/month: ${Number(downloads.data.downloads || 0).toLocaleString()}\n` +
        `┃ 👨‍💻 Maintainers: ${maintainers}\n` +
        `┃ 📅 Created: ${pkg.time?.created || 'Unknown'}\n` +
        `┃ 🔄 Modified: ${pkg.time?.modified || 'Unknown'}\n` +
        `┃ 📝 License: ${version.license || 'Unknown'}\n` +
        `┃ 🔗 https://www.npmjs.com/package/${pkg.name}\n` +
        `╰━━━━━━━━━━━━━━━━━━╯\n\n` +
        `Created by Watson Fourpence`
      );

    } catch (error) {
      console.error('[NPMSTATS]', error.message);

      return ctx.reply(
        error.response?.status === 404
          ? '❌ npm package not found.'
          : '❌ Failed to retrieve npm statistics.'
      );
    }
  }
}];