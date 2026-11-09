// PRECIOUS-MD | VCF Contact Generator
// Created by Watson Fourpence

function cleanName(value) {
  return String(value || 'PRECIOUS Contact')
    .replace(/[\r\n,;]/g, ' ')
    .trim()
    .slice(0, 80);
}

function cleanNumber(value) {
  return String(value || '').replace(/\D/g, '');
}

export default [{
  command: 'savecontact',
  aliases: ['vcf', 'contactvcf'],
  category: 'tools',
  description: 'Create a downloadable VCF contact',
  cooldown: 5,

  run: async (ctx) => {
    try {
      const args = ctx.args || [];
      const number = cleanNumber(args[0]);
      const name = cleanName(args.slice(1).join(' '));

      if (!number || !/^\d{7,15}$/.test(number)) {
        return ctx.reply(
          '❌ *INVALID CONTACT NUMBER*\n\n' +
          'Usage:\n' +
          '.savecontact 263771234567 Watson'
        );
      }

      const escapeVCard = (value) =>
        value.replace(/\\/g, '\\\\')
          .replace(/;/g, '\\;')
          .replace(/,/g, '\\,')
          .replace(/\n/g, '\\n');

      const vcf =
        'BEGIN:VCARD\r\n' +
        'VERSION:3.0\r\n' +
        `FN:${escapeVCard(name)}\r\n` +
        `TEL;TYPE=CELL:+${number}\r\n` +
        'END:VCARD\r\n';

      const buffer = Buffer.from(vcf, 'utf8');

      await ctx.send({
        document: buffer,
        mimetype: 'text/vcard',
        fileName: `${name.replace(/[^a-z0-9]/gi, '_')}.vcf`,
        caption:
          `✅ *CONTACT CREATED*\n\n` +
          `👤 Name: ${name}\n` +
          `📱 Number: +${number}\n\n` +
          `Created by Watson Fourpence`
      });

      await ctx.react('✅');

    } catch (error) {
      console.error('[SAVECONTACT]', error);
      return ctx.reply('❌ Failed to create contact.');
    }
  }
}];