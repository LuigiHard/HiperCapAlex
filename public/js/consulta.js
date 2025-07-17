// public/js/consulta.js
// Fluxo de consulta em 3 passos: CPF -> produtos -> resultados paginados

let currentCpf = '';
let selectedProducts = [];
let currentPage = 1;
let currentStep = 1; // 1: CPF, 2: produtos, 3: resultados
let fallbackCoupons = null; // dados retornados via fallback
const limit = 10;

const stepCpf        = document.getElementById('stepCpf');
const stepProducts   = document.getElementById('stepProducts');
const resultsSection = document.getElementById('resultsSection');
const pageNumEl      = document.getElementById('pageNum');
const resultsEl      = document.getElementById('results');
const btnBack        = document.getElementById('btnBack');
const productList    = stepProducts.querySelector('.product-list');
const productMsg     = stepProducts.querySelector('p');

/**
 * Converte string “DD/MM/YYYY HH:mm” em Date;
 * caso contrário, usa o construtor padrão.
 */
function parseDate(str) {
  if (typeof str === 'string' && str.includes('/')) {
    const [d, m, yAndTime] = str.split('/');
    const [y, time] = yAndTime.split(' ');
    return new Date(`${y}-${m}-${d}T${time}`);
  }
  return new Date(str);
}

/**
 * Cria um <label> completo para cada produto,
 * com ícone, nome e seta, tudo clicável.
 */
function appendProduct(p) {
  const label = document.createElement('label');
  label.classList.add('product-item');

  label.innerHTML = `
    <input
      type="checkbox"
      name="produtos"
      value="${p}"
      checked
      style="display:none;"
    />
    <div class="product-item__content">
      <img
        src="/img/products/${p}.png"
        alt="${p}"
        class="product-item__icon"
      />
      <span class="product-item__text">${p}</span>
      <svg
        class="product-item__arrow"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
      >
        <path d="M10 17l5-5-5-5v10z"/>
      </svg>
    </div>
  `;

  // Toggle do checkbox e estado “checked”
  label.addEventListener('click', () => {
    const cb = label.querySelector('input[type="checkbox"]');
    cb.checked = !cb.checked;
    label.classList.toggle('product-item--checked', cb.checked);
  });

  productList.appendChild(label);
}

// Passo 1: coleta CPF, consulta usuário e avança para seleção de produtos
const cpfForm = document.getElementById('cpfForm');
cpfForm.addEventListener('submit', async e => {
  e.preventDefault();
  currentCpf = document
    .getElementById('cpf')
    .value
    .replace(/\D/g, '')
    .trim();

  if (!currentCpf) {
    return alert('Por favor, informe um CPF válido');
  }

  try {
    const resp = await fetch(`/api/user/${currentCpf}`);
    const data = await resp.json();
    productList.innerHTML = '';
    fallbackCoupons = null;

    if (resp.ok) {
      if (data.bloqueada) {
        return alert('Usuário bloqueado');
      }
      if (Array.isArray(data.compras) && data.compras.length) {
        // produtos únicos e ordenados
        const products = [
          ...new Set(data.compras.map(c => c.produto))
        ].sort();
        products.forEach(appendProduct);
        productMsg.textContent = 'Selecione o produto';
      } else {
        productMsg.textContent = 'Nenhuma compra encontrada';
      }
    } else if (data.fallbackData) {
      // fallback de cupons
      fallbackCoupons = data.fallbackData;
      const products = Object.keys(fallbackCoupons).sort();
      products.forEach(appendProduct);
      productMsg.textContent = products.length
        ? 'Selecione o produto'
        : 'Nenhuma compra encontrada';
    } else {
      if (resp.status === 400) {
        return alert(data.error || 'Usuário não encontrado');
      }
      throw new Error(data.error || 'Falha ao consultar usuário');
    }

    // próximo passo
    stepCpf.style.display      = 'none';
    stepProducts.style.display = 'block';
    currentStep = 2;
  } catch (err) {
    alert(err.message);
  }
});

// Passo 2: usuário confirma produtos e busca cupons
const productForm = document.getElementById('productForm');
productForm.addEventListener('submit', e => {
  e.preventDefault();
  selectedProducts = Array.from(
    productList.querySelectorAll('input[name="produtos"]:checked')
  ).map(i => i.value);

  if (!selectedProducts.length) {
    return alert('Selecione ao menos um produto');
  }
  currentPage = 1;
  fetchCoupons();
});

// Navegação de páginas
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

// Botão “voltar”
btnBack.addEventListener('click', () => {
  if (currentStep === 3) {
    resultsSection.style.display = 'none';
    stepProducts.style.display    = 'block';
    currentStep = 2;
  } else if (currentStep === 2) {
    stepProducts.style.display = 'none';
    stepCpf.style.display      = 'block';
    currentStep = 1;
  }
});

/**
 * Passo 3: busca cupons (API POST ou fallback interno),
 * renderiza e avança para resultados.
 */
async function fetchCoupons() {
  try {
    let data;
    if (fallbackCoupons) {
      data = {};
      selectedProducts.forEach(p => {
        if (fallbackCoupons[p]) {
          data[p] = [...fallbackCoupons[p]];
        }
      });
    } else {
      const resp = await fetch(
        `/api/coupons/${currentPage}/${limit}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON
            .stringify({ cpf: currentCpf, produtos: selectedProducts })
        }
      );
      data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Erro ao buscar cupons');
      }
    }

    displayResults(data);
    pageNumEl.textContent        = currentPage;
    stepProducts.style.display   = 'none';
    resultsSection.style.display = 'block';
    currentStep = 3;
  } catch (err) {
    alert(err.message);
  }
}

/**
 * Renderiza os cupons na tela, agrupados por produto.
 */
function displayResults(data) {
  resultsEl.innerHTML = '';
  Object.entries(data).forEach(([produto, cupons]) => {
    const title = document.createElement('h3');
    title.textContent = produto;
    resultsEl.appendChild(title);

    // mais recente primeiro
    cupons
      .sort((a, b) => parseDate(b.dataCupom) - parseDate(a.dataCupom))
      .forEach(c => {
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
            img.style.display =
              img.style.display === 'none' ? 'block' : 'none';
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
