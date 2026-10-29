const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const API_BASE = window.API_URL || (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? '' : 'https://alharabackend.vercel.app');
const asset = u => (!u || u.startsWith('http') || u.startsWith('data:')) ? u : (API_BASE + u);
let D = null, tab = 'orders', editId = null;
const getToken = () => localStorage.getItem('alhara_admin_token') || '';
const setToken = t => { if (t) localStorage.setItem('alhara_admin_token', t); };
const clearToken = () => localStorage.removeItem('alhara_admin_token');

async function api(method, url, body) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
    headers['x-session-id'] = token;
  }

  const endpoints = [];
  if (API_BASE && !url.startsWith('http')) endpoints.push(API_BASE + url);
  if (!url.startsWith('http')) endpoints.push(url);
  if (!endpoints.includes('https://alharabackend.vercel.app' + url)) endpoints.push('https://alharabackend.vercel.app' + url);

  let lastErr = null;
  for (const ep of endpoints) {
    try {
      const r = await fetch(ep, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include'
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401 && url !== '/api/login') { clearToken(); showLogin(); throw new Error('Please sign in again'); }
      if (!r.ok) throw new Error(j.error || 'Something went wrong');
      return j;
    } catch (err) {
      lastErr = err;
      if (err.message === 'Please sign in again' || (err.message && err.message.includes('Wrong'))) throw err;
    }
  }
  throw lastErr || new Error('Could not connect to server');
}
function msg(t, bad) { const m = $('#msg'); m.textContent = t; m.className = bad ? 'bad' : 'ok'; m.hidden = false; clearTimeout(msg.t); msg.t = setTimeout(() => m.hidden = true, 4000); }
const run = fn => async (...a) => { try { await fn(...a); } catch (e) { msg(e.message, true); } };
function showLogin() { $('#app').hidden = true; $('#login').hidden = false; }
async function load() { D = await api('GET', '/api/admin/data'); $('#login').hidden = true; $('#app').hidden = false; render(); }

$('#loginForm').onsubmit = run(async e => {
  e.preventDefault(); const f = new FormData(e.target);
  const res = await api('POST', '/api/login', { username: f.get('username'), password: f.get('password') });
  if (res.token) setToken(res.token);
  e.target.reset(); await load();
});
$('#logout').onclick = run(async () => { await api('POST', '/api/logout'); clearToken(); showLogin(); });
$('#tabs').onclick = e => { const b = e.target.closest('button'); if (b) { tab = b.dataset.tab; editId = null; render(); } };

// ----- images: resized in the browser, then uploaded -----
function toDataUrl(f) {
  return new Promise((ok, no) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      ok(c.toDataURL(f.type === 'image/png' ? 'image/png' : 'image/jpeg', .85));
    };
    img.onerror = () => no(new Error('That file is not a valid image')); img.src = URL.createObjectURL(f);
  });
}
const upload = async f => (await api('POST', '/api/admin/upload', { data: await toDataUrl(f) })).url;
const imgField = (name, label, val) => `<label>${label}<img class="thumb" src="${esc(asset(val))}" alt=""><input type="hidden" name="${name}" value="${esc(val)}"><input type="file" accept="image/*" data-for="${name}"></label>`;
$('#view').addEventListener('change', run(async e => {
  const f = e.target; if (!f.dataset.for || !f.files[0]) return;
  msg('Uploading…'); const url = await upload(f.files[0]);
  const form = f.closest('form'); form.elements[f.dataset.for].value = url; f.closest('label').querySelector('img').src = url; msg('Image ready — press Save to keep it');
}));

// ----- rendering -----
function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const nw = (D.orders || []).filter(o => o.status !== 'done').length; document.querySelector('[data-tab=orders]').textContent = 'Orders' + (nw ? ' (' + nw + ' new)' : '');
  $('#view').innerHTML = { orders: ordersView, menu: menuView, content: contentView, gallery: galleryView, design: designView }[tab]();
}
function ordersView() {
  const L = D.orders || [];
  return `<div class="card"><div class="row" style="justify-content:space-between"><h2>Orders (${L.length})</h2><button class="btn small ghost" data-act="refresh">Refresh</button></div>${L.map(o => `<div class="list-item" style="align-items:flex-start"><div class="grow"><strong>#${o.ref}</strong> ${esc(o.name)} <span class="tag">${o.status === 'done' ? 'Done' : 'New'}</span><br><small>${new Date(o.time).toLocaleString()} · <a href="tel:${esc(o.phone)}">${esc(o.phone)}</a></small><div>${o.items.map(i => `${i.qty} × ${esc(i.name)}`).join('<br>')}</div>${o.total ? `<strong>Total: ${esc(o.total)}</strong>` : ''}${o.note ? `<br><em>Note: ${esc(o.note)}</em>` : ''}</div><div class="row"><button class="btn small ghost" data-act="odone" data-id="${o.id}">${o.status === 'done' ? 'Mark new' : 'Mark done'}</button><button class="btn small danger" data-act="odel" data-id="${o.id}">Delete</button></div></div>`).join('') || '<p class="muted">No orders yet. New orders appear here when customers press Place Order.</p>'}</div>`;
}
function menuView() {
  const it = D.menu.find(x => x.id === editId) || { name: '', desc: '', price: '', category: '', image: '', featured: false, visible: true };
  return `<div class="card"><h2>${editId ? 'Edit item' : 'Add a menu item'}</h2>
  <form data-form="item"><div class="grid"><label>Name<input name="name" required maxlength="80" value="${esc(it.name)}"></label>
  <label>Price (as you want it shown)<input name="price" maxlength="20" value="${esc(it.price)}" placeholder="e.g. 350"></label></div>
  <label>Category<input name="category" list="cats" maxlength="40" value="${esc(it.category)}" placeholder="e.g. Drinks"><datalist id="cats">${[...new Set(D.menu.map(i => i.category))].map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
  <label>Description<textarea name="desc" maxlength="300">${esc(it.desc)}</textarea></label>${imgField('image', 'Photo', it.image)}
  <label class="inline"><input type="checkbox" name="featured" ${it.featured ? 'checked' : ''}> Show in Signature Favorites</label>
  <label class="inline"><input type="checkbox" name="visible" ${it.visible ? 'checked' : ''}> Visible on website</label>
  <div class="row"><button class="btn">${editId ? 'Save changes' : 'Add item'}</button>${editId ? '<button type="button" class="btn ghost" data-act="cancel">Cancel</button>' : ''}</div></form></div>
  <div class="card"><h2>Menu items (${D.menu.length})</h2>${D.menu.map(i => `<div class="list-item">${i.image ? `<img src="${esc(i.image)}" alt="">` : '<div class="thumb" style="width:64px;height:64px;visibility:visible"></div>'}
  <div class="grow"><strong>${esc(i.name)}</strong> ${i.price ? esc(i.price) : ''}<br><small>${esc(i.category)}${i.featured ? '<span class="tag">Favorite</span>' : ''}${i.visible ? '' : '<span class="tag">Hidden</span>'}</small></div>
  <div class="row"><button class="btn small ghost" data-act="edit" data-id="${i.id}">Edit</button><button class="btn small ghost" data-act="toggle" data-id="${i.id}">${i.visible ? 'Hide' : 'Show'}</button><button class="btn small danger" data-act="del" data-id="${i.id}">Delete</button></div></div>`).join('') || '<p class="muted">No items yet.</p>'}</div>`;
}
const CF = [['heroTitle', 'Hero heading'], ['heroText', 'Hero description', 1], ['heroBtn1Text', 'Hero button 1 text'], ['heroBtn1Link', 'Hero button 1 link (e.g. #menu)'],
  ['heroBtn2Text', 'Hero button 2 text'], ['heroBtn2Link', 'Hero button 2 link (e.g. #contact)'], ['orderLink', 'Order Now link (leave empty to use WhatsApp or phone)'],
  ['aboutTitle', 'About heading'], ['aboutText', 'About text', 1], ['phone', 'Phone number'], ['whatsapp', 'WhatsApp number (with country code)'], ['address', 'Address'],
  ['mapsLink', 'Directions link (Google Maps share link)'], ['hours', 'Opening hours (one line per day)', 1], ['instagram', 'Instagram link'], ['facebook', 'Facebook link']];
function contentView() {
  return `<div class="card"><h2>Website content</h2><form data-form="content">${CF.map(([k, l, ta]) => `<label>${l}${ta ? `<textarea name="${k}">${esc(D.content[k])}</textarea>` : `<input name="${k}" value="${esc(D.content[k])}">`}</label>`).join('')}<button class="btn">Save</button></form></div>`;
}
function galleryView() {
  return `<div class="card"><h2>Add a photo</h2><form data-form="gal"><label>Photo<input type="file" name="file" accept="image/*" required></label>
  <label>Caption (optional)<input name="caption" maxlength="120"></label><button class="btn">Upload</button></form></div>
  <div class="card"><h2>Gallery (${D.gallery.length})</h2>${[...D.gallery].sort((a, b) => a.order - b.order).map(g => `<form class="list-item" data-form="galedit" data-id="${g.id}"><img src="${esc(g.image)}" alt="">
  <div class="grow"><input name="caption" placeholder="Caption" value="${esc(g.caption)}" maxlength="120"></div><label style="margin:0;width:90px">Order<input name="order" type="number" value="${g.order}"></label>
  <div class="row"><button class="btn small">Save</button><button type="button" class="btn small danger" data-act="gdel" data-id="${g.id}">Delete</button></div></form>`).join('') || '<p class="muted">No photos yet.</p>'}</div>`;
}
function designView() {
  const c = D.content, sw = (n) => `<div class="swatches">${D.palette.map(p => `<label><input type="radio" name="${n}" value="${p}" ${c[n] === p ? 'checked' : ''}><span style="background:${p}"></span></label>`).join('')}</div>`;
  return `<div class="card"><h2>Design</h2><form data-form="design">${imgField('logo', 'Logo (leave empty to show the text name)', c.logo)}${imgField('heroImage', 'Hero photo', c.heroImage)}${imgField('aboutImage', 'About photo', c.aboutImage)}
  <label>Main accent color</label>${sw('accent')}<label>Secondary color (behind images)</label>${sw('accent2')}
  <label class="inline"><input type="checkbox" name="announcementOn" ${c.announcementOn ? 'checked' : ''}> Show announcement strip</label>
  <label>Announcement text<input name="announcement" maxlength="200" value="${esc(c.announcement)}"></label><button class="btn">Save</button></form></div>`;
}

// ----- actions -----
$('#view').addEventListener('submit', run(async e => {
  e.preventDefault(); const f = e.target, k = f.dataset.form, v = n => f.elements[n]?.value ?? '';
  if (k === 'item') {
    const b = { name: v('name'), price: v('price'), category: v('category'), desc: v('desc'), image: v('image'), featured: f.elements.featured.checked, visible: f.elements.visible.checked };
    await api(editId ? 'PUT' : 'POST', '/api/admin/menu' + (editId ? '/' + editId : ''), b); editId = null; msg('Menu item saved');
  } else if (k === 'content') { await api('PUT', '/api/admin/content', Object.fromEntries(CF.map(([n]) => [n, v(n)]))); msg('Content saved'); }
  else if (k === 'design') {
    await api('PUT', '/api/admin/content', { logo: v('logo'), heroImage: v('heroImage'), aboutImage: v('aboutImage'), accent: v('accent'), accent2: v('accent2'), announcement: v('announcement'), announcementOn: f.elements.announcementOn.checked });
    msg('Design saved');
  } else if (k === 'gal') { msg('Uploading…'); const image = await upload(f.elements.file.files[0]); await api('POST', '/api/admin/gallery', { image, caption: v('caption') }); msg('Photo added'); }
  else if (k === 'galedit') { await api('PUT', '/api/admin/gallery/' + f.dataset.id, { caption: v('caption'), order: v('order') }); msg('Saved'); }
  await load();
}));
$('#view').addEventListener('click', run(async e => {
  const b = e.target.closest('[data-act]'); if (!b) return; const id = b.dataset.id, a = b.dataset.act;
  if (a === 'refresh') { await load(); return msg('Orders refreshed'); }
  if (a === 'odone') { const o = D.orders.find(x => x.id === id); await api('PUT', '/api/admin/orders/' + id, { status: o.status === 'done' ? 'new' : 'done' }); await load(); return; }
  if (a === 'odel') { if (confirm('Delete this order?')) { await api('DELETE', '/api/admin/orders/' + id); await load(); msg('Order deleted'); } return; }
  if (a === 'edit') { editId = id; render(); scrollTo(0, 0); }
  else if (a === 'cancel') { editId = null; render(); }
  else if (a === 'toggle') { const i = D.menu.find(x => x.id === id); await api('PUT', '/api/admin/menu/' + id, { ...i, visible: !i.visible }); await load(); msg(i.visible ? 'Item hidden' : 'Item shown'); }
  else if (a === 'del') { if (confirm('Delete this menu item? This cannot be undone.')) { await api('DELETE', '/api/admin/menu/' + id); await load(); msg('Item deleted'); } }
  else if (a === 'gdel') { if (confirm('Remove this photo from the gallery?')) { await api('DELETE', '/api/admin/gallery/' + id); await load(); msg('Photo removed'); } }
}));

api('GET', '/api/me').then(load).catch(showLogin);
