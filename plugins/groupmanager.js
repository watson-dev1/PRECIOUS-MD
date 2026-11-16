let handler = async (m, { waClient, args }) => {
 const action=String(args[0]||'list').toLowerCase()
 if(action==='leave' && args[1]) { await waClient.groupLeave(args[1]); return m.reply('Left group.') }
 const groups=Object.values(await waClient.groupFetchAllParticipating()).map(g=>`${g.subject||'Unnamed'}\n${g.id} · ${g.participants?.length||0} members`)
 return m.reply(`*Groups (${groups.length})*\n\n${groups.join('\n\n')||'No groups.'}`)
}
handler.command=['groupmanager','grouplist']; handler.owner=true; export default handler
