import { getAccount, saveEconomy, allAccounts, fmtCoins, fmtDuration, levelFromXp, xpForLevel } from '../../lib/economy.js'
import { sendButtons, quickReply } from '../../lib/buttons.js'

const DAY = 86400000, HOUR = 3600000
const JOBS = ['fixed a stranger\'s phone', 'delivered parcels', 'washed cars', 'tutored a student', 'sold airtime', 'coded a website', 'cooked at a food stand', 'painted a fence']

const parseAmount = (value, max) => {
    if (String(value).toLowerCase() === 'all') return max
    const n = Math.floor(Number(value))
    return Number.isFinite(n) && n > 0 ? n : 0
}

let handler = async (m, { waClient, command, args }) => {
    const prefix = global.prefix || '.'
    const me = getAccount(m.sender)
    const now = Date.now()

    switch (command) {
        case 'balance': case 'bal': case 'wallet': {
            const target = m.mentionedJid?.[0] || m.quoted?.sender || m.sender
            const acc = getAccount(target)
            return sendButtons(waClient, m, {
                title: '💰 WALLET',
                body: `@${target.split('@')[0]}\n\nWallet: *${fmtCoins(acc.wallet)}*\nBank: *${fmtCoins(acc.bank)}*\nNet worth: *${fmtCoins(acc.wallet + acc.bank)}*\nLevel: *${levelFromXp(acc.xp)}*`,
                buttons: [quickReply('🎁 Daily', `${prefix}daily`), quickReply('💼 Work', `${prefix}work`), quickReply('🏆 Leaderboard', `${prefix}leaderboard`)]
            })
        }
        case 'daily': {
            const left = me.lastDaily + DAY - now
            if (left > 0) return m.reply(`⏳ Come back in *${fmtDuration(left)}* for your next daily reward.`)
            me.streak = now - me.lastDaily < DAY * 2 ? me.streak + 1 : 1
            const reward = 500 + Math.min(me.streak, 30) * 50
            me.wallet += reward; me.lastDaily = now
            saveEconomy()
            return m.reply(`🎁 *Daily reward:* ${fmtCoins(reward)}\n🔥 Streak: *${me.streak}* day(s)\nWallet: ${fmtCoins(me.wallet)}`)
        }
        case 'work': {
            const left = me.lastWork + HOUR - now
            if (left > 0) return m.reply(`😮‍💨 You are tired. Work again in *${fmtDuration(left)}*.`)
            const pay = 80 + Math.floor(Math.random() * 220)
            me.wallet += pay; me.lastWork = now; me.xp += 8
            saveEconomy()
            return m.reply(`💼 You ${JOBS[Math.floor(Math.random() * JOBS.length)]} and earned ${fmtCoins(pay)}.`)
        }
        case 'deposit': case 'dep': {
            const amount = parseAmount(args[0], me.wallet)
            if (!amount || amount > me.wallet) return m.reply(`Use: ${prefix}deposit <amount|all>\nWallet: ${fmtCoins(me.wallet)}`)
            me.wallet -= amount; me.bank += amount; saveEconomy()
            return m.reply(`🏦 Deposited ${fmtCoins(amount)}.\nBank: ${fmtCoins(me.bank)}`)
        }
        case 'withdraw': case 'wd': {
            const amount = parseAmount(args[0], me.bank)
            if (!amount || amount > me.bank) return m.reply(`Use: ${prefix}withdraw <amount|all>\nBank: ${fmtCoins(me.bank)}`)
            me.bank -= amount; me.wallet += amount; saveEconomy()
            return m.reply(`💵 Withdrew ${fmtCoins(amount)}.\nWallet: ${fmtCoins(me.wallet)}`)
        }
        case 'give': case 'pay': case 'transfer': {
            const target = m.mentionedJid?.[0] || m.quoted?.sender
            const amount = parseAmount(args.find(a => /^\d+$|^all$/i.test(a)), me.wallet)
            if (!target || !amount) return m.reply(`Use: ${prefix}give @user <amount>`)
            if (target === m.sender) return m.reply('You cannot pay yourself.')
            if (amount > me.wallet) return m.reply(`You only have ${fmtCoins(me.wallet)} in your wallet.`)
            const other = getAccount(target)
            me.wallet -= amount; other.wallet += amount; saveEconomy()
            return waClient.sendMessage(m.chat, { text: `✅ Sent ${fmtCoins(amount)} to @${target.split('@')[0]}.`, mentions: [target] }, { quoted: m })
        }
        case 'gamble': case 'bet': {
            const amount = parseAmount(args[0], me.wallet)
            if (!amount || amount > me.wallet) return m.reply(`Use: ${prefix}gamble <amount|all>\nWallet: ${fmtCoins(me.wallet)}`)
            if (amount > 50000) return m.reply('Maximum bet is 🪙 50,000.')
            const win = Math.random() < 0.45
            me.wallet += win ? amount : -amount; saveEconomy()
            return sendButtons(waClient, m, {
                body: win ? `🎉 You won ${fmtCoins(amount)}!\nWallet: ${fmtCoins(me.wallet)}` : `💸 You lost ${fmtCoins(amount)}.\nWallet: ${fmtCoins(me.wallet)}`,
                buttons: [quickReply('🔁 Again', `${prefix}gamble ${Math.min(amount, me.wallet) || 1}`), quickReply('💰 Balance', `${prefix}balance`)]
            })
        }
        case 'slot': case 'slots': {
            const amount = parseAmount(args[0] || 50, me.wallet)
            if (!amount || amount > me.wallet) return m.reply(`Use: ${prefix}slot <bet>\nWallet: ${fmtCoins(me.wallet)}`)
            const symbols = ['🍒', '🍋', '🍇', '🔔', '💎', '7️⃣']
            const roll = () => symbols[Math.floor(Math.random() * symbols.length)]
            const [a, b, c] = [roll(), roll(), roll()]
            let multiplier = 0
            if (a === b && b === c) multiplier = a === '7️⃣' ? 10 : a === '💎' ? 6 : 4
            else if (a === b || b === c || a === c) multiplier = 1.5
            const delta = multiplier ? Math.floor(amount * multiplier) - amount : -amount
            me.wallet += delta; saveEconomy()
            return m.reply(`🎰 ${a} | ${b} | ${c}\n\n${multiplier ? `🎉 *${multiplier}x* — you won ${fmtCoins(delta)}!` : `😢 You lost ${fmtCoins(amount)}.`}\nWallet: ${fmtCoins(me.wallet)}`)
        }
        case 'leaderboard': case 'lb': case 'richest': {
            const ranked = Object.entries(allAccounts()).map(([jid, a]) => [jid, (a.wallet || 0) + (a.bank || 0)]).sort((x, y) => y[1] - x[1]).slice(0, 10)
            if (!ranked.length) return m.reply('Nobody has any coins yet. Try .daily')
            const medals = ['🥇', '🥈', '🥉']
            return waClient.sendMessage(m.chat, {
                text: `*🏆 RICHEST MEMBERS*\n\n${ranked.map(([jid, total], i) => `${medals[i] || `${i + 1}.`} @${jid.split('@')[0]} — ${fmtCoins(total)}`).join('\n')}`,
                mentions: ranked.map(([jid]) => jid)
            }, { quoted: m })
        }
        case 'rank': case 'level': case 'xp': {
            const target = m.mentionedJid?.[0] || m.quoted?.sender || m.sender
            const acc = getAccount(target)
            const level = levelFromXp(acc.xp)
            const next = xpForLevel(level + 1), base = xpForLevel(level)
            const pct = Math.min(10, Math.floor(((acc.xp - base) / Math.max(1, next - base)) * 10))
            const position = Object.entries(allAccounts()).sort((a, b) => b[1].xp - a[1].xp).findIndex(([jid]) => jid === target) + 1
            return waClient.sendMessage(m.chat, {
                text: `*⭐ RANK* — @${target.split('@')[0]}\n\nLevel: *${level}*\nXP: *${acc.xp}* / ${next}\n[${'█'.repeat(pct)}${'░'.repeat(10 - pct)}]\nGlobal rank: *#${position}*`,
                mentions: [target]
            }, { quoted: m })
        }
    }
}

handler.command = ['balance', 'bal', 'wallet', 'daily', 'work', 'deposit', 'dep', 'withdraw', 'wd', 'give', 'pay', 'transfer', 'gamble', 'bet', 'slot', 'slots', 'leaderboard', 'lb', 'richest', 'rank', 'level', 'xp']
handler.category = 'Economy'
export default handler
