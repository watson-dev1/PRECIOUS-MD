import fs from 'node:fs'
import path from 'node:path'

const databaseFile = path.resolve('./data/database.json')
if (!global.db) {
  try { global.db = JSON.parse(fs.readFileSync(databaseFile, 'utf8')) }
  catch { global.db = { groups: {}, users: {} } }
}
global.db.groups ||= {}
global.db.users ||= {}

export function saveDB(db = global.db) {
  if (!db) return false
  fs.mkdirSync(path.dirname(databaseFile), { recursive: true })
  fs.writeFileSync(databaseFile, JSON.stringify(db, null, 2))
  return true
}
