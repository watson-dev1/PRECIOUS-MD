import fs from 'fs'; import path from 'path'
const file=path.join(process.cwd(),'database','settings.json')
let handler=async(m,{args})=>{const s=JSON.parse(fs.readFileSync(file,'utf8'));const mode=String(args[0]||'').toLowerCase();if(!['on','off'].includes(mode))return m.reply(`Welcome is ${s.welcomeEnabled?'ON':'OFF'}. Use .welcome on/off`);s.welcomeEnabled=mode==='on';fs.writeFileSync(file,JSON.stringify(s,null,2));return m.reply(`Panel welcome ${mode}.`)}
handler.command=['panelwelcome'];handler.owner=true;export default handler
