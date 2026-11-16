let handler = async (m, { waClient }) => {
 const chats=Object.values(waClient.chats||{}).filter(c=>c?.id?.endsWith('@s.whatsapp.net'))
 const lines=chats.slice(0,80).map((c,i)=>`${i+1}. ${c.name||c.id.split('@')[0]} — ${c.id.split('@')[0]}`)
 return m.reply(`*Known private chats (${chats.length})*\n${lines.join('\n')||'No cached users.'}`)
}
handler.command=['listusers','users']; handler.owner=true; export default handler
