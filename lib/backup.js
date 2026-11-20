import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const DB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'database')

/** Bundle every database/*.json file into one JSON document. The WhatsApp session is NOT included. */
export function buildBackup() {
    const files = {}
    try {
        for (const name of fs.readdirSync(DB_DIR)) {
            if (!name.endsWith('.json')) continue
            try { files[name] = JSON.parse(fs.readFileSync(path.join(DB_DIR, name), 'utf8')) } catch {}
        }
    } catch {}
    const payload = { bot: global.botName || 'PRECIOUS-MD', createdAt: new Date().toISOString(), files }
    return { buffer: Buffer.from(JSON.stringify(payload, null, 2)), count: Object.keys(files).length }
}

export function restoreBackup(buffer) {
    const payload = JSON.parse(Buffer.from(buffer).toString('utf8'))
    if (!payload?.files || typeof payload.files !== 'object') throw new Error('Not a valid backup file.')
    fs.mkdirSync(DB_DIR, { recursive: true })
    let restored = 0
    for (const [name, data] of Object.entries(payload.files)) {
        if (!/^[\w.-]+\.json$/.test(name) || name.includes('..')) continue
        fs.writeFileSync(path.join(DB_DIR, name), JSON.stringify(data, null, 2))
        restored++
    }
    return restored
}
