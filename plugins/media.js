import fs from 'fs';import path from 'path'
let handler=async(m)=>{const dir=path.join(process.cwd(),'database','temp');fs.mkdirSync(dir,{recursive:true});let count=0;for(const f of fs.readdirSync(dir)){fs.rmSync(path.join(dir,f),{recursive:true,force:true});count++}return m.reply(`Temporary media cache cleared (${count} entries).`)}
handler.command=['clearcache'];handler.owner=true;export default handler
