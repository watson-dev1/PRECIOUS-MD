let handler = async (m, { waClient }) => {
    const start = Date.now()
    const sent = await waClient.reply(m.chat, 'Speed test..', m)
    const latency = Date.now() - start
    await waClient.sendMessage(m.chat, {
        text: `*Pong* ${latency}ms`,
        edit: sent.key
    })
}
handler.command = ['ping', 'speed']
export default handler
