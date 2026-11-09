import {
  addRestrictedContact,
  removeRestrictedContact,
  listRestrictedContacts
} from '../lib/contact-restrictions.js';

function usage(prefix) {
  return `*PRECIOUS-MD CONTACT AUTO-REPLY*\n\n` +
    `Add a number:\n${prefix}ablock 263637839383\n\n` +
    `Remove a number:\n${prefix}unablock 263637839383\n\n` +
    `View list:\n${prefix}ablocklist\n\n` +
    `Restricted contacts are not blocked by WhatsApp. ` +
    `They can still message, and PRECIOUS-MD sends an automatic private reply.`;
}

export default [
  {
    command: 'ablock',
    aliases: ['addautoreply', 'restrictcontact'],
    owner: true,
    category: 'owner',
    description: 'Add a contact to the automatic DM reply list',
    cooldown: 2,
    run: async ctx => {
      const result = await addRestrictedContact(ctx.q, ctx.sender);
      return ctx.reply(
        `${result.existed ? 'ℹ️' : '✅'} *CONTACT ${result.existed ? 'ALREADY IN' : 'ADDED TO'} AUTO-REPLY LIST*\n\n` +
        `Number: +${result.number}\n` +
        `Automatic DM reply: ON\n` +
        `WhatsApp block: OFF\n\n` +
        `When this contact messages you privately, PRECIOUS-MD will reply automatically.`
      );
    }
  },
  {
    command: 'unablock',
    aliases: ['removeautoreply', 'unrestrictcontact'],
    owner: true,
    category: 'owner',
    description: 'Remove a contact from the automatic DM reply list',
    cooldown: 2,
    run: async ctx => {
      const result = await removeRestrictedContact(ctx.q);
      return ctx.reply(
        `${result.existed ? '✅ Removed' : 'ℹ️ Number was not listed'}\n\n` +
        `Number: +${result.number}\n` +
        `Automatic DM reply: OFF`
      );
    }
  },
  {
    command: 'ablocklist',
    aliases: ['autoreplylist', 'restrictedcontacts'],
    owner: true,
    category: 'owner',
    description: 'Show contacts with automatic DM replies enabled',
    cooldown: 2,
    run: async ctx => {
      const contacts = await listRestrictedContacts();
      if (!contacts.length) return ctx.reply('There are no contacts in the auto-reply list.');
      const lines = contacts.map((item, index) => `${index + 1}. +${item.number}`);
      return ctx.reply(`*AUTO-REPLY CONTACTS*\n\n${lines.join('\n')}\n\nTotal: ${contacts.length}`);
    }
  },
  {
    command: 'ablockhelp',
    aliases: ['autoreplyhelp'],
    owner: true,
    category: 'owner',
    description: 'Show contact auto-reply command help',
    run: async ctx => ctx.reply(usage(ctx.prefix))
  }
];
