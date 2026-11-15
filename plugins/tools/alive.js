let handler = async (m) => {
    const uptime = Math.floor(process.uptime())
    const days = Math.floor(uptime / 86400)
    const hours = Math.floor((uptime % 86400) / 3600)
    const minutes = Math.floor((uptime % 3600) / 60)
    const seconds = uptime % 60
    await m.reply(`*PRECIOUS-MD is online* ✅\n\nOwner: watson-dev1\nMode: ${global.botMode || 'public'}\nUptime: ${days}d ${hours}h ${minutes}m ${seconds}s\n\nPRECIOUS-MD by watson-dev1`)
}
handler.command = ['alive']
handler.category = 'General'
export default handler
