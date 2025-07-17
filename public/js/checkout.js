// public/js/checkout.js

// 1) Ao carregar a página busca a promoção e prepara a tela
let currentPrice = 0;
let currentQty   = 1;
let buyerCPF     = '';
let buyerPhone   = '';
let currentPayId = '';

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('qrSection').style.display = 'none';
  document.getElementById('qrPlaceholder').style.display = 'block';

  // Carrega a configuração da promoção
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
  currentPrice = price;
  currentQty = qty;

  const qtyInput = document.getElementById('quantityInput');
  const qtyDisplay = document.getElementById('quantity');
  const totalDisplay = document.getElementById('totalAmount');

  function update() {
    qtyInput.value = qty;
    qtyDisplay.textContent = qty;
    totalDisplay.textContent = (qty * price).toFixed(2).replace('.', ',');
    currentQty = qty;
  }

  update();

  // controles de quantidade
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

// 2) Ao enviar o formulário: chama /api/purchase e mostra o QR
document.getElementById('purchaseForm')
  .addEventListener('submit', async e => {
    e.preventDefault();
    buyerCPF   = document.getElementById('cpfInput').value.trim();
    buyerPhone = document.getElementById('phoneInput').value.trim();

    const amount = Math.round(currentQty * currentPrice * 100);
    const resp = await fetch('/api/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount })
    });
    const data = await resp.json();
    if (!resp.ok) return alert(data.error || 'Erro ao gerar pagamento');

    currentPayId = data.id;
    document.getElementById('purchaseForm').style.display = 'none';
    document.getElementById('qrPlaceholder').style.display = 'none';
    document.getElementById('qrSection').style.display = 'block';
    document.getElementById('qrImg').src = data.qrImage;
    document.getElementById('copyCode').textContent = data.qrCode;
    document.getElementById('paymentStatus').textContent = data.status;
    loadPayment(currentPayId);
  });

// Consulta o status do pagamento e atualiza a tela
async function loadPayment(id) {
  const resp = await fetch(`/api/payment-status?id=${id}`);
  const data = await resp.json();
  if (!resp.ok) return alert(data.error || 'Erro ao consultar pagamento');
  document.getElementById('qrImg').src = data.qrImage;
  document.getElementById('copyCode').textContent = data.qrCode;
  document.getElementById('paymentStatus').textContent = data.status;
  if (data.status === 'pending') {
    setTimeout(() => loadPayment(id), 5000);
  } else if (data.status === 'paid' || data.status === 'confirmed') {
    finalizePurchase();
  }
}

// Chama o backend para registrar o atendimento após pagamento
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
