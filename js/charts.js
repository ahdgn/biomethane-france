/* ============================================
   Charts — Chart.js
   Axe temps linéaire (années manquantes = 0),
   un seul axe Y, couleurs = CONFIG.TYPE_COLORS
   ============================================ */

const Charts = (() => {
  const { PALETTE, fmtInt, fmtNum, typeColor, CAP_UNITS } = CONFIG;

  let chartTimeline, chartTypes, chartRegions, chartDepartments;
  let lastData = [];
  const timelineOpts = { metric: 'sites', cumul: false };

  const GRID = 'rgba(30, 66, 96, 0.08)';

  const baseOptions = () => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#FFFFFF',
        titleColor: PALETTE.navy,
        bodyColor: '#24303C',
        borderColor: '#D5DCE4',
        borderWidth: 1,
        cornerRadius: 6,
        padding: 10,
        titleFont: { family: 'Roboto', weight: '700' },
        bodyFont: { family: 'Roboto' },
      },
    },
  });

  function init() {
    Chart.defaults.color = '#5F6B7A';
    Chart.defaults.font.family = 'Roboto';
    Chart.defaults.font.size = 11;

    chartTimeline = new Chart(document.getElementById('chart-timeline'), {
      type: 'bar',
      data: { labels: [], datasets: [] },
      options: {
        ...baseOptions(),
        plugins: {
          ...baseOptions().plugins,
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: { usePointStyle: true, pointStyleWidth: 8, boxHeight: 6, padding: 10 },
          },
          tooltip: {
            ...baseOptions().plugins.tooltip,
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label} : ${
                timelineOpts.metric === 'sites' ? fmtInt(ctx.parsed.y) : fmtNum(ctx.parsed.y, 1) + ' GWh/an'}`,
            },
          },
        },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: { color: GRID },
            ticks: { callback: (v) => v.toLocaleString('fr-FR') },
            title: { display: true, text: 'Sites', font: { size: 11 } },
          },
        },
      },
    });

    chartTypes = new Chart(document.getElementById('chart-types'), {
      type: 'bar',
      data: { labels: [], datasets: [] },
      options: horizontalBarOptions('Nombre de sites', (ctx) => {
        const total = lastData.length || 1;
        const pct = (ctx.parsed.x / total * 100);
        return ` ${fmtInt(ctx.parsed.x)} site${ctx.parsed.x > 1 ? 's' : ''} (${fmtNum(pct, 1)} %)`;
      }),
    });

    chartRegions = new Chart(document.getElementById('chart-regions'), {
      type: 'bar',
      data: { labels: [], datasets: [] },
      options: horizontalBarOptions('GWh/an', (ctx) => ` ${fmtNum(ctx.parsed.x, 1)} GWh/an`),
    });

    chartDepartments = new Chart(document.getElementById('chart-departments'), {
      type: 'bar',
      data: { labels: [], datasets: [] },
      options: horizontalBarOptions('Nombre de sites', (ctx) => ` ${fmtInt(ctx.parsed.x)} sites`),
    });

    bindControls();
  }

  function horizontalBarOptions(xTitle, tooltipLabel) {
    const o = baseOptions();
    return {
      ...o,
      indexAxis: 'y',
      plugins: {
        ...o.plugins,
        tooltip: { ...o.plugins.tooltip, callbacks: { label: tooltipLabel } },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: GRID },
          ticks: { callback: (v) => v.toLocaleString('fr-FR') },
          title: { display: true, text: xTitle, font: { size: 11 } },
        },
        y: {
          grid: { display: false },
          ticks: { color: '#24303C', font: { size: 10.5 }, autoSkip: false,
                   callback: function (v) {
                     const label = this.getLabelForValue(v);
                     return label.length > 26 ? label.slice(0, 25) + '…' : label;
                   } },
        },
      },
    };
  }

  function bindControls() {
    document.getElementById('timeline-metric').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-metric]');
      if (!btn) return;
      timelineOpts.metric = btn.dataset.metric;
      document.querySelectorAll('#timeline-metric .seg-btn').forEach(b =>
        b.setAttribute('aria-pressed', String(b.dataset.metric === timelineOpts.metric)));
      updateTimeline(lastData);
    });
    document.getElementById('timeline-cumul').addEventListener('change', (e) => {
      timelineOpts.cumul = e.target.checked;
      updateTimeline(lastData);
    });
  }

  function update(data) {
    lastData = data;
    updateTimeline(data);
    updateTypes(data);
    updateRegions(data);
    updateDepartments(data);
  }

  function setEmpty(canvasId, empty) {
    const card = document.getElementById(canvasId).closest('.chart-card');
    card.querySelector('.chart-empty').hidden = !empty;
  }

  /* ---- Mises en service par année ---- */
  function updateTimeline(data) {
    const withYear = data.filter(d => d.annee);
    setEmpty('chart-timeline', withYear.length === 0);

    const bases = [...new Set(withYear.map(d => d.base))];
    const years = withYear.map(d => d.annee);
    const y0 = years.length ? Math.min(...years) : 2011;
    const y1 = years.length ? Math.max(...years) : 2026;
    // axe complet, années sans MES incluses (pas de distorsion temporelle)
    const labels = [];
    for (let y = y0; y <= y1; y++) labels.push(y);

    const metricOf = (d) => timelineOpts.metric === 'sites' ? 1 : (d.capacite || 0);

    const BASE_STYLE = {
      injection: { label: 'Injection', color: PALETTE.teal },
      cogen: { label: 'Cogénérations', color: PALETTE.navy },
    };

    const datasets = bases.map(base => {
      const byYear = Object.fromEntries(labels.map(y => [y, 0]));
      withYear.filter(d => d.base === base).forEach(d => { byYear[d.annee] += metricOf(d); });
      let series = labels.map(y => byYear[y]);
      if (timelineOpts.cumul) {
        let acc = 0;
        series = series.map(v => (acc += v));
      }
      const s = BASE_STYLE[base] || { label: base, color: PALETTE.grey };
      return timelineOpts.cumul
        ? { label: s.label, data: series, type: 'line', borderColor: s.color,
            backgroundColor: s.color + '22', fill: true, tension: 0.25,
            pointRadius: 0, pointHitRadius: 8, borderWidth: 2 }
        : { label: s.label, data: series, backgroundColor: s.color, borderRadius: 2,
            maxBarThickness: 26 };
    });

    const isCap = timelineOpts.metric === 'capacite';
    chartTimeline.options.scales.y.title.text = isCap
      ? (timelineOpts.cumul ? 'GWh/an (cumul)' : 'GWh/an mis en service')
      : (timelineOpts.cumul ? 'Sites (cumul)' : 'Sites mis en service');
    chartTimeline.options.plugins.legend.display = datasets.length > 1;
    chartTimeline.data.labels = labels;
    chartTimeline.data.datasets = datasets;
    chartTimeline.update('none');
  }

  /* ---- Sites par type ---- */
  function updateTypes(data) {
    setEmpty('chart-types', data.length === 0);
    const byType = {};
    data.forEach(d => { byType[d.type] = (byType[d.type] || 0) + 1; });
    const sorted = Object.entries(byType).sort((a, b) => b[1] - a[1]);

    chartTypes.data.labels = sorted.map(([k]) => k);
    chartTypes.data.datasets = [{
      data: sorted.map(([, v]) => v),
      backgroundColor: sorted.map(([k]) => typeColor(k)),
      borderRadius: 2,
      maxBarThickness: 18,
    }];
    chartTypes.update('none');
  }

  /* ---- Capacité par région (injection uniquement, unités homogènes) ---- */
  function updateRegions(data) {
    const inj = data.filter(d => d.base === 'injection');
    const onlyCogen = data.length > 0 && inj.length === 0;
    const source = onlyCogen ? data : inj;
    const title = document.getElementById('chart-regions-title');
    title.textContent = onlyCogen
      ? 'Énergie électrique injectée par région (cogé)'
      : 'Capacité d\'injection par région';
    chartRegions.options.scales.x.title.text = onlyCogen ? CAP_UNITS.cogen : CAP_UNITS.injection;

    setEmpty('chart-regions', source.length === 0);
    const byRegion = {};
    source.forEach(d => {
      const r = d.region || 'Inconnue';
      byRegion[r] = (byRegion[r] || 0) + (d.capacite || 0);
    });
    const sorted = Object.entries(byRegion).sort((a, b) => b[1] - a[1]);

    chartRegions.data.labels = sorted.map(([k]) => k);
    chartRegions.data.datasets = [{
      data: sorted.map(([, v]) => Math.round(v * 10) / 10),
      backgroundColor: PALETTE.steel,
      borderRadius: 2,
      maxBarThickness: 18,
    }];
    chartRegions.update('none');
  }

  /* ---- Top 10 départements ---- */
  function updateDepartments(data) {
    setEmpty('chart-departments', data.length === 0);
    const byDept = {};
    data.forEach(d => {
      const dept = d.departement || 'Inconnu';
      byDept[dept] = (byDept[dept] || 0) + 1;
    });
    const sorted = Object.entries(byDept).sort((a, b) => b[1] - a[1]).slice(0, 10);

    chartDepartments.data.labels = sorted.map(([k]) => k);
    chartDepartments.data.datasets = [{
      data: sorted.map(([, v]) => v),
      backgroundColor: PALETTE.lightBlue,
      borderRadius: 2,
      maxBarThickness: 18,
    }];
    chartDepartments.update('none');
  }

  function resize() {
    [chartTimeline, chartTypes, chartRegions, chartDepartments].forEach(c => c && c.resize());
  }

  return { init, update, resize };
})();
