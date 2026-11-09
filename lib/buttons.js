
import config from '../config.js';

import {
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  proto
} from '@whiskeysockets/baileys';

const MAX_BUTTONS = 3;
const MAX_LABEL_LENGTH = 25;
const MAX_ID_LENGTH = 100;
const MAX_BODY_LENGTH = 3000;

const PREFIX = String(config.prefix || '.');

function validateButtons(buttons) {
  if (!Array.isArray(buttons)) {
    throw new Error('Buttons must be an array.');
  }

  const valid = buttons
    .map(button => ({
      text: String(button?.text || '')
        .trim()
        .slice(0, MAX_LABEL_LENGTH),

      id: String(button?.id || '')
        .trim()
        .slice(0, MAX_ID_LENGTH)
    }))
    .filter(button => button.text && button.id);

  if (!valid.length) {
    throw new Error('At least one valid button is required.');
  }

  return valid.slice(0, MAX_BUTTONS);
}

function createFallback(title, body, footer, buttons) {
  return [
    `*${title}*`,
    '',
    body,
    '',
    ...buttons.map((button, index) =>
      `${index + 1}. *${button.text}*\n` +
      `   Send: ${button.id}`
    ),
    '',
    footer
  ].join('\n');
}

export async function sendQuickButtons(
  sock,
  jid,
  {
    title = 'PRECIOUS-MD',
    body = 'Choose an option below.',
    footer = 'Created by Watson Fourpence',
    buttons = [],
    image = null,
    quoted
  } = {}
) {
  if (!sock || !jid) {
    throw new Error(
      'WhatsApp socket and destination JID are required.'
    );
  }

  const selected = validateButtons(buttons);

  const safeTitle = String(title).slice(0, 60);
  const safeBody = String(body).slice(0, MAX_BODY_LENGTH);
  const safeFooter = String(footer).slice(0, 60);

  const nativeButtons = selected.map(button => ({
    name: 'quick_reply',

    buttonParamsJson: JSON.stringify({
      display_text: button.text,
      id: button.id
    })
  }));

  let header = {
    title: safeTitle,
    subtitle: 'WhatsApp Assistant',
    hasMediaAttachment: false
  };

  // Attach the image directly to the interactive message.
  if (image) {
    const media = await prepareWAMessageMedia(
      { image },
      {
        upload: sock.waUploadToServer
      }
    );

    header = {
      title: safeTitle,
      subtitle: 'PRECIOUS-MD',
      hasMediaAttachment: true,
      imageMessage: media.imageMessage
    };
  }

  const interactiveMessage =
    proto.Message.InteractiveMessage.create({
      header:
        proto.Message.InteractiveMessage.Header.create(header),

      body:
        proto.Message.InteractiveMessage.Body.create({
          text: safeBody
        }),

      footer:
        proto.Message.InteractiveMessage.Footer.create({
          text: safeFooter
        }),

      nativeFlowMessage:
        proto.Message.InteractiveMessage.NativeFlowMessage.create({
          buttons: nativeButtons
        })
    });

  const content = {
    viewOnceMessage: {
      message: {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2
        },

        interactiveMessage
      }
    }
  };

  const options = {};

  if (sock.user?.id) {
    options.userJid = sock.user.id;
  }

  try {
    const message = generateWAMessageFromContent(
      jid,
      content,
      options
    );

    if (!message?.message || !message?.key?.id) {
      throw new Error(
        'Baileys did not generate a valid interactive message.'
      );
    }

    await sock.relayMessage(
      jid,
      message.message,
      {
        messageId: message.key.id
      }
    );

    return message;

  } catch (nativeError) {
    console.error(
      '[PRECIOUS-MD BUTTONS] Native-flow error:',
      nativeError
    );

    // Fallback: send one ordinary message.
    // When an image exists, include it in that same message.
    const fallbackText = createFallback(
      safeTitle,
      safeBody,
      safeFooter,
      selected
    );

    try {
      if (image) {
        return await sock.sendMessage(
          jid,
          {
            image,
            caption: fallbackText
          },
          quoted ? { quoted } : {}
        );
      }

      return await sock.sendMessage(
        jid,
        {
          text: fallbackText
        },
        quoted ? { quoted } : {}
      );

    } catch (fallbackError) {
      console.error(
        '[PRECIOUS-MD BUTTONS] Fallback error:',
        fallbackError
      );

      throw fallbackError;
    }
  }
}

// Dynamic-prefix navigation buttons
export const menuButtons = {
  main: [
    { text: 'GENERAL', id: `${PREFIX}generalmenu` },
    { text: 'GROUP', id: `${PREFIX}groupmenu` },
    { text: 'TOOLS', id: `${PREFIX}toolsmenu` }
  ],

  general: [
    { text: 'MAIN MENU', id: `${PREFIX}menu` },
    { text: 'OWNER', id: `${PREFIX}ownermenu` },
    { text: 'GROUP', id: `${PREFIX}groupmenu` }
  ],

  group: [
    { text: 'MAIN MENU', id: `${PREFIX}menu` },
    { text: 'GENERAL', id: `${PREFIX}generalmenu` },
    { text: 'TOOLS', id: `${PREFIX}toolsmenu` }
  ],

  tools: [
    { text: 'MAIN MENU', id: `${PREFIX}menu` },
    { text: 'GENERAL', id: `${PREFIX}generalmenu` },
    { text: 'OWNER', id: `${PREFIX}ownermenu` }
  ]
};
