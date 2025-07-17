// public/js/consulta.js
// Fluxo de consulta em 3 passos: CPF -> produtos -> resultados paginados

let currentCpf = '';
let selectedProducts = [];
let currentPage = 1;
let currentStep = 1; // 1: CPF, 2: produtos, 3: resultados
const limit = 10;

const stepCpf = document.getElementById('stepCpf');
const stepProducts = document.getElementById('stepProducts');
const resultsSection = document.getElementById('resultsSection');
const pageNumEl = document.getElementById('pageNum');
const resultsEl = document.getElementById('results');
const btnBack = document.getElementById('btnBack');
const productList = stepProducts.querySelector('.product-list');
const productMsg = stepProducts.querySelector('p');

// Passo 1: coleta CPF, consulta usuário e avança
const cpfForm = document.getElementById('cpfForm');
cpfForm.addEventListener('submit', async e => {
  e.preventDefault();
  currentCpf = document.getElementById('cpf').value.replace(/\D/g, '').trim();
  if (!currentCpf) return alert('Por favor, informe um CPF válido');

  try {
    const resp = await fetch(`/api/user/${currentCpf}`);
    const data = await resp.json();
    if (resp.status === 400) {
      return alert(data.error || 'Usuário não encontrado');
    }
    if (!resp.ok) throw new Error(data.error || 'Falha ao consultar usuário');
    if (data.bloqueada) {
      return alert('Usuário bloqueado');
    }

    productList.innerHTML = '';
    if (Array.isArray(data.compras) && data.compras.length) {
      const products = [...new Set(data.compras.map(c => c.produto))];
      products.forEach(p => {
        const label = document.createElement('label');
        label.innerHTML = `<input type="checkbox" name="produtos" value="${p}" checked> ${p}`;
        productList.appendChild(label);
      });
      productMsg.textContent = 'Selecione o produto';
    } else {
      productMsg.textContent = 'Nenhuma compra encontrada';
    }

    stepCpf.style.display = 'none';
    stepProducts.style.display = 'block';
    currentStep = 2;
  } catch (err) {
    alert(err.message);
  }
});

// Passo 2: seleciona produtos e busca cupons
const productForm = document.getElementById('productForm');
productForm.addEventListener('submit', e => {
  e.preventDefault();
  selectedProducts = Array.from(productList.querySelectorAll('input[name="produtos"]:checked')).map(i => i.value);
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

btnBack.addEventListener('click', () => {
  if (currentStep === 3) {
    resultsSection.style.display = 'none';
    stepProducts.style.display = 'block';
    currentStep = 2;
  } else if (currentStep === 2) {
    stepProducts.style.display = 'none';
    stepCpf.style.display = 'block';
    currentStep = 1;
  }
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
    currentStep = 3;
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
