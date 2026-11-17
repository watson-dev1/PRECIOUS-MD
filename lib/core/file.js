import axios from 'axios'

export async function reactTo(sock, m, emoji) {
  if (!sock || !m?.key) return
  return sock.sendMessage(m.chat || m.key.remoteJid, { react: { text: String(emoji), key: m.key } })
}

export async function downloadBuffer(url, options = {}) {
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: options.timeout || 90000, maxContentLength: options.maxContentLength || 150 * 1024 * 1024 })
  return Buffer.from(response.data)
}
