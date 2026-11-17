import axios from 'axios'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import ffmpegPath from 'ffmpeg-static'

const execAsync = promisify(exec)
export const config = global.config || { bot: { name: global.botName || 'PRECIOUS-MD' } }
export const te = (prefix = '.', command = '', pushName = 'User') =>
  `❌ ${pushName || 'User'}, something went wrong while running ${prefix || '.'}${command || 'this command'}. Please try again later.`
export const saluranCtx = () => ({})

function addMessageCompat(m, ctx = {}) {
  const prefix = ctx.prefix ?? ctx.usedPrefix ?? global.prefix ?? '.'
  const command = ctx.command || ''
  m.prefix = prefix
  m.command = command
  m.pushName = m.pushName || m.name || m.sender?.split('@')[0] || 'User'
  if (typeof m.react !== 'function') {
    m.react = emoji => ctx.waClient?.sendMessage(m.chat, { react: { text: emoji, key: m.key } })
  }
  if (typeof m.reply !== 'function') {
    m.reply = text => ctx.waClient?.sendMessage(m.chat, { text: String(text) }, { quoted: m })
  }
  return m
}

function normalizeContext(m, ctx = {}) {
  const waClient = ctx.waClient || ctx.conn || ctx.sock
  addMessageCompat(m, { ...ctx, waClient })
  if (waClient && typeof waClient.sendMedia !== 'function') {
    waClient.sendMedia = async (jid, source, caption = '', quoted, options = {}) => {
      let buffer
      if (Buffer.isBuffer(source)) buffer = source
      else if (typeof source === 'string' && /^https?:\/\//i.test(source)) {
        const response = await axios.get(source, { responseType: 'arraybuffer', timeout: 90000, maxContentLength: 150 * 1024 * 1024 })
        buffer = Buffer.from(response.data)
      } else if (source?.url) {
        const response = await axios.get(source.url, { responseType: 'arraybuffer', timeout: 90000 })
        buffer = Buffer.from(response.data)
      } else buffer = source
      const type = options.type || 'document'
      const payload = type === 'video' ? { video: buffer, caption } : type === 'image' ? { image: buffer, caption } : type === 'audio' ? { audio: buffer, mimetype: options.mimetype || 'audio/mpeg' } : { document: buffer, mimetype: options.mimetype || 'application/octet-stream', fileName: options.fileName || 'download.bin', caption }
      return waClient.sendMessage(jid, payload, quoted ? { quoted } : {})
    }
  }
  if (waClient && typeof waClient.sendFile !== 'function') {
    waClient.sendFile = async (jid, source, fileName = 'file', caption = '', quoted, options = {}) => {
      const response = Buffer.isBuffer(source) ? source : (await axios.get(source, { responseType: 'arraybuffer', timeout: 90000 })).data
      return waClient.sendMessage(jid, { document: Buffer.from(response), fileName, mimetype: options.mimetype || 'application/octet-stream', caption }, quoted ? { quoted } : {})
    }
  }
  return {
    ...ctx,
    waClient,
    conn: waClient,
    sock: waClient,
    jid: m.chat,
    text: ctx.text ?? m.text ?? '',
    args: ctx.args || [],
    prefix: ctx.prefix ?? ctx.usedPrefix ?? global.prefix ?? '.',
    usedPrefix: ctx.usedPrefix ?? ctx.prefix ?? global.prefix ?? '.',
    command: ctx.command || m.command || '',
    reply: ctx.reply || (text => m.reply(text)),
    isAdmin: ctx.isAdmin ?? m.isAdmin,
    isOwner: ctx.isOwner ?? m.isOwner
  }
}

export function wrapClassic(handler) {
  const wrapped = async (m, ctx = {}) => handler(addMessageCompat(m, ctx), normalizeContext(m, ctx))
  Object.assign(wrapped, handler)
  return wrapped
}

export function wrapPlugin(pluginConfig, handler) {
  const wrapped = wrapClassic(handler)
  wrapped.pluginConfig = pluginConfig || {}
  wrapped.help ||= pluginConfig?.usage ? [pluginConfig.usage] : []
  wrapped.tags ||= [pluginConfig?.category || 'download']
  wrapped.command ||= pluginConfig?.alias?.length ? pluginConfig.alias : (Array.isArray(pluginConfig?.name) ? pluginConfig.name : [pluginConfig?.name]).filter(Boolean)
  return wrapped
}

export function oneCommand(handler, name) {
  if (!handler) return handler
  if (!handler.command || !(Array.isArray(handler.command) ? handler.command.length : handler.command)) handler.command = [name]
  else if (name && !Array.isArray(handler.command)) handler.command = [handler.command]
  return handler
}

export function mergePlugins(_category, ...handlers) {
  const list = handlers.flat().filter(Boolean)
  const merged = async (m, ctx) => {
    for (const handler of list) await handler(m, ctx)
  }
  merged.command = list.flatMap(h => Array.isArray(h.command) ? h.command : h.command ? [h.command] : [])
  merged.help = list.flatMap(h => h.help || [])
  merged.tags = [_category]
  return merged
}

export async function sendAlbum(sock, jid, items = [], options = {}) {
  for (const item of items) {
    const quoted = options.quoted ? { quoted: options.quoted } : {}
    if (item.type === 'video') {
      const video = item.buffer || (item.url ? { url: item.url } : item.video)
      await sock.sendMessage(jid, { video, caption: item.caption || '' }, quoted)
    } else {
      const image = item.buffer || (item.url ? { url: item.url } : item.image)
      await sock.sendMessage(jid, { image, caption: item.caption || '' }, quoted)
    }
  }
}

export async function sendStickerPack(sock, jid, buffers = [], quoted, options = {}) {
  for (const buffer of buffers) {
    if (!buffer) continue
    await sock.sendMessage(jid, { sticker: Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer) }, quoted ? { quoted } : {})
  }
}

export async function f(source, mode = 'buffer') {
  if (Buffer.isBuffer(source)) return source
  const response = await axios.get(source, { responseType: mode === 'json' ? 'json' : 'arraybuffer', timeout: 90000, maxContentLength: 150 * 1024 * 1024 })
  return mode === 'json' ? response.data : Buffer.from(response.data)
}

export async function safeJson(response, fallback = {}) {
  try { return await response.json() } catch { return fallback }
}

export async function queueFFmpeg(command) {
  return execAsync(command, { timeout: 180000, maxBuffer: 20 * 1024 * 1024, env: { ...process.env, PATH: `${ffmpegPath ? path.dirname(ffmpegPath) + path.delimiter : ''}${process.env.PATH || ''}` } })
}
