import fs from 'fs';import path from 'path'
const file=path.join(process.cwd(),'database','settings.json')
let handler=async(m,{args})=>{const s=JSON.parse(fs.readFileSync(file,'utf8'));const mode=String(args[0]||'').toLowerCase();if(!['on','off','dm','group','all','mention'].includes(mode))return m.reply(`AI mode: ${global.chatbotMode||'off'}. Use .ai on/off or .ai dm/group/all/mention`);s.chatbotMode=mode==='on'?'all':mode==='off'?'off':mode;fs.writeFileSync(file,JSON.stringify(s,null,2));global.chatbotMode=s.chatbotMode;return m.reply(`AI mode set to ${s.chatbotMode}.`)}
handler.command=['aipanel'];handler.owner=true;export default handler
