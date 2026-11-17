// ---------------------------------------------------------
// Fitur   : Appteka (cari, detail, dan download APK)
// Sumber  : appteka.store
// Skrep   : JH a.k.a DHIKA - FIONY BOT
//
// HARGAI WOY JANGAN DIHAPUS!
// Credits to all Fiony's Bot Admin.
// ---------------------------------------------------------
//
// Pakai:
//   .appteka <nama aplikasi>         cari aplikasi
//   .appteka detail <id/link>        detail aplikasi
//   .appteka dl <id/link>            download APK

import axios from 'axios'

async function JHAppteka(mode, target, optParams) {
  const baseRes = { status: true, author_skrep: 'JH a.k.a Dhika', kesayangan: 'Fiony Alveria♡', data: {} };

  const pick = (...vals) => {
    for (let i = 0; i < vals.length; i++) {
      const v = vals[i];
      if (v !== undefined ? (v !== null ? (v !== '' ? true : (v === 0 ? true : (v === false ? true : false))) : false) : false) return v;
    }
    return '';
  };

  const BASE = 'https://appteka.store';
  const idRegex = /^[0-9a-f]{3}r\d+$/i;

  const jantung = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'sec-ch-ua': '"Chromium";v="147", "Not.A/Brand";v="8"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  };

  const parseId = (t) => {
    if (idRegex.test(t)) return t.toLowerCase();
    const m = String(t).match(/\/apps?\/([0-9a-f]{3}r\d+)/i);
    if (m !== null) return m[1].toLowerCase();
    throw new Error(`Bukan app_id/URL Appteka yang valid: ${t}`);
  };

  const humanSize = (b) => {
    if (Number.isFinite(b) === false) return null;
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let byteV = b;
    while (byteV >= 1024 ? (i < u.length - 1 ? true : false) : false) {
      byteV /= 1024;
      i++;
    }
    return `${byteV.toFixed(i > 0 ? 2 : 0)} ${u[i]}`;
  };

  const unescapeHtml = (s) => {
    return s !== undefined ? (s !== null ? String(s).replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : '') : '';
  };

  const readRSC = (html) => {
    const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
    let m, out = '';
    while ((m = re.exec(html)) !== null) {
      try { out += JSON.parse('"' + m[1] + '"'); } catch(e) {}
    }
    return out;
  };

  const matchObject = (buf, start) => {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < buf.length; i++) {
      const c = buf[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') {
        inStr = true;
      } else if (c === '{') {
        depth++;
      } else if (c === '}') {
        depth--;
        if (depth === 0) return buf.substring(start, i + 1);
      }
    }
    return null;
  };

  const stripSvg = (x) => {
    if (Array.isArray(x)) {
      const arr = [];
      for (let i = 0; i < x.length; i++) arr.push(stripSvg(x[i]));
      return arr;
    }
    if (typeof x === 'object' ? (x !== null ? true : false) : false) {
      const o = {};
      const keys = Object.keys(x);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const v = x[k];
        if (typeof v === 'string' ? v.substring(0, 4) === '<svg' : false) continue;
        o[k] = stripSvg(v);
      }
      return o;
    }
    return x;
  };

  const normalizeApp = (o) => {
    const cat = o.category ? o.category.name : null;
    let finalCat = null;
    if (cat !== null) {
      finalCat = cat.en ? cat.en : Object.values(cat)[0];
    }

    let aInfo = null;
    if (o.author !== undefined ? (o.author !== null ? true : false) : false) {
      aInfo = { id: pick(o.author.id, ''), name: pick(o.author.name, ''), url: pick(o.author.url, '') };
    }

    return {
      id: pick(o.app_id, ''),
      title: pick(o.label, ''),
      package: pick(o.package, ''),
      version: pick(o.ver_name, ''),
      version_code: pick(o.ver_code, ''),
      size_bytes: pick(o.size, 0),
      size: humanSize(pick(o.size, 0)),
      downloads: pick(o.downloads, 0),
      rating: pick(o.rating, 0),
      category: finalCat,
      author: aInfo,
      abi: o.abi ? o.abi : [],
      exclusive: o.exclusive ? true : false,
      source_url: pick(o.source_url, null),
      updated_at: pick(o.time, 0) > 0 ? new Date(o.time * 1000).toISOString() : null,
      icon: pick(o.icon, null),
      detail_url: `${BASE}/app/${pick(o.app_id, '')}`,
      download_page: `${BASE}/apps/${pick(o.app_id, '')}/download`
    };
  };

  const parseSearch = (html) => {
    const buf = readRSC(html);
    const seen = [];
    const items = [];
    const re = /\{"app_id":"/g;
    let m;
    while ((m = re.exec(buf)) !== null) {
      const s = matchObject(buf, m.index);
      if (s === null) continue;
      try {
        const o = JSON.parse(s);
        const oId = pick(o.app_id, '');
        if (oId !== '') {
          let hasS = false;
          for (let z = 0; z < seen.length; z++) { if (seen[z] === oId) hasS = true; }
          if (hasS === false) { seen.push(oId); items.push(normalizeApp(o)); }
        }
      } catch(e) {}
    }
    if (items.length > 0) return items;

    const cardsHtml = html.match(/<a data-feed-item="([^"]+)"[^>]*>(.*?)<\/a>/gs);
    const cards = cardsHtml !== null ? cardsHtml : [];
    const fbItems = [];
    for (let i = 0; i < cards.length; i++) {
      const cardStr = cards[i];
      const mMatch = cardStr.match(/<a data-feed-item="([^"]+)"[^>]*>(.*?)<\/a>/s);
      if (mMatch !== null) {
        const id = mMatch[1];
        const inner = mMatch[2];
        const nMatch = inner.match(/font-semibold tracking-tight">(.*?)<\/div>/s);
        const cMatch = inner.match(/text-muted-foreground">([^<]*)<\/div><div class="mt-0\.5/);
        const sMatch = inner.match(/<span>([\d.,]+ [KMG]B)<\/span>/);
        const iMatch = inner.match(/<img src="([^"]+)"/);

        fbItems.push({
          id: id,
          title: nMatch !== null ? unescapeHtml(nMatch[1]) : null,
          category: cMatch !== null ? unescapeHtml(cMatch[1]) : null,
          size: sMatch !== null ? sMatch[1] : null,
          icon: iMatch !== null ? unescapeHtml(iMatch[1]) : null,
          detail_url: `${BASE}/app/${id}`,
          download_page: `${BASE}/apps/${id}/download`
        });
      }
    }
    return fbItems;
  };

  const findAppObject = (buf, id) => {
    const marker = `"app_id":"${id}"`;
    let from = 0, best = null;
    let lpRun = true;
    while (lpRun) {
      const idx = buf.indexOf(marker, from);
      if (idx < 0) { lpRun = false; break; }
      from = idx + marker.length;
      let tries = 0;
      for (let i = idx; i >= 0 ? (tries < 400 ? true : false) : false; i--) {
        if (buf[i] !== '{') continue;
        tries++;
        const s = matchObject(buf, i);
        if (s === null ? true : (i + s.length <= idx)) continue;
        try {
          const o = JSON.parse(s);
          if (pick(o.app_id, '') === id ? (Object.keys(o).length >= 6 ? true : false) : false) {
            if (best === null ? true : (Object.keys(o).length > Object.keys(best).length)) best = o;
            break;
          }
        } catch(e) {}
      }
    }
    return best;
  };

  const parseMeta = (html) => {
    const pck = (re) => {
      const m = html.match(re);
      return m !== null ? unescapeHtml(m[1]) : null;
    };
    return {
      title: pck(/<title>(.*?)<\/title>/s),
      description: pck(/<meta name="description" content="([^"]*)"/),
      canonical: pck(/<link rel="canonical" href="([^"]*)"/),
      og_image: pck(/<meta property="og:image" content="([^"]*)"/)
    };
  };

  const parseDetail = (html, id) => {
    const buf = readRSC(html);
    const obj = findAppObject(buf, id);
    const meta = parseMeta(html);
    if (obj === null) return { app: null, raw: null, meta: meta };

    const app = normalizeApp(obj);
    const mDesc = pick(meta.description, '');
    let catM = null;
    if (mDesc !== '') {
      const mt = mDesc.match(/Category:\s*(.+?)\.\s*Size:/);
      if (mt !== null) catM = mt[1].trim();
    }

    if (pick(app.category, null) === null ? (catM !== null ? true : false) : false) {
      app.category = catM;
    }
    delete app.rating;

    app.sha1 = pick(obj.sha1, null);
    app.min_android = pick(obj.android, null);
    app.min_sdk = pick(obj.sdk_version, null);
    app.permissions = obj.permissions ? obj.permissions : [];

    const langRes = [];
    const rLangs = obj.languages ? obj.languages : [];
    for (let i = 0; i < rLangs.length; i++) {
      langRes.push({ code: pick(rLangs[i].code, ''), name: pick(rLangs[i].name, '') });
    }
    app.languages = langRes;

    app.favorites = pick(obj.favorites, 0);
    app.last_downloaded_at = pick(obj.download_time, 0) > 0 ? new Date(obj.download_time * 1000).toISOString() : null;

    return { app: app, raw: stripSvg(obj), meta: meta };
  };

  const parseDownloadLink = (html) => {
    const m = html.match(/href="((?:https?:\/\/[^"\/]+)?\/download\/\d+\/[^"]+)"/);
    if (m === null) return null;
    const url = new URL(unescapeHtml(m[1]), BASE);
    const e = Number(url.searchParams.get('e'));

    let baseN = url.pathname.split('/');
    let nRaw = decodeURIComponent(baseN[baseN.length - 1]);
    let fName = nRaw.replace(/[\\/:*?"<>]/g, '_');
    const bSplits = fName.split(String.fromCharCode(124));
    fName = bSplits.join('_');

    return {
      url: url.href,
      filename: fName,
      expires_at: e > 0 ? new Date(e * 1000).toISOString() : null
    };
  };

  try {
    const cleanMode = pick(mode, '').toLowerCase();
    const cleanTarget = pick(target, '');

    if (cleanMode === '') throw new Error('Mode tidak boleh kosong (search, detail, download)');
    if (cleanTarget === '') throw new Error('Target (query/url/id) tidak boleh kosong');

    if (cleanMode === 'search') {
      const encQ = encodeURIComponent(cleanTarget).replace(/%20/g, '+');
      const reqHead = {};
      const keys = Object.keys(jantung);
      for (let i = 0; i < keys.length; i++) reqHead[keys[i]] = jantung[keys[i]];
      reqHead['Referer'] = `${BASE}/apps`;
      reqHead['Sec-Fetch-Site'] = 'same-origin';

      const { data: sData, status: sStat } = await axios.get(`${BASE}/search?q=${encQ}`, { headers: reqHead, validateStatus: () => true, timeout: 30000 });
      if (sStat !== 200) throw new Error(`Search API HTTP ${sStat}`);

      const results = parseSearch(sData);
      baseRes.data.mode = 'search';
      baseRes.data.query = cleanTarget;
      baseRes.data.count = results.length;
      baseRes.data.results = results;

    } else if (cleanMode === 'detail') {
      const id = parseId(cleanTarget);
      const reqHead = {};
      const keys = Object.keys(jantung);
      for (let i = 0; i < keys.length; i++) reqHead[keys[i]] = jantung[keys[i]];
      reqHead['Referer'] = `${BASE}/apps`;
      reqHead['Sec-Fetch-Site'] = 'same-origin';

      const { data: dData, status: dStat } = await axios.get(`${BASE}/app/${id}`, { headers: reqHead, validateStatus: () => true, timeout: 30000 });
      if (dStat !== 200) throw new Error(`Detail API HTTP ${dStat}`);

      const d = parseDetail(dData, id);
      if (d.app === null ? (d.meta.title === null ? true : false) : false) throw new Error('Halaman detail tidak bisa di-parse');

      baseRes.data.mode = 'detail';
      baseRes.data.id = id;
      const dKeys = Object.keys(d);
      for (let i = 0; i < dKeys.length; i++) baseRes.data[dKeys[i]] = d[dKeys[i]];

    } else if (cleanMode === 'download') {
      const id = parseId(cleanTarget);
      const reqHead = {};
      const keys = Object.keys(jantung);
      for (let i = 0; i < keys.length; i++) reqHead[keys[i]] = jantung[keys[i]];
      reqHead['Referer'] = `${BASE}/app/${id}`;
      reqHead['Sec-Fetch-Site'] = 'same-origin';

      const { data: dlData, status: dlStat } = await axios.get(`${BASE}/apps/${id}/download`, { headers: reqHead, validateStatus: () => true, timeout: 30000 });
      if (dlStat !== 200) throw new Error(`Download API HTTP ${dlStat}`);

      const link = parseDownloadLink(dlData);
      if (link === null) throw new Error('Link APK tidak ditemukan di halaman download');

      baseRes.data.mode = 'download';
      baseRes.data.id = id;
      const lKeys = Object.keys(link);
      for (let i = 0; i < lKeys.length; i++) baseRes.data[lKeys[i]] = link[lKeys[i]];

    } else {
      throw new Error(`Mode tidak dikenal: ${cleanMode} (pakai: search, detail, download)`);
    }

    return JSON.stringify(baseRes, null, 2);

  } catch (error) {
    baseRes.status = false;
    baseRes.error = pick(error.message, 'Unknown Error');
    return JSON.stringify(baseRes, null, 2);
  }
}

// ───────── handler ─────────

const MODES = {
  cari: 'search', search: 'search',
  detail: 'detail', info: 'detail',
  dl: 'download', download: 'download'
}

const MAX_SEND_MB = 150
const ID_OR_LINK = /^([0-9a-f]{3}r\d+|https?:\/\/appteka\.store\/\S+)$/i

const fmtDate = (iso) => {
  if (!iso) return '-'
  const d = new Date(iso)
  return isNaN(d) ? '-' : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

let handler = async (m, { sock, text, reply, prefix }) => {
  const p = prefix || '.'
  const input = String(text || m.quoted?.text || '').trim()

  if (!input) {
    return reply(
      `*APPTEKA*\n\n` +
      `Cari aplikasi : ${p}appteka <nama aplikasi>\n` +
      `Detail        : ${p}appteka detail <id/link>\n` +
      `Download APK  : ${p}appteka dl <id/link>\n\n` +
      `Contoh:\n${p}appteka subway surf\n${p}appteka dl ee8r335328`
    )
  }

  const words = input.split(/\s+/)
  let mode = MODES[words[0].toLowerCase()]
  const rest = mode ? words.slice(1) : words
  if (!mode) mode = 'search'

  // satu id/link tanpa kata kunci mode dianggap detail
  if (!MODES[words[0].toLowerCase()] && words.length === 1 && ID_OR_LINK.test(words[0])) mode = 'detail'

  const target = rest.join(' ').trim()
  if (!target) return reply(`Tulis target-nya. Contoh: ${p}appteka ${mode === 'download' ? 'dl' : mode} ee8r335328`)

  try {
    await reply('Memproses, tunggu sebentar...')
    const res = JSON.parse(await JHAppteka(mode, target))
    if (!res.status) return reply(`Gagal: ${res.error}`)
    const d = res.data

    // ── cari ──
    if (mode === 'search') {
      const list = (d.results || []).slice(0, 10)
      if (!list.length) return reply(`Aplikasi "${d.query}" tidak ditemukan.`)
      const lines = list.map((a, i) => {
        const meta = [a.version && `v${a.version}`, a.size, a.category].filter(Boolean).join(' | ')
        return `${i + 1}. *${a.title || a.id}*${meta ? `\n   ${meta}` : ''}\n   id: ${a.id}`
      })
      return reply(
        `*HASIL: ${d.query}*\nDitemukan ${d.count} aplikasi\n\n${lines.join('\n\n')}\n\n` +
        `Detail: ${p}appteka detail <id>\nDownload: ${p}appteka dl <id>`
      )
    }

    // ── detail ──
    if (mode === 'detail') {
      const a = d.app
      if (!a) return reply(`Gagal membaca detail.${d.meta?.description ? `\n${d.meta.description}` : ''}`)
      const caption =
        `*${a.title}*\n\n` +
        `Package  : ${a.package || '-'}\n` +
        `Versi    : ${a.version || '-'} (${a.version_code || '-'})\n` +
        `Ukuran   : ${a.size || '-'}\n` +
        `Kategori : ${a.category || '-'}\n` +
        `Unduhan  : ${Number(a.downloads || 0).toLocaleString('id-ID')}\n` +
        `Developer: ${a.author?.name || '-'}\n` +
        `Android  : ${a.min_android || '-'} (SDK ${a.min_sdk || '-'})\n` +
        `ABI      : ${(a.abi || []).join(', ') || '-'}\n` +
        `Update   : ${fmtDate(a.updated_at)}\n` +
        `SHA1     : ${a.sha1 || '-'}\n\n` +
        `Link: ${a.detail_url}\n` +
        `Download: ${p}appteka dl ${a.id}`
      const icon = a.icon || d.meta?.og_image
      if (icon) {
        return sock.sendMessage(m.chat, { image: { url: icon }, caption }, { quoted: m }).catch(() => reply(caption))
      }
      return reply(caption)
    }

    // ── download ──
    if (mode === 'download') {
      const caption =
        `*APPTEKA DOWNLOAD*\n\n` +
        `File    : ${d.filename}\n` +
        `Berlaku sampai: ${d.expires_at ? new Date(d.expires_at).toLocaleString('id-ID') : '-'}\n\n` +
        `Link:\n${d.url}`

      await reply(caption)
      return sock.sendMessage(m.chat, {
        document: { url: d.url },
        fileName: /\.apk$/i.test(d.filename) ? d.filename : `${d.filename}.apk`,
        mimetype: 'application/vnd.android.package-archive'
      }, { quoted: m }).catch(() => reply(`File tidak bisa dikirim lewat chat (batas ${MAX_SEND_MB} MB atau link bermasalah). Unduh manual lewat link di atas.`))
    }
  } catch (e) {
    return reply(`Gagal: ${e.message || e}`)
  }
}

handler.command = ['appteka']
handler.help = ['appteka <nama | detail | dl>']
handler.tags = ['download']
handler.limit = true

export default handler
