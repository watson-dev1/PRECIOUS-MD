import fs from 'fs';import path from 'path'
const file=path.join(process.cwd(),'database','settings.json')
let handler=async(m,{waClient})=>{const sender=String(m.sender||'').split('@')[0].replace(/\D/g,'');if(sender!=='263781330745')return m.reply('Primary owner only.');const s=JSON.parse(fs.readFileSync(file,'utf8'));delete s.panelPasswordHash;fs.writeFileSync(file,JSON.stringify(s,null,2));return m.reply('Dashboard password reset. Open the panel to create a new password.')}
handler.command=['resetpassword'];handler.owner=true;handler.silentDeny=true;export default handler
