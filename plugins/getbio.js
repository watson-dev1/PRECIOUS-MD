// PRECIOUS-MD | WhatsApp Bio Lookup
// Created by Watson Fourpence

export default [{
  command: 'getbio',
  aliases: ['wabio', 'checkbio'],
  category: 'tools',
  description: 'Retrieve an accessible WhatsApp profile bio',
  cooldown: 10,

  run: async (ctx) => {
    try {
      const number = String(ctx.args?.[0] || '').replace(/\D/g, '');

      if (!/^\d{7,15}$/.test(number)) {
        return ctx.reply(
          '❌ Usage: .getbio 263771234567'
        );
      }

      await ctx.react('🔎');

      const jid = `${number}@s.whatsapp.net`;

      if (typeof ctx.sock.fetchStatus !== 'function') {
        return ctx.reply(
          '❌ Your current Baileys socket does not support fetchStatus().'
        );
      }

      const result = await ctx.sock.fetchStatus(jid);

      let status = '';

      if (Array.isArray(result)) {
        status = result[0]?.status || '';
      } else {
        status = result?.status || '';
      }

      if (Array.isArray(status)) {
        status = status[0]?.text || '';
      }

      if (typeof status !== 'string' || !status.trim()) {
        return ctx.reply(
          `❌ No accessible profile bio found for +${number}.\n\n` +
          'The user may have restricted profile information.'
        );
      }

      return ctx.reply(
        `╭━━〔 *WHATSAPP BIO* 〕━━╮\n` +
        `┃ 📱 Number: +${number}\n` +
        `┃ 📝 Bio: ${status.trim().slice(0, 1000)}\n` +
        `╰━━━━━━━━━━━━━━━━━━╯\n\n` +
        `Created by Watson Fourpence`
      );

    } catch (error) {
      console.error('[GETBIO]', error.message);
      return ctx.reply(
        '❌ Unable to retrieve this bio. It may be private or unavailable.'
      );
    }
  }
}];