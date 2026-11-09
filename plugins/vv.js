
import { downloadMediaMessage } from '@whiskeysockets/baileys';

// ==================================================
// PRECIOUS-MD VV DOWNLOADER
// Created by Watson Fourpence
//
// Downloads and resends ordinary quoted media.
// Does not bypass WhatsApp ViewOnce restrictions.
// ==================================================

const VIEW_ONCE_KEYS = [
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension'
];

function findContext(message, depth = 0) {
  if (!message || typeof message !== 'object' || depth > 12) {
    return null;
  }

  for (const [key, value] of Object.entries(message)) {
    if (key === 'contextInfo' && value) return value;

    if (value && typeof value === 'object') {
      const found = findContext(value, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

function findMedia(message, depth = 0) {
  if (!message || typeof message !== 'object' || depth > 12) {
    return null;
  }

  for (const key of VIEW_ONCE_KEYS) {
    if (message[key]?.message) {
      return { viewOnce: true, key };
    }
  }

  const mediaTypes = [
    'imageMessage',
    'videoMessage',
    'audioMessage',
    'documentMessage',
    'stickerMessage'
  ];

  for (const type of mediaTypes) {
    if (message[type]) {
      return {
        viewOnce: false,
        type,
        content: message[type]
      };
    }
  }

  for (const key of [
    'ephemeralMessage',
    'documentWithCaptionMessage',
    'editedMessage'
  ]) {
    const nested = message[key]?.message;
    if (nested) {
      const found = findMedia(nested, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

function unwrapMedia(message) {
  let current = message;

  for (let i = 0; i < 12 && current; i++) {
    if (current.ephemeralMessage?.message) {
      current = current.ephemeralMessage.message;
      continue;
    }

    if (current.documentWithCaptionMessage?.message) {
      current = current.documentWithCaptionMessage.message;
      continue;
    }

    if (current.editedMessage?.message) {
      current = current.editedMessage.message;
      continue;
    }

    break;
  }

  return current;
}

export default [
  {
    command: 'vv',
    aliases: ['viewonceinfo'],
    category: 'media',
    description: 'Download and resend quoted normal media',
    cooldown: 3,

    run: async (ctx) => {
      try {
        const context = findContext(ctx.msg.message);
        const quotedMessage = context?.quotedMessage;

        if (!quotedMessage) {
          return ctx.reply(
            '📥 *PRECIOUS-MD VV DOWNLOADER*\n\n' +
            'Reply to a normal photo, video, audio, document or sticker with `.vv`.'
          );
        }

        const detected = findMedia(quotedMessage);

        if (!detected) {
          return ctx.reply('⚠️ No supported media was found in the quoted message.');
        }

        if (detected.viewOnce) {
          return ctx.reply(
            '🔒 *VIEW-ONCE DETECTED*\n\n' +
            'This media is protected by WhatsApp ViewOnce. ' +
            'I cannot bypass that restriction. Ask the sender to resend it normally.'
          );
        }

        const stanzaId = context.stanzaId;
        const participant = context.participant || context.remoteJid;

        if (!stanzaId) {
          return ctx.reply('❌ Could not identify the original media message.');
        }

        const quoted = {
          key: {
            remoteJid: ctx.chat || ctx.msg.key?.remoteJid,
            fromMe: false,
            id: stanzaId,
            participant
          },
          message: quotedMessage
        };

        await ctx.react('⬇️');

        const buffer = await downloadMediaMessage(
          quoted,
          'buffer',
          {},
          {
            logger: ctx.sock.logger,
            reuploadRequest: ctx.sock.updateMediaMessage
          }
        );

        if (!buffer || !buffer.length) {
          return ctx.reply('❌ Media download failed.');
        }

        const media = unwrapMedia(quotedMessage);
        const type = detected.type;
        const caption = detected.content?.caption || '';

        let payload;

        switch (type) {
          case 'imageMessage':
            payload = {
              image: buffer,
              mimetype: detected.content.mimetype || 'image/jpeg',
              caption
            };
            break;

          case 'videoMessage':
            payload = {
              video: buffer,
              mimetype: detected.content.mimetype || 'video/mp4',
              caption
            };
            break;

          case 'audioMessage':
            payload = {
              audio: buffer,
              mimetype: detected.content.mimetype || 'audio/mpeg',
              ptt: false
            };
            break;

          case 'documentMessage':
            payload = {
              document: buffer,
              mimetype: detected.content.mimetype || 'application/octet-stream',
              fileName: detected.content.fileName || 'download',
              caption
            };
            break;

          case 'stickerMessage':
            payload = {
              sticker: buffer
            };
            break;

          default:
            return ctx.reply('❌ Unsupported media type.');
        }

        await ctx.send(payload);
        await ctx.react('✅');

      } catch (error) {
        console.error('[PRECIOUS VV ERROR]', error);

        return ctx.reply(
          '❌ Download failed. The media may have expired or the connection may have interrupted the download.'
        );
      }
    }
  }
];
