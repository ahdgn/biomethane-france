/* ============================================
   Charts — Chart.js dashboard
   ============================================ */

const Charts = (() => {
  let chartTimeline, chartTypes, chartRegions, chartDepartments;

  const CHART_COLORS = [
    '#10b981', '#3b82f6', '#f59e0b', '#ef4444',
    '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
    '#f97316', '#6366f1', '#14b8a6', '#e11d48',
    '#a855f7', '#0ea5e9', '#22c55e',
  ];

  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#94a3b8',
          font: { family: 'Inter', size: 11 },
          padding: 12,
          usePointStyle: true,
          pointStyleWidth: 8,
        },
      },
      tooltip: {
        backgroundColor: '#1a1d27',
        titleColor: '#e2e8f0',
        bodyColor: '#94a3b8',
        borderColor: '#2e3347',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 10,
        titleFont: { family: 'Inter', weight: '600' },
        bodyFont: { family: 'Inter' },
      },
    },
  };

  function init() {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = 'Inter';
    Chart.defaults.borderColor = '#2e334733';

    chartTimeline = new Chart(document.getElementById('chart-timeline'), {
      type: 'line',
      data: { labels: [], datasets: [] },
      options: {
        ...defaultOptions,
        scales: {
          x: {
            grid: { color: '#2e334733' },
            ticks: { color: '#94a3b8' },
          },
          y: {
            position: 'left',
            grid: { color: '#2e334733' },
            ticks: { color: '#10b981' },
            title: { display: true, text: 'Nb. sites (cumulé)', color: '#10b981', font: { size: 11 } },
          },
          y1: {
            position: 'right',
            grid: { display: false },
            ticks: { color: '#3b82f6' },
            title: { display: true, text: 'Capacité GWh/an (cumulée)', color: '#3b82f6', font: { size: 11 } },
          },
        },
        plugins: {
          ...defaultOptions.plugins,
          legend: { ...defaultOptions.plugins.legend, position: 'top' },
        },
      },
    });

    chartTypes = new Chart(document.getElementById('chart-types'), {
      type: 'doughnut',
      data: { labels: [], datasets: [] },
      options: {
        ...defaultOptions,
        cutout: '55%',
        plugins: {
          ...defaultOptions.plugins,
          legend: {
            ...defaultOptions.plugins.legend,
            position: 'right',
            labels: {
              ...defaultOptions.plugins.legend.labels,
              font: { family: 'Inter', size: 10 },
              padding: 8,
            },
          },
        },
      },
    });

    chartRegions = new Chart(document.getElementById('chart-regions'), {
      type: 'bar',
      data: { labels: [], datasets: [] },
      options: {
        ...defaultOptions,
        indexAxis: 'y',
        plugins: {
          ...defaultOptions.plugins,
          legend: { display: false },
        },
        scales: {
          x: {
            grid: { color: '#2e334733' },
            ticks: { color: '#94a3b8' },
            title: { display: true, text: 'GWh/an', color: '#94a3b8', font: { size: 11 } },
          },
          y: {
            grid: { display: false },
            ticks: { color: '#e2e8f0', font: { size: 10 } },
          },
        },
      },
    });

    chartDepartments = new Chart(document.getElementById('chart-departments'), {
      type: 'bar',
      data: { labels: [], datasets: [] },
      options: {
        ...defaultOptions,
        indexAxis: 'y',
        plugins: {
          ...defaultOptions.plugins,
          legend: { display: false },
        },
        scales: {
          x: {
            grid: { color: '#2e334733' },
            ticks: { color: '#94a3b8' },
            title: { display: true, text: 'Nombre de sites', color: '#94a3b8', font: { size: 11 } },
          },
          y: {
            grid: { display: false },
            ticks: { color: '#e2e8f0', font: { size: 10 } },
          },
        },
      },
    });
  }

  function update(data) {
    updateTimeline(data);
    updateTypes(data);
    updateRegions(data);
    updateDepartments(data);
  }

  function updateTimeline(data) {
    // Group by year
    const byYear = {};
    data.forEach(d => {
      const y = d.annee_mes;
      if (!y) return;
      if (!byYear[y]) byYear[y] = { count: 0, capacity: 0 };
      byYear[y].count++;
      byYear[y].capacity += d.capacite_de_production_gwh_an || 0;
    });

    const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
    let cumCount = 0, cumCap = 0;
    const counts = [], caps = [];

    years.forEach(y => {
      cumCount += byYear[y].count;
      cumCap += byYear[y].capacity;
      counts.push(cumCount);
      caps.push(Math.round(cumCap * 10) / 10);
    });

    chartTimeline.data.labels = years;
    chartTimeline.data.datasets = [
      {
        label: 'Sites (cumulé)',
        data: counts,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16,185,129,0.1)',
        fill: true,
        tension: 0.3,
        yAxisID: 'y',
        pointRadius: 3,
        pointBackgroundColor: '#10b981',
      },
      {
        label: 'Capacité GWh/an (cumulée)',
        data: caps,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.1)',
        fill: true,
        tension: 0.3,
        yAxisID: 'y1',
        pointRadius: 3,
        pointBackgroundColor: '#3b82f6',
      },
    ];
    chartTimeline.update('none');
  }

  function updateTypes(data) {
    const byType = {};
    data.forEach(d => {
      const type = d.site || 'Inconnu';
      byType[type] = (byType[type] || 0) + 1;
    });

    const sorted = Object.entries(byType).sort((a, b) => b[1] - a[1]);
    chartTypes.data.labels = sorted.map(([k]) => k);
    chartTypes.data.datasets = [{
      data: sorted.map(([, v]) => v),
      backgroundColor: sorted.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
      borderWidth: 0,
      hoverOffset: 8,
    }];
    chartTypes.update('none');
  }

  function updateRegions(data) {
    const byRegion = {};
    data.forEach(d => {
      const r = d.region || 'Inconnu';
      byRegion[r] = (byRegion[r] || 0) + (d.capacite_de_production_gwh_an || 0);
    });

    const sorted = Object.entries(byRegion)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 13);

    chartRegions.data.labels = sorted.map(([k]) => k);
    chartRegions.data.datasets = [{
      data: sorted.map(([, v]) => Math.round(v * 10) / 10),
      backgroundColor: '#10b981',
      borderRadius: 4,
      barThickness: 16,
    }];
    chartRegions.update('none');
  }

  function updateDepartments(data) {
    const byDept = {};
    data.forEach(d => {
      const dept = d.departement || 'Inconnu';
      byDept[dept] = (byDept[dept] || 0) + 1;
    });

    const sorted = Object.entries(byDept)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    chartDepartments.data.labels = sorted.map(([k]) => k);
    chartDepartments.data.datasets = [{
      data: sorted.map(([, v]) => v),
      backgroundColor: '#3b82f6',
      borderRadius: 4,
      barThickness: 16,
    }];
    chartDepartments.update('none');
  }

  return { init, update };
})();
