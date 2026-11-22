// ─────────────────────────────────────────────────────────────────────────────
// AUTO REACTION  (single source of truth — the old autoreact code was replaced by this)
//
//   • Auto-react ON  → env AutoReaction=true, or AUTO_REACT=true, or `.autoreact on`
//       - text messages  → random emoji (👑 when the sender is the owner)
//       - image / video / audio messages → random emoji
//   • Owner react ON → config.js OWNER_REACT = true: reacts to messages the owner sends
//       from the bot's own account with OWNER_REACT_EMOJI (env: owner_react_emojie, default 💛)
//   • Emoji pool     → env autoreactions_emojies (comma separated) → emojis set with
//       `.autoreact emoji ...` → built-in list below
//
// Statuses are NOT handled here — see statuslistener.js.
// ─────────────────────────────────────────────────────────────────────────────

const REACTION_COOLDOWN_MS = 1500 // small gap between reactions so a busy group can't flood WhatsApp
let lastReactionAt = 0

const DEFAULT_EMOJIS = ['💛', '🤍', '💗', '♥️', '💞', '💖', '💓', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💟', '🕊️', '🥀', '🦋', '🐣', '❤‍🩹', '♥️', '🌸', '❣️', '✨', '🎀', '🩷', '🖤', '🤍', '🤎', '💛', '💚', '🩵', '💙', '💜', '💟', '💓', '🩶']
const UNTOUCHED_COMMAND_DEFAULT = '❤️‍🔥' // the placeholder the `.autoreact` command ships with

const TEXT_TRIGGER = /[a-zاميء]/i // same letters as the original pattern (latin + ا م ي ء)
const MEDIA_TYPES = ['imageMessage', 'videoMessage', 'audioMessage']
const NON_REACTABLE = new Set(['protocolMessage', 'reactionMessage', 'pollUpdateMessage', 'senderKeyDistributionMessage', 'messageContextInfo'])

const pickRandom = list => list[Math.floor(Math.random() * list.length)]
const digitsOf = jid => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')

function emojiPool() {
    const fromEnv = process.env.autoreactions_emojies?.split(',').map(e => e.trim()).filter(Boolean)
    if (fromEnv?.length) return fromEnv
    // keep `.autoreact emoji ...` working
    const custom = Array.isArray(global.autoReactEmojis) ? global.autoReactEmojis.filter(Boolean) : []
    if (custom.length && !(custom.length === 1 && custom[0] === UNTOUCHED_COMMAND_DEFAULT)) return custom
    return DEFAULT_EMOJIS
}

const autoReactEnabled = () =>
    global.autoReact === true || String(process.env.AutoReaction || '').toLowerCase() === 'true'

function isReactable(content) {
    const types = Object.keys(content || {}).filter(t => t !== 'messageContextInfo')
    return types.length > 0 && !types.every(t => NON_REACTABLE.has(t))
}

function textOf(content) {
    return content.conversation
        || content.extendedTextMessage?.text
        || content.imageMessage?.caption
        || content.videoMessage?.caption
        || ''
}

function senderIsOwner(key) {
    const owner = digitsOf(global.ownerNumber)
    if (!owner) return false
    return [key.participantAlt, key.participant, key.remoteJidAlt, key.remoteJid].some(jid => digitsOf(jid) === owner)
}

let handler = async (waClient, { messages, type }) => {
    if (type !== 'notify') return
    const autoOn = autoReactEnabled()
    const ownerOn = global.OWNER_REACT === true
    if (!autoOn && !ownerOn) return

    for (const message of messages || []) {
        const key = message?.key
        const content = message?.message
        const chat = key?.remoteJid
        if (!key?.id || !content || !chat) continue
        if (chat === 'status@broadcast' || chat.endsWith('@newsletter')) continue
        if (!isReactable(content)) continue

        let emoji = null

        if (key.fromMe) {
            // messages the owner sends from the bot's own account
            if (ownerOn) emoji = String(global.OWNER_REACT_EMOJI || '💛')
        } else if (autoOn) {
            const hasMedia = MEDIA_TYPES.some(t => content[t])
            if (hasMedia || TEXT_TRIGGER.test(textOf(content))) {
                emoji = senderIsOwner(key) ? '👑' : pickRandom(emojiPool())
            }
        }

        if (!emoji) continue
        if (Date.now() - lastReactionAt < REACTION_COOLDOWN_MS) continue
        lastReactionAt = Date.now()
        await waClient.sendMessage(chat, { react: { text: emoji, key } }).catch(() => {})
    }
}

handler.on = 'messages.upsert'

export default handler
