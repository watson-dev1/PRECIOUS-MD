let handler = async (m, { waClient }) => {
    await waClient.groupLeave(m.chat)
}

handler.command = ['left', 'leavegroup']
handler.group = true
handler.owner = true

export default handler
