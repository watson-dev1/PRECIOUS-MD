// PRECIOUS-MD | WhatsApp Number Checker
// Created by Watson Fourpence

export default [{
  command: 'checknumber',
  aliases: ['checkwa', 'numbercheck'],
  category: 'tools',
  description: 'Check whether a number is registered on WhatsApp',
  cooldown: 10,

  run: async (ctx) => {
    try {
      const number = String(ctx.args?.[0] || '').replace(/\D/g, '');

      if (!/^\d{7,15}$/.test(number)) {
        return ctx.reply(
          '❌ Usage: .checknumber 263771234567'
        );
      }

      if (typeof ctx.sock.onWhatsApp !== 'function') {
        return ctx.reply(
          '❌ WhatsApp number checking is unavailable in this Baileys version.'
        );
      }

      await ctx.react('🔎');

      const results = await ctx.sock.onWhatsApp(number);
      const result = Array.isArray(results) ? results[0] : null;

      if (!result) {
        return ctx.reply(
          `❌ No registration information returned for +${number}.`
        );
      }

      if (!result.exists) {
        return ctx.reply(
          `╭━━〔 *NUMBER CHECK* 〕━━╮\n` +
          `┃ 📱 Number: +${number}\n` +
          `┃ ❌ WhatsApp: Not registered\n` +
          `╰━━━━━━━━━━━━━━━━━━╯`
        );
      }

      return ctx.reply(
        `╭━━〔 *NUMBER CHECK* 〕━━╮\n` +
        `┃ 📱 Number: +${number}\n` +
        `┃ ✅ WhatsApp: Registered\n` +
        `┃ 🆔 JID: ${result.jid || 'Unavailable'}\n` +
        `╰━━━━━━━━━━━━━━━━━━╯\n\n` +
        `Created by Watson Fourpence`
      );

    } catch (error) {
      console.error('[CHECKNUMBER]', error.message);
      return ctx.reply(
        '❌ Number verification failed. Try again later.'
      );
    }
  }
}];