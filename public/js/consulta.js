// public/js/consulta.js
// Fluxo de consulta em 3 passos: CPF -> produtos -> resultados paginados

let currentCpf = '';
let selectedProducts = [];
let currentPage = 1;
const limit = 10;

const stepCpf = document.getElementById('stepCpf');
const stepProducts = document.getElementById('stepProducts');
const resultsSection = document.getElementById('resultsSection');
const pageNumEl = document.getElementById('pageNum');
const resultsEl = document.getElementById('results');

// Passo 1: coleta CPF e avança
const cpfForm = document.getElementById('cpfForm');
cpfForm.addEventListener('submit', e => {
  e.preventDefault();
  currentCpf = document.getElementById('cpf').value.trim();
  if (!currentCpf) return;
  stepCpf.style.display = 'none';
  stepProducts.style.display = 'block';
});

// Passo 2: seleciona produtos e busca cupons
const productForm = document.getElementById('productForm');
productForm.addEventListener('submit', e => {
  e.preventDefault();
  selectedProducts = Array.from(document.querySelectorAll('input[name="produtos"]:checked')).map(i => i.value);
  if (!selectedProducts.length) return alert('Selecione ao menos um produto');
  currentPage = 1;
  fetchCoupons();
});

document.getElementById('prevPage').addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--;
    fetchCoupons();
  }
});

document.getElementById('nextPage').addEventListener('click', () => {
  currentPage++;
  fetchCoupons();
});

async function fetchCoupons() {
  try {
    const resp = await fetch(`/api/coupons/${currentPage}/${limit}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpf: currentCpf, produtos: selectedProducts })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Erro ao buscar cupons');
    displayResults(data);
    pageNumEl.textContent = currentPage;
    stepProducts.style.display = 'none';
    resultsSection.style.display = 'block';
  } catch (err) {
    alert(err.message);
  }
}

function displayResults(data) {
  resultsEl.innerHTML = '';
  Object.entries(data).forEach(([produto, cupons]) => {
    const title = document.createElement('h3');
    title.textContent = produto;
    resultsEl.appendChild(title);

    cupons.forEach(c => {
      const card = document.createElement('div');
      card.className = 'coupon-card';
      card.innerHTML = `
        <p><strong>ID:</strong> ${c.idTituloPromocao}</p>
        <p><strong>Data:</strong> ${c.dataCupom}</p>
      `;
      const btn = document.createElement('button');
      btn.textContent = 'Mostrar QRCode';
      const img = document.createElement('img');
      img.className = 'coupon-qrcode';
      btn.addEventListener('click', () => {
        if (img.src) {
          img.style.display = img.style.display === 'none' ? 'block' : 'none';
        } else {
          QRCode.toDataURL(c.autenticacao, (err, url) => {
            if (!err) {
              img.src = url;
              img.style.display = 'block';
            }
          });
        }
      });
      card.appendChild(btn);
      card.appendChild(img);
      resultsEl.appendChild(card);
    });
  });
}
