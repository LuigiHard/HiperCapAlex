window.addEventListener('DOMContentLoaded', () => {
  fetch('/api/promotion')
    .then(r => r.json())
    .then(promo => {
      if (promo && promo.banner) {
        const img = document.getElementById('promoBanner');
        if (img) img.src = promo.banner;
      }
    })
    .catch(err => console.error('Promo fetch error', err));
});
