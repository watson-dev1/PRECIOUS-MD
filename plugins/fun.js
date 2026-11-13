import config from '../config.js';
import { randomInt } from 'node:crypto';

// ============================================================
// PRECIOUS-MD ULTIMATE FUN & GAMES
// Created by Watson Fourpence
// Powered by Watson XD
// ============================================================

// HELPERS
const pick = list => {
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('Cannot choose from an empty list.');
  }
  return list[randomInt(list.length)];
};

const cleanText = (value, max = 300) =>
  String(value || '').trim().slice(0, max);

// JOKES
const jokes = [
  'Why did the programmer quit? Because they did not get arrays.',
  'Why do Java developers wear glasses? Because they cannot C#.',
  'A SQL query walks into a bar and asks: Can I join you?',
  'There are 10 kinds of people: those who understand binary and those who do not.',
  'Why do programmers prefer dark mode? Because light attracts bugs.',
  'A programmer is told to buy a loaf of bread. If they have eggs, buy a dozen. They return with 12 loaves.',
  'Why was the computer cold? It left its Windows open.',
  'Debugging: being the detective in a crime movie where you are also the murderer.',
  'Why did the developer go broke? Because they used up all their cache.',
  'Why was the JavaScript developer sad? Because they did not know how to null their feelings.',
  'What do computers eat? Microchips.',
  'Why did the computer go to the doctor? It had a virus.',
  'Why did the function stop calling itself? It had reached its limit.',
  'What is a computer’s favourite snack? Computer chips.',
  'Why did the developer stay calm? They knew how to handle exceptions.',
  'Why was the website tired? It had too many requests.',
  'What did the HTML say to the CSS? You make me look good.',
  'Why do programmers hate nature? Too many bugs.',
  'Why did the robot visit a therapist? It had too many bytes of emotional baggage.',
  'A programmer’s favourite place is the Foo Bar.'
];

// COMPLIMENTS
const compliments = [
  'You have a great sense of style! ✨',
  'Your energy makes the room brighter! 🌟',
  'You are stronger than you think! 💪',
  'Keep going. Your effort matters! ❤️',
  'You deserve good things in life! 🌹',
  'Your smile can make someone’s day! 😊',
  'You have something special that makes you unique! 💎',
  'Never underestimate your potential! 🚀',
  'You make being yourself look effortless. 💖',
  'Your kindness is a real strength. 🌷',
  'You have a way of making people feel welcome. 🤗',
  'Your determination is inspiring. 🔥',
  'You are growing, even when you cannot see it. 🌱',
  'Your ideas deserve to be heard. 💡',
  'You bring value just by being you. 💎',
  'You have a beautiful way of seeing the world. 🌍',
  'Your courage is bigger than your doubts. 🦁',
  'You are more capable than you give yourself credit for. ⭐'
];

// RIDDLES
const riddles = [
  { q: 'What has keys but cannot open locks?', a: 'A piano.' },
  { q: 'What gets wetter as it dries?', a: 'A towel.' },
  { q: 'What has a face and two hands but no arms or legs?', a: 'A clock.' },
  { q: 'What has many teeth but cannot bite?', a: 'A comb.' },
  { q: 'What goes up but never comes down?', a: 'Your age.' },
  { q: 'What has one eye but cannot see?', a: 'A needle.' },
  { q: 'What has a neck but no head?', a: 'A bottle.' },
  { q: 'What can travel around the world while staying in one corner?', a: 'A stamp.' },
  { q: 'What has words but never speaks?', a: 'A book.' },
  { q: 'What has cities but no houses, forests but no trees, and water but no fish?', a: 'A map.' },
  { q: 'What belongs to you but other people use it more than you do?', a: 'Your name.' },
  { q: 'What has a thumb and four fingers but is not alive?', a: 'A glove.' },
  { q: 'What can you catch but not throw?', a: 'A cold.' },
  { q: 'What has legs but does not walk?', a: 'A table.' },
  { q: 'What has a head and a tail but no body?', a: 'A coin.' },
  { q: 'What goes through towns and over hills but never moves?', a: 'A road.' },
  { q: 'What has to be broken before you can use it?', a: 'An egg.' },
  { q: 'What is full of holes but still holds water?', a: 'A sponge.' }
];

// TRUTH QUESTIONS
const truths = [
  'What is one thing you have never told anyone?',
  'What is your biggest dream?',
  'What is your most embarrassing moment?',
  'Who inspires you the most?',
  'What is one habit you want to change?',
  'What is your biggest fear?',
  'What is the best thing that happened to you this year?',
  'If you could change one thing about your past, what would it be?',
  'What makes you genuinely happy?',
  'What is your biggest goal right now?',
  'Have you ever pretended to like someone?',
  'What is the biggest lie you have ever told?',
  'Who was your first crush?',
  'What is something you wish people understood about you?',
  'What is one thing you regret buying?',
  'Have you ever had a secret relationship?',
  'What is your biggest insecurity?',
  'What is the kindest thing someone has done for you?',
  'If you could call one person right now, who would it be?',
  'What is one thing you would never forgive?'
];

// DARES
const dares = [
  'Write a compliment for someone in the group.',
  'Speak only in emojis for the next five minutes.',
  'Tell everyone your favourite song.',
  'Send a voice note saying your favourite movie title.',
  'Tell a funny story about yourself.',
  'Use only three words to describe yourself.',
  'Share one thing you are grateful for.',
  'Make up a funny nickname for yourself.',
  'Tell everyone your favourite childhood memory.',
  'Send a funny GIF if you have one.',
  'Say the alphabet backwards as far as you can.',
  'Describe your day using only five emojis.',
  'Give someone in the group a friendly compliment.',
  'Share the last song you listened to.',
  'Tell a joke without laughing.',
  'Write a short poem about your favourite food.',
  'Use a movie title to describe your mood.',
  'Share a harmless funny fact about yourself.',
  'Send a voice note singing one line of a song.',
  'Let the group choose a nickname for you for ten minutes.'
];

// MAGIC 8 BALL
const magicAnswers = [
  'Yes, definitely. ✨',
  'It is certain. 🔮',
  'Without a doubt.',
  'Most likely.',
  'Ask again later.',
  'Cannot predict now.',
  'Probably not.',
  'My answer is no.',
  'Very unlikely.',
  'The signs point to yes.',
  'Absolutely!',
  'I would not count on it.'
];

// QUOTES
const quotes = [
  { category: 'life', text: 'Life is not about waiting for the storm to pass, but learning to dance in the rain.' },
  { category: 'success', text: 'Success is built on discipline, consistency and patience.' },
  { category: 'life', text: 'Never let a bad day make you think you have a bad life.' },
  { category: 'success', text: 'Dream big, work silently, and let your results make the noise.' },
  { category: 'love', text: 'The right people bring peace, not confusion.' },
  { category: 'life', text: 'Your past is a lesson, not a life sentence.' },
  { category: 'success', text: 'Small progress every day adds up to remarkable results.' },
  { category: 'life', text: 'Not everyone deserves access to your energy.' },
  { category: 'success', text: 'Be so consistent that your success becomes impossible to ignore.' },
  { category: 'love', text: 'Real love is shown through actions, not promises.' },
  { category: 'life', text: 'Sometimes losing people means finding yourself.' },
  { category: 'success', text: 'Do not fear starting small. Fear staying in the same place.' },
  { category: 'life', text: 'Silence is sometimes the best response.' },
  { category: 'success', text: 'Your competition is the person you were yesterday.' },
  { category: 'life', text: 'Protect your peace like it is your greatest achievement.' },
  { category: 'success', text: 'Hard work beats talent when talent refuses to work hard.' },
  { category: 'love', text: 'A genuine connection is worth more than a thousand empty conversations.' },
  { category: 'life', text: 'Everything changes when you decide not to give up.' },
  { category: 'success', text: 'Build a life that makes you excited to wake up.' },
  { category: 'life', text: 'Never explain your journey to people who refuse to understand it.' },
  { category: 'success', text: 'One day, your struggles will become someone else’s inspiration.' },
  { category: 'life', text: 'You can restart at any moment. Your story is not over.' },
  { category: 'success', text: 'Consistency is more powerful than temporary motivation.' },
  { category: 'love', text: 'Choose someone who makes ordinary moments feel special.' },
  { category: 'life', text: 'Do not chase attention. Build something worth noticing.' },
  { category: 'life', text: 'Growth begins when excuses end.' },
  { category: 'success', text: 'Focus on progress, not perfection.' },
  { category: 'love', text: 'A healthy relationship feels safe, honest and respectful.' },
  { category: 'life', text: 'You do not need everyone to understand your path.' },
  { category: 'success', text: 'Your future is shaped by what you do consistently today.' },
  { category: 'life', text: 'Rest is part of the journey, not a sign of weakness.' },
  { category: 'success', text: 'Start before you feel ready. Learn as you go.' },
  { category: 'love', text: 'The best connections are built on trust and effort.' },
  { category: 'life', text: 'Do not let yesterday take up too much of today.' },
  { category: 'success', text: 'A clear goal gives your hard work direction.' },
  { category: 'life', text: 'Choose peace over proving a point.' },
  { category: 'success', text: 'Every expert was once a beginner.' },
  { category: 'love', text: 'Love should add to your life, not erase who you are.' },
  { category: 'life', text: 'Your pace is valid. Keep moving.' },
  { category: 'success', text: 'The secret is to show up again tomorrow.' }
];

// FACTS
const facts = [
  'Octopuses have three hearts.',
  'Honey can remain edible for a very long time when properly stored.',
  'A group of flamingos is called a flamboyance.',
  'Bananas are berries from a botanical perspective.',
  'Sharks existed before trees.',
  'The human brain contains approximately 86 billion neurons.',
  'A day on Venus is longer than its year.',
  'Dolphins have unique signature whistles.',
  'Wombats produce cube-shaped droppings.',
  'The Eiffel Tower can become slightly taller during hot weather.',
  'An adult human typically has 206 bones.',
  'Butterflies taste using sensors on their feet.',
  'The Moon is slowly moving away from Earth.',
  'Lightning can heat the surrounding air to extremely high temperatures.',
  'Some species of bamboo can grow very quickly under the right conditions.',
  'A snail can have thousands of tiny teeth.',
  'The Pacific Ocean is the largest ocean on Earth.',
  'A rainbow is actually a full circle, although the ground usually blocks the lower part.',
  'The fingerprints of koalas are remarkably similar to human fingerprints.',
  'Water expands when it freezes.'
];

// LIFE ADVICE
const adviceList = [
  'Never make permanent decisions based on temporary emotions.',
  'Save money before spending it on things you do not need.',
  'Learn a skill that can earn you money.',
  'Do not confuse being busy with being productive.',
  'Listen carefully before responding.',
  'Keep your promises, especially the ones you make to yourself.',
  'Surround yourself with people who encourage your growth.',
  'Take care of your health while chasing your dreams.',
  'Learn to walk away from situations that destroy your peace.',
  'Be humble enough to learn and confident enough to try.',
  'Do not compare your chapter one to someone else’s chapter twenty.',
  'Always have a plan, but remain flexible when things change.',
  'Ask questions when you do not understand something.',
  'Build habits that support the future you want.',
  'Do not spend your whole life trying to impress people.',
  'Take responsibility for your mistakes and learn from them.',
  'Protect your time. You cannot get it back.',
  'Celebrate small wins while working toward bigger goals.'
];

// PICKUP LINES
const pickupLines = [
  'Are you Wi-Fi? Because I am feeling a strong connection. 📶❤️',
  'Are you a keyboard? Because you are just my type. ⌨️',
  'Are you Google? Because you have everything I have been searching for. 😍',
  'If beauty were time, you would be eternity. ⏳❤️',
  'Are you a programmer? Because you just compiled my heart. 💻',
  'You must be a star because you light up my night. ✨',
  'Is your name JavaScript? Because you make everything interactive. 😂',
  'I was having a normal day until your smile changed everything. ❤️',
  'Are you electricity? Because you give me butterflies. ⚡',
  'You are the notification I would never mute. 📱💕',
  'Are you a password? Because you are hard to forget.',
  'Are you a camera? Every time I see you, I smile. 📸',
  'You must be a good song because I want you on repeat. 🎶',
  'Are you a charger? Because you give me energy. 🔋'
];

// ROASTS
const roasts = [
  'You have something on your chin... no, the third one. 😂',
  'Your Wi-Fi signal has more connection than your thinking. 📶',
  'You are like a software update. Nobody asked, but here you are. 😂',
  'Your brain is running on airplane mode. ✈️',
  'Even Google cannot find your common sense. 🔍',
  'You bring everyone so much joy... when you leave. 😭',
  'Your jokes need a software update.',
  'You are proof that loading screens exist in real life. ⏳',
  'Your confidence is 100%, but your accuracy is still buffering. 😂',
  'You could lose an argument with a mirror.',
  'Your thoughts are still waiting for network connection.',
  'You have the energy of a phone stuck at 1%. 🔋',
  'You are not slow; you are just moving in a different time zone.',
  'Your alarm clock probably needs motivation to wake you up.'
];

// FLIRTS
const flirts = [
  'I was going to send you a normal message, but you deserve something special. ❤️',
  'Some notifications make you smile. Yours would be my favourite. 🥰',
  'I do not need a perfect day. A conversation with you is enough. 💕',
  'If I could choose one person to talk to right now, it would be you.',
  'You make even ordinary conversations interesting. 😍',
  'My favourite place might just be wherever you are. ❤️',
  'I think my heart has saved your name as a favourite contact. 💘',
  'Talking to you is becoming my favourite habit. 😊',
  'You make distance feel smaller and time pass faster.',
  'If smiles were messages, I would send you a thousand.'
];

// WOULD YOU RATHER
const wouldYouRather = [
  'Would you rather be rich but lonely or average but surrounded by genuine friends?',
  'Would you rather travel the world or own your dream house?',
  'Would you rather read minds or see the future?',
  'Would you rather have unlimited money or unlimited time?',
  'Would you rather never use social media again or never watch movies again?',
  'Would you rather become famous or become extremely wealthy privately?',
  'Would you rather forgive someone who hurt you or forget they existed?',
  'Would you rather live without music or without movies?',
  'Would you rather have your dream job or your dream relationship?',
  'Would you rather restart your life or see ten years into your future?',
  'Would you rather always be ten minutes late or always be twenty minutes early?',
  'Would you rather have the ability to fly or become invisible?',
  'Would you rather live by the ocean or in the mountains?',
  'Would you rather know every language or play every instrument?',
  'Would you rather have more courage or more patience?'
];

// ============================================================
// COMMANDS
// ============================================================

export default [

  {
    command: 'joke',
    aliases: ['jokes'],
    category: 'fun',
    description: 'Get a random joke',
    run: async ctx => {
      await ctx.reply(`😂 *RANDOM JOKE*\n\n${pick(jokes)}`);
    }
  },

  {
    command: 'compliment',
    aliases: ['praise'],
    category: 'fun',
    description: 'Get a random compliment',
    run: async ctx => {
      await ctx.reply(`💖 *COMPLIMENT*\n\n${pick(compliments)}`);
    }
  },

  {
    command: 'coin',
    aliases: ['flip'],
    category: 'games',
    description: 'Flip a coin',
    run: async ctx => {
      const result = randomInt(2) === 0 ? 'HEADS' : 'TAILS';
      await ctx.reply(`🪙 *COIN FLIP*\n\nThe coin landed on *${result}*!`);
    }
  },

  {
    command: 'dice',
    aliases: ['roll'],
    category: 'games',
    description: 'Roll a six-sided dice',
    run: async ctx => {
      const result = randomInt(1, 7);
      await ctx.reply(`🎲 *DICE ROLL*\n\nYou rolled a *${result}*!`);
    }
  },

  {
    command: 'ship',
    aliases: ['love'],
    category: 'fun',
    description: 'Calculate playful compatibility',
    run: async ctx => {
      const names = cleanText(ctx.q, 150);
      if (!names) return ctx.reply('Usage: .ship Watson, Alex');

      const score = randomInt(101);
      const result =
        score >= 80 ? 'A perfect match! 💍' :
        score >= 60 ? 'There may be a spark! ❤️' :
        score >= 40 ? 'Maybe there is something! 💕' :
        'Just friends for now! 😅';

      await ctx.reply(
        `💘 *LOVE COMPATIBILITY*\n\n${names}\n\n` +
        `❤️ Score: *${score}%*\n${result}\n\n` +
        `_Just for fun, not a real compatibility test._`
      );
    }
  },

  {
    command: 'rate',
    aliases: ['howgood'],
    category: 'fun',
    description: 'Give a random fun rating',
    run: async ctx => {
      const subject = cleanText(ctx.q, 200);
      if (!subject) return ctx.reply('Usage: .rate my coding skills');

      const score = randomInt(101);
      await ctx.reply(
        `⭐ *RANDOM RATING*\n\n` +
        `Subject: ${subject}\n` +
        `Rating: *${score}/100*\n\n` +
        `_This rating is randomly generated._`
      );
    }
  },

  {
    command: '8ball',
    aliases: ['magicball'],
    category: 'games',
    description: 'Ask the magic eight ball',
    run: async ctx => {
      const question = cleanText(ctx.q, 250);
      if (!question) return ctx.reply('Usage: .8ball Will I become successful?');

      await ctx.reply(
        `🎱 *MAGIC 8 BALL*\n\n❓ ${question}\n\n🔮 *${pick(magicAnswers)}*`
      );
    }
  },

  {
    command: 'truth',
    aliases: ['truthquestion'],
    category: 'games',
    description: 'Get a truth question',
    run: async ctx => {
      await ctx.reply(`🗣️ *TRUTH*\n\n${pick(truths)}`);
    }
  },

  {
    command: 'dare',
    aliases: ['challenge'],
    category: 'games',
    description: 'Get a dare challenge',
    run: async ctx => {
      await ctx.reply(
        `🔥 *DARE*\n\n${pick(dares)}\n\n` +
        `_Only do challenges you are comfortable with._`
      );
    }
  },

  {
    command: 'riddle',
    aliases: ['puzzle'],
    category: 'games',
    description: 'Get a random riddle',
    run: async ctx => {
      const item = pick(riddles);
      const answerCode = Buffer.from(item.a, 'utf8').toString('base64url');

      await ctx.reply(
        `🧩 *RIDDLE CHALLENGE*\n\n${item.q}\n\n` +
        `Think carefully!\n\nTo reveal the answer, use:\n` +
        `*${config.prefix}riddleanswer ${answerCode}*`
      );
    }
  },

  {
    command: 'riddleanswer',
    aliases: ['ranswer'],
    category: 'games',
    description: 'Reveal a riddle answer',
    run: async ctx => {
      const code = cleanText(ctx.q, 500);
      if (!code) return ctx.reply('Use the answer code supplied by .riddle.');

      try {
        if (!/^[A-Za-z0-9_-]+$/.test(code)) throw new Error('Invalid code');

        const answer = Buffer.from(code, 'base64url').toString('utf8');
        if (!answer || answer.length > 200 || !/^[\x20-\x7E]+$/.test(answer)) {
          throw new Error('Invalid answer');
        }

        await ctx.reply(`✅ *RIDDLE ANSWER*\n\n${answer}`);
      } catch {
        await ctx.reply('Invalid answer code.');
      }
    }
  },

  {
    command: 'rps',
    aliases: ['rockpaperscissors'],
    category: 'games',
    description: 'Play rock paper scissors',
    run: async ctx => {
      const choices = ['rock', 'paper', 'scissors'];
      const userChoice = cleanText(ctx.q, 20).toLowerCase();

      if (!choices.includes(userChoice)) {
        return ctx.reply(
          '✊ *ROCK PAPER SCISSORS*\n\n' +
          'Usage:\n.rps rock\n.rps paper\n.rps scissors'
        );
      }

      const botChoice = pick(choices);
      let result;

      if (userChoice === botChoice) {
        result = '🤝 It is a draw!';
      } else if (
        (userChoice === 'rock' && botChoice === 'scissors') ||
        (userChoice === 'paper' && botChoice === 'rock') ||
        (userChoice === 'scissors' && botChoice === 'paper')
      ) {
        result = '🏆 You win!';
      } else {
        result = '🤖 I win! Better luck next time.';
      }

      const emoji = { rock: '✊', paper: '✋', scissors: '✌️' };

      await ctx.reply(
        `🎮 *ROCK PAPER SCISSORS*\n\n` +
        `You: ${emoji[userChoice]} ${userChoice}\n` +
        `Bot: ${emoji[botChoice]} ${botChoice}\n\n*${result}*`
      );
    }
  },

  {
    command: 'slot',
    aliases: ['slots', 'slotmachine'],
    category: 'games',
    description: 'Play the slot machine',
    run: async ctx => {
      const symbols = ['🍒', '🍋', '🍉', '⭐', '💎', '7️⃣'];
      const result = [pick(symbols), pick(symbols), pick(symbols)];
      const win = result.every(symbol => symbol === result[0]);
      const pair = new Set(result).size === 2;

      await ctx.reply(
        `🎰 *SLOT MACHINE*\n\n` +
        `╭──────────────╮\n│ ${result.join('  ')} │\n╰──────────────╯\n\n` +
        `${win ? '🎉 JACKPOT! All three match!' : pair ? '✨ Two symbols match!' : '😅 No match. Try again!'}\n\n` +
        `_For entertainment only. No real money involved._`
      );
    }
  },

  {
    command: 'choose',
    aliases: ['pickone'],
    category: 'fun',
    description: 'Randomly choose between options',
    run: async ctx => {
      const options = String(ctx.q || '')
        .split('|')
        .map(item => item.trim())
        .filter(Boolean);

      if (options.length < 2 || options.length > 20) {
        return ctx.reply('Usage: .choose Pizza | Burger | Chicken\nProvide 2–20 options.');
      }
      if (options.some(item => item.length > 100)) {
        return ctx.reply('Each option must be under 100 characters.');
      }

      await ctx.reply(`🎯 *MY CHOICE*\n\n${pick(options)}`);
    }
  },

  {
    command: 'quote',
    aliases: ['quotes', 'wisdom'],
    category: 'fun',
    description: 'Get a life, love or success quote',
    run: async ctx => {
      const category = cleanText(ctx.q, 30).toLowerCase();
      const valid = ['life', 'success', 'love'];
      const available = valid.includes(category)
        ? quotes.filter(item => item.category === category)
        : quotes;
      const item = pick(available);

      await ctx.reply(
        `💎 *PRECIOUS QUOTE*\n\n❝ ${item.text} ❞\n\n` +
        `🏷️ Category: *${item.category.toUpperCase()}*\n\n` +
        `_Created by Watson Fourpence_`
      );
    }
  },

  {
    command: 'motivate',
    aliases: ['motivation', 'inspire'],
    category: 'fun',
    description: 'Get daily motivation',
    run: async ctx => {
      const item = pick(quotes.filter(q => q.category === 'success'));
      await ctx.reply(
        `🚀 *DAILY MOTIVATION*\n\n${item.text}\n\n` +
        `Remember: Your dreams deserve your effort. 💪`
      );
    }
  },

  {
    command: 'fact',
    aliases: ['facts', 'didyouknow'],
    category: 'fun',
    description: 'Discover a random fact',
    run: async ctx => {
      await ctx.reply(`🧠 *DID YOU KNOW?*\n\n${pick(facts)}\n\n_Knowledge is power!_`);
    }
  },

  {
    command: 'advice',
    aliases: ['lifeadvice'],
    category: 'fun',
    description: 'Get random life advice',
    run: async ctx => {
      await ctx.reply(
        `💡 *WATSON'S ADVICE*\n\n${pick(adviceList)}\n\n` +
        `_Take what helps you and keep growing._`
      );
    }
  },

  {
    command: 'pickup',
    aliases: ['pickupline', 'rizz'],
    category: 'fun',
    description: 'Get a random pickup line',
    run: async ctx => {
      await ctx.reply(`💘 *RIZZ GENERATOR*\n\n${pick(pickupLines)}`);
    }
  },

  {
    command: 'roast',
    aliases: ['burn'],
    category: 'fun',
    description: 'Get a playful roast',
    run: async ctx => {
      await ctx.reply(
        `🔥 *WATSON ROAST MACHINE*\n\n${pick(roasts)}\n\n` +
        `_Just jokes. Keep it friendly! 😂_`
      );
    }
  },

  {
    command: 'flirt',
    aliases: ['romantic'],
    category: 'fun',
    description: 'Get a romantic message',
    run: async ctx => {
      await ctx.reply(`💕 *ROMANTIC MESSAGE*\n\n${pick(flirts)}`);
    }
  },

  {
    command: 'wyr',
    aliases: ['wouldyourather'],
    category: 'games',
    description: 'Play would you rather',
    run: async ctx => {
      await ctx.reply(
        `🤔 *WOULD YOU RATHER?*\n\n${pick(wouldYouRather)}\n\n` +
        `👇 Reply with your choice!`
      );
    }
  },

  {
    command: 'lovequote',
    aliases: ['romancequote'],
    category: 'fun',
    description: 'Get a romantic quote',
    run: async ctx => {
      const item = pick(quotes.filter(q => q.category === 'love'));
      await ctx.reply(`❤️ *LOVE QUOTE*\n\n❝ ${item.text} ❞`);
    }
  },

  {
    command: 'lifequote',
    aliases: ['lifequotes'],
    category: 'fun',
    description: 'Get a life quote',
    run: async ctx => {
      const item = pick(quotes.filter(q => q.category === 'life'));
      await ctx.reply(`🌍 *LIFE QUOTE*\n\n❝ ${item.text} ❞`);
    }
  },

  {
    command: 'successquote',
    aliases: ['successquotes'],
    category: 'fun',
    description: 'Get a success quote',
    run: async ctx => {
      const item = pick(quotes.filter(q => q.category === 'success'));
      await ctx.reply(`🏆 *SUCCESS QUOTE*\n\n❝ ${item.text} ❞`);
    }
  },

  {
    command: 'funhelp',
    aliases: ['gamehelp'],
    category: 'games',
    description: 'Show fun and games commands',
    run: async ctx => {
      await ctx.reply(
        `🎮 *PRECIOUS-MD FUN & GAMES*\n\n` +
        `╭───────────────\n` +
        `┃ 😂 .joke\n` +
        `┃ 💖 .compliment\n` +
        `┃ 💘 .ship Watson, Alex\n` +
        `┃ ⭐ .rate coding\n` +
        `┃ 🎱 .8ball question\n` +
        `┃ 🗣️ .truth\n` +
        `┃ 🔥 .dare\n` +
        `┃ 🧩 .riddle\n` +
        `┃ 🎲 .dice\n` +
        `┃ 🪙 .coin\n` +
        `┃ ✊ .rps rock\n` +
        `┃ 🎰 .slot\n` +
        `┃ 🎯 .choose A | B | C\n` +
        `┃ 💎 .quote [life/love/success]\n` +
        `┃ 🚀 .motivate\n` +
        `┃ 🧠 .fact\n` +
        `┃ 💡 .advice\n` +
        `┃ 💘 .pickup\n` +
        `┃ 🔥 .roast\n` +
        `┃ 💕 .flirt\n` +
        `┃ 🤔 .wyr\n` +
        `┃ ❤️ .lovequote\n` +
        `┃ 🌍 .lifequote\n` +
        `┃ 🏆 .successquote\n` +
        `╰───────────────\n\n` +
        `*PRECIOUS-MD by Watson Fourpence*\n` +
        `*Powered by Watson XD*`
      );
    }
  }
];