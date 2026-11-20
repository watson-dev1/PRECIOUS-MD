import axios from 'axios'
import { getFeature, setFeature } from '../../lib/featurestore.js'
import { sendButtons, quickReply, urlButton } from '../../lib/buttons.js'

const http = axios.create({ timeout: 30000, validateStatus: () => true, headers: { 'User-Agent': 'Mozilla/5.0 PRECIOUS-MD' } })
const trim = (value, n = 3500) => String(value || '').trim().slice(0, n)
const fail = (m, text) => m.reply(`⚠️ ${text}`)
const quotedText = m => String(m.quoted?.text || m.quoted?.msg?.text || m.quoted?.msg?.caption || '').trim()

async function askAI(prompt) {
    const persona = getFeature('persona', '')
    const system = persona || 'You are a helpful, concise WhatsApp assistant. Keep answers short and clear.'
    const r = await http.post('https://ch.at/v1/chat/completions', {
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }]
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 60000 })
    const text = r.data?.choices?.[0]?.message?.content || r.data?.response
    if (!text) throw new Error('The AI service returned nothing.')
    return text
}

function safeCalc(expression) {
    const cleaned = String(expression).replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/\^/g, '**').replace(/(\d+(?:\.\d+)?)%/g, '($1/100)')
    if (!/^[\d+\-*/().,eE*]+$/.test(cleaned) || cleaned.length > 120) throw new Error('Only numbers and + - * / ^ % ( ) are allowed.')
    let value
    try { value = Function(`"use strict"; return (${cleaned.replace(/,/g, '')})`)() } catch { throw new Error('That is not a valid expression.') }
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('That does not evaluate to a number.')
    return value
}

const handlers = {
    async persona(m, { args, text }) {
        if (!m.isOwner) return fail(m, 'Only the owner can change the AI persona.')
        const prefix = global.prefix || '.'
        if (!text) return m.reply(`*AI persona:*\n${getFeature('persona') || '(default assistant)'}\n\nSet: ${prefix}persona You are a funny pirate who answers briefly\nReset: ${prefix}persona reset`)
        if (['reset', 'default', 'off'].includes(args[0]?.toLowerCase())) { setFeature('persona', ''); return m.reply('✅ Persona reset to default.') }
        setFeature('persona', trim(text, 600))
        return m.reply('✅ AI persona updated for *.ask*, *.explain* and *.summarize*.')
    },
    async ask(m, { text }) {
        const prompt = trim([text, quotedText(m)].filter(Boolean).join('\n\n'), 6000)
        if (!prompt) return m.reply(`Use: ${global.prefix || '.'}ask <question>`)
        await m.react?.('🤔')
        return m.reply(trim(await askAI(prompt)))
    },
    async explain(m, { text }) {
        const topic = text || quotedText(m)
        if (!topic) return m.reply(`Use: ${global.prefix || '.'}explain <topic>`)
        return m.reply(trim(await askAI(`Explain this simply with a short example, under 200 words:\n${topic}`)))
    },
    async summarize(m, { text }) {
        const body = quotedText(m) || text
        if (body.length < 80) return m.reply('Reply to a long message (or paste text) to summarize.')
        return m.reply(trim(await askAI(`Summarize the following in 3-5 bullet points:\n\n${trim(body, 6000)}`)))
    },
    async imagine(m, { waClient, text }) {
        if (!text) return m.reply(`Use: ${global.prefix || '.'}imagine a lion wearing a crown`)
        await m.react?.('🎨')
        const seed = Math.floor(Math.random() * 1e6)
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}?width=1024&height=1024&nologo=true&seed=${seed}`
        const r = await http.get(url, { responseType: 'arraybuffer', timeout: 90000 })
        if (r.status !== 200 || !r.headers['content-type']?.startsWith('image/')) throw new Error('Image service is busy. Try again.')
        return sendButtons(waClient, m, {
            image: Buffer.from(r.data), title: '🎨 AI Image', body: `Prompt: ${trim(text, 200)}`,
            buttons: [quickReply('🔄 Another', `${global.prefix || '.'}imagine ${text}`)]
        })
    },
    async translate(m, { args }) {
        const prefix = global.prefix || '.'
        let lang = 'en', body = args.join(' ')
        if (/^[a-z]{2}(-[A-Za-z]{2})?$/.test(args[0] || '') && (args.length > 1 || m.quoted)) { lang = args[0]; body = args.slice(1).join(' ') }
        body = body || quotedText(m)
        if (!body) return m.reply(`Use: ${prefix}translate <lang> <text>\nExample: ${prefix}translate sn Good morning\nOr reply to a message: ${prefix}translate fr`)
        const r = await http.get('https://translate.googleapis.com/translate_a/single', { params: { client: 'gtx', sl: 'auto', tl: lang, dt: 't', q: body } })
        const out = (r.data?.[0] || []).map(x => x[0]).join('')
        if (!out) throw new Error('Translation failed. Check the language code.')
        return m.reply(`🌍 *${r.data?.[2] || 'auto'} → ${lang}*\n\n${trim(out)}`)
    },
    async wiki(m, { text }) {
        if (!text) return m.reply(`Use: ${global.prefix || '.'}wiki <topic>`)
        const s = await http.get('https://en.wikipedia.org/w/api.php', { params: { action: 'opensearch', search: text, limit: 1, format: 'json' } })
        const title = s.data?.[1]?.[0]
        if (!title) return m.reply(`No Wikipedia article found for "${text}".`)
        const r = await http.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
        if (!r.data?.extract) return m.reply('No summary available.')
        return m.reply(`📚 *${r.data.title}*\n\n${trim(r.data.extract, 1800)}\n\n${r.data.content_urls?.mobile?.page || ''}`)
    },
    async define(m, { text }) {
        const word = String(text || '').trim().split(/\s+/)[0]
        if (!word) return m.reply(`Use: ${global.prefix || '.'}define <word>`)
        const r = await http.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
        const entry = r.data?.[0]
        if (!entry) return m.reply(`No definition found for "${word}".`)
        const meanings = entry.meanings.slice(0, 3).map(x => `• _${x.partOfSpeech}_: ${x.definitions[0]?.definition}${x.definitions[0]?.example ? `\n   e.g. "${x.definitions[0].example}"` : ''}`).join('\n')
        return m.reply(`📖 *${entry.word}* ${entry.phonetic || ''}\n\n${meanings}`)
    },
    async weather(m, { text }) {
        if (!text) return m.reply(`Use: ${global.prefix || '.'}weather <city>`)
        const g = await http.get('https://geocoding-api.open-meteo.com/v1/search', { params: { name: text, count: 1 } })
        const place = g.data?.results?.[0]
        if (!place) return m.reply(`City "${text}" not found.`)
        const r = await http.get('https://api.open-meteo.com/v1/forecast', { params: { latitude: place.latitude, longitude: place.longitude, current: 'temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code', daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max', timezone: 'auto', forecast_days: 3 } })
        const c = r.data?.current
        if (!c) throw new Error('Weather service unavailable.')
        const codes = { 0: 'Clear ☀️', 1: 'Mostly clear 🌤️', 2: 'Partly cloudy ⛅', 3: 'Overcast ☁️', 45: 'Fog 🌫️', 48: 'Fog 🌫️', 51: 'Drizzle 🌦️', 53: 'Drizzle 🌦️', 55: 'Drizzle 🌦️', 61: 'Rain 🌧️', 63: 'Rain 🌧️', 65: 'Heavy rain 🌧️', 80: 'Showers 🌦️', 81: 'Showers 🌦️', 82: 'Heavy showers ⛈️', 95: 'Thunderstorm ⛈️', 96: 'Thunderstorm ⛈️', 99: 'Thunderstorm ⛈️' }
        const d = r.data.daily
        const days = d.time.map((t, i) => `${t}: ${Math.round(d.temperature_2m_min[i])}–${Math.round(d.temperature_2m_max[i])}°C, rain ${d.precipitation_probability_max[i]}%`).join('\n')
        return m.reply(`🌤️ *${place.name}, ${place.country || ''}*\n\n${codes[c.weather_code] || 'Unknown'}\nTemp: *${c.temperature_2m}°C* (feels ${c.apparent_temperature}°C)\nHumidity: *${c.relative_humidity_2m}%* | Wind: *${c.wind_speed_10m} km/h*\n\n*3-day forecast*\n${days}`)
    },
    async currency(m, { args }) {
        const amount = Number(args[0]), from = String(args[1] || '').toUpperCase(), to = String(args[3] || args[2] || '').toUpperCase()
        if (!amount || !/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return m.reply(`Use: ${global.prefix || '.'}currency 100 usd zar\n(or: 100 usd to zar)`)
        const r = await http.get(`https://open.er-api.com/v6/latest/${from}`)
        const rate = r.data?.rates?.[to]
        if (!rate) return m.reply('Unknown currency code.')
        return m.reply(`💱 *${amount.toLocaleString()} ${from}* = *${(amount * rate).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${to}*\nRate: 1 ${from} = ${rate} ${to}`)
    },
    async qr(m, { waClient, text }) {
        const data = text || quotedText(m)
        if (!data) return m.reply(`Use: ${global.prefix || '.'}qr <text or link>`)
        const QR = (await import('qrcode')).default
        const buffer = await QR.toBuffer(data.slice(0, 900), { margin: 2, width: 600 })
        return waClient.sendMessage(m.chat, { image: buffer, caption: `QR code for:\n${trim(data, 200)}` }, { quoted: m })
    },
    async shorten(m, { text }) {
        const link = text || quotedText(m)
        if (!/^https?:\/\//i.test(link)) return m.reply(`Use: ${global.prefix || '.'}shorten https://example.com/long/link`)
        const r = await http.get('https://is.gd/create.php', { params: { format: 'simple', url: link } })
        if (r.status !== 200 || !/^https?:\/\//.test(String(r.data))) throw new Error(trim(r.data, 100) || 'Could not shorten that link.')
        return m.reply(`🔗 ${String(r.data).trim()}`)
    },
    async calc(m, { text }) {
        if (!text) return m.reply(`Use: ${global.prefix || '.'}calc 12*(3+4)/2`)
        return m.reply(`🧮 ${text} = *${safeCalc(text)}*`)
    },
    async joke(m) {
        const r = await http.get('https://official-joke-api.appspot.com/random_joke')
        if (!r.data?.setup) throw new Error('No joke available right now.')
        return m.reply(`😂 ${r.data.setup}\n\n${r.data.punchline}`)
    },
    async fact(m) {
        const r = await http.get('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en')
        if (!r.data?.text) throw new Error('No fact available right now.')
        return m.reply(`🧠 *Did you know?*\n\n${r.data.text}`)
    },
    async quote(m) {
        const r = await http.get('https://zenquotes.io/api/random')
        const q = r.data?.[0]
        if (!q?.q) throw new Error('No quote available right now.')
        return m.reply(`💬 _"${q.q}"_\n\n— *${q.a}*`)
    }
}

const aliases = { ai2: 'ask', gpt: 'ask', chat: 'ask', tr: 'translate', trt: 'translate', dict: 'define', meaning: 'define', cuaca: 'weather', forecast: 'weather', convert: 'currency', curr: 'currency', short: 'shorten', calculate: 'calc', math: 'calc', tldr: 'summarize', draw: 'imagine', image: 'imagine', joke2: 'joke', dadjoke: 'joke', wikipedia: 'wiki', setpersona: 'persona' }

let handler = async (m, context) => {
    const name = aliases[context.command] || context.command
    const run = handlers[name]
    if (!run) return
    try { return await run(m, context) }
    catch (error) { return fail(m, error?.response?.data?.error || error?.message || 'Something went wrong. Try again.') }
}

handler.command = [...Object.keys(handlers), ...Object.keys(aliases)]
handler.category = 'AI & Tools'
handler.cooldown = 4
export default handler
