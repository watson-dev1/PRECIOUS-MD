// ==================================================
// PRECIOUS-MD VIEW-ONCE HELPER
// Created by Watson Fourpence
//
// This plugin detects quoted ViewOnce messages but does
// not extract, download, replay, or bypass disappearing media.
// ==================================================

import { getContextInfo } from '../lib/utils.js';

const VIEW_ONCE_KEYS = [
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension'
];

function findViewOnce(message, depth = 0) {
  if (!message || typeof message !== 'object' || depth > 12) {
    return null;
  }

  for (const key of VIEW_ONCE_KEYS) {
    if (message[key]?.message) {
      return {
        key,
        content: message[key].message
      };
    }
  }

  // Ephemeral and edited wrappers may contain a ViewOnce node.
  for (const key of [
    'ephemeralMessage',
    'editedMessage',
    'documentWithCaptionMessage'
  ]) {
    const nested = message[key]?.message;
    if (nested) {
      const found = findViewOnce(nested, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

export default [
  {
    command: 'vv',
    aliases: ['viewonceinfo', 'vvhelp'],
    category: 'media',
    description: 'Identify a quoted ViewOnce message and explain safe handling',
    cooldown: 3,

    run: async ctx => {
      const context = getContextInfo(ctx.msg);
      const quoted = context?.quotedMessage;

      if (!quoted) {
        return ctx.reply(
          '👁️ *PRECIOUS-MD VIEW-ONCE HELPER*\n\n' +
          'Reply directly to a ViewOnce message with `.vv` to identify it.\n\n' +
          'ViewOnce media is designed to disappear after viewing. I cannot extract or replay it through a hidden bypass. Ask the sender to resend the photo, video or audio as a normal message if you need to keep it.'
        );
      }

      const detected = findViewOnce(quoted);
      if (!detected) {
        return ctx.reply(
          '⚠️ The message you replied to does not appear to be a ViewOnce message.\n\n' +
          'Reply to the original ViewOnce item with `.vv`.'
        );
      }

      const inner = detected.content || {};
      const type = inner.imageMessage
        ? 'Photo'
        : inner.videoMessage
          ? 'Video'
          : inner.audioMessage
            ? 'Audio'
            : 'Media';

      return ctx.reply(
        `👁️ *VIEW-ONCE MESSAGE DETECTED*\n\n` +
        `Type: ${type}\n` +
        `Format: ${detected.key}\n\n` +
        'WhatsApp ViewOnce media is intentionally non-replayable. PRECIOUS-MD will not download or expose it through a bypass. Please ask the sender to resend it as a normal photo, video or audio message if they agree.'
      );
    }
  }
];
