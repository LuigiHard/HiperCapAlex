// public/js/consulta.js
// Fluxo de consulta em 3 passos: CPF -> produtos -> resultados paginados

let currentCpf = '';
let selectedProducts = [];
let currentPage = 1;
let currentStep = 1; // 1: CPF, 2: produtos, 3: resultados
const limit = 3; // mostra 3 cupons por página
let promoData = null;
let hasNextPage = false; // resultado do prefetch da próxima página
// Carrega detalhes da promoção para exibir na consulta
fetch('/api/promotion')
  .then(r => r.json())
  .then(p => {
    promoData = p;
  })
  .catch(err => console.error('Promo fetch error', err));

const stepCpf        = document.getElementById('stepCpf');
const stepProducts   = document.getElementById('stepProducts');
const resultsSection = document.getElementById('resultsSection');
const errorMsgEl     = document.getElementById('errorMsg');
const pageNumEl      = document.getElementById('pageNum');
const resultsEl      = document.getElementById('results');
const pageIndicatorEl = document.getElementById('pageIndicator');
const btnBack        = document.getElementById('btnBack');
const productList    = stepProducts.querySelector('.product-list');
const productMsg     = stepProducts.querySelector('p');
// Botões de paginação
const prevBtn        = document.getElementById('prevPage');
const nextBtn        = document.getElementById('nextPage');

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
 * Verifica se há ao menos um cupom para o CPF informado.
 * Retorna um objeto { ok: boolean, message?: string }
 */
async function checkCouponsForCpf(cpf) {
  try {
    const resp = await fetch('/api/coupons/1/1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpf, produtos: ['hipercapbrasil'] })
    });
    const data = await resp.json();

    if (!resp.ok || data.mensagem) {
      return { ok: false, message: data.mensagem || 'Não foram encontrados cupons.' };
    }

    return { ok: true };
  } catch (err) {
    console.error('Erro ao verificar cupons', err);
    return { ok: false, message: 'Erro ao buscar cupons.' };
  }
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

  const check = await checkCouponsForCpf(currentCpf);
  if (!check.ok) {
    await showDialog(check.message || 'Não foram encontrados cupons.', { okText: 'OK' });
    stepCpf.style.display      = 'block';
    stepProducts.style.display = 'none';
    currentStep = 1;
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

function showPageIndicator(page) {
  if (!pageIndicatorEl) return;
  pageIndicatorEl.textContent = `Página ${page}`;
  pageIndicatorEl.style.display = 'block';
  pageIndicatorEl.classList.add('show');
  clearTimeout(showPageIndicator._t);
  showPageIndicator._t = setTimeout(() => {
    pageIndicatorEl.classList.remove('show');
    pageIndicatorEl.style.display = 'none';
  }, 1000);
}


function updatePaginationButtons() {
  // Prev
  prevBtn.disabled = currentPage <= 1;
  prevBtn.classList.toggle('disabled', currentPage <= 1);

  // Next: usa resultado do prefetch para decidir se há próxima página
  const disableNext = !hasNextPage;
  nextBtn.disabled = disableNext;
  nextBtn.classList.toggle('disabled', disableNext);
}

/** Prefetch para decidir se habilita o Next silenciosamente */
async function prefetchNextPage() {
  try {
    const resp = await fetch(
      `/api/coupons/${currentPage + 1}/${limit}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf: currentCpf, produtos: selectedProducts })
      }
    );
    const data = await resp.json().catch(() => ({}));

    const noCoupons =
      !resp.ok ||
      (data.mensagem && data.mensagem.includes('Não foram encontrados cupons'));

    hasNextPage = !noCoupons;

  } catch (err) {
    console.error('Prefetch error', err);
    hasNextPage = false;
  }
}

// Navegação Prev
prevBtn.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--;
    pageNumEl.textContent = currentPage;
    showPageIndicator(currentPage);
    fetchCoupons();
  }
});

// ------------- ATUALIZAÇÃO PRINCIPAL: NEXT SOMENTE EM CASO DE SUCESSO -------------
nextBtn.addEventListener('click', async () => {
  if (nextBtn.disabled) return;

  const attemptedPage = currentPage + 1;

  try {
    // 1) Tenta buscar diretamente ABRINDO A NOVA PÁGINA SEM ALTERAR currentPage
    const resp = await fetch(
      `/api/coupons/${attemptedPage}/${limit}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf: currentCpf, produtos: selectedProducts })
      }
    );
    const data = await resp.json();

    // 2) Se der erro ou “não há cupons”, mantemos a página atual e desabilitamos Next
    if (!resp.ok || data.mensagem) {
      hasNextPage = false;
      nextBtn.disabled = true;
      nextBtn.classList.add('disabled');
      return;
    }

    // 3) Deu tudo certo: atualizamos currentPage, UI e já prefetch a próxima
    currentPage = attemptedPage;
    pageNumEl.textContent = currentPage;
    showPageIndicator(currentPage);

    // Limpa resultados antigos e renderiza os novos
    resultsEl.innerHTML = '';
    await displayResults(data);

    // Prefetch para saber se há ainda uma página seguinte
    await prefetchNextPage();
    updatePaginationButtons();

  } catch (err) {
    console.error('Error fetching next page', err);
    // Em caso de falha de rede, só desabilita Next para evitar loop
    hasNextPage = false;
    nextBtn.disabled = true;
    nextBtn.classList.add('disabled');
  }
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
  } else if (currentStep === 1) {
    window.location.href = '/';
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
      // API diz “Não foram encontrados cupons...”
      errorMsgEl.textContent       = data.mensagem;
      errorMsgEl.style.display     = 'block';
      resultsSection.style.display = 'flex';
      stepProducts.style.display   = 'none';
      currentStep                  = 3;
      resultsEl.innerHTML          = '';
      // garante botões corretos
      await prefetchNextPage();
      updatePaginationButtons();

    } else {
      // renderiza resultados normalmente
      await displayResults(data);
      pageNumEl.textContent        = currentPage;
      stepProducts.style.display   = 'none';
      resultsSection.style.display = 'flex';
      currentStep                  = 3;
      // prefetch e atualiza botões
      await prefetchNextPage();
      updatePaginationButtons();
    }

  } catch (err) {
    console.error('[AXIOS ERROR]', err);

    // 1) limpar qualquer cupom que estava na tela
    resultsEl.innerHTML = '';
    // 2) exibir mensagem “nenhum cupom” (opcional, ou ajuste conforme UX)
    errorMsgEl.textContent       = 'Não foram encontrados cupons para esta página.';
    errorMsgEl.style.display     = 'block';
    resultsSection.style.display = 'flex';
    stepProducts.style.display   = 'none';
    currentStep                  = 3;
    // 3) desabilita NEXT
    hasNextPage = false;
    nextBtn.disabled = true;
    nextBtn.classList.add('disabled');

    // lance o erro para que o listener do Next faça o rollback
    throw err;
  }
}
/**
 * Renderiza os cupons na tela em cards HiperCap‑style
 */
function createDezenasTable(nums) {
  const table = document.createElement('table');
  table.className = 'dezenas-table';
  const tbody = document.createElement('tbody');
  for (let i = 0; i < nums.length; i += 5) {
    const row = document.createElement('tr');
    nums.slice(i, i + 5).forEach(n => {
      const td = document.createElement('td');
      td.textContent = n.toString().padStart(2, '0');
      td.addEventListener('click', () => td.classList.toggle('selected'));
      row.appendChild(td);
    });
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  return table;
}

function createNumeroSorteTable(numero) {
  const digits = numero.toString().padStart(5, '0').split('');
  const table = document.createElement('table');
  table.className = 'numero-sorte-table';
  const row = document.createElement('tr');
  digits.forEach(d => {
    const td = document.createElement('td');
    td.textContent = d;
    td.addEventListener('click', () => td.classList.toggle('selected'));
    row.appendChild(td);
  });
  table.appendChild(row);
  return table;
}

function showQr(auth) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';
  const canvas = document.createElement('canvas');
  try {
    QRCode.toCanvas(canvas, auth);
  } catch (err) { console.error('QR error', err); }
  modal.appendChild(canvas);
  const authDiv = document.createElement('div');
  authDiv.className = 'auth';
  authDiv.textContent = 'Autenticação: ' + auth;
  modal.appendChild(authDiv);
  const closeBtn = document.createElement('button');
  closeBtn.className = 'primary';
  closeBtn.textContent = 'Fechar';
  closeBtn.addEventListener('click', () => {
    document.body.removeChild(overlay);
  });
  modal.appendChild(closeBtn);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}
/**
 * Renderiza a estrutura de dezenas
 * @param {number[]} dezenas      – array de números sorteados
 * @param {string} tituloNumero   – ID do título (e.g. "5.977.893")
 * @param {string} autenticacao   – código de autenticação
 * @param {number} chanceIndex    – índice da chance (1, 2, …)
 * @returns {HTMLDivElement}      – container .dezenas-container
 */
function renderDezenasSection(
  dezenas,
  tituloNumero,
  autenticacao,
  numeroSorte = '',
  chanceIndex = 1,
  imgUrl = ''
) {
  const container = document.createElement('div');
  container.className = 'dezenas-container';

  // Header
  const header = document.createElement('div');
  header.className = 'dezenas-header';

  const chanceEl = document.createElement('p');
  chanceEl.className = 'dezenas-chance';
  chanceEl.textContent = `Chance (${chanceIndex})`;
  header.appendChild(chanceEl);

  const info = document.createElement('div');
  info.className = 'dezenas-info';
  const lbl = document.createElement('p');
  lbl.className = 'dezenas-info-label';
  lbl.textContent = 'Nº do Título';
  const val = document.createElement('p');
  val.className = 'dezenas-info-value';
  val.textContent = tituloNumero;
  info.appendChild(lbl);
  info.appendChild(val);
  header.appendChild(info);

  container.appendChild(header);

  // Imagem do sorteio
  if (imgUrl) {
    const img = document.createElement('img');
    img.className = 'sorteio-img';
    img.src = imgUrl;
    img.alt = 'Prêmio';
    container.appendChild(img);
  }

  // Table of numbers
  const table = createDezenasTable(dezenas);
  table.classList.add('dezenas-table');
  container.appendChild(table);

  // Número da sorte
  if (numeroSorte) {
    const numTable = createNumeroSorteTable(numeroSorte);
    container.appendChild(numTable);
  }

  // Authentication
  const authDiv = document.createElement('div');
  authDiv.className = 'dezenas-auth';
  const authP = document.createElement('p');
  authP.className = 'dezenas-auth-text';
  authP.textContent = `Autenticação: ${autenticacao}`;
  authDiv.appendChild(authP);
  container.appendChild(authDiv);

  return container;
}

async function displayResults(data) {
  // limpa resultados anteriores
  resultsEl.innerHTML = '';
  const resultadoCache = {};

  for (const [produto, cupons] of Object.entries(data)) {
    const productTitle = document.createElement('h3');
    productTitle.textContent = produto;
    productTitle.style.display = 'none';
    productTitle.style.margin = '1rem 0';
    resultsEl.appendChild(productTitle);

    const sortedCupons = cupons.sort(
      (a, b) => parseDate(b.dataCupom) - parseDate(a.dataCupom)
    );
    for (const c of sortedCupons) {
      let promoInfo = promoData;
      if (c.promocao?.finalizada) {
        const idPromo = c.promocao.idPromocao;
        try {
          if (resultadoCache[idPromo]) {
            promoInfo = resultadoCache[idPromo];
          } else {
            const resp = await fetch(`/api/result/${idPromo}`);
            promoInfo = await resp.json();
            resultadoCache[idPromo] = promoInfo;
          }
        } catch (err) {
          console.error('Result fetch error', err);
        }
      }
      const sorteiosSorted = Array.isArray(promoInfo?.sorteios)
        ? promoInfo.sorteios.slice().sort((a, b) => a.ordem - b.ordem)
        : [];
      const sorteObj = Array.isArray(c.numeroSorte) ? c.numeroSorte[0] || {} : {};
      const dezenasCupom = sorteObj.dezenas || [];
      const numeroCupom  = sorteObj.numero  || '';
      // 1) Criamos o wrapper flex‑col
      const wrapper = document.createElement('div');
      wrapper.className = 'coupon';


      // 2) Coupon card original (resumo + QR)
      const card = document.createElement('div');
      card.className = 'coupon-card';

      // --- resumo ---
      const summary = document.createElement('div');
      summary.className = 'coupon-summary';
      const [d, t] = (c.dataCupom || '').split(' ');
      const premio =

        c.promocao?.titulo ||
        promoInfo?.tituloPromocao ||
        promoInfo?.titulo ||
        '';
      summary.innerHTML = `
          <div class="summary-col">
            <div class="summary-col-block">
              <div class="summary-row"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.6668 1.66659H11.0002V0.999919C11.0002 0.599919 10.7335 0.333252 10.3335 0.333252C9.9335 0.333252 9.66683 0.599919 9.66683 0.999919V1.66659H4.3335V0.999919C4.3335 0.599919 4.06683 0.333252 3.66683 0.333252C3.26683 0.333252 3.00016 0.599919 3.00016 0.999919V1.66659H2.3335C1.20016 1.66659 0.333496 2.53325 0.333496 3.66659V4.33325H13.6668V3.66659C13.6668 2.53325 12.8002 1.66659 11.6668 1.66659ZM0.333496 11.6666C0.333496 12.7999 1.20016 13.6666 2.3335 13.6666H11.6668C12.8002 13.6666 13.6668 12.7999 13.6668 11.6666V5.66659H0.333496V11.6666ZM10.3335 6.99992C10.7335 6.99992 11.0002 7.26659 11.0002 7.66659C11.0002 8.06659 10.7335 8.33325 10.3335 8.33325C9.9335 8.33325 9.66683 8.06659 9.66683 7.66659C9.66683 7.26659 9.9335 6.99992 10.3335 6.99992ZM10.3335 9.66659C10.7335 9.66659 11.0002 9.93325 11.0002 10.3333C11.0002 10.7333 10.7335 10.9999 10.3335 10.9999C9.9335 10.9999 9.66683 10.7333 9.66683 10.3333C9.66683 9.93325 9.9335 9.66659 10.3335 9.66659ZM7.00016 6.99992C7.40016 6.99992 7.66683 7.26659 7.66683 7.66659C7.66683 8.06659 7.40016 8.33325 7.00016 8.33325C6.60016 8.33325 6.3335 8.06659 6.3335 7.66659C6.3335 7.26659 6.60016 6.99992 7.00016 6.99992ZM7.00016 9.66659C7.40016 9.66659 7.66683 9.93325 7.66683 10.3333C7.66683 10.7333 7.40016 10.9999 7.00016 10.9999C6.60016 10.9999 6.3335 10.7333 6.3335 10.3333C6.3335 9.93325 6.60016 9.66659 7.00016 9.66659ZM3.66683 6.99992C4.06683 6.99992 4.3335 7.26659 4.3335 7.66659C4.3335 8.06659 4.06683 8.33325 3.66683 8.33325C3.26683 8.33325 3.00016 8.06659 3.00016 7.66659C3.00016 7.26659 3.26683 6.99992 3.66683 6.99992ZM3.66683 9.66659C4.06683 9.66659 4.3335 9.93325 4.3335 10.3333C4.3335 10.7333 4.06683 10.9999 3.66683 10.9999C3.26683 10.9999 3.00016 10.7333 3.00016 10.3333C3.00016 9.93325 3.26683 9.66659 3.66683 9.66659Z" fill="#CC8500"></path></svg><div class="summary-col"><span>Data</span><span>${d || ''}</span></div></div>
              <div class="summary-row"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.00016 0.333252C3.3335 0.333252 0.333496 3.33325 0.333496 6.99992C0.333496 10.6666 3.3335 13.6666 7.00016 13.6666C10.6668 13.6666 13.6668 10.6666 13.6668 6.99992C13.6668 3.33325 10.6668 0.333252 7.00016 0.333252ZM9.3335 8.33325C9.1335 8.66659 8.7335 8.73325 8.40016 8.59992L6.66683 7.59992C6.46683 7.46659 6.3335 7.26659 6.3335 6.99992V3.66659C6.3335 3.26659 6.60016 2.99992 7.00016 2.99992C7.40016 2.99992 7.66683 3.26659 7.66683 3.66659V6.59992L9.06683 7.39992C9.40016 7.59992 9.46683 7.99992 9.3335 8.33325Z" fill="#CC8500"></path></svg> <div class=summary-col><span>Horário</span><span>${t || ''}</span></div></div>
            </div>
            <div class="competition-status ${c.promocao?.finalizada === false ? 'status-active' : 'status-ended'}">
              <p class="status-label">
                ${c.promocao?.finalizada === false ? 'Concorrendo' : 'Encerrada'}
              </p>
            </div>
          </div>
          <div class="summary-col" style="gap: .75rem;">
            <div class="summary-col"><span>Nº do Título</span><span>${numeroCupom}</span></div>
            <div class="summary-col-premio"><span>Prêmio</span><p>${premio}</p></div>
          </div>

        `;
      card.appendChild(summary);

        // --- botão QR ---
        const qrBtn = document.createElement('button');
        qrBtn.type = 'button';
        qrBtn.className = 'qr-btn';
        qrBtn.innerHTML = '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M0 224h192V32H0v192zM64 96h64v64H64V96zm192-64v192h192V32H256zm128 128h-64V96h64v64zM0 480h192V288H0v192zm64-128h64v64H64v-64zm352-64h32v128h-96v-32h-32v96h-64V288h96v32h64v-32zm0 160h32v32h-32v-32zm-64 0h32v32h-32v-32z"></path></svg> QR Code';
        qrBtn.addEventListener('click', () => showQr(c.autenticacao || ''));
        card.appendChild(qrBtn);
        // add bellow button
        const authInfo = document.createElement('span');
        authInfo.className = 'auth-info';
        authInfo.innerHTML = `Autenticação: ${c.autenticacao || ''}`;
        card.appendChild(authInfo);
        // adiciona o card ao wrapper
        wrapper.appendChild(card);

        // 3) Nova div .sorteios, fora do coupon-card
        const sorteiosContainer = document.createElement('div');
        sorteiosContainer.className = 'sorteios';

        // elemento de toggle
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'sorteio-btn';
        toggleBtn.innerHTML = '<svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="chevron-down" class="svg-inline--fa fa-chevron-down sb3f95b" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M233.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 338.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z"></path></svg> Ver dezenas';

        // lista de sorteios (inicialmente oculta)
        const sorteioList = document.createElement('div');
        sorteioList.style.display = 'none';
        
        // build one entry per sorteio in the promotion,
        // using the appropriate field for each tipoSorteio
        const chancesArray = sorteiosSorted.map(sorteio => {
          switch (sorteio.codigoTipoSorteio) {
            case 'globosorte':
              // globosorte → use the dezenas array
            return { dezenas: dezenasCupom, numero: '' };
            case 'girosorte':
              // girosorte → use the single "numero" field
              return { dezenas: [], numero: numeroCupom };
            default:
              // any other type: show both if available
              return {
                dezenas: c.dezenas   ?? [],
                numero:  c.numero    ?? ''
              };
          }
        });

        chancesArray.forEach((chanceObj, idx) => {
          // idx+1 para exibir Chance (1), (2), …
          const sorteioInfo = sorteiosSorted[idx] || null;
          const dezenaSection = renderDezenasSection(
            chanceObj.dezenas,
            numeroCupom,
            c.autenticacao || '',
            chanceObj.numero || '',
            idx + 1,
            sorteioInfo?.urlImagem || ''
          );
          sorteioList.appendChild(dezenaSection);
        });

        // adiciona elementos à div de sorteios
        sorteiosContainer.appendChild(toggleBtn);
        sorteiosContainer.appendChild(sorteioList);
        // alterna exibição da lista e ajusta layout
        toggleBtn.addEventListener('click', () => {
          const open = sorteioList.style.display === 'none';
          sorteioList.style.display = open ? 'block' : 'none';
          toggleBtn.classList.toggle('open', open);
          
          if (open) {
            toggleBtn.innerHTML = '<svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="chevron-up" class="svg-inline--fa fa-chevron-up sb3f95b" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M233.4 105.4c12.5-12.5 32.8-12.5 45.3 0l192 192c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L256 173.3 86.6 342.6c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3l192-192z"></path></svg> Esconder dezenas';
          } else {
            toggleBtn.innerHTML = '<svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="chevron-down" class="svg-inline--fa fa-chevron-down sb3f95b" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M233.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 338.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z"></path></svg> Ver dezenas';
          }

          // 1) Adiciona margin-bottom ao wrapper quando aberto, remove quando fechado
          wrapper.style.marginBottom = open ? '1.25rem' : '0';

          // 2) Move o botão para baixo em relação aos sorteios quando aberto e volta quando fechado
          if (open) {
            sorteiosContainer.appendChild(toggleBtn);
          } else {
            sorteiosContainer.insertBefore(toggleBtn, sorteioList);
          }
        });

        // adiciona o container de sorteios ao wrapper
        wrapper.appendChild(sorteiosContainer);

        // 4) anexa tudo ao container de resultados
        resultsEl.appendChild(wrapper);
    }
  }
}

// Mantém busca automática quando parâmetro cpf estiver na URL
const params = new URLSearchParams(window.location.search);
const cpfQuery = params.get('cpf');
if (cpfQuery) {
  (async () => {
    currentCpf = cpfQuery.replace(/\D/g, '');
    const check = await checkCouponsForCpf(currentCpf);
    const input = document.getElementById('cpf');
    if (input) input.value = cpfQuery.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

    if (!check.ok) {
      await showDialog(check.message || 'N\u00e3o foram encontrados cupons.', { okText: 'OK' });
      stepCpf.style.display      = 'block';
      stepProducts.style.display = 'none';
      currentStep = 1;
      return;
    }

    productList.innerHTML = '';
    appendProduct('hipercapbrasil');
    productMsg.textContent   = 'Selecione o produto';
    stepCpf.style.display      = 'none';
    stepProducts.style.display = 'block';
    currentStep = 2;
  })();
}
