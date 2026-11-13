
import {
  addRestrictedContact,
  removeRestrictedContact,
  listRestrictedContacts
} from '../lib/contact-restrictions.js';

// ==================================================
// PRECIOUS-MD CONTACT CONTROL
// Created by Watson Fourpence
// ==================================================

function usage(prefix = '.') {
  return `╭━━〔 *PRECIOUS-MD CONTACT CONTROL* 〕
┃
┃ 📵 *Block contact*
┃ ${prefix}ablock 263637839383
┃
┃ 🔓 *Unblock contact*
┃ ${prefix}unablock 263637839383
┃
┃ 📋 *Restricted contacts*
┃ ${prefix}ablocklist
┃
┃ ❓ *Help*
┃ ${prefix}ablockhelp
┃
╰━━━━━━━━━━━━━━━━━━

_Manage restricted WhatsApp contacts._

© Watson Fourpence`;
}

// ==================================================
// NUMBER NORMALIZATION
// ==================================================

function normalizeNumber(value) {
  return String(value || '')
    .replace(/@(?:s\.whatsapp\.net|c\.us)$/i, '')
    .replace(/[^0-9]/g, '');
}

function validNumber(number) {
  return /^\d{7,15}$/.test(number);
}

// ==================================================
// OWNER PROTECTION
// ==================================================

function getOwner(ctx) {
  return Boolean(
    ctx.isOwner ||
    ctx.isSudo ||
    ctx.isOwnerOrSudo
  );
}

// ==================================================
// WHATSAPP BLOCKING
// ==================================================

async function updateWhatsAppBlock(ctx, number, action) {
  const sock = ctx.sock;

  if (!sock) {
    throw new Error('WhatsApp socket is unavailable.');
  }

  if (typeof sock.updateBlockStatus !== 'function') {
    throw new Error(
      'This Baileys socket does not support updateBlockStatus().'
    );
  }

  const jid = `${number}@s.whatsapp.net`;

  await sock.updateBlockStatus(jid, action);

  return true;
}

// ==================================================
// ADD CONTACT
// ==================================================

async function addContact(ctx, number) {
  const added = await addRestrictedContact(number);

  if (!added) {
    return ctx.reply(
      `⚠️ ${number} is already on the restricted contact list.`
    );
  }

  try {
    await updateWhatsAppBlock(ctx, number, 'block');

    return ctx.reply(
`╭━━〔 *CONTACT BLOCKED* 〕
┃
┃ ✅ Number: ${number}
┃ 📵 Restriction: Active
┃ 🔒 WhatsApp block: Successful
┃
╰━━━━━━━━━━━━━━━━━━

_WhatsApp accepted the block request._`
    );

  } catch (error) {
    console.error('[PRECIOUS ABLOCK]', error);

    // Roll back database restriction if actual blocking failed.
    try {
      await removeRestrictedContact(number);
    } catch (rollbackError) {
      console.error('[ABLOCK ROLLBACK]', rollbackError);
    }

    return ctx.reply(
`╭━━〔 *BLOCK FAILED* 〕
┃
┃ ❌ Number: ${number}
┃ ⚠️ WhatsApp block: Failed
┃
╰━━━━━━━━━━━━━━━━━━

_The contact could not be blocked. Check the Baileys socket and connection._`
    );
  }
}

// ==================================================
// REMOVE CONTACT
// ==================================================

async function removeContact(ctx, number) {
  const removed = await removeRestrictedContact(number);

  if (!removed) {
    return ctx.reply(
      `⚠️ ${number} is not on your restricted contact list.`
    );
  }

  let whatsappUnblocked = false;

  try {
    await updateWhatsAppBlock(ctx, number, 'unblock');
    whatsappUnblocked = true;

  } catch (error) {
    console.error('[PRECIOUS UNBLOCK]', error);
  }

  return ctx.reply(
`╭━━〔 *CONTACT RESTORED* 〕
┃
┃ ✅ Number: ${number}
┃ 🗂️ Restriction: Removed
┃ ${whatsappUnblocked
    ? '🔓 WhatsApp: Unblocked'
    : '⚠️ WhatsApp: Unblock not confirmed'}
┃
╰━━━━━━━━━━━━━━━━━━

_The internal restriction has been removed._`
  );
}

// ==================================================
// LIST CONTACTS
// ==================================================

async function showContacts(ctx) {
  const contacts = await listRestrictedContacts();

  if (!contacts.length) {
    return ctx.reply(
`╭━━〔 *RESTRICTED CONTACTS* 〕
┃
┃ 📭 No restricted contacts.
┃
╰━━━━━━━━━━━━━━━━━━`
    );
  }

  const entries = contacts.map((contact, index) => {
    return `┃ ${index + 1}. ${contact.number}`;
  });

  return ctx.reply(
`╭━━〔 *RESTRICTED CONTACTS* 〕
┃
${entries.join('\n')}
┃
┃ 📊 Total: ${contacts.length}
╰━━━━━━━━━━━━━━━━━━

_Use .unablock number to restore a contact._`
  );
}

// ==================================================
// MAIN HANDLER
// ==================================================

const handler = async (ctx) => {
  const {
    command,
    args,
    prefix
  } = ctx;

  // OWNER ONLY
  if (!getOwner(ctx)) {
    return ctx.reply(
      '⛔ This command is restricted to the bot owner.'
    );
  }

  // HELP
  if (command === 'ablockhelp') {
    return ctx.reply(usage(prefix));
  }

  // ADD
  if (command === 'ablock') {
    const number = normalizeNumber(
      (args || []).join(' ')
    );

    if (!number) {
      return ctx.reply(
        `❌ Enter a WhatsApp number.\n\nExample:\n${prefix}ablock 263637839383`
      );
    }

    if (!validNumber(number)) {
      return ctx.reply(
        '❌ Invalid number. Use international format.'
      );
    }

    try {
      return await addContact(ctx, number);
    } catch (error) {
      console.error('[ABLOCK ADD]', error);

      return ctx.reply(
        '❌ Failed to add the contact.'
      );
    }
  }

  // REMOVE
  if (
    command === 'unablock' ||
    command === 'ablockremove'
  ) {
    const number = normalizeNumber(
      (args || []).join(' ')
    );

    if (!number) {
      return ctx.reply(
        `❌ Enter a number.\n\nExample:\n${prefix}unablock 263637839383`
      );
    }

    if (!validNumber(number)) {
      return ctx.reply(
        '❌ Invalid number. Use international format.'
      );
    }

    try {
      return await removeContact(ctx, number);
    } catch (error) {
      console.error('[ABLOCK REMOVE]', error);

      return ctx.reply(
        '❌ Failed to remove the contact.'
      );
    }
  }

  // LIST
  if (
    command === 'ablocklist' ||
    command === 'ablocks'
  ) {
    try {
      return await showContacts(ctx);
    } catch (error) {
      console.error('[ABLOCK LIST]', error);

      return ctx.reply(
        '❌ Could not load restricted contacts.'
      );
    }
  }

  return ctx.reply(usage(prefix));
};

// ==================================================
// PLUGIN EXPORT
// ==================================================

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

  description:
    'Block, unblock and manage restricted WhatsApp contacts.',

  owner: true,
  private: true,

  run: handler
};
