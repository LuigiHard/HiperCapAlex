// public/js/results.js

function parseDate(str) {
  if (typeof str === 'string' && str.includes('/')) {
    const [d, m, rest] = str.split('/');
    const [y, time] = rest.split(' ');
    return new Date(`${y}-${m}-${d}T${time || '00:00'}`);
  }
  return new Date(str);
}

function createDezenasTable(nums) {
  if (!Array.isArray(nums)) return document.createElement('div');
  const table = document.createElement('table');
  table.className = 'dezenas-table';
  const tbody = document.createElement('tbody');
  for (let i = 0; i < nums.length; i += 5) {
    const row = document.createElement('tr');
    nums.slice(i, i + 5).forEach(n => {
      const td = document.createElement('td');
      td.textContent = n.toString().padStart(2, '0');
      row.appendChild(td);
    });
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  return table;
}

async function loadPromotions() {
  const select = document.getElementById('promoSelect');
  const resp = await fetch('/api/promo-results');
  const data = await resp.json();
  const list = Array.isArray(data.values) ? data.values : [];
  list.sort((a, b) => parseDate(b.dataSorteioPrincipal) - parseDate(a.dataSorteioPrincipal));
  list.forEach(p => {
    const opt = document.createElement('option');
    const [date] = (p.dataSorteioPrincipal || '').split(' ');
    opt.value = p.id;
    opt.textContent = `${date} - ${p.titulo}`;
    select.appendChild(opt);
  });
  if (list.length) {
    select.value = list[0].id;
    loadResult(list[0].id);
  }
}

async function loadResult(id) {
  const container = document.getElementById('resultsContainer');
  container.innerHTML = 'Carregando...';
  const resp = await fetch(`/api/promo-results/${id}`);
  const data = await resp.json();
  container.innerHTML = '';
  if (!Array.isArray(data.sorteios)) return;
  data.sorteios.sort((a, b) => a.ordem - b.ordem);
  data.sorteios.forEach(s => {
    const item = document.createElement('div');
    item.className = 'accordion-item';

    const btn = document.createElement('button');
    btn.className = 'accordion-button';
    btn.textContent = s.descricao || `Sorteio ${s.ordem}`;
    item.appendChild(btn);

    const content = document.createElement('div');
    content.className = 'accordion-content';

    if (s.urlImagem) {
      const img = document.createElement('img');
      img.className = 'sorteio-img';
      img.src = s.urlImagem;
      img.alt = s.descricao || '';
      content.appendChild(img);
    }

    let dezenas = Array.isArray(s.dezenas) ? s.dezenas : [];
    if (!dezenas.length && Array.isArray(s.ganhadores) && s.ganhadores[0]?.dezenas) {
      dezenas = s.ganhadores[0].dezenas;
    }
    if (dezenas.length) {
      const table = createDezenasTable(dezenas);
      content.appendChild(table);
    }

    if (Array.isArray(s.ganhadores)) {
      const ul = document.createElement('ul');
      ul.className = 'winner-list';
      s.ganhadores.forEach(g => {
        const li = document.createElement('li');
        const city = g.cidade ? ` - ${g.cidade}` : '';
        li.textContent = `${g.nome}${city} - Título ${g.titulo}`;
        ul.appendChild(li);
      });
      content.appendChild(ul);
    }

    item.appendChild(content);
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      if (content.style.display === 'block') {
        content.style.display = 'none';
      } else {
        content.style.display = 'block';
      }
    });

    container.appendChild(item);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const select = document.getElementById('promoSelect');
  select.addEventListener('change', () => loadResult(select.value));
  loadPromotions();
});
