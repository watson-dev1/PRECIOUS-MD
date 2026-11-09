import axios from 'axios';

// PRECIOUS-MD | Country Information
// Created by Watson Fourpence

export default [{
  command: 'country',
  aliases: ['countryinfo', 'nation'],
  category: 'tools',
  description: 'Get country information',
  cooldown: 5,

  run: async (ctx) => {
    try {
      const query = ctx.args?.join(' ').trim();
      if (!query) return ctx.reply('❌ Usage: .country Zimbabwe');

      await ctx.react('🌍');

      const { data } = await axios.get(
        `https://restcountries.com/v3.1/name/${encodeURIComponent(query)}`,
        {
          params: {
            fields: 'name,capital,region,subregion,population,area,currencies,languages,flags,timezones'
          },
          timeout: 15000
        }
      );

      const c = data[0];
      if (!c) return ctx.reply('❌ Country not found.');

      const currencies = Object.entries(c.currencies || {})
        .map(([code, value]) => `${code} (${value.name})`)
        .join(', ') || 'Unknown';

      const languages = Object.values(c.languages || {}).join(', ') || 'Unknown';

      return ctx.reply(
        `╭━━〔 *COUNTRY INFO* 〕━━╮\n` +
        `┃ 🌍 Country: ${c.name?.common}\n` +
        `┃ 🏛 Official: ${c.name?.official}\n` +
        `┃ 🏙 Capital: ${c.capital?.join(', ') || 'Unknown'}\n` +
        `┃ 🌐 Region: ${c.region || 'Unknown'}\n` +
        `┃ 📍 Subregion: ${c.subregion || 'Unknown'}\n` +
        `┃ 👥 Population: ${Number(c.population || 0).toLocaleString()}\n` +
        `┃ 📏 Area: ${Number(c.area || 0).toLocaleString()} km²\n` +
        `┃ 💰 Currency: ${currencies}\n` +
        `┃ 🗣 Languages: ${languages}\n` +
        `┃ 🕒 Timezones: ${(c.timezones || []).join(', ')}\n` +
        `╰━━━━━━━━━━━━━━━━━━╯\n\n` +
        `Created by Watson Fourpence`
      );

    } catch (error) {
      return ctx.reply(
        error.response?.status === 404
          ? '❌ Country not found.'
          : '❌ Country service unavailable.'
      );
    }
  }
}];