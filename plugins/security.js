import { getGroup, saveDatabase } from '../lib/database.js';
import { requireGroupAdmin } from '../lib/admin.js';

const SECURITY_TOGGLES = {
  antilink: { key: 'antiLink', label: 'AntiLink', help: 'Deletes URLs and WhatsApp invite links.' },
  antiscam: { key: 'antiScam', label: 'AntiScam', help: 'Detects common phishing, OTP theft and fake-prize wording.' },
  antispam: { key: 'antiSpam', label: 'AntiSpam', help: 'Detects repeated high-frequency messages.' },
  antibad: { key: 'antiBad', label: 'AntiBad', help: 'Filters custom words configured with badwords.' },
  antimention: { key: 'antiMention', label: 'AntiMention', help: 'Blocks messages that exceed the mention limit.' },
  antibot: { key: 'antiBot', label: 'AntiBot', help: 'Acts only if participant metadata explicitly identifies an account as a bot.' },
  antiforeign: { key: 'antiForeign', label: 'AntiForeign', help: 'Allows only phone calling codes configured with foreigncodes.' }
};

function parseToggle(value) {
  const v = String(value || '').trim().toLowerCase();
  if (['on', 'enable', 'enabled', 'yes', 'true'].includes(v)) return true;
  if (['off', 'disable', 'disabled', 'no', 'false'].includes(v)) return false;
  return null;
}

async function authorize(ctx) {
  if (!ctx.isGroup) {
    await ctx.reply('🛡️ This security setting can only be changed in a group.');
    return false;
  }
  try {
    const result = await requireGroupAdmin(ctx);
    return Boolean(result);
  } catch (error) {
    console.error('[PRECIOUS SECURITY ADMIN CHECK]', error);
    await ctx.reply('Could not verify your permissions. Ensure the bot is a group admin.');
    return false;
  }
}

function securityStatus(group) {
  const rows = Object.entries(SECURITY_TOGGLES).map(([command, item]) =>
    `${group[item.key] ? '🟢 ON' : '⚪ OFF'}  ${item.label}  (${ctxPrefixPlaceholder(command)})`
  );
  return rows.join('\n');
}

function ctxPrefixPlaceholder(command) {
  return command;
}

const plugins = [
  {
    command: 'security', aliases: ['securitymenu', 'shield'], category: 'security', group: true,
    description: 'Show group security status and configuration commands',
    run: async ctx => {
      if (!ctx.isGroup) return ctx.reply('Use this command in a group.');
      const group = getGroup(ctx.chat);
      const lines = Object.entries(SECURITY_TOGGLES).map(([command, item]) =>
        `${group[item.key] ? '🟢' : '⚪'} *${item.label}:* ${group[item.key] ? 'ON' : 'OFF'}  —  ${ctx.prefix}${command} on/off`
      );
      return ctx.reply(
        `╭━━〔 *PRECIOUS-MD ELITE SECURITY* 〕━━╮\n` +
        `${lines.join('\n')}\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
        `⚙️ ${ctx.prefix}badwords add <word>\n` +
        `⚙️ ${ctx.prefix}foreigncodes 263,27\n` +
        `⚙️ ${ctx.prefix}maxmentions 8\n` +
        `⚙️ ${ctx.prefix}warnlimit 3\n\n` +
        `Warnings: ${group.maxWarnings || 3}\n` +
        `Mention limit: ${group.maxMentions || 8}\n` +
        `Allowed calling codes: ${(group.foreignAllowedCodes || []).join(', ') || 'not configured'}\n\n` +
        `_AntiPorn image scanning is not enabled: it requires a configured image-moderation provider._`
      );
    }
  },
  ...Object.entries(SECURITY_TOGGLES).map(([command, item]) => ({
    command, aliases: [], category: 'security', group: true,
    description: `Enable or disable ${item.label}`,
    run: async ctx => {
      if (!await authorize(ctx)) return;
      const group = getGroup(ctx.chat);
      const value = parseToggle(ctx.q);
      if (value === null) {
        return ctx.reply(`🛡️ *${item.label.toUpperCase()}*\nStatus: ${group[item.key] ? 'ON' : 'OFF'}\nUsage: ${ctx.prefix}${command} on/off\n\n${item.help}`);
      }
      if (command === 'antiforeign' && value && !group.foreignAllowedCodes?.length) {
        return ctx.reply(`Configure allowed calling codes first:\n${ctx.prefix}foreigncodes 263,27`);
      }
      group[item.key] = value;
      await saveDatabase();
      return ctx.reply(`${value ? '✅ Enabled' : '🚫 Disabled'} ${item.label}.\n\n${item.help}`);
    }
  })),
  {
    command: 'badwords', aliases: ['badword'], category: 'security', group: true,
    description: 'Manage the group custom bad-word filter',
    run: async ctx => {
      if (!await authorize(ctx)) return;
      const group = getGroup(ctx.chat);
      group.badWords ||= [];
      const [action, ...rest] = String(ctx.q || '').trim().split(/\s+/);
      const word = rest.join(' ').trim();
      if (!action || action.toLowerCase() === 'list') {
        return ctx.reply(`🚫 *BAD-WORD FILTER*\n${group.badWords.join(', ') || 'No custom words configured.'}\n\nUsage: ${ctx.prefix}badwords add <word>\n${ctx.prefix}badwords remove <word>\n${ctx.prefix}badwords clear`);
      }
      if (action.toLowerCase() === 'clear') group.badWords = [];
      else if (['add', 'remove'].includes(action.toLowerCase()) && word) {
        if (action.toLowerCase() === 'add') {
          if (!group.badWords.some(x => x.toLowerCase() === word.toLowerCase())) group.badWords.push(word.slice(0, 60));
        } else {
          group.badWords = group.badWords.filter(x => x.toLowerCase() !== word.toLowerCase());
        }
      } else return ctx.reply(`Usage: ${ctx.prefix}badwords add <word> | remove <word> | list | clear`);
      await saveDatabase();
      return ctx.reply(`✅ Bad-word list updated. Total entries: ${group.badWords.length}`);
    }
  },
  {
    command: 'foreigncodes', aliases: ['antiforeigncodes'], category: 'security', group: true,
    description: 'Set allowed country calling codes for AntiForeign',
    run: async ctx => {
      if (!await authorize(ctx)) return;
      const group = getGroup(ctx.chat);
      const value = String(ctx.q || '').trim();
      if (!value) return ctx.reply(`Allowed calling codes: ${(group.foreignAllowedCodes || []).join(', ') || '(not configured)'}\nUsage: ${ctx.prefix}foreigncodes 263,27,44\nUse ${ctx.prefix}foreigncodes clear to remove the list.`);
      if (value.toLowerCase() === 'clear') {
        group.foreignAllowedCodes = [];
        group.antiForeign = false;
      } else {
        const codes = value.split(/[\s,]+/).map(x => x.replace(/^\+/, '')).filter(x => /^\d{1,4}$/.test(x));
        if (!codes.length) return ctx.reply('Provide numeric calling codes, e.g. 263,27.');
        group.foreignAllowedCodes = [...new Set(codes)];
      }
      await saveDatabase();
      return ctx.reply(`✅ Allowed calling codes: ${group.foreignAllowedCodes.join(', ') || 'none (list cleared)'}`);
    }
  },
  {
    command: 'maxmentions', aliases: ['mentionlimit'], category: 'security', group: true,
    description: 'Set the maximum number of mentions per message',
    run: async ctx => {
      if (!await authorize(ctx)) return;
      const group = getGroup(ctx.chat);
      if (!ctx.q) return ctx.reply(`Current mention limit: ${group.maxMentions || 8}\nUsage: ${ctx.prefix}maxmentions 8`);
      const n = Number(ctx.q);
      if (!Number.isInteger(n) || n < 1 || n > 100) return ctx.reply('Choose a whole number from 1 to 100.');
      group.maxMentions = n;
      await saveDatabase();
      return ctx.reply(`✅ Maximum mentions set to ${n}.`);
    }
  },
  {
    command: 'warnlimit', aliases: ['maxwarn'], category: 'security', group: true,
    description: 'Set warnings before a member is removed',
    run: async ctx => {
      if (!await authorize(ctx)) return;
      const group = getGroup(ctx.chat);
      if (!ctx.q) return ctx.reply(`Current warning limit: ${group.maxWarnings || 3}\nUsage: ${ctx.prefix}warnlimit 3`);
      const n = Number(ctx.q);
      if (!Number.isInteger(n) || n < 1 || n > 20) return ctx.reply('Choose a whole number from 1 to 20.');
      group.maxWarnings = n;
      await saveDatabase();
      return ctx.reply(`✅ Warning limit set to ${n}. Members are removed when they reach ${n} warnings, if the bot has admin permissions.`);
    }
  },
  {
    command: 'resetwarnings', aliases: ['clearwarnings'], category: 'security', group: true,
    description: 'Clear a member warning count by mention or reply',
    run: async ctx => {
      if (!await authorize(ctx)) return;
      const group = getGroup(ctx.chat);
      const context = ctx.msg?.message?.extendedTextMessage?.contextInfo || {};
      const target = context.mentionedJid?.[0] || context.participant;
      if (!target) return ctx.reply(`Tag a member or reply to their message. Usage: ${ctx.prefix}resetwarnings @member`);
      group.warnings[target] = 0;
      await saveDatabase();
      return ctx.reply(`✅ Warning count reset for @${String(target).split('@')[0]}.`, { mentions: [target] });
    }
  },
  {
    command: 'antiporn', aliases: [], category: 'security', group: true,
    description: 'Show AntiPorn integration status',
    run: async ctx => ctx.reply('⚠️ Image-based AntiPorn scanning is not active. A compatible image-moderation provider must be configured before this can safely inspect media. No image scanning is being claimed.')
  }
];

export default plugins;
