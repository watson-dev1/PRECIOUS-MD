import fs from 'fs';import path from 'path'
const file=path.join(process.cwd(),'database','owner.json')
let handler=async(m)=>{let list=[];try{list=JSON.parse(fs.readFileSync(file,'utf8'))}catch{};return m.reply(`*Owners*\n${list.map(x=>String(x).split('@')[0]).join('\n')||'No extra owners'}`)}
handler.command=['panelowners','sudo'];handler.owner=true;export default handler
