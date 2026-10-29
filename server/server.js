// Al Hara Cafeteria — tiny zero-dependency backend server (Node built-ins only).
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
if (!ADMIN_USER || !SALT || !HASH) {
  console.error('\nAdmin login is not configured.\n1) node server/hash.js "your-password"\n2) put ADMIN_USER and ADMIN_PASSWORD_HASH in .env (see .env.example)\n');
  process.exit(1);
}
fs.mkdirSync(DATA_DIR, { recursive: true }); fs.mkdirSync(UPLOAD_DIR, { recursive: true });
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

let db;
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch {
  db = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8'));
  save();
}
db.content = { ...DEFAULT_CONTENT, ...db.content };
function save() { // atomic write so a crash can't corrupt the file
  const tmp = DB_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db, null, 2)); fs.renameSync(tmp, DB_FILE);
}

// ---------- helpers ----------
const str = (v, n) => String(v ?? '').trim().slice(0, n);
const cleanImg = v => /^\/(uploads|images)\/[\w.-]+$/.test(v || '') ? v : '';
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
const cleanItem = b => ({ name: str(b.name, 80), desc: str(b.desc, 300), price: str(b.price, 20), category: str(b.category, 40) || 'Other',
  image: cleanImg(b.image), featured: !!b.featured, visible: b.visible !== false });

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
    if (new URL(o).host === req.headers.host) return o;
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
const sessions = new Map(), attempts = new Map();
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(a => a[0]));
const authed = req => { const t = cookies(req).sid, e = sessions.get(t); if (e && e > Date.now()) return t; sessions.delete(t); return null; };
function checkPassword(pw) {
  const a = crypto.scryptSync(String(pw), SALT, 32), b = Buffer.from(HASH, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const isSecure = process.env.COOKIE_SECURE === '1' || process.env.COOKIE_SECURE === 'true';
const sameSite = process.env.COOKIE_SAMESITE || (isSecure ? 'None' : 'Lax');

// ---------- API ----------
async function api(req, res, p) {
  const m = req.method;
  if (m !== 'GET') { // CSRF protection: allowed origin or same-origin
    const o = req.headers.origin;
    if (o && !getCorsOrigin(req)) return send(res, 403, { error: 'Forbidden' });
  }
  if (p === '/api/public' && m === 'GET') {
    return send(res, 200, { content: db.content, menu: db.menu.filter(i => i.visible),
      gallery: [...db.gallery].sort((a, b) => a.order - b.order) });
  }
  if (p === '/api/login' && m === 'POST') {
    const ip = req.socket.remoteAddress, a = attempts.get(ip) || { n: 0, t: Date.now() };
    if (Date.now() - a.t > 15 * 6e4) { a.n = 0; a.t = Date.now(); }
    if (a.n >= 8) return send(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
    const b = await readBody(req);
    const ok = String(b.username) === ADMIN_USER && checkPassword(b.password);
    if (!ok) { a.n++; attempts.set(ip, a); return send(res, 401, { error: 'Wrong username or password' }); }
    attempts.delete(ip);
    const t = crypto.randomBytes(32).toString('hex'); sessions.set(t, Date.now() + 12 * 36e5);
    return send(res, 200, { ok: true }, { 'Set-Cookie': `sid=${t}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=43200${isSecure ? '; Secure' : ''}` });
  }
  if (p === '/api/logout' && m === 'POST') {
    sessions.delete(cookies(req).sid);
    return send(res, 200, { ok: true }, { 'Set-Cookie': `sid=; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=0${isSecure ? '; Secure' : ''}` });
  }
  if (p === '/api/orders' && m === 'POST') { // public: customers place orders
    const ip = req.socket.remoteAddress, hits = (orderHits.get(ip) || []).filter(t => Date.now() - t < 6e5);
    if (hits.length >= 5) return send(res, 429, { error: 'Too many orders. Please wait a few minutes.' });
    const b = await readBody(req), name = str(b.name, 60), phone = str(b.phone, 25), note = str(b.note, 200);
    if (!name || !/^[\d+\-\s()]{6,25}$/.test(phone)) return send(res, 400, { error: 'Please enter your name and a valid phone number' });
    const lines = (Array.isArray(b.items) ? b.items : []).slice(0, 40).map(x => {
      const it = db.menu.find(i => i.id === String(x.id) && i.visible), q = Math.floor(Number(x.qty));
      return it && q >= 1 && q <= 50 ? { name: it.name, price: it.price, qty: q } : null; }).filter(Boolean);
    if (!lines.length) return send(res, 400, { error: 'Your cart is empty' });
    const sum = lines.reduce((a, l) => a + l.qty * numOf(l.price), 0), p0 = (db.menu.find(i => numOf(i.price)) || {}).price || '';
    const pre = (p0.match(/^[^\d]*/) || [''])[0], suf = (p0.match(/[^\d.,\s]+$/) || [''])[0];
    const total = sum ? pre + Math.round(sum * 100) / 100 + (suf && !pre ? ' ' + suf : '') : '';
    db.orderSeq = (db.orderSeq || 1000) + 1; db.orders = db.orders || [];
    db.orders.unshift({ id: id(), ref: db.orderSeq, time: new Date().toISOString(), name, phone, note, items: lines, total, status: 'new' });
    db.orders = db.orders.slice(0, 500); hits.push(Date.now()); orderHits.set(ip, hits); save();
    return send(res, 200, { ok: true, ref: db.orderSeq, total });
  }
  if (!p.startsWith('/api/admin') && p !== '/api/me') return send(res, 404, { error: 'Not found' });
  if (!authed(req)) return send(res, 401, { error: 'Please sign in' });
  if (p === '/api/me') return send(res, 200, { ok: true });

  if (p === '/api/admin/data' && m === 'GET') return send(res, 200, { ...db, palette: PALETTE });
  if (p === '/api/admin/content' && m === 'PUT') { Object.assign(db.content, cleanContent(await readBody(req))); save(); return send(res, 200, db.content); }

  if (p === '/api/admin/upload' && m === 'POST') {
    const b = await readBody(req), mm = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(b.data || '');
    if (!mm) return send(res, 400, { error: 'Please choose a PNG, JPG, WebP or GIF image' });
    const buf = Buffer.from(mm[2], 'base64'); if (buf.length > 6e6) return send(res, 400, { error: 'Image is too big (max 6 MB)' });
    const name = id() + id() + '.' + (mm[1] === 'jpeg' ? 'jpg' : mm[1]);
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buf); return send(res, 200, { url: '/uploads/' + name });
  }

  let r;
  if (p === '/api/admin/menu' && m === 'POST') {
    const it = cleanItem(await readBody(req)); if (!it.name) return send(res, 400, { error: 'Name is required' });
    it.id = id(); db.menu.push(it); save(); return send(res, 200, it);
  }
  if ((r = /^\/api\/admin\/menu\/(\w+)$/.exec(p))) {
    const i = db.menu.findIndex(x => x.id === r[1]); if (i < 0) return send(res, 404, { error: 'Not found' });
    if (m === 'DELETE') { db.menu.splice(i, 1); save(); return send(res, 200, { ok: true }); }
    if (m === 'PUT') { const it = cleanItem(await readBody(req)); if (!it.name) return send(res, 400, { error: 'Name is required' });
      db.menu[i] = { ...it, id: r[1] }; save(); return send(res, 200, db.menu[i]); }
  }
  if (p === '/api/admin/gallery' && m === 'POST') {
    const b = await readBody(req), image = cleanImg(b.image); if (!image) return send(res, 400, { error: 'Image required' });
    const g = { id: id(), image, caption: str(b.caption, 120), order: Math.max(0, ...db.gallery.map(x => x.order)) + 1 };
    db.gallery.push(g); save(); return send(res, 200, g);
  }
  if ((r = /^\/api\/admin\/gallery\/(\w+)$/.exec(p))) {
    const i = db.gallery.findIndex(x => x.id === r[1]); if (i < 0) return send(res, 404, { error: 'Not found' });
    if (m === 'DELETE') { db.gallery.splice(i, 1); save(); return send(res, 200, { ok: true }); }
    if (m === 'PUT') { const b = await readBody(req); db.gallery[i].caption = str(b.caption, 120); db.gallery[i].order = Number(b.order) || 0; save(); return send(res, 200, db.gallery[i]); }
  }
  if ((r = /^\/api\/admin\/orders\/(\w+)$/.exec(p))) {
    db.orders = db.orders || []; const i = db.orders.findIndex(x => x.id === r[1]); if (i < 0) return send(res, 404, { error: 'Not found' });
    if (m === 'DELETE') { db.orders.splice(i, 1); save(); return send(res, 200, { ok: true }); }
    if (m === 'PUT') { const b = await readBody(req); db.orders[i].status = b.status === 'done' ? 'done' : 'new'; save(); return send(res, 200, db.orders[i]); }
  }
  return send(res, 404, { error: 'Not found' });
}

// ---------- static files & uploads ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function serve(res, base, rel) {
  let f; try { f = path.join(base, decodeURIComponent(rel)); } catch { res.writeHead(400); return res.end(); }
  if (!f.startsWith(base) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*'
  });
  fs.createReadStream(f).pipe(res);
}

http.createServer(async (req, res) => {
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
    if (p.startsWith('/uploads/')) return serve(res, UPLOAD_DIR, p.slice(9));

    // Root status info for the backend API
    if (p === '/' || p === '/admin' || p === '/admin/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok', service: 'Al Hara Cafeteria Backend API' }));
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (e) { if (!res.headersSent) send(res, 400, { error: e.message || 'Error' }); }
}).listen(PORT, () => console.log('Al Hara Cafeteria backend running on http://localhost:' + PORT));
