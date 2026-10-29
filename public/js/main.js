const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CUP = '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 26h34v10a14 14 0 0 1-14 14h-6A14 14 0 0 1 12 36V26zM46 29h4a6 6 0 0 1 0 12h-5M22 8c-3 4 3 6 0 10M32 8c-3 4 3 6 0 10M42 8c-3 4 3 6 0 10"/></svg>';
const API_BASE = window.API_URL || (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? '' : 'https://alharabackend.vercel.app');
const asset = u => (!u || u.startsWith('http') || u.startsWith('data:')) ? u : (API_BASE + u);
const bg = u => u ? `style="background-image:url('${esc(asset(u))}')"` : '';
let MENU = [], C = {}, WA = '', TEL = '', CART = {}, CUR = 'All';
try { CART = JSON.parse(localStorage.getItem('alhara_cart') || '{}'); } catch {}
const persist = () => { try { localStorage.setItem('alhara_cart', JSON.stringify(CART)); } catch {} };
const num = p => parseFloat(String(p || '').replace(/[^\d.]/g, '')) || 0;
function money(n) {
  const m0 = (MENU.find(i => i.price) || {}).price || '', pre = (m0.match(/^[^\d]*/) || [''])[0], suf = (m0.match(/[^\d.,\s]+$/) || [''])[0];
  return pre + (Math.round(n * 100) / 100) + (suf && !pre ? ' ' + suf : '');
}

fetch(API_BASE + '/api/public').then(r => r.json()).then(({ content: c, menu, gallery }) => {
  C = c; MENU = menu;
  for (const k in CART) if (!menu.some(i => i.id === k)) delete CART[k];
  WA = (c.whatsapp.match(/\d/g) || []).join(''); TEL = c.phone.replace(/[^\d+]/g, '');
  document.documentElement.style.setProperty('--accent', c.accent);
  document.documentElement.style.setProperty('--accent2', c.accent2);
  if (c.announcementOn && c.announcement) {
    const t = `<span>${esc(c.announcement)}</span>`.repeat(12); $('#stripTrack').innerHTML = t + t; $('#strip').hidden = false;
  }
  const bt = '<span>Made fresh</span><i>•</i><span>Served with love</span><i>•</i>'.repeat(8); $('#bandTrack').innerHTML = bt + bt;
  if (c.logo) document.querySelectorAll('.brand').forEach(b => b.innerHTML = `<img src="${esc(asset(c.logo))}" alt="Al Hara Cafeteria">`);
  $('#heroTitle').textContent = c.heroTitle; $('#heroText').textContent = c.heroText;
  [['#heroBtn1', c.heroBtn1Text, c.heroBtn1Link], ['#heroBtn2', c.heroBtn2Text, c.heroBtn2Link]].forEach(([s, t, l]) => { const a = $(s); a.textContent = t; a.href = l || '#'; a.hidden = !t; });
  if (c.heroImage) $('#heroBlob').style.backgroundImage = `url('${esc(asset(c.heroImage))}')`; else $('#heroBlob').innerHTML = CUP;
  // Order Now: opens the cart (or an external ordering link if the owner set one)
  if (c.orderLink) { const o = $('#orderBtn'); o.href = c.orderLink; o.removeAttribute('data-cart'); o.target = '_blank'; o.rel = 'noopener'; }
  $('#stepSend').textContent = 'Enter your name and phone number, then press Place Order. The cafeteria receives it right away.';
  $('#aboutTitle').textContent = c.aboutTitle; $('#aboutText').textContent = c.aboutText;
  if (c.aboutImage) $('#aboutImg').style.backgroundImage = `url('${esc(asset(c.aboutImage))}')`; else $('#aboutImg').innerHTML = CUP;
  // categories
  const cats = [...new Set(menu.map(i => i.category))];
  $('#catGrid').innerHTML = cats.map(k => `<button class="cat" data-cat="${esc(k)}"><span class="cimg" ${bg((menu.find(i => i.category === k && i.image) || {}).image)}></span><div><strong>${esc(k)}</strong><small>${menu.filter(i => i.category === k).length} items</small></div></button>`).join('');
  $('#cats').hidden = !cats.length;
  $('#filters').innerHTML = ['All', ...cats].map((k, i) => `<button class="chip${i ? '' : ' on'}" data-cat="${esc(k)}">${esc(k)}</button>`).join('');
  drawMenu();
  const favs = menu.filter(i => i.featured);
  if (favs.length) {
    $('#favSec').hidden = false;
    $('#favList').innerHTML = favs.map(i => `<article class="fav-item"><div class="fav-pic" ${bg(i.image)}>${i.image ? '' : CUP}</div>
      <div><h3>${esc(i.name)}</h3><p>${esc(i.desc)}</p>${i.price ? `<span class="price">${esc(i.price)}</span>` : ''}<button class="add" data-add="${i.id}">Add +</button></div></article>`).join('');
  } else document.querySelectorAll('.wave').forEach(w => w.hidden = true);
  $('#gallery').hidden = !gallery.length;
  $('#masonry').innerHTML = gallery.map(g => `<figure><img loading="lazy" src="${esc(asset(g.image))}" alt="${esc(g.caption || 'Al Hara Cafeteria')}">${g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : ''}</figure>`).join('');
  // FAQ
  const faq = [['How do I place an order?', 'Add your favorites to the cart, tap Order Now, enter your name and phone number, and press Place Order.'],
    ['Where can I find you?', c.address || 'Our address will be added soon.'], ['When are you open?', c.hours || 'Opening hours will be added soon.'],
    ['Is the menu up to date?', 'Yes — this page always shows the latest menu and prices.']];
  $('#faqList').innerHTML = faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('');
  // contact
  const info = [];
  if (c.address) info.push(`<div><small class="lbl">Address</small>${esc(c.address)}</div>`);
  if (c.phone) info.push(`<a href="tel:${esc(TEL)}"><small class="lbl">Phone</small>${esc(c.phone)}</a>`);
  if (WA) info.push(`<a href="https://wa.me/${WA}" target="_blank" rel="noopener"><small class="lbl">WhatsApp</small>Message us</a>`);
  if (c.mapsLink) info.push(`<a class="btn btn-solid" href="${esc(c.mapsLink)}" target="_blank" rel="noopener">Get directions</a>`);
  $('#info').innerHTML = info.join('') || '<p class="empty">Contact details coming soon.</p>';
  $('#hours').textContent = c.hours || 'Opening hours coming soon.';
  $('#footInfo').textContent = [c.address, c.phone].filter(Boolean).join('\n');
  $('#socials').innerHTML = [['Instagram', c.instagram], ['Facebook', c.facebook]].filter(s => s[1]).map(s => `<a href="${esc(s[1])}" target="_blank" rel="noopener">${s[0]}</a>`).join('');
  renderCart(); observe();
}).catch(() => { $('#menuGrid').innerHTML = '<p class="empty">Could not load content. Please refresh.</p>'; document.querySelectorAll('.reveal').forEach(e => e.classList.add('in')); });

function drawMenu() {
  document.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x.dataset.cat === CUR));
  const list = MENU.filter(i => CUR === 'All' || i.category === CUR);
  $('#menuGrid').innerHTML = list.map(i => `<article class="item"><div class="pic" ${bg(i.image)}>${i.image ? '' : CUP}</div>
    <div class="row"><h3>${esc(i.name)}</h3>${i.price ? `<span class="price">${esc(i.price)}</span>` : ''}</div><p>${esc(i.desc)}</p>
    <button class="add" data-add="${i.id}">Add +</button></article>`).join('') || '<p class="empty">The menu is being updated. Please check back soon.</p>';
}

// ---------- cart ----------
const items = () => MENU.filter(i => CART[i.id] > 0);
function renderCart() {
  const list = items(), n = list.reduce((a, i) => a + CART[i.id], 0), total = list.reduce((a, i) => a + CART[i.id] * num(i.price), 0);
  $('#cartCount').textContent = n;
  $('#cartItems').innerHTML = list.length ? list.map(i => `<div class="ci"><div class="n"><strong>${esc(i.name)}</strong><br><small>${esc(i.price)}</small></div>
    <div class="qty"><button data-d="-1" data-id="${i.id}" aria-label="Less">−</button><b>${CART[i.id]}</b><button data-d="1" data-id="${i.id}" aria-label="More">+</button></div></div>`).join('')
    : '<p class="empty">Your cart is empty.<br>Add something tasty from the menu.</p>';
  $('#cartForm').hidden = !list.length;
  $('#cartTotal').textContent = total ? money(total) : n + (n === 1 ? ' item' : ' items');
}
function resetDone() { $('#done').hidden = true; $('#cartItems').hidden = false; }
function add(id, d) {
  resetDone();
  const it = MENU.find(i => i.id === id); if (!it) return;
  CART[id] = Math.max(0, (CART[id] || 0) + d); if (!CART[id]) delete CART[id];
  persist(); renderCart();
  if (d > 0) { toast(it.name + ' added to cart'); const b = $('#cartBtn'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
}
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), 1800); }
function openCart() { resetDone(); renderCart(); $('#drawer').classList.add('on'); $('#ov').classList.add('on'); $('#drawer').setAttribute('aria-hidden', 'false'); }
function closeCart() { $('#drawer').classList.remove('on'); $('#ov').classList.remove('on'); $('#drawer').setAttribute('aria-hidden', 'true'); }
function orderText() {
  const list = items(), total = list.reduce((a, i) => a + CART[i.id] * num(i.price), 0), name = $('#custName').value.trim(), note = $('#custNote').value.trim();
  return ['New order — Al Hara Cafeteria', '', ...list.map(i => `${CART[i.id]} × ${i.name}${i.price ? ' (' + i.price + ')' : ''}`),
    ...(total ? ['', 'Total: ' + money(total)] : []), ...(name ? ['', 'Name: ' + name] : []), ...(note ? ['Note: ' + note] : [])].join('\n');
}
document.addEventListener('click', e => {
  const t = e.target, a = t.closest('[data-add]'), d = t.closest('[data-d]'), k = t.closest('[data-cat]');
  if (a) return add(a.dataset.add, 1);
  if (d) return add(d.dataset.id, +d.dataset.d);
  if (k) { CUR = k.dataset.cat; drawMenu(); if (k.classList.contains('cat')) $('#menu').scrollIntoView({ behavior: 'smooth' }); return; }
  if (t.closest('[data-cart]')) { e.preventDefault(); links.classList.remove('open'); burger.setAttribute('aria-expanded', false); return openCart(); }
  if (t.closest('#closeCart') || t.id === 'ov') return closeCart();
  if (t.closest('#clearCart')) { CART = {}; persist(); return renderCart(); }
  if (t.closest('#sendOrder')) return placeOrder();
  if (t.closest('#doneClose')) return closeCart();
});
async function placeOrder() {
  const list = items(); if (!list.length) return;
  const name = $('#custName').value.trim(), phone = $('#custPhone').value.trim();
  if (!name || !/^[\d+\-\s()]{6,25}$/.test(phone)) return toast('Please enter your name and a valid phone number');
  const btn = $('#sendOrder'); btn.disabled = true; btn.textContent = 'Placing order…';
  try {
    const txt = orderText() + '\nPhone: ' + phone;
    const r = await fetch(API_BASE + '/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, note: $('#custNote').value, items: list.map(i => ({ id: i.id, qty: CART[i.id] })) }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Could not place your order');
    CART = {}; persist(); renderCart();
    $('#cartItems').hidden = true; $('#cartForm').hidden = true; $('#done').hidden = false;
    $('#doneMsg').textContent = `Thank you, ${name}! Your order #${j.ref} has been received.`;
    $('#doneSum').textContent = txt;
    const w = $('#doneWa'); if (WA) { w.href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent('Order #' + j.ref + '\n' + txt); w.hidden = false; } else w.hidden = true;
  } catch (e) { toast(e.message || 'Could not place your order'); }
  btn.disabled = false; btn.textContent = 'Place Order';
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCart(); });

function observe() {
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) return els.forEach(e => e.classList.add('in'));
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .05 });
  els.forEach(e => io.observe(e));
}
const burger = $('#burger'), links = $('#links');
burger.onclick = () => { const o = links.classList.toggle('open'); burger.setAttribute('aria-expanded', o); };
links.addEventListener('click', e => { if (e.target.closest('a')) { links.classList.remove('open'); burger.setAttribute('aria-expanded', false); } });
$('#yr').textContent = new Date().getFullYear();
