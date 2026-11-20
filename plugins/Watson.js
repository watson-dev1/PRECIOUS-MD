import { plugins } from '../index.js'

import {
    sendButtons,
    quickReply,
    listButton
} from '../../lib/watson.js'

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const MENU_IMAGE = path.resolve(
    __dirname,
    '../../media/watson.jpg'
)

const BOT_NAME = 'PRECIOUS-MD'
const FOOTER = 'PRECIOUS-MD by watson-dev1'
const TEXT_LIMIT = 3500

const ICONS = {
    General: '🏠',
    Owner: '👑',
    Group: '👥',
    Download: '📥',
    Tools: '🧰',
    'AI & Tools': '🤖',
    Games: '🎮',
    Economy: '💰',
    Fun: '🎉',
    Search: '🔎',
    Other: '📦'
}

const icon = name => ICONS[name] || '✦'

function getPrefix() {
    return typeof global.prefix === 'string'
        ? global.prefix
        : '.'
}

function normalize(value) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase()
}

function formatUptime(seconds) {
    const total = Math.max(
        0,
        Math.floor(Number(seconds) || 0)
    )

    const days = Math.floor(total / 86400)
    const hours = Math.floor((total % 86400) / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const remaining = total % 60

    return [
        days ? `${days}d` : '',
        hours ? `${hours}h` : '',
        minutes ? `${minutes}m` : '',
        `${remaining}s`
    ].filter(Boolean).join(' ')
}

function collectCategories() {
    const categories = new Map()
    const seen = new Set()

    for (const plugin of plugins.values()) {
        if (!plugin || seen.has(plugin)) continue
        seen.add(plugin)

        if (
            plugin.silentDeny ||
            !plugin.command ||
            plugin.command instanceof RegExp
        ) {
            continue
        }

        const category =
            String(plugin.category || 'Other').trim() || 'Other'

        const commands = Array.isArray(plugin.command)
            ? plugin.command
            : [plugin.command]

        for (const command of commands) {
            if (
                typeof command !== 'string' &&
                typeof command !== 'number'
            ) {
                continue
            }

            const name = String(command).trim()
            if (!name) continue

            if (!categories.has(category)) {
                categories.set(category, new Set())
            }

            categories.get(category).add(name)
        }
    }

    return new Map(
        [...categories.entries()]
            .map(([name, commands]) => [
                name,
                [...commands].sort((a, b) =>
                    a.localeCompare(b)
                )
            ])
            .filter(([, commands]) => commands.length > 0)
            .sort(([a], [b]) => a.localeCompare(b))
    )
}

function splitText(text, limit = TEXT_LIMIT) {
    const chunks = []
    let current = ''

    for (const line of text.split('\n')) {
        if (line.length > limit) {
            if (current) {
                chunks.push(current)
                current = ''
            }

            for (let index = 0; index < line.length; index += limit) {
                chunks.push(line.slice(index, index + limit))
            }

            continue
        }

        const next = current ? `${current}\n${line}` : line

        if (next.length > limit) {
            chunks.push(current)
            current = line
        } else {
            current = next
        }
    }

    if (current) chunks.push(current)

    return chunks
}

async function replyLong(m, text) {
    let result

    for (const chunk of splitText(text)) {
        result = await m.reply(chunk)
    }

    return result
}

function categoryText(name, commands, prefix) {
    return (
        `╭─〔 ${icon(name)} *${name.toUpperCase()}* 〕\n` +
        `┃ Commands / aliases: ${commands.length}\n` +
        `┃\n` +
        commands.map(command =>
            `┃ ✦ ${prefix}${command}`
        ).join('\n') +
        `\n╰─────────────────`
    )
}

function categoryIndex(categories, prefix) {
    return [...categories.entries()]
        .map(([name, commands]) =>
            `${icon(name)} ${name} (${commands.length})\n` +
            `   ${prefix}menu ${name}`
        )
        .join('\n\n')
}

async function readMenuImage() {
    try {
        return await fs.promises.readFile(MENU_IMAGE)
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.warn(
                '[MENU] Image read failed:',
                error?.message || error
            )
        }

        return undefined
    }
}

const handler = async (m, { waClient, args = [] }) => {
    try {
        if (!waClient?.user?.id) {
            return await m.reply(
                'Bot is not fully connected yet.'
            )
        }

        const prefix = getPrefix()
        const categories = collectCategories()
        const names = [...categories.keys()]

        const total = new Set(
            [...categories.values()].flat()
        ).size

        if (!total) {
            return await m.reply(
                'No commands loaded. Check the console for plugin errors.'
            )
        }

        const wanted = normalize(
            Array.isArray(args)
                ? args.join(' ')
                : args
        )

        // .menu all
        if (wanted === 'all') {
            const header =
                `╭━━〔 *${BOT_NAME}* 〕━━╮\n` +
                `┃ Commands / aliases: ${total}\n` +
                `┃ Categories: ${names.length}\n` +
                `┃ Prefix: ${prefix || '(none)'}\n` +
                `╰━━━━━━━━━━━━━━━━━━╯`

            const sections = names.map(name =>
                categoryText(
                    name,
                    categories.get(name),
                    prefix
                )
            )

            return await replyLong(
                m,
                [
                    header,
                    ...sections,
                    `Main menu: ${prefix}menu`
                ].join('\n\n')
            )
        }

        // .menu <category>
        if (wanted) {
            let name = names.find(
                category => normalize(category) === wanted
            )

            if (!name) {
                const matches = names.filter(category =>
                    normalize(category).startsWith(wanted)
                )

                if (matches.length === 1) {
                    name = matches[0]
                } else if (matches.length > 1) {
                    return await replyLong(
                        m,
                        'More than one category matches:\n\n' +
                        matches.map(category =>
                            `• ${prefix}menu ${category}`
                        ).join('\n')
                    )
                }
            }

            if (!name) {
                return await replyLong(
                    m,
                    'Category not found.\n\n' +
                    categoryIndex(categories, prefix) +
                    `\n\nFull list: ${prefix}menu all`
                )
            }

            const commands = categories.get(name)
            const body = categoryText(name, commands, prefix)

            if (body.length > TEXT_LIMIT) {
                return await replyLong(
                    m,
                    `${body}\n\n` +
                    `Main menu: ${prefix}menu\n` +
                    `Full list: ${prefix}menu all`
                )
            }

            return await sendButtons(waClient, m, {
                title: `${icon(name)} ${name.toUpperCase()}`,
                footer: FOOTER,
                body,
                buttons: [
                    quickReply(
                        '⬅️ Main menu',
                        `${prefix}menu`
                    ),
                    quickReply(
                        '📜 Full list',
                        `${prefix}menu all`
                    )
                ]
            })
        }

        // .menu
        const displayName =
            String(m.pushName || 'User')
                .replace(/[*_`~\r\n]/g, '')
                .trim() || 'User'

        const body =
            `╭━━〔 *${BOT_NAME}* 〕━━╮\n` +
            `┃ 👤 ${displayName}\n` +
            `┃ ⚙️ Mode: ${global.botMode || 'public'}\n` +
            `┃ 🔣 Prefix: ${prefix || '(none)'}\n` +
            `┃ ⏱️ Uptime: ${formatUptime(process.uptime())}\n` +
            `┃ 📚 Commands / aliases: ${total}\n` +
            `┃ 📂 Categories: ${names.length}\n` +
            `╰━━━━━━━━━━━━━━━━━━╯\n\n` +
            `Tap Select category to browse.\n` +
            `Or type ${prefix}menu all for every command.`

        const image = await readMenuImage()

        return await sendButtons(waClient, m, {
            title: `${BOT_NAME} MENU`,
            footer: FOOTER,
            body,
            ...(image ? { image } : {}),
            buttons: [
                listButton('📂 Select category', [
                    {
                        title: 'Categories',
                        rows: names.map(name => ({
                            title: `${icon(name)} ${name}`,
                            description:
                                `${categories.get(name).length} commands`,
                            id: `${prefix}menu ${name}`
                        }))
                    }
                ]),
                quickReply(
                    '📜 Full list',
                    `${prefix}menu all`
                ),
                quickReply(
                    '🏓 Ping',
                    `${prefix}ping`
                ),
                quickReply(
                    '👑 Owner',
                    `${prefix}owner`
                ),
                quickReply(
                    '🟢 Alive',
                    `${prefix}alive`
                )
            ]
        })
    } catch (error) {
        console.error('[MENU] Handler failed:', error)

        return await m.reply(
            'The menu could not be generated. Check the bot console for the error.'
        )
    }
}

handler.command = ['x', 'helpx', 'commands']
handler.category = 'General'

export default handler
