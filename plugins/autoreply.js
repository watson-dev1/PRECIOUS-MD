import fs from 'fs'; import path from 'path'
const file=path.join(process.cwd(),'database','settings.json')
let handler=async(m,{args})=>{const s=JSON.parse(fs.readFileSync(file,'utf8'));const mode=String(args[0]||'').toLowerCase();if(!['on','off'].includes(mode))return m.reply(`Offline reply is ${s.offlineReplyEnabled?'ON':'OFF'}. Use .autoreply on/off`);s.offlineReplyEnabled=mode==='on';fs.writeFileSync(file,JSON.stringify(s,null,2));return m.reply(`Offline reply ${mode}.`)}
handler.command=['autoreply'];handler.owner=true;export default handler
