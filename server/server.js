// Al Hara Cafeteria — Backend Server with PostgreSQL (Neon) & Local Fallback
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');

// Load .env (simple KEY=value lines)
try {
  fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').forEach(l => {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
} catch {}

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(ROOT, 'uploads');
const ADMIN_USER = process.env.ADMIN_USER || '';
const [SALT, HASH] = (process.env.ADMIN_PASSWORD_HASH || '').split(':');

try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch {}
const DB_FILE = path.join(DATA_DIR, 'data.json');

const PALETTE = ['#B9CBA8', '#DCE8D5', '#F5D6C6', '#F5E8B5', '#E8C4B8', '#CFE0E8'];
const DEFAULT_CONTENT = {
  heroTitle: 'Good Food. Good Mood.',
  heroText: 'Fresh plates, warm drinks and a calm corner to enjoy them. Welcome to Al Hara Cafeteria.',
  heroBtn1Text: 'Explore Our Menu', heroBtn1Link: '#menu', heroBtn2Text: 'Find Us', heroBtn2Link: '#contact',
  orderLink: '',
  aboutTitle: 'About Al Hara Cafeteria',
  aboutText: 'Write about your cafeteria here. Sign in to the admin panel and edit this text under "Website content".',
  phone: '', whatsapp: '', address: '', mapsLink: '', hours: '', instagram: '', facebook: '',
  announcement: 'Made fresh, served with love', announcementOn: true,
  logo: '', heroImage: '', aboutImage: '', accent: '#B9CBA8', accent2: '#F5D6C6'
};
const BOOL = ['announcementOn'], IMG = ['logo', 'heroImage', 'aboutImage'], COLOR = ['accent', 'accent2'];
const LINK = ['heroBtn1Link', 'heroBtn2Link', 'orderLink', 'mapsLink', 'instagram', 'facebook'];

// ---------- PostgreSQL (Neon) & Storage ----------
let pool = null;
if (process.env.DATABASE_URL) {
  try {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
  } catch (e) {
    console.error('Failed to load pg module:', e.message);
  }
}

let db = null;
let dbInitPromise = null;

async function getDb() {
  if (db) return db;
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      if (pool) {
        try {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS alhara_store (key TEXT PRIMARY KEY, data JSONB NOT NULL);
            CREATE TABLE IF NOT EXISTS alhara_uploads (name TEXT PRIMARY KEY, mime TEXT NOT NULL, data BYTEA NOT NULL);
            CREATE TABLE IF NOT EXISTS alhara_sessions (sid TEXT PRIMARY KEY, expires BIGINT NOT NULL);
          `);
          const res = await pool.query(`SELECT data FROM alhara_store WHERE key = 'cafeteria' LIMIT 1;`);
          if (res.rows.length && res.rows[0].data) {
            db = res.rows[0].data;
          } else {
            db = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8'));
            await pool.query(
              `INSERT INTO alhara_store (key, data) VALUES ('cafeteria', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data;`,
              [JSON.stringify(db)]
            );
          }
        } catch (err) {
          console.error('PostgreSQL connection error, falling back to local file storage:', err.message);
        }
      }
      if (!db) {
        try {
          db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        } catch {
          db = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8'));
          try { saveFs(); } catch {}
        }
      }
      db.content = { ...DEFAULT_CONTENT, ...db.content };
      return db;
    })();
  }
  return dbInitPromise;
}

function saveFs() {
  try {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    console.warn('Could not save to local filesystem:', err.message);
  }
}

async function save() {
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO alhara_store (key, data) VALUES ('cafeteria', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data;`,
        [JSON.stringify(db)]
      );
      return;
    } catch (err) {
      console.error('Error saving to PostgreSQL, falling back to local disk:', err.message);
    }
  }
  saveFs();
}

// ---------- helpers ----------
const str = (v, n) => String(v ?? '').trim().slice(0, n);
const cleanImg = v => /^(\/(uploads|images)\/[\w.-]+|data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+)$/.test(v || '') ? v : '';
const cleanLink = v => /^(https?:\/\/|#|\/|tel:|mailto:)/i.test(v || '') ? str(v, 500) : '';
const id = () => crypto.randomBytes(6).toString('hex');
function cleanContent(b) {
  const out = {};
  for (const k of Object.keys(DEFAULT_CONTENT)) {
    if (!(k in b)) continue;
    if (BOOL.includes(k)) out[k] = !!b[k];
    else if (IMG.includes(k)) out[k] = cleanImg(b[k]);
    else if (COLOR.includes(k)) { if (PALETTE.includes(b[k])) out[k] = b[k]; }
    else if (LINK.includes(k)) out[k] = cleanLink(b[k]);
    else out[k] = str(b[k], 2000);
  }
  return out;
}
const cleanItem = b => ({
  name: str(b.name, 80), desc: str(b.desc, 300), price: str(b.price, 20), category: str(b.category, 40) || 'Other',
  image: cleanImg(b.image), featured: !!b.featured, visible: b.visible !== false
});

const numOf = p => parseFloat(String(p || '').replace(/[^\d.]/g, '')) || 0;
const orderHits = new Map();

// ---------- CORS & responses ----------
const CORS_ORIGINS = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
function getCorsOrigin(req) {
  const o = (req?.headers?.origin || '').replace(/\/$/, '');
  if (!o) return '';
  if (CORS_ORIGINS.includes('*')) return o;
  if (CORS_ORIGINS.includes(o)) return o;
  try {
    if (req?.headers?.host && new URL(o).host === req.headers.host) return o;
  } catch {}
  return '';
}

const send = (res, code, obj, h = {}) => {
  const corsOrigin = getCorsOrigin(res.req);
  const corsHeaders = corsOrigin ? {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin'
  } : {};
  res.writeHead(code, { 'Content-Type': 'application/json', ...corsHeaders, ...h });
  res.end(JSON.stringify(obj));
};

const readBody = req => new Promise((ok, no) => {
  let n = 0; const b = [];
  req.on('data', c => { n += c.length; if (n > 9e6) { no(new Error('Too large')); req.destroy(); } else b.push(c); });
  req.on('end', () => { try { ok(b.length ? JSON.parse(Buffer.concat(b)) : {}); } catch (e) { no(new Error('Bad JSON')); } });
});

// ---------- sessions ----------
const inMemorySessions = new Map(), attempts = new Map();
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(a => a[0]));

async function authed(req) {
  const t = cookies(req).sid;
  if (!t) return null;
  const now = Date.now();
  if (pool) {
    try {
      const res = await pool.query('SELECT expires FROM alhara_sessions WHERE sid = $1 AND expires > $2 LIMIT 1;', [t, now]);
      if (res.rows.length) return t;
      await pool.query('DELETE FROM alhara_sessions WHERE sid = $1 OR expires <= $2;', [t, now]);
      return null;
    } catch (err) {
      console.warn('Session query error in DB:', err.message);
    }
  }
  const e = inMemorySessions.get(t);
  if (e && e > now) return t;
  inMemorySessions.delete(t);
  return null;
}

async function setSession(t, expires) {
  if (pool) {
    try {
      await pool.query('INSERT INTO alhara_sessions (sid, expires) VALUES ($1, $2) ON CONFLICT (sid) DO UPDATE SET expires = EXCLUDED.expires;', [t, expires]);
    } catch (err) {
      console.warn('Session store error in DB:', err.message);
    }
  }
  inMemorySessions.set(t, expires);
}

async function destroySession(req) {
  const t = cookies(req).sid;
  if (!t) return;
  if (pool) {
    try {
      await pool.query('DELETE FROM alhara_sessions WHERE sid = $1;', [t]);
    } catch {}
  }
  inMemorySessions.delete(t);
}

function checkPassword(pw) {
  if (!SALT || !HASH) return false;
  const a = crypto.scryptSync(String(pw), SALT, 32), b = Buffer.from(HASH, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const isSecure = process.env.COOKIE_SECURE === '1' || process.env.COOKIE_SECURE === 'true';
const sameSite = process.env.COOKIE_SAMESITE || (isSecure ? 'None' : 'Lax');

// ---------- API ----------
async function api(req, res, p) {
  const db = await getDb();
  const m = req.method;

  if (m !== 'GET') { // CSRF protection: allowed origin or same-origin
    const o = req.headers.origin;
    if (o && !getCorsOrigin(req)) return send(res, 403, { error: 'Forbidden' });
  }

  if (p === '/api/public' && m === 'GET') {
    return send(res, 200, {
      content: db.content,
      menu: db.menu.filter(i => i.visible),
      gallery: [...db.gallery].sort((a, b) => a.order - b.order)
    });
  }

  if (p === '/api/login' && m === 'POST') {
    const ip = req.socket.remoteAddress || req.headers['x-forwarded-for'] || 'client';
    const a = attempts.get(ip) || { n: 0, t: Date.now() };
    if (Date.now() - a.t > 15 * 6e4) { a.n = 0; a.t = Date.now(); }
    if (a.n >= 8) return send(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
    const b = await readBody(req);
    const ok = String(b.username) === ADMIN_USER && checkPassword(b.password);
    if (!ok) { a.n++; attempts.set(ip, a); return send(res, 401, { error: 'Wrong username or password' }); }
    attempts.delete(ip);
    const t = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 12 * 36e5;
    await setSession(t, expires);
    return send(res, 200, { ok: true }, {
      'Set-Cookie': `sid=${t}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=43200${isSecure ? '; Secure' : ''}`
    });
  }

  if (p === '/api/logout' && m === 'POST') {
    await destroySession(req);
    return send(res, 200, { ok: true }, {
      'Set-Cookie': `sid=; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=0${isSecure ? '; Secure' : ''}`
    });
  }

  if (p === '/api/orders' && m === 'POST') { // public: customers place orders
    const ip = req.socket.remoteAddress || req.headers['x-forwarded-for'] || 'client';
    const hits = (orderHits.get(ip) || []).filter(t => Date.now() - t < 6e5);
    if (hits.length >= 5) return send(res, 429, { error: 'Too many orders. Please wait a few minutes.' });
    const b = await readBody(req), name = str(b.name, 60), phone = str(b.phone, 25), note = str(b.note, 200);
    if (!name || !/^[\d+\-\s()]{6,25}$/.test(phone)) return send(res, 400, { error: 'Please enter your name and a valid phone number' });
    const lines = (Array.isArray(b.items) ? b.items : []).slice(0, 40).map(x => {
      const it = db.menu.find(i => i.id === String(x.id) && i.visible), q = Math.floor(Number(x.qty));
      return it && q >= 1 && q <= 50 ? { name: it.name, price: it.price, qty: q } : null;
    }).filter(Boolean);
    if (!lines.length) return send(res, 400, { error: 'Your cart is empty' });
    const sum = lines.reduce((a, l) => a + l.qty * numOf(l.price), 0), p0 = (db.menu.find(i => numOf(i.price)) || {}).price || '';
    const pre = (p0.match(/^[^\d]*/) || [''])[0], suf = (p0.match(/[^\d.,\s]+$/) || [''])[0];
    const total = sum ? pre + Math.round(sum * 100) / 100 + (suf && !pre ? ' ' + suf : '') : '';
    db.orderSeq = (db.orderSeq || 1000) + 1; db.orders = db.orders || [];
    db.orders.unshift({ id: id(), ref: db.orderSeq, time: new Date().toISOString(), name, phone, note, items: lines, total, status: 'new' });
    db.orders = db.orders.slice(0, 500); hits.push(Date.now()); orderHits.set(ip, hits);
    await save();
    return send(res, 200, { ok: true, ref: db.orderSeq, total });
  }

  if (!p.startsWith('/api/admin') && p !== '/api/me') return send(res, 404, { error: 'Not found' });
  if (!(await authed(req))) return send(res, 401, { error: 'Please sign in' });
  if (p === '/api/me') return send(res, 200, { ok: true });

  if (p === '/api/admin/data' && m === 'GET') return send(res, 200, { ...db, palette: PALETTE });
  if (p === '/api/admin/content' && m === 'PUT') {
    Object.assign(db.content, cleanContent(await readBody(req)));
    await save();
    return send(res, 200, db.content);
  }

  if (p === '/api/admin/upload' && m === 'POST') {
    const b = await readBody(req), mm = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(b.data || '');
    if (!mm) return send(res, 400, { error: 'Please choose a PNG, JPG, WebP or GIF image' });
    const buf = Buffer.from(mm[2], 'base64');
    if (buf.length > 6e6) return send(res, 400, { error: 'Image is too big (max 6 MB)' });
    const name = id() + id() + '.' + (mm[1] === 'jpeg' ? 'jpg' : mm[1]);

    if (pool) {
      try {
        await pool.query(
          'INSERT INTO alhara_uploads (name, mime, data) VALUES ($1, $2, $3) ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, mime = EXCLUDED.mime;',
          [name, 'image/' + (mm[1] === 'jpg' ? 'jpeg' : mm[1]), buf]
        );
        return send(res, 200, { url: '/uploads/' + name });
      } catch (err) {
        console.error('Error saving image to PostgreSQL:', err.message);
      }
    }

    try {
      fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
      return send(res, 200, { url: '/uploads/' + name });
    } catch {
      return send(res, 200, { url: b.data });
    }
  }

  let r;
  if (p === '/api/admin/menu' && m === 'POST') {
    const it = cleanItem(await readBody(req)); if (!it.name) return send(res, 400, { error: 'Name is required' });
    it.id = id(); db.menu.push(it); await save(); return send(res, 200, it);
  }
  if ((r = /^\/api\/admin\/menu\/(\w+)$/.exec(p))) {
    const i = db.menu.findIndex(x => x.id === r[1]); if (i < 0) return send(res, 404, { error: 'Not found' });
    if (m === 'DELETE') { db.menu.splice(i, 1); await save(); return send(res, 200, { ok: true }); }
    if (m === 'PUT') {
      const it = cleanItem(await readBody(req)); if (!it.name) return send(res, 400, { error: 'Name is required' });
      db.menu[i] = { ...it, id: r[1] }; await save(); return send(res, 200, db.menu[i]);
    }
  }
  if (p === '/api/admin/gallery' && m === 'POST') {
    const b = await readBody(req), image = cleanImg(b.image); if (!image) return send(res, 400, { error: 'Image required' });
    const g = { id: id(), image, caption: str(b.caption, 120), order: Math.max(0, ...db.gallery.map(x => x.order)) + 1 };
    db.gallery.push(g); await save(); return send(res, 200, g);
  }
  if ((r = /^\/api\/admin\/gallery\/(\w+)$/.exec(p))) {
    const i = db.gallery.findIndex(x => x.id === r[1]); if (i < 0) return send(res, 404, { error: 'Not found' });
    if (m === 'DELETE') { db.gallery.splice(i, 1); await save(); return send(res, 200, { ok: true }); }
    if (m === 'PUT') {
      const b = await readBody(req);
      db.gallery[i].caption = str(b.caption, 120); db.gallery[i].order = Number(b.order) || 0;
      await save(); return send(res, 200, db.gallery[i]);
    }
  }
  if ((r = /^\/api\/admin\/orders\/(\w+)$/.exec(p))) {
    db.orders = db.orders || []; const i = db.orders.findIndex(x => x.id === r[1]); if (i < 0) return send(res, 404, { error: 'Not found' });
    if (m === 'DELETE') { db.orders.splice(i, 1); await save(); return send(res, 200, { ok: true }); }
    if (m === 'PUT') {
      const b = await readBody(req); db.orders[i].status = b.status === 'done' ? 'done' : 'new';
      await save(); return send(res, 200, db.orders[i]);
    }
  }
  return send(res, 404, { error: 'Not found' });
}

// ---------- static files & uploads ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

async function serveUpload(req, res, rel) {
  const decoded = decodeURIComponent(rel || '');
  if (pool) {
    try {
      const row = await pool.query('SELECT mime, data FROM alhara_uploads WHERE name = $1 LIMIT 1;', [decoded]);
      if (row.rows.length) {
        res.writeHead(200, {
          'Content-Type': row.rows[0].mime,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=31536000, immutable'
        });
        return res.end(row.rows[0].data);
      }
    } catch (e) {
      console.error('Error fetching image from DB:', e.message);
    }
  }

  const f = path.join(UPLOAD_DIR, decoded);
  if (f.startsWith(UPLOAD_DIR) && fs.existsSync(f) && fs.statSync(f).isFile()) {
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*'
    });
    return fs.createReadStream(f).pipe(res);
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'File not found' }));
}

// ---------- Main Request Handler (Serverless & Standalone) ----------
const handler = async (req, res) => {
  try {
    const p = new URL(req.url, 'http://x').pathname;

    // Handle preflight CORS OPTIONS requests
    if (req.method === 'OPTIONS') {
      const corsOrigin = getCorsOrigin(req);
      if (corsOrigin) {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': corsOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Cookie',
          'Access-Control-Allow-Credentials': 'true',
          'Vary': 'Origin'
        });
        return res.end();
      }
    }

    if (p.startsWith('/api/')) return await api(req, res, p);
    if (p.startsWith('/uploads/')) return await serveUpload(req, res, p.slice(9));

    // Health/status endpoint for Vercel
    if (p === '/' || p === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        status: 'ok',
        service: 'Al Hara Cafeteria Backend API',
        database: pool ? 'PostgreSQL (Neon)' : 'local filesystem'
      }));
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (e) {
    if (!res.headersSent) send(res, 400, { error: e.message || 'Error' });
  }
};

// Start standalone HTTP server when executed directly via Node.js
if (require.main === module) {
  if (!ADMIN_USER || !SALT || !HASH) {
    console.warn('\nNotice: Admin login is not configured in .env. Generate a hash with: node server/hash.js "password"\n');
  }
  http.createServer(handler).listen(PORT, () => {
    console.log('Al Hara Cafeteria backend running on http://localhost:' + PORT);
  });
}

// Export for Vercel Serverless Functions
module.exports = handler;
