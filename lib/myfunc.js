
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { fileTypeFromBuffer } from 'file-type'
import * as baileys from '@whiskeysockets/baileys'

let _makeWaSocket = baileys.default

if (typeof _makeWaSocket !== 'function') {
    _makeWaSocket = baileys.makeWASocket
}

if (typeof _makeWaSocket !== 'function') {
    _makeWaSocket = baileys.makeSocket
}

if (typeof _makeWaSocket !== 'function' && baileys.default && typeof baileys.default === 'object') {
    _makeWaSocket = baileys.default.default ||
        baileys.default.makeWASocket ||
        baileys.default.makeSocket
}

if (typeof _makeWaSocket !== 'function') {
    throw new Error(
        `makeWASocket not found. Available exports: ${Object.keys(baileys).join(', ')}`
    )
}

const {
    downloadContentFromMessage,
    jidDecode,
    areJidsSameUser,
    generateWAMessage
} = baileys

const ownerPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'database',
    'owner.json'
)

let ownerCache = { mtime: 0, list: [] }

function getOwners() {
    try {
        const { mtimeMs } = fs.statSync(ownerPath)

        if (mtimeMs !== ownerCache.mtime) {
            const list = JSON.parse(
                fs.readFileSync(ownerPath, 'utf-8')
            )

            ownerCache = {
                mtime: mtimeMs,
                list: Array.isArray(list) ? list : []
            }
        }
    } catch {}

    return ownerCache.list
}

const smsgCache = new WeakMap()

const groupMetadataCache = new Map()
const groupMetadataRequests = new Map()

const GROUP_METADATA_TTL = 5 * 60 * 1000
const GROUP_METADATA_CACHE_LIMIT = 500

const lidCache = new Map()
const LID_CACHE_TTL = 30 * 60 * 1000
const LID_CACHE_LIMIT = 5000

const MESSAGE_CACHE_LIMIT = 2000
const CONTACT_CACHE_LIMIT = 5000
const CHAT_CACHE_LIMIT = 1000

function trimCache(cache, limit) {
    while (cache.size > limit) {
        cache.delete(cache.keys().next().value)
    }
}

function trimObjectCache(cache, limit, preserve = []) {
    let keys = Object.keys(cache)

    while (keys.length > limit) {
        const key = keys.find(
            candidate => !preserve.includes(candidate)
        )

        if (!key) break

        delete cache[key]
        keys = Object.keys(cache)
    }
}

function getMessageCacheKey(key) {
    if (!key?.id) return null

    const chat = key.remoteJid || key.remoteJidAlt || ''
    const participant = key.participant || key.participantAlt || ''

    return `${chat}:${participant}:${key.id}`
}

export function setGroupMetadataCache(id, metadata) {
    groupMetadataCache.delete(id)

    groupMetadataCache.set(id, {
        data: metadata,
        fetchedAt: Date.now()
    })

    trimCache(groupMetadataCache, GROUP_METADATA_CACHE_LIMIT)
}

export async function getGroupMetadata(
    waClient,
    id,
    forceRefresh = false
) {
    const cached = groupMetadataCache.get(id)

    const isFresh = cached &&
        Date.now() - cached.fetchedAt < GROUP_METADATA_TTL

    if (!forceRefresh && isFresh) {
        return cached.data
    }

    if (cached && !isFresh) {
        groupMetadataCache.delete(id)
    }

    if (groupMetadataRequests.has(id)) {
        return groupMetadataRequests.get(id)
    }

    const request = waClient.groupMetadata(id)
        .catch(() => null)
        .then(metadata => {
            if (metadata) {
                setGroupMetadataCache(id, metadata)
            }

            return metadata || cached?.data || null
        })
        .finally(() => {
            groupMetadataRequests.delete(id)
        })

    groupMetadataRequests.set(id, request)

    return request
}

async function resolveLidCached(waClient, lid) {
    if (!lid || !lid.endsWith('@lid')) return lid

    const cached = lidCache.get(lid)

    if (cached && Date.now() - cached.fetchedAt < LID_CACHE_TTL) {
        return cached.jid
    }

    let resolved = lid

    try {
        const pn = await waClient.signalRepository
            ?.lidMapping?.getPNForLID(lid)

        if (pn) resolved = pn
    } catch {}

    lidCache.delete(lid)

    lidCache.set(lid, {
        jid: resolved,
        fetchedAt: Date.now()
    })

    trimCache(lidCache, LID_CACHE_LIMIT)

    return resolved
}

/* =====================================================
   MESSAGE CACHE AND MEDIA RECOVERY
===================================================== */

function unwrapMessage(message) {
    let current = message

    const wrappers = [
        'ephemeralMessage',
        'viewOnceMessage',
        'viewOnceMessageV2',
        'viewOnceMessageV2Extension',
        'documentWithCaptionMessage',
        'editedMessage',
        'deviceSentMessage',
        'botForwardedMessage'
    ]

    let count = 0

    while (current && count++ < 10) {
        let found = false

        for (const wrapper of wrappers) {
            if (current[wrapper]?.message) {
                current = current[wrapper].message
                found = true
                break
            }
        }

        if (!found) break
    }

    return current
}

function getMessageType(message) {
    if (!message || typeof message !== 'object') {
        return null
    }

    return Object.keys(message).find(
        key => key !== 'messageContextInfo'
    ) || null
}

function getMediaContent(message, preferredType) {
    const content = unwrapMessage(message)

    if (!content) return null

    const supported = [
        'imageMessage',
        'videoMessage',
        'audioMessage',
        'stickerMessage',
        'documentMessage'
    ]

    if (preferredType && content[preferredType]) {
        return {
            type: preferredType,
            content: content[preferredType]
        }
    }

    for (const type of supported) {
        if (content[type]) {
            return {
                type,
                content: content[type]
            }
        }
    }

    const interactive = content.interactiveMessage?.header

    if (interactive) {
        for (const type of supported) {
            if (interactive[type]) {
                return {
                    type,
                    content: interactive[type]
                }
            }
        }
    }

    return null
}

function getMediaType(type) {
    return String(type || '')
        .replace(/Message$/i, '')
        .toLowerCase()
}

async function downloadRawMedia(message, preferredType) {
    const media = getMediaContent(message, preferredType)

    if (!media?.content) {
        throw new Error(
            'No downloadable media content was found in the message.'
        )
    }

    const mediaType = getMediaType(media.type)

    const stream = await downloadContentFromMessage(
        media.content,
        mediaType
    )

    const chunks = []

    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk))
    }

    const buffer = Buffer.concat(chunks)

    if (!buffer.length) {
        throw new Error('WhatsApp returned an empty media file.')
    }

    return buffer
}

/* =====================================================
   SOCKET CREATION
===================================================== */

export function makeWASocket(connectionOptions, options = {}) {
    const waClient = _makeWaSocket(connectionOptions)

    const messageCache = new Map()

    // Store the COMPLETE original message, including its key.
    waClient.rememberMessage = message => {
        if (!message?.key?.id || !message?.message) return

        const cacheKey = getMessageCacheKey(message.key)

        if (!cacheKey) return

        messageCache.delete(cacheKey)

        messageCache.set(cacheKey, message)

        trimCache(messageCache, MESSAGE_CACHE_LIMIT)
    }

    // Recover original message using the quoted WhatsApp key.
    waClient.getStoredMessage = key => {
        if (!key?.id) return null

        const exactKey = getMessageCacheKey(key)

        if (exactKey && messageCache.has(exactKey)) {
            return messageCache.get(exactKey)
        }

        const chat = key.remoteJid || key.remoteJidAlt || ''

        const participant =
            key.participant || key.participantAlt || ''

        const alternateKey = `${chat}::${key.id}`

        if (messageCache.has(alternateKey)) {
            return messageCache.get(alternateKey)
        }

        // Match by message ID and chat if participant differs.
        for (const message of messageCache.values()) {
            if (message.key?.id !== key.id) continue

            const storedChat =
                message.key.remoteJid ||
                message.key.remoteJidAlt ||
                ''

            if (storedChat !== chat) continue

            const storedParticipant =
                message.key.participant ||
                message.key.participantAlt ||
                ''

            if (
                !participant ||
                !storedParticipant ||
                participant === storedParticipant
            ) {
                return message
            }
        }

        return null
    }

    // Cache messages sent by the bot.
    const originalSendMessage = waClient.sendMessage.bind(waClient)

    waClient.sendMessage = async (...args) => {
        const sent = await originalSendMessage(...args)

        if (sent) {
            waClient.rememberMessage(sent)
        }

        return sent
    }

    const originalRelayMessage = waClient.relayMessage.bind(waClient)

    waClient.relayMessage = async (jid, message, relayOptions = {}) => {
        const result = await originalRelayMessage(
            jid,
            message,
            relayOptions
        )

        const messageId = relayOptions.messageId || result

        if (jid && typeof messageId === 'string' && message) {
            waClient.rememberMessage({
                key: {
                    remoteJid: jid,
                    fromMe: true,
                    id: messageId
                },
                message
            })
        }

        return result
    }

    // JID decoder.
    waClient.decodeJid = jid => {
        if (!jid) return jid

        if (/:\\d+@/gi.test(jid)) {
            const decode = jidDecode(jid) || {}

            return (
                decode.user &&
                decode.server &&
                `${decode.user}@${decode.server}`
            ) || jid
        }

        return jid
    }

    waClient.reply = (jid, text, m, options) => {
        return waClient.sendMessage(
            jid,
            { text },
            { quoted: m, ...options }
        )
    }

    waClient.resolveLidToJid =
        waClient.resolveLidToJid ||
        (async lid => resolveLidCached(waClient, lid))

    /* =================================================
       FILE HELPERS
    ================================================= */

    waClient.getFile = async (PATH, saveToFile = false) => {
        let res, filename

        const data = Buffer.isBuffer(PATH)
            ? PATH
            : PATH instanceof ArrayBuffer
                ? Buffer.from(PATH)
                : typeof PATH === 'string' &&
                    /^data:.*?\\/.*?;base64,/i.test(PATH)
                    ? Buffer.from(PATH.split(',')[1], 'base64')
                    : typeof PATH === 'string' &&
                        /^https?:\\/\\//.test(PATH)
                        ? (
                            res = await fetch(PATH),
                            Buffer.from(await res.arrayBuffer())
                        )
                        : typeof PATH === 'string' &&
                            fs.existsSync(PATH)
                            ? (
                                filename = PATH,
                                fs.readFileSync(PATH)
                            )
                            : typeof PATH === 'string'
                                ? Buffer.from(PATH)
                                : Buffer.alloc(0)

        if (!Buffer.isBuffer(data)) {
            throw new TypeError('Result is not a buffer')
        }

        const type = await fileTypeFromBuffer(data) || {
            mime: 'application/octet-stream',
            ext: 'bin'
        }

        if (data.length && saveToFile && !filename) {
            const tmpDir = './tmp'

            if (!fs.existsSync(tmpDir)) {
                fs.mkdirSync(tmpDir, { recursive: true })
            }

            filename = path.join(
                tmpDir,
                `${Date.now()}.${type.ext}`
            )

            fs.writeFileSync(filename, data)
        }

        return {
            res,
            filename,
            ...type,
            data,
            deleteFile() {
                return filename && fs.unlinkSync(filename)
            }
        }
    }

    waClient.sendFile = async (
        jid,
        filePath,
        filename = '',
        caption = '',
        quoted,
        ptt = false,
        sendOptions = {}
    ) => {
        const type = await waClient.getFile(filePath, true)

        const { res, data: file, filename: pathFile } = type

        if (res && !res.ok) {
            throw new Error(`Download failed: HTTP ${res.status}`)
        }

        const fileSize = fs.statSync(pathFile).size / 1024 / 1024

        if (fileSize >= 100) {
            throw new Error('File size is too big!')
        }

        const opt = {}

        if (quoted) opt.quoted = quoted

        if (
            !type.mime ||
            type.mime === 'application/octet-stream'
        ) {
            sendOptions.asDocument = true
        }

        let mtype = ''

        const mimetype = sendOptions.mimetype || type.mime

        if (/webp/.test(type.mime) && sendOptions.asSticker) {
            mtype = 'sticker'
        } else if (/image/.test(type.mime)) {
            mtype = sendOptions.asDocument ? 'document' : 'image'
        } else if (/video/.test(type.mime)) {
            mtype = 'video'
        } else if (/audio/.test(type.mime)) {
            mtype = 'audio'
        } else {
            mtype = 'document'
        }

        if (sendOptions.asDocument) {
            mtype = 'document'
        }

        const message = {
            ...sendOptions,
            caption,
            ptt,
            [mtype]: { url: pathFile },
            mimetype,
            fileName: filename || path.basename(pathFile)
        }

        try {
            return await waClient.sendMessage(
                jid,
                message,
                { ...opt, ...sendOptions }
            )
        } catch (error) {
            return await waClient.sendMessage(
                jid,
                { ...message, [mtype]: file },
                { ...opt, ...sendOptions }
            )
        } finally {
            type.deleteFile()
        }
    }

    /* =================================================
       DOWNLOAD MEDIA
    ================================================= */

    waClient.downloadM = async (m, type, saveToFile = false) => {
        if (!m) {
            throw new Error('Message is missing.')
        }

        let buffer

        // Try direct media first.
        try {
            const direct = m.msg || m

            buffer = await downloadRawMedia(
                direct,
                type ? `${getMediaType(type)}Message` : null
            )
        } catch (directError) {
            // Recover original message from cache.
            const key = m.key || m.fakeObj?.key

            const original = key
                ? waClient.getStoredMessage(key)
                : null

            if (!original) {
                throw new Error(
                    `Media download failed: ${directError.message}. ` +
                    'Original message is not available in cache.'
                )
            }

            buffer = await downloadRawMedia(
                original.message,
                type ? `${getMediaType(type)}Message` : null
            )
        }

        if (!saveToFile) {
            return buffer
        }

        const fileInfo = await fileTypeFromBuffer(buffer)

        const ext = fileInfo?.ext || 'bin'

        const tmpDir = './tmp'

        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true })
        }

        const filename = path.join(
            tmpDir,
            `${Date.now()}-${Math.floor(Math.random() * 100000)}.${ext}`
        )

        fs.writeFileSync(filename, buffer)

        return filename
    }

    return waClient
}

/* =====================================================
   MESSAGE PARSING HELPERS
===================================================== */

function extractRealMessage(msg) {
    return unwrapMessage(msg)
}

function getInteractiveMedia(message) {
    const header = message?.interactiveMessage?.header

    if (!header || typeof header !== 'object') {
        return null
    }

    for (const type of [
        'imageMessage',
        'videoMessage',
        'audioMessage',
        'documentMessage',
        'stickerMessage'
    ]) {
        if (header[type]) {
            return {
                type,
                content: header[type]
            }
        }
    }

    return null
}

function findQuoteContext(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) {
        return null
    }

    seen.add(value)

    if (value.contextInfo?.quotedMessage) {
        return value.contextInfo
    }

    if (value.messageContextInfo?.quotedMessage) {
        return value.messageContextInfo
    }

    for (const [key, child] of Object.entries(value)) {
        if (key === 'quotedMessage') continue

        const context = findQuoteContext(child, seen)

        if (context) return context
    }

    return null
}

/* =====================================================
   SMSG
===================================================== */

export function smsg(waClient, m) {
    if (!m || typeof m !== 'object') {
        return Promise.resolve(m)
    }

    let task = smsgCache.get(m)

    if (!task) {
        task = parseMessage(waClient, m)
        smsgCache.set(m, task)
    }

    return task
}

async function parseMessage(waClient, m) {
    if (m.key) {
        m.id = m.key.id

        m.isBaileys = Boolean(
            m.id?.startsWith('BAE5') && m.id.length === 16
        )

        m.chat = m.key.remoteJidAlt || m.key.remoteJid

        m.fromMe = m.key.fromMe
        m.isGroup = m.chat?.endsWith('@g.us')
        m.isNewsletter = m.chat?.endsWith('@newsletter')
        m.isDM = !m.isGroup && !m.isNewsletter

        const rawSender =
            m.key.participantAlt ||
            m.key.participant ||
            m.chat

        m.sender = waClient.decodeJid(
            m.fromMe && waClient.user?.id ||
            rawSender ||
            ''
        )

        let groupMetadata = null

        if (m.isGroup) {
            groupMetadata = await getGroupMetadata(
                waClient,
                m.chat
            )
        }

        if (m.chat?.endsWith('@lid') && !m.isGroup) {
            m.chat = waClient.decodeJid(
                await waClient.resolveLidToJid(m.chat)
            )
        }

        if (m.sender.endsWith('@lid')) {
            m.senderLid = m.sender

            if (m.isGroup) {
                const participant = groupMetadata?.participants?.find(
                    user => user.id === m.sender
                )

                m.sender = waClient.decodeJid(
                    participant?.phoneNumber ||
                    await waClient.resolveLidToJid(m.sender)
                )
            } else {
                m.sender = waClient.decodeJid(
                    await waClient.resolveLidToJid(m.sender)
                )
            }
        }

        const owners = getOwners()

        const senderNumber = m.sender.split('@')[0]

        const botNumber = waClient.decodeJid(
            waClient.user?.id || ''
        ).split('@')[0]

        m.isOwner =
            owners.includes(m.sender) ||
            owners.includes(m.senderLid) ||
            owners.includes(senderNumber) ||
            senderNumber === botNumber

        if (m.isGroup) {
            const participants = groupMetadata?.participants || []

            const matchParticipant = (...candidates) => {
                const ids = new Set(
                    candidates
                        .filter(Boolean)
                        .flatMap(id => [
                            id,
                            waClient.decodeJid(id)
                        ])
                )

                return participants.find(participant =>
                    [
                        participant.id,
                        participant.lid,
                        participant.phoneNumber
                    ]
                        .filter(Boolean)
                        .some(id =>
                            ids.has(id) ||
                            ids.has(waClient.decodeJid(id))
                        )
                )
            }

            const senderParticipant = matchParticipant(
                m.sender,
                m.key.participant,
                m.key.participantAlt
            )

            m.isAdmin =
                senderParticipant?.admin === 'admin' ||
                senderParticipant?.admin === 'superadmin'

            const botId = waClient.decodeJid(waClient.user.id)

            const botLid = waClient.user.lid
                ? waClient.decodeJid(waClient.user.lid)
                : null

            const botParticipant = matchParticipant(
                botId,
                botLid
            )

            m.isBotAdmin =
                botParticipant?.admin === 'admin' ||
                botParticipant?.admin === 'superadmin'
        } else {
            m.isAdmin = false
            m.isBotAdmin = false
        }
    }

    if (m.message) {
        // Cache original incoming message before parsing it.
        waClient.rememberMessage?.(m)

        const messageContent = extractRealMessage(m.message)

        m.mtype = getMessageType(messageContent)

        if (!m.mtype) {
            m.reply = (text, chatId, options) =>
                waClient.reply(
                    chatId || m.chat,
                    text,
                    m,
                    options
                )

            return m
        }

        m.msg = messageContent[m.mtype]

        const messageText =
            m.msg?.text ||
            m.msg?.caption ||
            messageContent.conversation ||
            m.msg?.contentText ||
            m.msg?.selectedDisplayText ||
            m.msg?.title ||
            m.msg?.body?.text ||
            m.msg?.header?.title ||
            ''

        m.text = typeof m.msg === 'string'
            ? m.msg
            : messageText

        m.download = (saveToFile = false) =>
            waClient.downloadM(
                m,
                m.mtype.replace(/Message/i, ''),
                saveToFile
            )

        m.mimetype = m.msg?.mimetype

        const mentioned =
            m.msg?.contextInfo?.mentionedJid ||
            m.msg?.messageContextInfo?.mentionedJid ||
            []

        m.mentionedJid = mentioned.map(
            jid => waClient.decodeJid(jid)
        )

        const quoteContext =
            findQuoteContext(messageContent) ||
            findQuoteContext(m.message)

        let quotedRaw = quoteContext?.quotedMessage || null

        m.quoteDebug = {
            mtype: m.mtype,
            contentKeys: Object.keys(messageContent || {}),
            hasQuotedMessage: Boolean(quotedRaw),
            stanzaId: quoteContext?.stanzaId || null,
            participant: quoteContext?.participant || null
        }

        if (!quotedRaw && m.msg?.botForwardedMessage) {
            const botMsg = m.msg.botForwardedMessage.message

            quotedRaw =
                botMsg?.richResponseMessage
                    ?.contextInfo?.quotedMessage || null
        }

        if (quotedRaw) {
            const realQuoted = extractRealMessage(quotedRaw)

            if (!realQuoted) {
                m.quoted = null
            } else {
                const containerType = getMessageType(realQuoted)

                const interactiveMedia =
                    containerType === 'interactiveMessage'
                        ? getInteractiveMedia(realQuoted)
                        : null

                const type = interactiveMedia?.type || containerType

                const quotedContent =
                    interactiveMedia?.content ||
                    realQuoted[containerType]

                if (!type || !quotedContent) {
                    m.quoted = null
                } else {
                    const quotedObj = typeof quotedContent === 'object'
                        ? { ...quotedContent }
                        : { text: String(quotedContent || '') }

                    const quoteKey = {
                        remoteJid:
                            m.key.remoteJid ||
                            m.key.remoteJidAlt ||
                            m.chat,

                        fromMe: false,

                        id: quoteContext?.stanzaId || null,

                        participant:
                            quoteContext?.participant || undefined
                    }

                    quotedObj.containerMtype = containerType
                    quotedObj.mtype = type
                    quotedObj.msg = quotedContent
                    quotedObj.message = realQuoted
                    quotedObj.rawMessage = quotedRaw

                    quotedObj.id = quoteKey.id
                    quotedObj.chat = quoteKey.remoteJid

                    quotedObj.participant = quoteKey.participant

                    quotedObj.key = quoteKey

                    if (quotedContent.mimetype) {
                        quotedObj.mimetype = quotedContent.mimetype
                    }

                    let quotedSender = quoteContext?.participant || ''

                    quotedSender = quotedSender
                        ? waClient.decodeJid(quotedSender)
                        : ''

                    if (quotedSender.endsWith('@lid')) {
                        if (m.isGroup) {
                            const meta = await getGroupMetadata(
                                waClient,
                                m.chat
                            )

                            const participant = meta?.participants?.find(
                                user => user.id === quotedSender
                            )

                            quotedSender = waClient.decodeJid(
                                participant?.phoneNumber ||
                                await waClient.resolveLidToJid(quotedSender)
                            )
                        } else {
                            quotedSender = waClient.decodeJid(
                                await waClient.resolveLidToJid(quotedSender)
                            )
                        }
                    }

                    quotedObj.sender = quotedSender

                    quotedObj.fromMe = quotedSender
                        ? areJidsSameUser(
                            quotedSender,
                            waClient.decodeJid(waClient.user.id)
                        )
                        : false

                    quotedObj.isBaileys = Boolean(
                        quotedObj.id?.startsWith('BAE5') &&
                        quotedObj.id.length === 16
                    )

                    quotedObj.text =
                        quotedObj.text ||
                        quotedObj.caption ||
                        quotedObj.body?.text ||
                        quotedObj.header?.title ||
                        ''

                    quotedObj.fakeObj = {
                        key: quoteKey,
                        message: realQuoted,
                        rawMessage: quotedRaw
                    }

                    quotedObj.reply = (text, chatId, options) =>
                        waClient.reply(
                            chatId || m.chat,
                            text,
                            m.quoted.fakeObj,
                            options
                        )

                    // Download directly from quoted media first.
                    // If that fails, recover original from cache.
                    quotedObj.download = async (saveToFile = false) => {
                        let buffer

                        try {
                            buffer = await downloadRawMedia(
                                realQuoted,
                                type
                            )
                        } catch (directError) {
                            const original =
                                waClient.getStoredMessage?.(quoteKey)

                            if (!original?.message) {
                                throw new Error(
                                    `Quoted media download failed: ${directError.message}. ` +
                                    'Original message was not found in the cache. ' +
                                    'Send the original media again while the bot is online.'
                                )
                            }

                            buffer = await downloadRawMedia(
                                original.message,
                                type
                            )
                        }

                        if (!saveToFile) return buffer

                        const info = await fileTypeFromBuffer(buffer)
                        const ext = info?.ext || 'bin'

                        if (!fs.existsSync('./tmp')) {
                            fs.mkdirSync('./tmp', { recursive: true })
                        }

                        const filename = path.join(
                            './tmp',
                            `${Date.now()}-${Math.floor(Math.random() * 100000)}.${ext}`
                        )

                        fs.writeFileSync(filename, buffer)

                        return filename
                    }

                    quotedObj.delete = () =>
                        waClient.sendMessage(m.chat, {
                            delete: quoteKey
                        })

                    m.quoted = quotedObj
                }
            }
        } else {
            m.quoted = null
        }
    }

    m.reply = (text, chatId, options) =>
        waClient.reply(
            chatId || m.chat,
            text,
            m,
            options
        )

    return m
}

/* =====================================================
   BIND EVENTS
===================================================== */

export function bind(waClient) {
    if (!waClient.chats) waClient.chats = {}
    if (!waClient.contacts) waClient.contacts = {}

    // CRITICAL: Cache all incoming messages before plugins process them.
    waClient.ev.on('messages.upsert', ({ messages }) => {
        try {
            for (const message of messages || []) {
                waClient.rememberMessage?.(message)
            }
        } catch (error) {
            console.error('[PRECIOUS MESSAGE CACHE]', error)
        }
    })

    function updateNameToDb(contacts) {
        if (!contacts) return

        try {
            contacts = contacts.contacts || contacts

            for (const contact of contacts) {
                const id = waClient.decodeJid(contact.id)

                if (!id || id === 'status@broadcast') continue

                let chats = waClient.chats[id]

                if (!chats) {
                    chats = waClient.chats[id] = {
                        ...contact,
                        id
                    }
                }

                waClient.chats[id] = {
                    ...chats,
                    ...contact,

                    ...(id.endsWith('@g.us')
                        ? {
                            subject:
                                contact.subject ||
                                contact.name ||
                                chats.subject ||
                                ''
                        }
                        : {
                            name:
                                contact.notify ||
                                contact.name ||
                                chats.name ||
                                chats.notify ||
                                ''
                        })
                }

                waClient.contacts[id] = {
                    ...waClient.contacts[id],
                    ...contact
                }
            }
        } catch (error) {
            console.error('[PRECIOUS CONTACTS]', error)
        }

        trimObjectCache(
            waClient.contacts,
            CONTACT_CACHE_LIMIT,
            [waClient.user?.id]
        )

        trimObjectCache(
            waClient.chats,
            CHAT_CACHE_LIMIT
        )
    }

    waClient.ev.on('contacts.upsert', updateNameToDb)
    waClient.ev.on('contacts.update', updateNameToDb)
    waClient.ev.on('contacts.set', updateNameToDb)
    waClient.ev.on('groups.update', updateNameToDb)

    waClient.ev.on('messages.reaction', reactions => {
        try {
            for (const reaction of reactions) {
                if (reaction.key?.participant) {
                    const jid = waClient.decodeJid(
                        reaction.key.participant
                    )

                    if (jid && !waClient.contacts[jid]) {
                        waClient.contacts[jid] = { id: jid }
                    }
                }
            }
        } catch {}

        trimObjectCache(
            waClient.contacts,
            CONTACT_CACHE_LIMIT,
            [waClient.user?.id]
        )
    })

    waClient.ev.on('chats.set', async ({ chats }) => {
        try {
            for (let { id, name, readOnly } of chats) {
                id = waClient.decodeJid(id)

                if (!id || id === 'status@broadcast') continue

                const isGroup = id.endsWith('@g.us')

                let localChats = waClient.chats[id]

                if (!localChats) {
                    localChats = waClient.chats[id] = { id }
                }

                localChats.isChats = !readOnly

                if (name) {
                    localChats[isGroup ? 'subject' : 'name'] = name
                }

                if (isGroup) {
                    const metadata = await getGroupMetadata(
                        waClient,
                        id,
                        true
                    )

                    if (name || metadata?.subject) {
                        localChats.subject = name || metadata.subject
                    }

                    if (!metadata) continue

                    localChats.metadata = metadata
                }
            }
        } catch (error) {
            console.error('[PRECIOUS CHATS]', error)
        }

        trimObjectCache(
            waClient.chats,
            CHAT_CACHE_LIMIT
        )
    })

    waClient.ev.on(
        'group-participants.update',
        async ({ id }) => {
            if (!id) return

            id = waClient.decodeJid(id)

            if (id === 'status@broadcast') return

            if (!(id in waClient.chats)) {
                waClient.chats[id] = { id }
            }

            const localChats = waClient.chats[id]

            localChats.isChats = true

            const metadata = await getGroupMetadata(
                waClient,
                id,
                true
            )

            if (!metadata) return

            localChats.subject = metadata.subject
            localChats.metadata = metadata

            trimObjectCache(
                waClient.chats,
                CHAT_CACHE_LIMIT
            )
        }
    )

    if (waClient.user) {
        waClient.contacts[waClient.user.id] = {
            id: waClient.user.id,
            name: waClient.user.name,
            notify: waClient.user.name
        }
    }
}

/* =====================================================
   NOTIFICATIONS
===================================================== */

export async function sendNotification(
    waClient,
    m,
    title,
    body
) {
    const textMessage = title
        ? `*${title}*\n\n${body}`
        : body

    const quotedMessage = {
        key: {
            remoteJid: 'status@broadcast',
            fromMe: false,
            id: 'PRECIOUS-MD',
            participant: '13135550002@s.whatsapp.net'
        },

        message: {
            locationMessage: {
                degreesLatitude: -6.2,
                degreesLongitude: 106.816666,
                name: 'PRECIOUS-MD',
                address: 'PRECIOUS-MD',
                jpegThumbnail: null
            }
        }
    }

    const msg = await generateWAMessage(
        m.chat,
        { text: textMessage },
        {
            userJid: waClient.user.id,
            quoted: quotedMessage
        }
    )

    await waClient.relayMessage(
        msg.key.remoteJid,
        msg.message,
        {
            messageId: msg.key.id
        }
    )
}
