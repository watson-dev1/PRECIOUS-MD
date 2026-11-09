// ==================================================
// PRECIOUS-MD COMMUNITY & SAFETY PLUGINS
// Created by Watson Fourpence
// ==================================================

const activeQuizzes = new Map();

const QUIZ_BANK = [
  { q: 'What is the capital city of Zimbabwe?', options: ['A. Bulawayo', 'B. Harare', 'C. Mutare', 'D. Gweru'], answer: 'B', note: 'Harare is the capital of Zimbabwe.' },
  { q: 'Which language is primarily used to structure web pages?', options: ['A. HTML', 'B. SQL', 'C. Python', 'D. Bash'], answer: 'A', note: 'HTML defines the structure and content of web pages.' },
  { q: 'What does CPU stand for?', options: ['A. Computer Power Unit', 'B. Central Processing Unit', 'C. Core Program Utility', 'D. Central Print Unit'], answer: 'B', note: 'CPU means Central Processing Unit.' },
  { q: 'Which planet is known as the Red Planet?', options: ['A. Venus', 'B. Jupiter', 'C. Mars', 'D. Mercury'], answer: 'C', note: 'Mars appears reddish because of iron oxide on its surface.' },
  { q: 'Which company develops the JavaScript runtime Node.js?', options: ['A. OpenJS Foundation community', 'B. NASA', 'C. Mozilla alone', 'D. Oracle alone'], answer: 'A', note: 'Node.js is an open-source project governed by the OpenJS Foundation.' }
];

function parsePhone(value = '') {
  return String(value).replace(/\D/g, '');
}

function isPrivateIp(host) {
  const h = host.toLowerCase();
  return h === 'localhost' ||
    h.endsWith('.localhost') ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h.startsWith('10.') ||
    h.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h);
}

function inspectUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { safe: false, reason: 'This does not look like a valid URL.' };
  }

  const host = url.hostname.toLowerCase();
  const flags = [];

  if (url.protocol !== 'https:') flags.push('The link does not use HTTPS.');
  if (url.username || url.password) flags.push('The URL contains embedded login credentials.');
  if (isPrivateIp(host)) flags.push('The URL points to a local/private network address.');
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) flags.push('The link uses a raw IP address instead of a domain.');
  if (host.includes('xn--')) flags.push('The domain uses internationalized/punycode characters.');
  if (host.split('.').length >= 5) flags.push('The domain has an unusually deep subdomain structure.');
  if (url.port && !['80', '443'].includes(url.port)) flags.push('The link uses a non-standard port.');

  const suspiciousWords = /login|verify|wallet|gift|free|claim|password|security|urgent|suspended|unlock/i;
  if (suspiciousWords.test(url.pathname + url.search)) {
    flags.push('The URL path or query contains common phishing lure terms.');
  }

  return {
    safe: flags.length === 0,
    host,
    flags
  };
}

export default [
  {
    command: 'stalk',
    aliases: ['wastalk', 'wainfo'],
    category: 'tools',
    description: 'Check WhatsApp registration and publicly visible profile picture',
    cooldown: 5,

    run: async ctx => {
      const number = parsePhone(ctx.args?.join(' ') || ctx.q || '');
      if (!/^\d{7,15}$/.test(number)) {
        return ctx.reply(`Usage: ${ctx.prefix || '.'}stalk 263771234567\nInclude the country calling code.`);
      }

      try {
        const sock = ctx.sock || ctx.conn || ctx.socket;
        if (!sock?.onWhatsApp) throw new Error('WhatsApp lookup is unavailable in this session.');

        const matches = await sock.onWhatsApp(`${number}@s.whatsapp.net`);
        const account = Array.isArray(matches) ? matches[0] : null;

        if (!account?.exists || !account.jid) {
          return ctx.reply(`❌ No WhatsApp account was confirmed for ${number}.`);
        }

        let picture = null;
        try {
          picture = await sock.profilePictureUrl(account.jid, 'image');
        } catch {}

        const caption =
          `╭━━〔 *PRECIOUS-MD WHATSAPP LOOKUP* 〕━━╮\n` +
          `┃ Number: ${number}\n` +
          `┃ Registered: Yes\n` +
          `┃ Profile picture: ${picture ? 'Publicly available' : 'Unavailable or private'}\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
          `Only information exposed by WhatsApp was checked.`;

        if (picture) {
          await sock.sendMessage(ctx.chat, { image: { url: picture }, caption }, { quoted: ctx.msg?.key ? ctx.msg : undefined });
        } else {
          await ctx.reply(caption);
        }
      } catch (error) {
        console.error('[STALK PLUGIN]', error);
        await ctx.reply(`❌ WhatsApp lookup failed: ${error.message}`);
      }
    }
  },

  {
    command: 'antiscam',
    aliases: ['checklink', 'linkcheck'],
    category: 'security',
    description: 'Inspect a URL for common phishing warning signs',
    cooldown: 3,

    run: async ctx => {
      const input = String(ctx.q || ctx.args?.join(' ') || '').trim();
      const match = input.match(/https?:\/\/[^\s<>"']+/i);

      if (!match) {
        return ctx.reply(`🔎 *ANTI-SCAM LINK CHECK*\n\nUsage: ${ctx.prefix || '.'}antiscam https://example.com\n\nThis is a heuristic check, not a guarantee that a website is safe.`);
      }

      const result = inspectUrl(match[0]);
      if (!result.host) {
        return ctx.reply(`⚠️ ${result.reason}`);
      }

      const lines = result.flags.length
        ? result.flags.map((flag, index) => `${index + 1}. ${flag}`).join('\n')
        : 'No obvious structural warning signs were detected.';

      await ctx.reply(
        `${result.safe ? '🟢' : '⚠️'} *LINK INSPECTION*\n\n` +
        `Domain: ${result.host}\n` +
        `Assessment: ${result.safe ? 'No obvious warning signs' : 'Use caution'}\n\n` +
        `${lines}\n\n` +
        `Never enter passwords, verification codes or payment details on a site you do not trust.`
      );
    }
  },

  {
    command: 'quiz',
    aliases: ['trivia'],
    category: 'games',
    description: 'Start a multiple-choice quiz',
    cooldown: 3,

    run: async ctx => {
      const chat = ctx.chat;
      if (!chat) return ctx.reply('Could not identify this chat.');

      const question = QUIZ_BANK[Math.floor(Math.random() * QUIZ_BANK.length)];
      activeQuizzes.set(chat, {
        answer: question.answer,
        note: question.note,
        expiresAt: Date.now() + 5 * 60 * 1000
      });

      await ctx.reply(
        `🧠 *PRECIOUS-MD QUIZ*\n\n${question.q}\n\n` +
        `${question.options.join('\n')}\n\n` +
        `Answer with: *${ctx.prefix || '.'}answer B*\n` +
        `You have 5 minutes.`
      );
    }
  },

  {
    command: 'answer',
    aliases: ['quizanswer'],
    category: 'games',
    description: 'Submit your answer to the active quiz',

    run: async ctx => {
      const chat = ctx.chat;
      const quiz = activeQuizzes.get(chat);
      const answer = String(ctx.args?.[0] || ctx.q || '').trim().toUpperCase();

      if (!quiz || quiz.expiresAt < Date.now()) {
        activeQuizzes.delete(chat);
        return ctx.reply(`There is no active quiz. Start one with ${ctx.prefix || '.'}quiz.`);
      }

      if (!/^[A-D]$/.test(answer)) {
        return ctx.reply(`Choose A, B, C or D. Example: ${ctx.prefix || '.'}answer B`);
      }

      activeQuizzes.delete(chat);

      await ctx.reply(
        `${answer === quiz.answer ? '🎉 *CORRECT!*' : '❌ *NOT QUITE!*'}\n\n` +
        `Correct answer: *${quiz.answer}*\n${quiz.note}`
      );
    }
  }
];
