
import config from '../config.js';
import fs from 'node:fs/promises';
import path from 'node:path';

import { getAllAudioUrls } from 'google-tts-api';

import {
  sendQuickButtons,
  menuButtons
} from '../lib/buttons.js';

// ==================================================
// PRECIOUS-MD MENU CONFIGURATION
// Created by Watson Fourpence
// ==================================================

const BOT_NAME = config.botName || 'PRECIOUS-MD';
const OWNER_NAME = config.ownerName || 'Watson Fourpence';
const PREFIX = String(config.prefix || '.');

const MENU_IMAGE = path.join(
  process.cwd(),
  'media',
  'watson.jpg'
);

const TTS_LANGUAGE = 'en';
const TTS_TIMEZONE = 'Africa/Harare';

// ==================================================
// CATEGORIES
// ==================================================

const categories = {
  general: 'General',
  owner: 'Owner',
  group: 'Group',
  tools: 'Tools',
  sticker: 'Sticker',
  media: 'Media',
  ai: 'Artificial Intelligence',
  fun: 'Entertainment',
  games: 'Games',
  utility: 'Utilities'
};

// ==================================================
// PLUGIN HELPERS
// ==================================================

function getPlugins() {
  return (globalThis.plugins || []).filter(plugin =>
    plugin && typeof plugin.command === 'string'
  );
}

function normalizeCategory(category) {
  return String(category || 'general').toLowerCase();
}

function getCategoryPlugins(category) {
  return getPlugins()
    .filter(plugin =>
      normalizeCategory(plugin.category) === category
    )
    .sort((a, b) =>
      a.command.localeCompare(b.command)
    );
}

function getCommandCount() {
  return globalThis.commandMap instanceof Map
    ? globalThis.commandMap.size
    : getPlugins().reduce(
        (total, plugin) =>
          total + 1 + (plugin.aliases?.length || 0),
        0
      );
}

// ==================================================
// TIME AND GREETING
// ==================================================

function getGreeting() {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TTS_TIMEZONE,
      hour: '2-digit',
      hourCycle: 'h23'
    }).format(new Date())
  );

  if (hour >= 5 && hour < 12) {
    return 'Good morning';
  }

  if (hour >= 12 && hour < 17) {
    return 'Good afternoon';
  }

  return 'Good evening';
}

function getUserName(ctx) {
  const rawName =
    ctx.msg?.pushName ||
    ctx.msg?.verifiedBizName ||
    String(ctx.sender || '').split('@')[0] ||
    'friend';

  return String(rawName)
    .replace(/[\r\n]/g, ' ')
    .replace(/[^\p{L}\p{N} .'-]/gu, '')
    .trim()
    .slice(0, 40) || 'friend';
}

// ==================================================
// VOICE SCRIPT
// ==================================================

function createVoiceScript(ctx, category = null) {
  const greeting = getGreeting();
  const userName = getUserName(ctx);

  if (category) {
    const title =
      categories[category] || category.toUpperCase();

    const count =
      getCategoryPlugins(category).length;

    return (
      `${greeting}, ${userName}. ` +
      `Welcome to ${BOT_NAME}. ` +
      `You are now viewing the ${title} menu. ` +
      `There are ${count} commands available in this category. ` +
      `Choose a command from the menu. ` +
      `I'm ${BOT_NAME}, created by Watson Fourpence, ` +
      `and I'm ready to help you.`
    );
  }

  return (
    `${greeting}, ${userName}. ` +
    `Welcome to ${BOT_NAME}. ` +
    `Your main menu is ready. ` +
    `You currently have ${getCommandCount()} commands available. ` +
    `Choose General, Group, or Tools to explore my commands. ` +
    `I'm ${BOT_NAME}, created by Watson Fourpence. ` +
    `I'm ready to help you. Enjoy using PRECIOUS-MD.`
  );
}

// ==================================================
// GOOGLE TTS GENERATOR
// ==================================================

async function generateTTS(text) {
  const audioParts = [];

  const audioUrls = getAllAudioUrls(text, {
    lang: TTS_LANGUAGE,
    slow: false,
    host: 'https://translate.google.com'
  });

  for (const item of audioUrls) {
    const response = await fetch(item.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      },
      signal: AbortSignal.timeout(20000)
    });

    if (!response.ok) {
      throw new Error(
        `TTS request failed: HTTP ${response.status}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();

    audioParts.push(Buffer.from(arrayBuffer));
  }

  if (!audioParts.length) {
    throw new Error('TTS returned an empty audio response.');
  }

  return Buffer.concat(audioParts);
}

// ==================================================
// SEND VOICE GREETING
// ==================================================

async function sendMenuVoice(ctx, category = null) {
  try {
    const voiceText = createVoiceScript(ctx, category);

    const audioBuffer = await generateTTS(voiceText);

    await ctx.sock.sendMessage(
      ctx.chat,
      {
        audio: audioBuffer,
        mimetype: 'audio/mpeg',
        ptt: false
      },
      {
        quoted: ctx.msg
      }
    );

    console.log(
      `[PRECIOUS TTS] Voice greeting sent to ${getUserName(ctx)}`
    );

  } catch (error) {
    console.error(
      '[PRECIOUS MENU TTS ERROR]',
      error
    );

    // TTS failure must not stop the menu.
  }
}

// ==================================================
// MENU IMAGE
// ==================================================

async function getMenuImage() {
  try {
    return await fs.readFile(MENU_IMAGE);
  } catch (error) {
    console.error(
      '[PRECIOUS MENU IMAGE]',
      error.message
    );

    return null;
  }
}

// ==================================================
// DYNAMIC COMMAND MENU
// ==================================================

function makeMenu() {
  const grouped = new Map();

  for (const plugin of getPlugins()) {
    const category = normalizeCategory(plugin.category);

    if (!grouped.has(category)) {
      grouped.set(category, new Set());
    }

    grouped.get(category).add(plugin.command);
  }

  const sections = [];

  for (const [category, commands] of grouped) {
    const title =
      categories[category] || category.toUpperCase();

    sections.push(
      `\n╭━━〔 *${title.toUpperCase()}* 〕━━╮\n` +
      [...commands]
        .sort()
        .map(command =>
          `┃ ${PREFIX}${command}`
        )
        .join('\n') +
      '\n╰━━━━━━━━━━━━━━━━━━╯'
    );
  }

  return sections.join('\n');
}

// ==================================================
// MAIN MENU CAPTION
// ==================================================

function makeMainMenu() {
  return (
    `╭━━〔 *${BOT_NAME}* 〕━━╮\n` +
    `┃ 👑 Creator: ${OWNER_NAME}\n` +
    `┃ ⚡ Prefix: ${PREFIX}\n` +
    `┃ ⏱ Runtime: ${Math.floor(process.uptime())} seconds\n` +
    `┃ 🧩 Commands: ${getCommandCount()}\n` +
    `┃ 🌐 Mode: ${config.publicMode ? 'PUBLIC' : 'PRIVATE'}\n` +
    `╰━━━━━━━━━━━━━━━━━━╯\n` +
    makeMenu() +
    `\n\n_Powered by Watson Fourpence_`
  );
}

// ==================================================
// CATEGORY NAVIGATION
// ==================================================

function getCategoryButtons(category) {
  switch (category) {
    case 'general':
      return menuButtons.general;

    case 'owner':
      return menuButtons.general;

    case 'group':
      return menuButtons.group;

    case 'tools':
      return menuButtons.tools;

    default:
      return [
        {
          text: 'MAIN MENU',
          id: `${PREFIX}menu`
        },
        {
          text: 'GENERAL',
          id: `${PREFIX}generalmenu`
        },
        {
          text: 'TOOLS',
          id: `${PREFIX}toolsmenu`
        }
      ];
  }
}

// ==================================================
// SEND MAIN MENU
// ==================================================

async function sendMainMenu(ctx) {
  const image = await getMenuImage();

  const caption = makeMainMenu();

  await sendQuickButtons(
    ctx.sock,
    ctx.chat,
    {
      title: BOT_NAME,
      body: caption.slice(0, 2800),
      footer: 'Created by Watson Fourpence',
      image,
      quoted: ctx.msg,
      buttons: menuButtons.main
    }
  );

  // Send personalized audio greeting.
  await sendMenuVoice(ctx);
}

// ==================================================
// SHOW CATEGORY
// ==================================================

async function showCategory(ctx, category) {
  const plugins = getCategoryPlugins(category);

  const title =
    categories[category] || category.toUpperCase();

  const output = plugins.map(plugin =>
    `┃ ${PREFIX}${plugin.command}\n` +
    `┃ ${plugin.description || 'No description available'}`
  );

  const body = plugins.length
    ? (
        `╭━━〔 *${title.toUpperCase()}* 〕━━╮\n\n` +
        output.join('\n\n') +
        `\n\n╰━━━━━━━━━━━━━━━━━━╯\n` +
        `_Commands: ${plugins.length}_`
      )
    : (
        `📂 *${title.toUpperCase()}*\n\n` +
        'No commands are currently registered in this category.'
      );

  const image = await getMenuImage();

  await sendQuickButtons(
    ctx.sock,
    ctx.chat,
    {
      title: `${BOT_NAME} ${title.toUpperCase()}`,
      body: body.slice(0, 2800),
      footer: `Created by ${OWNER_NAME}`,
      image,
      quoted: ctx.msg,
      buttons: getCategoryButtons(category)
    }
  );

  // Speak the selected category and its command count.
  await sendMenuVoice(ctx, category);
}

// ==================================================
// CATEGORY COMMANDS
// ==================================================

const categoryCommands = [
  ['generalmenu', 'general', 'Show general commands'],
  ['ownermenu', 'owner', 'Show owner commands'],
  ['groupmenu', 'group', 'Show group commands'],
  ['toolsmenu', 'tools', 'Show tools commands'],
  ['stickermenu', 'sticker', 'Show sticker commands'],
  ['mediamenu', 'media', 'Show media commands'],
  ['aimenu', 'ai', 'Show artificial intelligence commands'],
  ['funmenu', 'fun', 'Show entertainment commands'],
  ['gamesmenu', 'games', 'Show games commands'],
  ['utilitymenu', 'utility', 'Show utility commands']
].map(([command, category, description]) => ({
  command,
  category: 'general',
  description,

  run: async ctx => {
    return showCategory(ctx, category);
  }
}));

// ==================================================
// EXPORT MENU PLUGINS
// ==================================================

export default [

  // MAIN MENU

  {
    command: 'menu',
    aliases: ['help', 'commands', 'list'],
    category: 'general',
    description: 'Display all available commands with voice greeting',

    run: async ctx => {
      try {
        await sendMainMenu(ctx);
      } catch (error) {
        console.error('[PRECIOUS MAIN MENU]', error);

        await ctx.reply(
          makeMainMenu().slice(0, 65000)
        );
      }
    }
  },

  // HELP

  {
    command: 'helpme',
    aliases: ['commandhelp'],
    category: 'general',
    description: 'Explain how to use PRECIOUS-MD commands',

    run: async ctx => {
      await ctx.reply(
        `📚 *PRECIOUS-MD HELP*\n\n` +
        `1. Commands begin with ${PREFIX}.\n` +
        `2. Use ${PREFIX}menu to view commands.\n` +
        `3. Use ${PREFIX}find <command> to search.\n` +
        `4. Use ${PREFIX}categories to browse categories.\n` +
        `5. Reply to supported media with the relevant command.\n\n` +
        `*Examples:*\n` +
        `${PREFIX}ping\n` +
        `${PREFIX}sticker\n` +
        `${PREFIX}groupinfo\n\n` +
        `Creator: ${OWNER_NAME}`
      );
    }
  },

  // FIND COMMAND

  {
    command: 'find',
    aliases: ['searchcmd'],
    category: 'general',
    description: 'Search for a command',

    run: async ctx => {
      const query = String(ctx.q || '')
        .trim()
        .toLowerCase();

      if (!query) {
        return ctx.reply(
          `Usage: ${PREFIX}find sticker`
        );
      }

      const matches = getPlugins().filter(plugin =>
        plugin.command.toLowerCase().includes(query) ||
        plugin.description?.toLowerCase().includes(query) ||
        (plugin.aliases || []).some(alias =>
          String(alias).toLowerCase().includes(query)
        )
      );

      if (!matches.length) {
        return ctx.reply('No matching commands found.');
      }

      await ctx.reply(
        `🔎 *COMMAND SEARCH*\n\n` +
        matches.slice(0, 30).map(plugin =>
          `• ${PREFIX}${plugin.command}\n` +
          `  ${plugin.description || 'No description'}`
        ).join('\n\n') +
        `\n\nFound: ${matches.length}`
      );
    }
  },

  // CATEGORIES

  {
    command: 'categories',
    aliases: ['cmdcategories'],
    category: 'general',
    description: 'List command categories',

    run: async ctx => {
      const counts = {};

      for (const plugin of getPlugins()) {
        const category =
          normalizeCategory(plugin.category);

        counts[category] =
          (counts[category] || 0) + 1;
      }

      const output = Object.entries(counts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([category, count]) =>
          `• ${categories[category] || category}: ${count} commands`
        );

      await sendQuickButtons(
        ctx.sock,
        ctx.chat,
        {
          title: `${BOT_NAME} CATEGORIES`,
          body:
            `📂 *COMMAND CATEGORIES*\n\n` +
            (output.join('\n') || 'No commands registered.'),
          footer: `Created by ${OWNER_NAME}`,
          quoted: ctx.msg,
          buttons: menuButtons.main
        }
      );

      await sendMenuVoice(ctx);
    }
  },

  // CATEGORY PLUGINS

  ...categoryCommands

];
