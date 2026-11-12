import { getGroup, saveDatabase } from '../lib/database.js';
import { requireGroupAdmin, groupTarget, getGroupMetadata } from '../lib/admin.js';

const PREFIX = () => globalThis.config?.prefix || '.';

function groupOnly(ctx) {
  if (!ctx?.isGroup) {
    ctx?.reply?.('❌ This command only works in WhatsApp groups.');
    return false;
  }
  return true;
}

async function adminContext(ctx) {
  if (!groupOnly(ctx)) return null;
  return await requireGroupAdmin(ctx);
}

function normalizeParticipant(p) {
  return p?.id || p?.jid || p?.lid || '';
}

function getTargetFromMessage(ctx) {
  const message = ctx.msg?.message || {};
  const candidates = [
    ...(message.extendedTextMessage?.contextInfo?.mentionedJid || []),
    message.extendedTextMessage?.contextInfo?.participant,
    message.imageMessage?.contextInfo?.participant,
    message.videoMessage?.contextInfo?.participant,
    message.documentMessage?.contextInfo?.participant
  ].filter(Boolean);
  return candidates[0] || null;
}

function cleanReason(value, fallback = 'No reason provided') {
  const reason = String(value || '').trim();
  return (reason || fallback).slice(0, 300);
}

async function runParticipantAction(ctx, action, success) {
  const metadata = await adminContext(ctx);
  if (!metadata) return;
  const target = await groupTarget(ctx);
  if (!target) return;
  try {
    await ctx.sock.groupParticipantsUpdate(ctx.chat, [target], action);
    await ctx.reply(`${success}\nTarget: @${target.split('@')[0]}`, { mentions: [target] });
  } catch (error) {
    console.error(`[GROUP-MANAGEMENT] ${action}:`, error);
    await ctx.reply(`❌ WhatsApp could not ${action} this member. Check bot admin permissions and try again.`);
  }
}

async function setGroupSetting(ctx, setting, label) {
  const metadata = await adminContext(ctx);
  if (!metadata) return;
  try {
    await ctx.sock.groupSettingUpdate(ctx.chat, setting);
    const group = getGroup(ctx.chat);
    if (setting === 'locked' || setting === 'unlocked') {
      group.locked = setting === 'locked';
    }
    if (setting === 'announcement' || setting === 'not_announcement') {
      group.announcementMode = setting === 'announcement';
    }
    await saveDatabase();
    await ctx.reply(`✅ ${label}`);
  } catch (error) {
    console.error(`[GROUP-MANAGEMENT] setting ${setting}:`, error);
    await ctx.reply('❌ Could not update this group setting. Make sure PRECIOUS-MD is a group admin.');
  }
}

function getWarningStore(group) {
  if (!group.moderationWarnings || typeof group.moderationWarnings !== 'object' || Array.isArray(group.moderationWarnings)) {
    group.moderationWarnings = {};
  }
  return group.moderationWarnings;
}

function memberLabel(jid) {
  return `@${String(jid).split('@')[0]}`;
}

export default [
  {
    command: 'mute', aliases: ['gcmute', 'close', 'gcclose'], category: 'group', group: true,
    description: 'Allow only group admins to send messages',
    run: ctx => setGroupSetting(ctx, 'announcement', 'Group muted: only admins can send messages.')
  },
  {
    command: 'unmute', aliases: ['gcunmute', 'open', 'gcopen'], category: 'group', group: true,
    description: 'Allow all group members to send messages',
    run: ctx => setGroupSetting(ctx, 'not_announcement', 'Group unmuted: all members can send messages.')
  },
  {
    command: 'lock', aliases: ['gclock'], category: 'group', group: true,
    description: 'Restrict group info changes to admins',
    run: ctx => setGroupSetting(ctx, 'locked', 'Group info locked: only admins can edit group settings.')
  },
  {
    command: 'unlock', aliases: ['gcunlock'], category: 'group', group: true,
    description: 'Allow members to edit group info',
    run: ctx => setGroupSetting(ctx, 'unlocked', 'Group info unlocked: members can edit group settings.')
  },
  {
    command: 'groupinvite', aliases: ['gclink', 'invitelink'], category: 'group', group: true,
    description: 'Get the current group invite link',
    run: async ctx => {
      if (!groupOnly(ctx)) return;
      try {
        const code = await ctx.sock.groupInviteCode(ctx.chat);
        if (!code) return ctx.reply('❌ WhatsApp did not return an invite code.');
        await ctx.reply(`🔗 *GROUP INVITE LINK*\nhttps://chat.whatsapp.com/${code}\n\nOnly share this link with people you trust.`);
      } catch (error) {
        console.error('[GROUP-MANAGEMENT] invite link:', error);
        await ctx.reply('❌ Unable to retrieve the invite link. The group may restrict this action.');
      }
    }
  },
  {
    command: 'groupowner', aliases: ['gcowner'], category: 'group', group: true,
    description: 'Show the group creator',
    run: async ctx => {
      const metadata = await getGroupMetadata(ctx);
      if (!metadata) return;
      const owner = metadata.owner || (metadata.participants || []).find(p => p.admin === 'superadmin')?.id;
      if (!owner) return ctx.reply('The group creator is not available in the group metadata.');
      await ctx.send({ text: `👑 Group creator: @${owner.split('@')[0]}`, mentions: [owner] });
    }
  },
  {
    command: 'memberlist', aliases: ['gcmembers', 'listmembers'], category: 'group', group: true,
    description: 'List group members',
    run: async ctx => {
      const metadata = await getGroupMetadata(ctx);
      if (!metadata) return;
      const members = (metadata.participants || []).map(normalizeParticipant).filter(Boolean);
      if (!members.length) return ctx.reply('No members were returned.');
      const pageSize = 80;
      const page = Math.max(1, Number.parseInt(String(ctx.q || '1').trim(), 10) || 1);
      const start = (page - 1) * pageSize;
      const selected = members.slice(start, start + pageSize);
      if (!selected.length) return ctx.reply(`Page ${page} does not exist. Total pages: ${Math.ceil(members.length / pageSize)}.`);
      const rows = selected.map((jid, i) => `${start + i + 1}. ${memberLabel(jid)}`);
      await ctx.send({ text: `👥 *GROUP MEMBERS — PAGE ${page}/${Math.ceil(members.length / pageSize)}*\n\n${rows.join('\n')}\n\nTotal: ${members.length}`, mentions: selected });
    }
  },
  {
    command: 'groupstats', aliases: ['gcstats'], category: 'group', group: true,
    description: 'Show group membership and role statistics',
    run: async ctx => {
      const metadata = await getGroupMetadata(ctx);
      if (!metadata) return;
      const participants = metadata.participants || [];
      const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin' || p.admin === true).length;
      const group = getGroup(ctx.chat);
      await ctx.reply(`📊 *GROUP STATISTICS*\n\n🏷️ Name: ${metadata.subject || 'Unknown'}\n👥 Members: ${participants.length}\n🛡️ Admins: ${admins}\n🙋 Members without admin: ${participants.length - admins}\n🔗 Anti-link: ${group.antiLink ? 'ON' : 'OFF'}\n🚫 Anti-spam: ${group.antiSpam ? 'ON' : 'OFF'}\n🤖 Anti-bot: ${group.antiBot ? 'ON' : 'OFF'}\n🛡️ Anti-raid: ${group.antiRaid ? 'ON' : 'OFF'}`);
    }
  },
  {
    command: 'warn', aliases: ['gwarn'], category: 'group', group: true,
    description: 'Issue a persistent warning to a mentioned or quoted member (admins only)',
    run: async ctx => {
      const metadata = await adminContext(ctx);
      if (!metadata) return;
      const target = await groupTarget(ctx);
      if (!target) return;
      const group = getGroup(ctx.chat);
      const warnings = getWarningStore(group);
      const current = warnings[target] && typeof warnings[target] === 'object' ? warnings[target] : { count: 0, entries: [] };
      current.count = Math.max(0, Number(current.count) || 0) + 1;
      current.entries = Array.isArray(current.entries) ? current.entries : [];
      current.entries.push({ by: ctx.sender, reason: cleanReason(ctx.q), at: Date.now() });
      current.entries = current.entries.slice(-20);
      warnings[target] = current;
      await saveDatabase();
      const limit = Math.max(1, Number(group.maxWarnings) || 3);
      await ctx.send({ text: `⚠️ *GROUP WARNING*\n\nMember: ${memberLabel(target)}\nWarnings: *${current.count}/${limit}*\nReason: ${cleanReason(ctx.q)}\n\nWarnings are recorded. Removal is not automatic.`, mentions: [target] });
    }
  },
  {
    command: 'warnings', aliases: ['gwarnings', 'checkwarn'], category: 'group', group: true,
    description: 'Check warnings for a mentioned or quoted member',
    run: async ctx => {
      if (!groupOnly(ctx)) return;
      const target = getTargetFromMessage(ctx);
      if (!target) return ctx.reply(`Tag or reply to a member. Usage: ${PREFIX()}warnings @member`);
      const warnings = getWarningStore(getGroup(ctx.chat));
      const record = warnings[target] || { count: 0, entries: [] };
      const entries = Array.isArray(record.entries) ? record.entries.slice(-5) : [];
      const details = entries.map((entry, i) => `${i + 1}. ${new Date(entry.at || Date.now()).toLocaleString()} — ${entry.reason || 'No reason'}`).join('\n');
      await ctx.send({ text: `⚠️ *WARNING RECORD*\n\nMember: ${memberLabel(target)}\nTotal warnings: *${Number(record.count) || 0}*\n${details ? `\nRecent warnings:\n${details}` : '\nNo warning history.'}`, mentions: [target] });
    }
  },
  {
    command: 'resetwarn', aliases: ['clearwarn'], category: 'group', group: true,
    description: 'Clear warning history for a member (admins only)',
    run: async ctx => {
      if (!await adminContext(ctx)) return;
      const target = await groupTarget(ctx);
      if (!target) return;
      const warnings = getWarningStore(getGroup(ctx.chat));
      delete warnings[target];
      await saveDatabase();
      await ctx.send({ text: `✅ Warning history cleared for ${memberLabel(target)}.`, mentions: [target] });
    }
  },
  {
    command: 'maxwarn', aliases: ['setmaxwarn'], category: 'group', group: true,
    description: 'Set the warning threshold displayed by the group warning system (admins only)',
    run: async ctx => {
      if (!await adminContext(ctx)) return;
      const value = Number.parseInt(String(ctx.q || '').trim(), 10);
      if (!Number.isInteger(value) || value < 1 || value > 20) return ctx.reply(`Usage: ${PREFIX()}maxwarn 3 (choose 1–20)`);
      const group = getGroup(ctx.chat);
      group.maxWarnings = value;
      await saveDatabase();
      await ctx.reply(`✅ Group warning threshold set to ${value}. This is a tracking threshold; it does not automatically remove members.`);
    }
  },
  {
    command: 'disablecmd', aliases: ['disablecommand'], category: 'group', group: true,
    description: 'Disable a bot command in this group (admins only)',
    run: async ctx => {
      if (!await adminContext(ctx)) return;
      const name = String(ctx.q || '').trim().toLowerCase().replace(/^[.!#/]+/, '').split(/\s+/)[0];
      if (!/^[a-z0-9_-]{1,40}$/.test(name)) return ctx.reply(`Usage: ${PREFIX()}disablecmd command`);
      if (['enablecmd', 'disablecmd', 'groupcommands', 'grouphelp'].includes(name)) return ctx.reply('That command is protected so administrators cannot lock themselves out of group controls.');
      const group = getGroup(ctx.chat);
      group.disabledCommands = Array.isArray(group.disabledCommands) ? group.disabledCommands : [];
      if (!group.disabledCommands.includes(name)) group.disabledCommands.push(name);
      await saveDatabase();
      await ctx.reply(`✅ Command *${name}* disabled in this group.`);
    }
  },
  {
    command: 'enablecmd', aliases: ['enablecommand'], category: 'group', group: true,
    description: 'Re-enable a bot command in this group (admins only)',
    run: async ctx => {
      if (!await adminContext(ctx)) return;
      const name = String(ctx.q || '').trim().toLowerCase().replace(/^[.!#/]+/, '').split(/\s+/)[0];
      if (!/^[a-z0-9_-]{1,40}$/.test(name)) return ctx.reply(`Usage: ${PREFIX()}enablecmd command`);
      const group = getGroup(ctx.chat);
      group.disabledCommands = Array.isArray(group.disabledCommands) ? group.disabledCommands : [];
      group.disabledCommands = group.disabledCommands.filter(item => String(item).toLowerCase() !== name);
      await saveDatabase();
      await ctx.reply(`✅ Command *${name}* enabled in this group.`);
    }
  },
  {
    command: 'groupcommands', aliases: ['gcommands', 'groupmenu'], category: 'group', group: true,
    description: 'Show the complete group command guide',
    run: async ctx => {
      if (!groupOnly(ctx)) return;
      const p = PREFIX();
      await ctx.reply(
        `╭━━━〔 *PRECIOUS-MD GROUP COMMANDS* 〕━━━╮\n` +
        `┃ *INFORMATION*\n` +
        `┃ ${p}groupinfo · ${p}admins · ${p}membercount\n` +
        `┃ ${p}groupowner · ${p}memberlist [page] · ${p}groupstats\n` +
        `┃ ${p}groupinvite · ${p}revoke\n` +
        `┃\n┃ *ADMINISTRATION*\n` +
        `┃ ${p}promote @user · ${p}demote @user\n` +
        `┃ ${p}kick @user · ${p}add 2637XXXXXXXX\n` +
        `┃ ${p}tagall [message] · ${p}hidetag [message]\n` +
        `┃ ${p}mute · ${p}unmute · ${p}lock · ${p}unlock\n` +
        `┃ ${p}setsubject name · ${p}setdesc description\n` +
        `┃ ${p}poll Question | Option 1 | Option 2\n` +
        `┃\n┃ *WARNINGS & COMMAND CONTROL*\n` +
        `┃ ${p}warn @user [reason] · ${p}warnings @user\n` +
        `┃ ${p}resetwarn @user · ${p}maxwarn 3\n` +
        `┃ ${p}disablecmd command · ${p}enablecmd command\n` +
        `┃\n┃ *GROUP AUTOMATION & PROTECTION*\n` +
        `┃ ${p}welcome on/off · ${p}goodbye on/off\n` +
        `┃ ${p}welcomemsg text · ${p}goodbyemsg text\n` +
        `┃ ${p}antilink on/off · ${p}antispam on/off\n` +
        `┃ ${p}antibad on/off · ${p}badword add/remove/list\n` +
        `┃ ${p}groupai on/off · ${p}subjectnotify on/off\n` +
        `┃ ${p}descnotify on/off\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
        `_Administrative actions require sender admin rights and bot admin rights. WhatsApp may restrict some operations._`
      );
    }
  }
];
