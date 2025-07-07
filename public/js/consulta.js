// public/js/consulta.js

document.getElementById('lookupForm')
  .addEventListener('submit', async e => {
    e.preventDefault();
    const cpf  = document.getElementById('cpfLookup').value.trim();
    const resp = await fetch(`/api/coupons?cpf=${cpf}`);
    const data = await resp.json();
    if (!resp.ok) return alert(data.error || 'Erro na consulta');

    const container = document.getElementById('results');
    if (data.titulos && data.titulos.length) {
      container.innerHTML = `
        <ul>
          ${data.titulos.map(t =>
            `<li><strong>${t.idTitulo}</strong> — ${t.status} — Dezenas: ${t.dezenas.join(', ')}</li>`
          ).join('')}
        </ul>`;
    } else {
      container.innerHTML = '<p>Nenhum cupom encontrado para este CPF.</p>';
    }
    container.style.display = 'block';
  });
