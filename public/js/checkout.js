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
});

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
