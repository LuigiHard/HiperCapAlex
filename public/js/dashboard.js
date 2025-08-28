async function loadMetrics() {
  try {
    const resp = await fetch('/dashboard/metrics');
    const data = await resp.json();

    const createChart = (id, label, counts) => {
      const labels = Object.keys(counts);
      const values = Object.values(counts);
      new Chart(document.getElementById(id), {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label,
            data: values,
            backgroundColor: 'rgba(75, 192, 192, 0.5)'
          }]
        }
      });
    };

    createChart('cpfChart', 'CPFs', data.cpfCounts);
    createChart('protocoloChart', 'Protocolos', data.protocoloCounts);
    createChart('statusChart', 'Status', data.statusCounts);
  } catch (err) {
    console.error('Erro ao carregar métricas', err);
  }
}

loadMetrics();
