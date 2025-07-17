// public/js/checkout.js

// 1) Ao carregar a página busca a promoção e prepara a tela
let currentPrice = 0;
let currentQty   = 1;
let buyerCPF     = '';
let buyerPhone   = '';
let currentPayId = '';  // será o `id` retornado pelo /api/purchase
let step         = 1;   // 1: form, 2: qr
let pollTimer;

window.addEventListener('DOMContentLoaded', () => {
  // esconde QR até gerar pagamento
  document.getElementById('qrSection').style.display     = 'none';
  document.getElementById('qrPlaceholder').style.display = 'block';

  document.querySelector('.back-btn').addEventListener('click', () => {
    if (step === 2) {
      document.getElementById('qrSection').style.display     = 'none';
      document.getElementById('purchaseForm').style.display  = 'block';
      document.getElementById('qrPlaceholder').style.display = 'block';
      if (pollTimer) clearTimeout(pollTimer);
      step = 1;
    }
  });

  fetch('/api/promotion')
    .then(r => r.json())
    .then(promo => {
      console.log('Promotion payload:', promo);
      setupPromotion(promo);
    })
    .catch(err => console.error('Promo error', err));
});

function parseDate(str) {
  // aceita tanto "DD/MM/YYYY HH:MM:SS" quanto ISO
  if (typeof str === 'string' && str.includes('/')) {
    const [d, m, yAndTime] = str.split('/');
    const [y, time] = yAndTime.split(' ');
    return new Date(`${y}-${m}-${d}T${time}`);
  }
  return new Date(str);
}

function startCountdown(target) {
  const el = {
    d: document.getElementById('days'),
    h: document.getElementById('hours'),
    m: document.getElementById('minutes'),
    s: document.getElementById('seconds'),
  };
  function tick() {
    const diff = target - new Date();
    if (diff <= 0) return clearInterval(timer);
    const t = Math.floor(diff / 1000);
    el.d.textContent = String(Math.floor(t / 86400)).padStart(2, '0');
    el.h.textContent = String(Math.floor((t % 86400) / 3600)).padStart(2, '0');
    el.m.textContent = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
    el.s.textContent = String(t % 60).padStart(2, '0');
  }
  tick();
  const timer = setInterval(tick, 1000);
}

function setupPromotion(promo) {
  if (!promo) return;

  // — Title — select by #promoTitle or fallback to existing class
  const titleEl = document.getElementById('promoTitle');
  if (titleEl) {
    // APIs sometimes use 'tituloPromocao' or just 'titulo'
    titleEl.textContent = promo.tituloPromocao || promo.titulo || 'Promoção';
  }

  // — Banner image —
  const bannerEl = document.getElementById('promoBanner');
  if (bannerEl && promo.banner) {
    bannerEl.src = promo.banner;
  }

  // — Price & quantity logic —
  const price = Number(promo.valorPromocao) || 0;
  const min   = promo.config?.multiProduto?.qtdMinimaCupons || 1;
  const max   = promo.config?.multiProduto?.qtdMaximaCupons || min;
  let qty     = min;
  currentPrice = price;
  currentQty   = qty;

  const qtyInput     = document.getElementById('quantityInput');
  const qtyDisplay   = document.getElementById('quantity');
  const totalDisplay = document.getElementById('totalAmount');

  function update() {
    qtyInput.value            = qty;
    qtyDisplay.textContent    = qty;
    totalDisplay.textContent  = (qty * price).toFixed(2).replace('.', ',');
    currentQty                = qty;
  }

  update();

  document.getElementById('increase').addEventListener('click', () => {
    if (qty < max) { qty++; update(); }
  });
  document.getElementById('decrease').addEventListener('click', () => {
    if (qty > min) { qty--; update(); }
  });

  // — Quick‑add buttons (+2, +5, etc.) —
  const quickAdd = document.querySelector('.quick-add');
  quickAdd.innerHTML = '';
  (promo.config?.multiProduto?.botoesQtd || []).forEach(val => {
    const b = document.createElement('button');
    b.type        = 'button';
    b.dataset.add = val;
    b.innerHTML   = `+${val} <br/>títulos`;
    b.addEventListener('click', () => {
      qty = Math.min(max, qty + val);
      update();
    });
    quickAdd.appendChild(b);
  });

  // — Countdown to draw —
  if (promo.dataSorteioPrincipal) {
    startCountdown(parseDate(promo.dataSorteioPrincipal));
  }
}

// 2) Envia o formulário: chama /api/purchase e mostra o QR
document.getElementById('purchaseForm').addEventListener('submit', async e => {
  e.preventDefault();
  buyerCPF   = document.getElementById('cpfInput').value.trim();
  buyerPhone = document.getElementById('phoneInput').value.trim();

  const amount = Math.round(currentQty * currentPrice * 100);
  const resp   = await fetch('/api/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount })
  });
  const data = await resp.json();
  if (!resp.ok) return alert(data.error || 'Erro ao gerar pagamento');

  currentPayId = data.id;  // ← gateway retorna `id`

  // mostra QR
  document.getElementById('purchaseForm').style.display   = 'none';
  document.getElementById('qrPlaceholder').style.display = 'none';
  document.getElementById('qrSection').style.display     = 'block';
  document.getElementById('qrImg').src                   = data.qrImage;
  document.getElementById('copyCode').textContent        = data.qrCode;
  document.getElementById('paymentStatus').textContent   = data.status;
  step = 2;

  // polling de status
  loadPayment(currentPayId);
});

// 3) Consulta o status do pagamento e atualiza a tela
async function loadPayment(id) {
  const resp = await fetch(`/api/payment-status?id=${id}`);
  const data = await resp.json();
  if (!resp.ok) return alert(data.error || 'Falha ao consultar pagamento');

  document.getElementById('qrImg').src                 = data.qrImage;
  document.getElementById('copyCode').textContent      = data.qrCode;
  document.getElementById('paymentStatus').textContent = data.status;

  if (data.status === 'pending') {
    pollTimer = setTimeout(() => loadPayment(id), 5000);
  } else if (data.status === 'paid' || data.status === 'confirmed') {
    finalizePurchase();
  }
}

// 4) Registra atendimento após pagamento
async function finalizePurchase() {
  const resp = await fetch('/api/attend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cpf: buyerCPF,
      phone: buyerPhone,
      quantity: currentQty
    })
  });
  const data = await resp.json();
  if (!resp.ok) {
    console.error(data.error || 'Erro ao registrar atendimento');
  }
}
