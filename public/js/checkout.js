// public/js/checkout.js

// 1) On load: if URL has ?orderId=, hide form and show QR section
window.addEventListener('DOMContentLoaded', () => {
  const params  = new URLSearchParams(window.location.search);
  const orderId = params.get('orderId');

  if (orderId) {
    document.getElementById('purchaseForm').style.display = 'none';
    document.getElementById('qrSection').style.display   = 'block';

    fetch(`/api/pix?orderId=${orderId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        document.getElementById('qrImg').src      = `data:image/png;base64,${data.pixQRCode}`;
        document.getElementById('copyCode').textContent = data.pixEMV;
      })
      .catch(err => alert(err.message || 'Erro ao carregar QR code.'));
  }

  // Fetch promotion configuration
  fetch('/api/promotion')
    .then(r => r.json())
    .then(setupPromotion)
    .catch(err => console.error('Promo error', err));
});

function parseDate(str) {
  const [d, m, yAndTime] = str.split('/');
  const [y, time] = yAndTime.split(' ');
  return new Date(`${y}-${m}-${d}T${time}`);
}

function startCountdown(target) {
  const el = {
    d: document.getElementById('days'),
    h: document.getElementById('hours'),
    m: document.getElementById('minutes'),
    s: document.getElementById('seconds')
  };
  function tick() {
    const diff = target - new Date();
    if (diff <= 0) return clearInterval(timer);
    const t = Math.floor(diff / 1000);
    const d = Math.floor(t / 86400);
    const h = Math.floor((t % 86400) / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    el.d.textContent = String(d).padStart(2, '0');
    el.h.textContent = String(h).padStart(2, '0');
    el.m.textContent = String(m).padStart(2, '0');
    el.s.textContent = String(s).padStart(2, '0');
  }
  tick();
  const timer = setInterval(tick, 1000);
}

function setupPromotion(promo) {
  if (!promo) return;

  document.getElementById('promoTitle').textContent = promo.tituloPromocao;
  document.getElementById('promoBanner').src = promo.banner;

  const price = +promo.valorPromocao;
  const min   = promo.config.multiProduto.qtdMinimaCupons;
  const max   = promo.config.multiProduto.qtdMaximaCupons;
  let qty     = min;

  const qtyInput = document.getElementById('quantityInput');
  const qtyDisplay = document.getElementById('quantity');
  const totalDisplay = document.getElementById('totalAmount');

  function update() {
    qtyInput.value = qty;
    qtyDisplay.textContent = qty;
    totalDisplay.textContent = (qty * price).toFixed(2).replace('.', ',');
  }

  update();

  // quantity controls
  document.getElementById('increase').addEventListener('click', () => {
    if (qty < max) { qty++; update(); }
  });
  document.getElementById('decrease').addEventListener('click', () => {
    if (qty > min) { qty--; update(); }
  });

  const quickAdd = document.querySelector('.quick-add');
  quickAdd.innerHTML = '';
  promo.config.multiProduto.botoesQtd.forEach(val => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.add = val;
    b.innerHTML = `+${val} <br/>títulos`;
    b.addEventListener('click', () => {
      qty = Math.min(max, qty + val);
      update();
    });
    quickAdd.appendChild(b);
  });

  startCountdown(parseDate(promo.dataSorteioPrincipal));
}

// 2) On form submit: call /api/purchase and reload with orderId
document.getElementById('purchaseForm')
  .addEventListener('submit', async e => {
    e.preventDefault();
    const cpf   = document.getElementById('cpfInput').value.trim();
    const phone = document.getElementById('phoneInput').value.trim();
    const qty   = +document.getElementById('quantityInput').value;

    const resp = await fetch('/api/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpf, phone, quantity: qty })
    });
    const data = await resp.json();
    if (!resp.ok) return alert(data.error || 'Erro na compra');
    window.location.search = `?orderId=${data.orderId}`;
  });
