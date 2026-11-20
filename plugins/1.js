

import { promises } from "fs";
import { join } from "path";
import moment from "moment-timezone";
import os from "os";

const defaultMenu = {
  before: `
✨🌟 *WELCOME TO PRECIOUS-MD* 🌟✨

╭━━━⊱ 💫 *USER INFORMATION* 💫 ⊱━━━
│ 👤 *NAME:* _%name_
│ 🛡️ *MODE:* _%mode_
│ 📱 *PLATFORM:* _%platform_
│ 💻 *TYPE:* _NODEJS_
│ 🔑 *PREFIX:* _%_p_
│ ⏳ *UPTIME:* _%uptime_
│ 💾 *REGISTERED USERS:* _%totalreg_
╰━━━━━━━━━━━━━━━━━━

📢 *%ucpn*

╭━━━⊱ ⚙️ *BOT INFORMATION* ⚙️ ⊱━━━
│ 🤖 *BOT:* PRECIOUS-MD
│ 👑 *OWNER:* Watson Fourpence
│ ⚡ *COMMANDS:* _%totalfeatures_
╰━━━━━━━━━━━━━━━━━━
%readmore
`.trimStart(),

  header: "\n╭━━━⊱ 💠 *%CATEGORY* 💠 ⊱━━━",
  body: "│ ⬡▸ %CMD %isPremium %islimit",
  footer: "╰━━━━━━━━━━━━━━━━━━",
  after: `
 
╭━━━⊱ 👑 *PRECIOUS-MD* ⊱━━━
│ Created by Watson Fourpence
╰━━━━━━━━━━━━━━━━━━
`
};

let handler = async (m, { conn, usedPrefix: _p, __dirname }) => {
  try {
    await conn.sendMessage(m.chat, {
      react: {
        text: "✨",
        key: m.key
      }
    });

    // User database
    const glb = global.db?.data?.users || {};
    const user = glb[m.sender] || {};

    // User information
    const name = await conn.getName(m.sender).catch(() => "User");
    const tag = `@${m.sender.split("@")[0]}`;

    const mode = global.opts?.self ? "PRIVATE" : "PUBLIC";
    const platform = os.platform();

    const level = Number(user.level || 0);
    const exp = Number(user.exp || 0);
    const limit = Number(user.limit || 0);
    const role = user.role || "Newbie";
    const credit = user.credit || "Watson Fourpence";
    const age = user.age || "Not registered";

    const premium = Number(user.premiumTime || 0);
    const prems = premium > Date.now() ? "PREMIUM" : "FREE";

    // Basic XP placeholders; no levelling module required
    const min = 0;
    const xp = 100;
    const max = 100;

    // Runtime
    const uptime = clockString(process.uptime() * 1000);
    const muptime = uptime;

    // Greeting
    const ucpn = ucapan();

    // Plugins and commands
    const plugins = Object.values(global.plugins || {});

    const totalfeatures = plugins.filter(plugin =>
      plugin &&
      plugin.help &&
      plugin.tags &&
      !plugin.disabled
    ).length;

    const totalreg = Object.keys(glb).length;

    const help = plugins
      .filter(plugin => plugin && !plugin.disabled)
      .map(plugin => ({
        help: Array.isArray(plugin.help)
          ? plugin.help
          : plugin.help
            ? [plugin.help]
            : [],

        tags: Array.isArray(plugin.tags)
          ? plugin.tags
          : plugin.tags
            ? [plugin.tags]
            : [],

        prefix: "customPrefix" in plugin,
        limit: plugin.limit,
        premium: plugin.premium
      }));

    // Categories
    const tags = {};

    for (const plugin of help) {
      for (const category of plugin.tags) {
        if (category) tags[category] = category;
      }
    }

    // Menu configuration
    conn.menu = conn.menu || {};

    const before = conn.menu.before || defaultMenu.before;
    const header = conn.menu.header || defaultMenu.header;
    const body = conn.menu.body || defaultMenu.body;
    const footer = conn.menu.footer || defaultMenu.footer;
    const after = conn.menu.after || defaultMenu.after;

    // Build menu
    let text = [
      before,

      ...Object.keys(tags).sort().map(category => {
        return (
          header.replace(/%CATEGORY/g, category.toUpperCase()) +
          "\n" +
          [
            ...help
              .filter(menu =>
                menu.tags.includes(category) &&
                menu.help.length
              )
              .flatMap(menu =>
                menu.help.map(command => {
                  return body
                    .replace(
                      /%CMD/g,
                      menu.prefix
                        ? `*${command}*`
                        : `%_p${command}`
                    )
                    .replace(
                      /%islimit/g,
                      menu.limit ? "🅻" : ""
                    )
                    .replace(
                      /%isPremium/g,
                      menu.premium ? "🅿" : ""
                    )
                    .trim();
                })
              ),
            footer
          ].join("\n")
        );
      }),

      after
    ].join("\n");

    // Replace menu variables
    const replace = {
      "%": "%",
      p: _p,
      uptime,
      muptime,
      me: await conn.getName(conn.user.jid).catch(() => "PRECIOUS-MD"),
      exp: exp - min,
      maxexp: xp,
      totalexp: exp,
      xp4levelup: max - exp,
      tag,
      ucpn,
      platform,
      mode,
      _p,
      credit,
      age,
      name,
      prems,
      level,
      limit,
      totalreg,
      totalfeatures,
      role,
      readmore: readMore
    };

    text = text.replace(
      new RegExp(
        `%(${Object.keys(replace)
          .sort((a, b) => b.length - a.length)
          .join("|")})`,
        "g"
      ),
      (_, key) => String(replace[key] ?? "")
    );

    // Random menu image
    const images = Array.isArray(global.princeImg)
      ? global.princeImg.filter(Boolean)
      : [];

    const selectedImage = images.length
      ? pickRandom(images)
      : null;

    // Send menu
    if (selectedImage) {
      await conn.sendMessage(
        m.chat,
        {
          image: selectedImage,
          caption: text.trim(),
          mentions: [m.sender]
        },
        { quoted: m }
      );
    } else {
      await conn.sendMessage(
        m.chat,
        {
          text: text.trim(),
          mentions: [m.sender]
        },
        { quoted: m }
      );
    }

  } catch (error) {
    console.error("PRECIOUS-MD MENU ERROR:", error);

    await conn.reply(
      m.chat,
      "❌ An error occurred while loading the menu. Please try again.",
      m
    );
  }
};

handler.command = /^(menu4|h4|hh|help2)$/i;
handler.help = ["menu4"];
handler.tags = ["main"];

export default handler;

// Pick random image
function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Read more
const more = String.fromCharCode(8206);
const readMore = more.repeat(4001);

// Uptime formatter
function clockString(ms) {
  if (!Number.isFinite(ms)) ms = 0;

  const h = Math.floor(ms / 3600000);
  const m = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;

  return [h, "h", m, "m", s, "s"]
    .map(value => String(value).padStart(2, "0"))
    .join(" ");
}

// Zimbabwe greeting
function ucapan() {
  const time = Number(
    moment.tz("Africa/Harare").format("HH")
  );

  if (time >= 18) return "🌙 GOOD NIGHT 🌙😴";
  if (time >= 15) return "🌇 GOOD EVENING 🌇";
  if (time >= 10) return "🌞 GOOD AFTERNOON 🌞";

  return "☀️ GOOD MORNING ☀️";
}
