
import {
  addRestrictedContact,
  removeRestrictedContact,
  listRestrictedContacts
} from '../lib/contact-restrictions.js';

// ==================================================
// PRECIOUS-MD CONTACT RESTRICTIONS
// Created by Watson Fourpence
// ==================================================

function usage(prefix) {
  return `╭━━〔 *PRECIOUS-MD CONTACT CONTROL* 〕
┃
┃ 📵 *Add restricted contact*
┃ ${prefix}ablock 263637839383
┃
┃ 🔓 *Remove restricted contact*
┃ ${prefix}unablock 263637839383
┃
┃ 📋 *View restricted contacts*
┃ ${prefix}ablocklist
┃
┃ ❓ *Contact control help*
┃ ${prefix}ablockhelp
┃
╰━━━━━━━━━━━━━━━━━━

_Restricted contacts are automatically blocked when the connected WhatsApp library supports blocking; otherwise an automatic reply is used._
_The reply is limited to once every 24 hours._

© Watson Fourpence`;
}

function normalizeNumber(value) {
  return String(value || '')
    .replace(/(?:@s\\.whatsapp\\.net|@c\\.us)$/i, '')
    .replace(/[^0-9]/g, '');
}

function validNumber(number) {
  return /^\d{7,15}$/.test(number);
}

function getOwner(ctx) {
  return Boolean(
    ctx.isOwner ||
    ctx.isSudo ||
    ctx.isOwnerOrSudo
  );
}

const handler = async (ctx) => {
  const {
    command,
    args,
    prefix
  } = ctx;

  // Owner-only protection.
  if (!getOwner(ctx)) {
    return ctx.reply(
      '⛔ This contact management command is restricted to the bot owner.'
    );
  }

  // --------------------------------------------------
  // HELP
  // --------------------------------------------------

  if (command === 'ablockhelp') {
    return ctx.reply(usage(prefix));
  }

  // --------------------------------------------------
  // ADD CONTACT
  // --------------------------------------------------

  if (command === 'ablock') {
    // Numbers may be pasted with spaces, e.g. +263 78 986 6123.
    // Join all parsed arguments before stripping formatting characters.
    const number = normalizeNumber((args || []).join(' '));

    if (!number) {
      return ctx.reply(
        `❌ Enter a WhatsApp number.\n\nExample:\n${prefix}ablock 263637839383`
      );
    }

    if (!validNumber(number)) {
      return ctx.reply(
        '❌ Invalid number. Use the international format without + or spaces.'
      );
    }

    try {
      const result = await addRestrictedContact(number);

      if (result === false) {
        return ctx.reply(
          `⚠️ ${number} is already on your restricted contact list.`
        );
      }

      return ctx.reply(
`<escape>╭━━〔</escape> *CONTACT RESTRICTED* <escape>〕
┃
┃ ✅ Number: ${number}
┃ 📵 Status: Restricted
┃ 🤖 Auto-reply: Enabled
┃ ⏱️ Reply interval: 24 hours
┃
╰━━━━━━━━━━━━━━━━━━

_This contact will now receive your automatic WhatsApp response._`
      );

    } catch (error) {
      console.error('[ABLOCK ADD]', error);

      return ctx.reply(
        '❌ Failed to add this contact. Check the contact restrictions database.'
      );
    }
  }

  // --------------------------------------------------
  // REMOVE CONTACT
  // --------------------------------------------------

  if (
    command === 'unablock' ||
    command === 'ablockremove'
  ) {
    // Numbers may be pasted with spaces, e.g. +263 78 986 6123.
    // Join all parsed arguments before stripping formatting characters.
    const number = normalizeNumber((args || []).join(' '));

    if (!number) {
      return ctx.reply(
        `❌ Enter the number to remove.\n\nExample:\n${prefix}unablock 263637839383`
      );
    }

    if (!validNumber(number)) {
      return ctx.reply(
        '❌ Invalid number. Use the international format without + or spaces.'
      );
    }

    try {
      const result = await removeRestrictedContact(number);

      if (result === false) {
        return ctx.reply(
          `⚠️ ${number} is not on your restricted contact list.`
        );
      }

      let whatsappUnblocked = false;
      if (typeof ctx.sock?.updateBlockStatus === 'function') {
        try {
          await ctx.sock.updateBlockStatus(`${number}@s.whatsapp.net`, 'unblock');
          whatsappUnblocked = true;
        } catch (error) {
          console.error('[ABLOCK WHATSAPP UNBLOCK]', error?.message || error);
        }
      }

      return ctx.reply(
`╭━━〔 *CONTACT RESTORED* 〕
┃
┃ ✅ Number: ${number}
┃ 🔓 Status: Removed from restriction list
┃ ${whatsappUnblocked ? '✅ WhatsApp block lifted' : 'ℹ️ WhatsApp unblock unavailable on this Baileys build'}
┃
╰━━━━━━━━━━━━━━━━━━

_This contact can now chat normally again._`
      );

    } catch (error) {
      console.error('[ABLOCK REMOVE]', error);

      return ctx.reply(
        '❌ Failed to remove this contact.'
      );
    }
  }

  // --------------------------------------------------
  // LIST CONTACTS
  // --------------------------------------------------

  if (
    command === 'ablocklist' ||
    command === 'ablocks'
  ) {
    try {
      const contacts = await listRestrictedContacts();

      if (!Array.isArray(contacts) || contacts.length === 0) {
        return ctx.reply(
`╭━━〔 *RESTRICTED CONTACTS* 〕
┃
┃ 📭 Your list is currently empty.
┃
╰━━━━━━━━━━━━━━━━━━`
        );
      }

      const entries = contacts.map((contact, index) => {
        const number = typeof contact === 'string'
          ? contact
          : contact.number;

        return `┃ ${index + 1}. ${number}`;
      });

      return ctx.reply(
`╭━━〔 *RESTRICTED CONTACTS* 〕
┃
${entries.join('\n')}
┃
┃ 📊 Total: ${contacts.length}
╰━━━━━━━━━━━━━━━━━━

_Use ${prefix}unablock number to restore a contact._`
      );

    } catch (error) {
      console.error('[ABLOCK LIST]', error);

      return ctx.reply(
        '❌ Could not load your restricted contacts.'
      );
    }
  }

  return ctx.reply(usage(prefix));
};

export default {
  command: 'ablock',
  aliases: [
    'unablock',
    'ablockremove',
    'ablocklist',
    'ablocks',
    'ablockhelp'
  ],
  category: 'owner',
  description: 'Manage restricted contacts and automatic replies.',
  owner: true,
  private: true,
  run: handler
};
