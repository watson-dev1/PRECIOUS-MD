import { fileURLToPath } from 'url'
import fs from 'fs'
import chalk from 'chalk'
import 'dotenv/config'

global.ownerName = 'watsonxd'
global.ownerTitle = 'Zimbabwe guy'
global.ownerNumber = '263781340745'
global.botName = 'PRECIOUS-MD'
global.repo = 'https://github.com/watson-dev1/PRECIOUS-MD'

global.botMessage = {
    owner: 'This feature is for the Owner only.',
    admin: 'This feature is for group Admins only.',
    group: 'This command can only be used in a group.',
    private: 'This command can only be used in a private chat.',
    isBotAdmin: 'I need to be an admin in this group to do that.'
}
global.stickerPack = {
    packname: 'PRECIOUS-MD',
    author: 'watsonxd'
}

const envBoolean = (name, fallback = false) => {
    const value = process.env[name]?.trim().toLowerCase()
    if (value === undefined || value === '') return fallback
    if (['true', '1', 'yes', 'on'].includes(value)) return true
    if (['false', '0', 'no', 'off'].includes(value)) return false
    return fallback
}

const envEmojis = (name, fallback) => {
    const emojis = process.env[name]
        ?.split(',')
        .map(emoji => emoji.trim())
        .filter(Boolean)
        .slice(0, 20)
    return emojis?.length ? emojis : fallback
}

const envChoice = (name, choices, fallback) => {
    const value = process.env[name]?.trim().toLowerCase()
    return choices.includes(value) ? value : fallback
}

global.settingsDefaults = {
    chatbotMode: envChoice('CHATBOT_MODE', ['off', 'dm', 'group', 'all', 'mention'], 'off'),
    autoReact: envBoolean('AUTO_REACT'),
    autoReactEmojis: envEmojis('AUTO_REACT_EMOJIS', ['❤️‍🔥']),
    autoRead: envBoolean('AUTO_READ'),
    autoRecording: envBoolean('AUTO_RECORDING'),
    autoTyping: envBoolean('AUTO_TYPING'),
    autoRecordType: envBoolean('AUTO_RECORD_TYPE')
}

// ─── Status automation (handled ONLY in lib/events/statuslistener.js) ───
// AUTO_STATUS_VIEW  = true  -> the bot views every contact's status
// AUTO_STATUS_REACT = true  -> the bot reacts to every contact's status (💚 💛 💓 ❤️ 💙)
// Change true/false below. A Render env var with the same name overrides this value.
global.AUTO_STATUS_VIEW = envBoolean('AUTO_STATUS_VIEW', true)
global.AUTO_STATUS_REACT = envBoolean('AUTO_STATUS_REACT', true)

// ─── Owner react (handled in lib/events/autoreact.js) ───
// OWNER_REACT = true -> the bot reacts to the messages you send from its own account
global.OWNER_REACT = envBoolean('OWNER_REACT', false)
global.OWNER_REACT_EMOJI = process.env.owner_react_emojie?.trim() || '💛'

const file = fileURLToPath(import.meta.url)
global.session = process.env.SESSION_ID || ''
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(`Update 'config.js'`))
    import(`${file}?update=${Date.now()}`)
})
