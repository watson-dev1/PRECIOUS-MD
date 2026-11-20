import axios from 'axios'
import he from 'he'
import { getAccount, saveEconomy, fmtCoins } from '../../lib/economy.js'
import { sendButtons, quickReply } from '../../lib/buttons.js'

const trivia = new Map()   // chat -> { answer, options, expires, solved }
const hangman = new Map()  // chat -> { word, guessed:Set, wrong:Set, expires }

const WORDS = ['whatsapp', 'zimbabwe', 'javascript', 'elephant', 'football', 'internet', 'keyboard', 'universe', 'chocolate', 'mountain', 'rainbow', 'diamond', 'dolphin', 'volcano', 'umbrella', 'butterfly', 'telephone', 'sunshine', 'adventure', 'friendship', 'computer', 'pyramid', 'jungle', 'galaxy']
const TRUTHS = ['What is the most embarrassing thing you have done in public?', 'Who was your first crush?', 'What is a secret talent you have?', 'What is the last lie you told?', 'What is your biggest fear?', 'Which person in this group would you trust with your phone?', 'What is the weirdest dream you remember?', 'What habit do you wish you could quit?']
const DARES = ['Send a voice note singing your favourite song.', 'Change your WhatsApp status to "I love broccoli" for 1 hour.', 'Send the 5th photo in your gallery (no cheating).', 'Talk in rhymes for the next 5 messages.', 'Tell the group your most-used emoji and why.', 'Send a voice note doing your best animal impression.', 'Text "I miss you" to your last contact in chat (then explain).']
const BALL = ['Yes, definitely.', 'It is certain.', 'Most likely.', 'Ask again later.', 'Cannot predict now.', 'Don\'t count on it.', 'My sources say no.', 'Very doubtful.', 'Without a doubt.', 'Signs point to yes.']
const STAGES = ['😀', '🙂', '😐', '😟', '😨', '😵', '💀']

const mask = game => [...game.word].map(ch => game.guessed.has(ch) ? ch : '_').join(' ')

let handler = async (m, { waClient, command, args, text }) => {
    const prefix = global.prefix || '.'

    if (command === 'trivia') {
        const active = trivia.get(m.chat)
        if (active && active.expires > Date.now()) return m.reply('A trivia question is already running here — answer it first!')
        const r = await axios.get('https://opentdb.com/api.php', { params: { amount: 1, type: 'multiple' }, timeout: 15000, validateStatus: () => true })
        const q = r.data?.results?.[0]
        if (!q) return m.reply('Trivia service is busy. Try again in a few seconds.')
        const answer = he.decode(q.correct_answer)
        const options = [...q.incorrect_answers.map(x => he.decode(x)), answer].sort(() => Math.random() - 0.5)
        trivia.set(m.chat, { answer: options.indexOf(answer), options, expires: Date.now() + 30000, solved: false, difficulty: q.difficulty })
        return sendButtons(waClient, m, {
            title: `🧠 TRIVIA — ${he.decode(q.category)}`,
            body: `*${he.decode(q.question)}*\n\nDifficulty: ${q.difficulty}\n⏱️ You have 30 seconds`,
            buttons: options.map((option, i) => quickReply(`${'ABCD'[i]}. ${option}`.slice(0, 40), `${prefix}triviaans ${i}`))
        })
    }

    if (command === 'triviaans') {
        const game = trivia.get(m.chat)
        if (!game || game.expires < Date.now() || game.solved) return m.reply('No active trivia question. Start one with ' + prefix + 'trivia')
        const pick = Number(args[0])
        if (!Number.isInteger(pick) || pick < 0 || pick > 3) return
        if (pick !== game.answer) return m.react?.('❌')
        game.solved = true
        const reward = { easy: 100, medium: 200, hard: 350 }[game.difficulty] || 100
        const acc = getAccount(m.sender); acc.wallet += reward; acc.xp += 10; saveEconomy()
        trivia.delete(m.chat)
        return waClient.sendMessage(m.chat, { text: `✅ @${m.sender.split('@')[0]} got it!\nAnswer: *${game.options[game.answer]}*\nReward: ${fmtCoins(reward)}`, mentions: [m.sender] }, { quoted: m })
    }

    if (command === 'hangman') {
        const word = WORDS[Math.floor(Math.random() * WORDS.length)]
        hangman.set(m.chat, { word, guessed: new Set(), wrong: new Set(), expires: Date.now() + 10 * 60000 })
        return m.reply(`🔤 *HANGMAN*\n\n${[...word].map(() => '_').join(' ')}\n\n${word.length} letters. Guess with *${prefix}guess <letter>*`)
    }

    if (command === 'guess') {
        const game = hangman.get(m.chat)
        if (!game || game.expires < Date.now()) return m.reply(`No hangman game running. Start one with ${prefix}hangman`)
        const guess = String(args[0] || '').toLowerCase()
        if (!/^[a-z]$/.test(guess) && guess !== game.word) return m.reply(`Guess a single letter: ${prefix}guess a`)
        if (guess === game.word) game.word.split('').forEach(ch => game.guessed.add(ch))
        else if (game.guessed.has(guess) || game.wrong.has(guess)) return m.reply('You already tried that letter.')
        else if (game.word.includes(guess)) game.guessed.add(guess)
        else game.wrong.add(guess)

        if ([...game.word].every(ch => game.guessed.has(ch))) {
            hangman.delete(m.chat)
            const acc = getAccount(m.sender); acc.wallet += 150; acc.xp += 10; saveEconomy()
            return waClient.sendMessage(m.chat, { text: `🎉 @${m.sender.split('@')[0]} solved it! The word was *${game.word}*.\nReward: ${fmtCoins(150)}`, mentions: [m.sender] }, { quoted: m })
        }
        if (game.wrong.size >= 6) {
            hangman.delete(m.chat)
            return m.reply(`💀 Game over! The word was *${game.word}*.`)
        }
        return m.reply(`${STAGES[game.wrong.size]} ${mask(game)}\n\nWrong (${game.wrong.size}/6): ${[...game.wrong].join(' ') || '-'}`)
    }

    if (command === 'rps') {
        const choices = ['rock', 'paper', 'scissors'], icons = { rock: '🪨', paper: '📄', scissors: '✂️' }
        const mine = choices.find(c => c.startsWith(String(args[0] || '').toLowerCase()) && args[0])
        if (!mine) {
            return sendButtons(waClient, m, { title: '✊ ROCK PAPER SCISSORS', body: 'Pick your move:', buttons: choices.map(c => quickReply(`${icons[c]} ${c}`, `${prefix}rps ${c}`)) })
        }
        const bot = choices[Math.floor(Math.random() * 3)]
        const result = mine === bot ? '🤝 Draw!' : ((mine === 'rock' && bot === 'scissors') || (mine === 'paper' && bot === 'rock') || (mine === 'scissors' && bot === 'paper')) ? '🎉 You win!' : '😈 I win!'
        return sendButtons(waClient, m, { body: `You: ${icons[mine]} ${mine}\nMe: ${icons[bot]} ${bot}\n\n*${result}*`, buttons: [quickReply('🔁 Play again', `${prefix}rps`)] })
    }

    if (command === 'truth' || command === 'dare' || command === 'truthordare' || command === 'tod') {
        const list = command === 'dare' ? DARES : command === 'truth' ? TRUTHS : (Math.random() < 0.5 ? TRUTHS : DARES)
        const kind = list === DARES ? '🔥 DARE' : '💭 TRUTH'
        return sendButtons(waClient, m, {
            title: kind, body: list[Math.floor(Math.random() * list.length)],
            buttons: [quickReply('💭 Truth', `${prefix}truth`), quickReply('🔥 Dare', `${prefix}dare`)]
        })
    }

    if (command === '8ball') {
        if (!text) return m.reply(`Ask a question: ${prefix}8ball will I be rich?`)
        return m.reply(`🎱 ${BALL[Math.floor(Math.random() * BALL.length)]}`)
    }
    if (command === 'coinflip') return m.reply(Math.random() < 0.5 ? '🪙 *Heads!*' : '🪙 *Tails!*')
    if (command === 'dice' || command === 'roll') {
        const sides = Math.min(Math.max(parseInt(args[0], 10) || 6, 2), 1000)
        return m.reply(`🎲 You rolled a *${1 + Math.floor(Math.random() * sides)}* (d${sides})`)
    }
}

handler.command = ['trivia', 'triviaans', 'hangman', 'guess', 'rps', 'truth', 'dare', 'truthordare', 'tod', '8ball', 'coinflip', 'dice', 'roll']
handler.category = 'Games'
export default handler
