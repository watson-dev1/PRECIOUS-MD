let handler = async (m, { waClient, args }) => {
 const text = args.join(' ').trim(); if (!text) return m.reply('Usage: .broadcast <message>')
 const chats = Object.values(waClient.chats || {}).filter(c => c?.id && (c.id.endsWith('@g.us') || c.id.endsWith('@s.whatsapp.net')))
 let sent=0, failed=0; for (const chat of chats) { try { await waClient.sendMessage(chat.id,{text}); sent++ } catch { failed++ } }
 return m.reply(`Broadcast finished. Sent: ${sent} | Failed: ${failed}`)
}
handler.command=['broadcast']; handler.owner=true; handler.silentDeny=true; export default handler
