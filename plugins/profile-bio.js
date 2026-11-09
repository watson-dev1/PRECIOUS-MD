// PRECIOUS-MD profile About commands — Watson Fourpence
function ownerOnly(ctx) {
  return Boolean(ctx?.isOwner);
}

export default [
  {
    command: 'setbio', aliases: ['aboutset'], category: 'owner', owner: true,
    description: 'Set the WhatsApp profile About text and save it for autobio',
    async run(ctx) {
      if (!ownerOnly(ctx)) return ctx.reply('❌ Owner only.');
      const value = String(ctx.args?.join(' ') || '').trim();
      if (!value) return ctx.reply(`Usage: ${ctx.prefix || '.'}setbio Your profile About text`);
      if (value.length > 139) return ctx.reply('❌ WhatsApp About text must be 139 characters or fewer.');
      globalThis.db.settings ||= {};
      globalThis.db.settings.autobioText = value;
      await (await import('../lib/database.js')).saveDatabase();
      try {
        if (typeof ctx.sock.updateProfileStatus !== 'function') throw new Error('This Baileys build does not expose updateProfileStatus.');
        await ctx.sock.updateProfileStatus(value);
        return ctx.reply('✅ WhatsApp About updated and saved for .autobio on.');
      } catch (error) {
        return ctx.reply(`⚠️ Text saved, but WhatsApp About could not be updated: ${error.message}`);
      }
    }
  },
  {
    command: 'mybio', aliases: ['getbio'], category: 'owner', owner: true,
    description: 'Show the saved automatic profile About text',
    async run(ctx) {
      if (!ownerOnly(ctx)) return ctx.reply('❌ Owner only.');
      const value = String(globalThis.db?.settings?.autobioText || '').trim();
      return ctx.reply(value ? `📝 Saved autobio:\n${value}\n\nEnable with .autobio on` : 'No autobio text saved. Set one with .setbio Your text');
    }
  }
];
