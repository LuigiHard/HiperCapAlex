// public/js/checkout.js

// 1) Ao carregar a página busca a promoção e prepara a tela
let currentPrice = 0;
let currentQty   = 1;
let buyerCPF     = '';
let buyerPhone   = '';
let currentPayId = '';  // será o `id` retornado pelo /api/purchase
let step         = 1;   // 1: form, 2: qr
let pollTimer;
let expireTimer;
let expireCountdownStarted = false;
const gridEl     = document.querySelector('.checkout-grid');
const stepCount  = document.querySelector('.step-count');
const qrCountdown = document.getElementById('qrCountdown');

function resetCheckout() {
  document.querySelector('.purchase-panel').style.display = 'block';
  document.getElementById('qrSection').style.display     = 'none';
  document.getElementById('purchaseForm').style.display  = 'block';
  document.getElementById('qrPlaceholder').style.display = 'block';
  if (qrCountdown) qrCountdown.style.display = 'none';
  gridEl.classList.remove('step-2');
  if (stepCount) stepCount.textContent = '1 de 2';
  if (pollTimer) clearTimeout(pollTimer);
  if (expireTimer) clearInterval(expireTimer);
  expireCountdownStarted = false;
  step = 1;
}

window.addEventListener('beforeunload', e => {
  if (step === 2) {
    e.preventDefault();
    e.returnValue = '';
  }
});

window.addEventListener('DOMContentLoaded', () => {
  // passo inicial: mostra painel de compra, esconde QR completo
  document.getElementById('qrSection').style.display     = 'none';
  // placeholder visível até gerar o QR
  document.getElementById('qrPlaceholder').style.display = 'block';
  if (qrCountdown) qrCountdown.style.display = 'none';
  gridEl.classList.remove('step-2');
  if (stepCount) stepCount.textContent = '1 de 2';

  const saved = localStorage.getItem('currentPayment');
  if (saved) {
    const data = JSON.parse(saved);
    if (data.expiresAt && Date.now() < data.expiresAt) {
      currentPayId = data.id;
      showQR(data);
      loadPayment(currentPayId);
    } else {
      localStorage.removeItem('currentPayment');
    }
  }

  document.querySelector('.back-btn').addEventListener('click', async () => {
    if (step === 2) {
      const confirmExit = await showDialog(
        'Tem certeza que deseja sair da compra?',
        { cancel: true, okText: 'Sair' }
      );
      if (confirmExit) {
        localStorage.removeItem('currentPayment');
        resetCheckout();
      }
    }
  });

  document.addEventListener('mouseleave', async () => {
    if (step === 1 || step === 2) {
      const out = await showDialog('Tem certeza que deseja abandonar a compra?', {
        cancel: true,
        okText: 'Sair'
      });
      if (out) {
        localStorage.removeItem('currentPayment');
        resetCheckout();
      }
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

function startExpireCountdown(target) {
  const el = document.getElementById('paymentCountdown');
  if (!el) return;
  function tick() {
    const diff = target - Date.now();
    if (diff <= 0) {
      clearInterval(expireTimer);
      el.textContent = '00:00';
      showDialog('O tempo do PIX esgotou.', { okText: 'OK' }).then(() => {
        localStorage.removeItem('currentPayment');
        if (pollTimer) clearTimeout(pollTimer);
        resetCheckout();
      });
      return;
    }
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  clearInterval(expireTimer);
  tick();
  expireTimer = setInterval(tick, 1000);
}

function showQR(data) {
  document.querySelector('.qr-panel').style.display       = 'block';
  document.getElementById('qrPlaceholder').style.display = 'none';
  document.getElementById('qrSection').style.display     = 'block';
  document.getElementById('qrImg').src                   = data.qrImage;
  document.getElementById('copyCode').textContent        = data.qrCode;
  document.getElementById('paymentStatus').textContent   = data.status;
  document.querySelector('.payment-instructions').style.display = 'none';
  if (qrCountdown) qrCountdown.style.display = 'block';
  gridEl.classList.add('step-2');
  if (stepCount) stepCount.textContent = '2 de 2';
  step = 2;
  startExpireCountdown(data.expiresAt);
  expireCountdownStarted = true;
  localStorage.setItem('currentPayment', JSON.stringify(data));
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
    body: JSON.stringify({ amount, cpf: buyerCPF })
  });
  const data = await resp.json();
  if (!resp.ok) {
    await showDialog(data.error || 'Erro ao gerar pagamento', { okText: 'OK' });
    return;
  }

  currentPayId = data.id;  // ← gateway retorna `id


  // avisa o servidor para simular o pagamento
  fetch('/api/simulate-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: currentPayId, amount: amount / 100 })
  }).catch(err => console.error('Falha ao simular pagamento', err));

  // dispara simulação de pagamento no webhook de testes
  simulatePayment(currentPayId, amount / 100);


  showQR(data);

  // polling de status
  loadPayment(currentPayId);
});

// 3) Consulta o status do pagamento e atualiza a tela
async function loadPayment(id) {
  const resp = await fetch(`/api/payment-status?id=${id}`);
  const data = await resp.json();
  if (!resp.ok) {
    await showDialog(data.error || 'Falha ao consultar pagamento', { okText: 'OK' });
    return;
  }

  document.getElementById('qrImg').src                 = data.qrImage;
  document.getElementById('copyCode').textContent      = data.qrCode;
  document.getElementById('paymentStatus').textContent = data.status;
  if (!expireCountdownStarted && data.expiresAt) {
    startExpireCountdown(data.expiresAt);
    expireCountdownStarted = true;
    localStorage.setItem('currentPayment', JSON.stringify({
      id: currentPayId,
      qrImage: data.qrImage,
      qrCode: data.qrCode,
      status: data.status,
      expiresAt: data.expiresAt
    }));
  } else {
    const saved = localStorage.getItem('currentPayment');
    if (saved) {
      const prev = JSON.parse(saved);
      localStorage.setItem('currentPayment', JSON.stringify({
        ...prev,
        status: data.status
      }));
    }
  }

  if (data.status === 'pending') {
    pollTimer = setTimeout(() => loadPayment(id), 5000);
  } else if (data.status === 'paid' || data.status === 'confirmed') {
    finalizePurchase();
  }
}

// Envia evento para simular pagamento PIX
async function simulatePayment(id, amount) {
  try {
    await fetch('https://sandbox.paymentgateway.ideamaker.com.br/webhook/idea/gateway', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: {
          type: 'pix',
          createdAt: new Date().toISOString(),
          data: {
            pix: {
              id,
              amount,
              amountPaid: amount,
              status: 'paid'
            }
          }
        }
      })
    });
  } catch (err) {
    console.error('Falha ao simular pagamento', err);
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
  localStorage.removeItem('currentPayment');
}
