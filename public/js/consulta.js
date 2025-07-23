// public/js/consulta.js
// Fluxo de consulta em 3 passos: CPF -> produtos -> resultados paginados

let currentCpf = '';
let selectedProducts = [];
let currentPage = 1;
let currentStep = 1; // 1: CPF, 2: produtos, 3: resultados
const limit = 10;

const stepCpf        = document.getElementById('stepCpf');
const stepProducts   = document.getElementById('stepProducts');
const resultsSection = document.getElementById('resultsSection');
const errorMsgEl     = document.getElementById('errorMsg');
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

  // Hardcoded product labels
  let productLabel = p;
  if (p === "Produto1") productLabel = "Label Especial 1";
  if (p === "Produto2") productLabel = "Super Label 2";
  if (p === "hipercapbrasil") productLabel = "HiperCap Brasil";
  // Add more mappings as needed

  label.innerHTML = `
    <div class="product-item__content">
      <img
        src="/img/products/${p}.png"
        alt="${p}"
        class="product-item__icon"
      />
      <span class="product-item__text">${productLabel}</span>
      <svg
        class="product-item__arrow"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
      >
        <path d="M10 17l5-5-5-5v10z"/>
      </svg>
    </div>
  `;

  // Ao clicar no produto, avança para o próximo passo
  label.addEventListener('click', () => {
    selectedProducts = [p];
    currentPage = 1;
    fetchCoupons();
  });

  productList.appendChild(label);
}

// Passo 1: coleta CPF e avança para seleção de produtos (produto fixo)
const cpfForm = document.getElementById('cpfForm');
cpfForm.addEventListener('submit', async e => {
  e.preventDefault();
  currentCpf = document
    .getElementById('cpf')
    .value
    .replace(/\D/g, '')
    .trim();

  if (!currentCpf) {
    await showDialog('Por favor, informe um CPF válido', { okText: 'OK' });
    return;
  }

  productList.innerHTML = '';
  appendProduct('hipercapbrasil');
  productMsg.textContent   = 'Selecione o produto';

  // próximo passo
  stepCpf.style.display      = 'none';
  stepProducts.style.display = 'block';
  currentStep = 2;
});

// Passo 2: seleção de produto agora acontece ao clicar no item

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
 * Passo 3: busca cupons via API,
 * renderiza e avança para resultados.
 */
async function fetchCoupons() {
  try {
    const resp = await fetch(
      `/api/coupons/${currentPage}/${limit}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf: currentCpf, produtos: selectedProducts })
      }
    );

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || 'Erro ao buscar cupons');
  }
  if (data.mensagem) {
    errorMsgEl.textContent      = data.mensagem;
    errorMsgEl.style.display    = 'block';
    resultsSection.style.display = 'block';
    stepProducts.style.display  = 'none';
    currentStep                 = 3;
    resultsEl.innerHTML         = '';
  } else {



    displayResults(data);
    pageNumEl.textContent       = currentPage;
    stepProducts.style.display  = 'none';
    resultsSection.style.display = 'block';
    currentStep                 = 3;
  }
  } catch (err) {
    await showDialog(err.message, { okText: 'OK' });
  }
}


/**
 * Renderiza os cupons na tela em cards HiperCap‑style
 */
function displayResults(data) {
  resultsEl.innerHTML = '';

  Object.entries(data).forEach(([produto, cupons]) => {
    const productTitle = document.createElement('h3');
    productTitle.textContent = produto;
    productTitle.style.textAlign = 'left';
    productTitle.style.margin = '1rem 0';
    resultsEl.appendChild(productTitle);

    cupons
      .sort((a, b) => parseDate(b.dataCupom) - parseDate(a.dataCupom))
      .forEach(c => {
        const banner = (c.promocao && c.promocao.banner) || c.imagemPremio || '';
        const chances = Array.isArray(c.numeroSorte) && c.numeroSorte.length
          ? c.numeroSorte
          : [{ dezenas: c.dezenas || [], numero: '' }];

        chances.forEach((chanceObj, idx) => {
          const dezenas = chanceObj.dezenas || [];

          const card = document.createElement('div');
          card.className = 'coupon-card';

          card.innerHTML = `
            <div class="coupon-img">${
              banner ? `<img src="${banner}" alt="ilustração promoção" />` : ''
            }</div>
            <div class="coupon-details">
              <div class="coupon-head">
                <p class="chance-label">Chance (${idx + 1})</p>
                <div class="title-number">
                  <p>Nº do Título</p>
                  <p>${c.idTituloPromocao}</p>
                </div>
              </div>
              <table class="dezenas-table"></table>
              <div class="auth">Autenticação: ${c.autenticacao || ''}</div>
            </div>
          `;

          const table = card.querySelector('.dezenas-table');
          const tbody = document.createElement('tbody');

          for (let i = 0; i < dezenas.length; i += 5) {
            const row = document.createElement('tr');
            dezenas.slice(i, i + 5).forEach(num => {
              const td = document.createElement('td');
              td.textContent = num.toString().padStart(2, '0');
              row.appendChild(td);
            });
            tbody.appendChild(row);
          }

          table.appendChild(tbody);
          resultsEl.appendChild(card);
        });
      });
  });
}


const params = new URLSearchParams(window.location.search);
const cpfQuery = params.get('cpf');
if (cpfQuery) {
  currentCpf = cpfQuery.replace(/\D/g, '');
  const input = document.getElementById('cpf');
  if (input) input.value = cpfQuery.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  selectedProducts = ['hipercapbrasil'];
  currentPage = 1;
  fetchCoupons();
}
