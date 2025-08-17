window.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  const img = document.getElementById('promoBanner');
  const show = () => { body.style.display = 'block'; };

  fetch('/api/sorteio')
    .then(r => r.json())
    .then(data => {
      const banner = data?.bannerPrincipal || data?.imagemDoTitulo || data?.urlImagem;
      if (banner && img) {
        img.onload = show;
        img.onerror = show;
        img.src = banner;
      } else {
        show();
      }
    })
    .catch(err => { console.error('Sorteio fetch error', err); show(); });
});
