/* ============================================
   Filters — état, logique de filtrage, KPI,
   synchronisation URL (état partageable)
   ============================================ */

const Filters = (() => {
  const { fmtInt, fmtNum, escapeHtml, typeColor, DATASETS, CAP_UNITS } = CONFIG;

  const state = {
    base: '',        // '' = toutes les bases
    search: '',
    region: '',
    types: new Set(),
    yearMin: null,
    yearMax: null,
    operator: '',
    status: '',      // '' | 'open' | 'closed'
    window: '',      // '' | 'echue' | '2026-2029' | '2030+'
  };

  const bounds = { yearMin: null, yearMax: null };
  let allData = [];
  let filteredData = [];
  let allTypes = [];
  let loadedBases = [];
  const onChangeCallbacks = [];

  /* ---------------- init ---------------- */

  function init(data, bases) {
    allData = data;
    loadedBases = bases;
    computeBounds();
    populateOptions();
    restoreFromURL();
    bindEvents();
    syncControls();
    applyFilters();
  }

  function computeBounds() {
    const years = allData.map(d => d.annee).filter(Boolean);
    bounds.yearMin = Math.min(...years);
    bounds.yearMax = Math.max(...years);
    state.yearMin = bounds.yearMin;
    state.yearMax = bounds.yearMax;
  }

  function populateOptions() {
    // Base (uniquement si plusieurs jeux chargés)
    if (loadedBases.length > 1) {
      const group = document.getElementById('group-base');
      group.hidden = false;
      const seg = document.getElementById('filter-base');
      const opts = [{ id: '', label: 'Toutes' },
                    ...loadedBases.map(b => DATASETS.find(ds => ds.id === b))];
      seg.innerHTML = opts.map(o =>
        `<button class="seg-btn" data-base="${o.id}" aria-pressed="${o.id === state.base}">${escapeHtml(o.label)}</button>`
      ).join('');
    }

    // Régions
    const regions = [...new Set(allData.map(d => d.region).filter(Boolean))].sort();
    const regionSelect = document.getElementById('filter-region');
    regions.forEach(r => regionSelect.appendChild(new Option(r, r)));

    // Types (pastille couleur + compteur, ordre = effectif décroissant)
    const counts = {};
    allData.forEach(d => { counts[d.type] = (counts[d.type] || 0) + 1; });
    allTypes = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    state.types = new Set(allTypes);

    const container = document.getElementById('filter-site-type');
    container.innerHTML = allTypes.map(type => {
      const diamond = type.startsWith('Cogénération') ? ' diamond' : '';
      return `<label>
        <input type="checkbox" value="${escapeHtml(type)}" checked>
        <span class="type-dot${diamond}" style="background:${typeColor(type)}"></span>
        <span class="type-name" title="${escapeHtml(type)}">${escapeHtml(type)}</span>
        <span class="type-count">${fmtInt(counts[type])}</span>
      </label>`;
    }).join('');

    // Opérateurs
    const operators = [...new Set(allData.map(d => d.operateur).filter(Boolean))].sort();
    const operatorSelect = document.getElementById('filter-operator');
    operators.forEach(op => operatorSelect.appendChild(new Option(op, op)));

    // Bornes du curseur de période
    ['filter-year-min', 'filter-year-max'].forEach(id => {
      const input = document.getElementById(id);
      input.min = bounds.yearMin;
      input.max = bounds.yearMax;
    });
    document.getElementById('year-bound-min').textContent = bounds.yearMin;
    document.getElementById('year-bound-max').textContent = bounds.yearMax;
  }

  /* ---------------- URL <-> état ---------------- */

  function restoreFromURL() {
    const hash = location.hash.replace(/^#/, '');
    if (!hash) return;
    const p = new URLSearchParams(hash);
    if (p.has('b') && loadedBases.includes(p.get('b'))) state.base = p.get('b');
    if (p.has('q')) state.search = p.get('q');
    if (p.has('r')) state.region = p.get('r');
    if (p.has('o')) state.operator = p.get('o');
    if (p.has('s') && ['open', 'closed'].includes(p.get('s'))) state.status = p.get('s');
    if (p.has('w') && ['echue', '2026-2029', '2030+'].includes(p.get('w'))) state.window = p.get('w');
    if (p.has('y')) {
      const [a, b] = p.get('y').split('-').map(Number);
      if (a >= bounds.yearMin && a <= bounds.yearMax) state.yearMin = a;
      if (b >= bounds.yearMin && b <= bounds.yearMax && b >= state.yearMin) state.yearMax = b;
    }
    if (p.has('t')) {
      const wanted = new Set(p.get('t').split('|'));
      const sel = allTypes.filter(t => wanted.has(t));
      if (sel.length) state.types = new Set(sel);
    }
  }

  function writeURL() {
    const p = new URLSearchParams();
    if (state.base) p.set('b', state.base);
    if (state.search) p.set('q', state.search);
    if (state.region) p.set('r', state.region);
    if (state.operator) p.set('o', state.operator);
    if (state.status) p.set('s', state.status);
    if (state.window) p.set('w', state.window);
    if (state.yearMin !== bounds.yearMin || state.yearMax !== bounds.yearMax)
      p.set('y', `${state.yearMin}-${state.yearMax}`);
    if (state.types.size !== allTypes.length) p.set('t', [...state.types].join('|'));
    const s = p.toString();
    history.replaceState(null, '', s ? '#' + s : location.pathname + location.search);
  }

  /* ---------------- événements ---------------- */

  function bindEvents() {
    // Base
    document.getElementById('filter-base').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-base]');
      if (!btn) return;
      state.base = btn.dataset.base;
      syncSegmented('filter-base', 'base', state.base);
      applyFilters();
    });

    // Recherche (debounce)
    const searchInput = document.getElementById('filter-search');
    let searchTimeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        state.search = searchInput.value.trim().toLowerCase();
        applyFilters();
      }, 200);
    });

    // Région / opérateur
    document.getElementById('filter-region').addEventListener('change', (e) => {
      state.region = e.target.value;
      applyFilters();
    });
    document.getElementById('filter-operator').addEventListener('change', (e) => {
      state.operator = e.target.value;
      applyFilters();
    });

    // Types
    document.getElementById('filter-site-type').addEventListener('change', () => {
      state.types = new Set([...document.querySelectorAll('#filter-site-type input:checked')].map(cb => cb.value));
      applyFilters();
    });
    document.getElementById('types-all').addEventListener('click', () => setAllTypes(true));
    document.getElementById('types-none').addEventListener('click', () => setAllTypes(false));

    // Période — le curseur déplacé est borné par l'autre (jamais de croisement)
    const yearMinInput = document.getElementById('filter-year-min');
    const yearMaxInput = document.getElementById('filter-year-max');
    yearMinInput.addEventListener('input', () => {
      state.yearMin = Math.min(parseInt(yearMinInput.value, 10), state.yearMax);
      yearMinInput.value = state.yearMin;
      updateYearUI();
      applyFilters();
    });
    yearMaxInput.addEventListener('input', () => {
      state.yearMax = Math.max(parseInt(yearMaxInput.value, 10), state.yearMin);
      yearMaxInput.value = state.yearMax;
      updateYearUI();
      applyFilters();
    });

    // Statut
    document.getElementById('filter-status').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-status]');
      if (!btn) return;
      state.status = btn.dataset.status;
      syncSegmented('filter-status', 'status', state.status);
      applyFilters();
    });

    // Fenêtre de décision (échéance estimée)
    document.getElementById('filter-window').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-window]');
      if (!btn) return;
      state.window = btn.dataset.window;
      syncSegmented('filter-window', 'window', state.window);
      applyFilters();
    });

    // Réinitialisation
    document.getElementById('btn-reset').addEventListener('click', resetFilters);
    const mapReset = document.getElementById('map-empty-reset');
    if (mapReset) mapReset.addEventListener('click', resetFilters);
  }

  function setAllTypes(checked) {
    document.querySelectorAll('#filter-site-type input').forEach(cb => { cb.checked = checked; });
    state.types = checked ? new Set(allTypes) : new Set();
    applyFilters();
  }

  // Bascule un type isolé (appelé par la légende carte)
  function toggleType(type) {
    const cb = [...document.querySelectorAll('#filter-site-type input')].find(c => c.value === type);
    if (!cb) return;
    cb.checked = !cb.checked;
    state.types = new Set([...document.querySelectorAll('#filter-site-type input:checked')].map(c => c.value));
    applyFilters();
  }

  /* ---------------- synchronisation UI ---------------- */

  function syncSegmented(groupId, dataAttr, value) {
    document.querySelectorAll(`#${groupId} .seg-btn`).forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset[dataAttr] === value));
    });
  }

  function updateYearUI() {
    document.getElementById('year-range-label').textContent =
      state.yearMin === state.yearMax ? String(state.yearMin) : `${state.yearMin} – ${state.yearMax}`;
    const span = bounds.yearMax - bounds.yearMin || 1;
    const fill = document.getElementById('year-range-fill');
    fill.style.left = ((state.yearMin - bounds.yearMin) / span * 100) + '%';
    fill.style.right = (100 - (state.yearMax - bounds.yearMin) / span * 100) + '%';
  }

  function syncControls() {
    document.getElementById('filter-search').value = state.search;
    document.getElementById('filter-region').value = state.region;
    document.getElementById('filter-operator').value = state.operator;
    document.getElementById('filter-year-min').value = state.yearMin;
    document.getElementById('filter-year-max').value = state.yearMax;
    document.querySelectorAll('#filter-site-type input').forEach(cb => {
      cb.checked = state.types.has(cb.value);
    });
    syncSegmented('filter-status', 'status', state.status);
    syncSegmented('filter-window', 'window', state.window);
    if (loadedBases.length > 1) syncSegmented('filter-base', 'base', state.base);
    updateYearUI();
  }

  function activeFilterCount() {
    let n = 0;
    if (state.base) n++;
    if (state.search) n++;
    if (state.region) n++;
    if (state.operator) n++;
    if (state.status) n++;
    if (state.window) n++;
    if (state.types.size !== allTypes.length) n++;
    if (state.yearMin !== bounds.yearMin || state.yearMax !== bounds.yearMax) n++;
    return n;
  }

  /* ---------------- filtrage ---------------- */

  function applyFilters() {
    filteredData = allData.filter(d => {
      if (state.base && d.base !== state.base) return false;
      if (state.search) {
        const hit = (d.nom || '').toLowerCase().includes(state.search)
          || (d.commune || '').toLowerCase().includes(state.search);
        if (!hit) return false;
      }
      if (state.region && d.region !== state.region) return false;
      if (!state.types.has(d.type)) return false;
      if (d.annee != null && (d.annee < state.yearMin || d.annee > state.yearMax)) return false;
      if (state.operator && d.operateur !== state.operator) return false;
      if (state.window) {
        const e = d.echeanceAnnee;
        if (e == null) return false; // pas d'estimation possible -> hors fenêtre
        const now = new Date().getFullYear();
        if (state.window === 'echue' && e >= now) return false;
        if (state.window === '2026-2029' && (e < 2026 || e > 2029)) return false;
        if (state.window === '2030+' && e < 2030) return false;
      }
      if (state.status === 'open' && !d.ouvert) return false;
      if (state.status === 'closed' && d.ouvert) return false;
      return true;
    });

    const n = activeFilterCount();
    const resetBtn = document.getElementById('btn-reset');
    resetBtn.hidden = n === 0;
    document.getElementById('reset-count').textContent = n;

    updateKPIs();
    writeURL();
    onChangeCallbacks.forEach(cb => cb(filteredData));
  }

  /* ---------------- KPI ---------------- */

  function updateKPIs() {
    const strip = document.getElementById('kpi-strip');
    const inj = filteredData.filter(d => d.base === 'injection');
    const cog = filteredData.filter(d => d.base === 'cogen');
    const capInj = inj.reduce((s, d) => s + (d.capacite || 0), 0);
    const regions = new Set(filteredData.map(d => d.region).filter(Boolean));
    const totalShown = allData.filter(d => !state.base || d.base === state.base).length;

    const cards = [];
    cards.push(kpi('Sites affichés',
      `${fmtInt(filteredData.length)} <span class="kpi-sub">/ ${fmtInt(totalShown)}</span>`));
    cards.push(kpi(`Capacité d'injection`,
      `${fmtNum(capInj, capInj >= 1000 ? 0 : 1)} <span class="kpi-sub">${CAP_UNITS.injection}</span>`, true));
    if (loadedBases.includes('cogen')) {
      const capCog = cog.reduce((s, d) => s + (d.capacite || 0), 0);
      cards.push(kpi('Cogénérations',
        `${fmtInt(cog.length)} <span class="kpi-sub">· ${fmtNum(capCog, 0)} ${CAP_UNITS.cogen}</span>`));
    } else {
      const open = filteredData.filter(d => d.ouvert).length;
      cards.push(kpi('Sites ouverts', fmtInt(open)));
    }
    cards.push(kpi('Régions couvertes',
      `${regions.size} <span class="kpi-sub">/ 13</span>`));

    strip.innerHTML = cards.join('');
  }

  function kpi(label, valueHtml, accent = false) {
    return `<div class="kpi-card${accent ? ' kpi-accent' : ''}">
      <span class="kpi-label">${label}</span>
      <span class="kpi-value">${valueHtml}</span>
    </div>`;
  }

  /* ---------------- reset ---------------- */

  function resetFilters() {
    state.base = '';
    state.search = '';
    state.region = '';
    state.operator = '';
    state.status = '';
    state.window = '';
    state.types = new Set(allTypes);
    state.yearMin = bounds.yearMin;
    state.yearMax = bounds.yearMax;
    syncControls();
    applyFilters();
  }

  function onChange(cb) { onChangeCallbacks.push(cb); }
  function getFiltered() { return filteredData; }
  function getState() { return state; }

  return { init, onChange, getFiltered, getState, toggleType, resetFilters };
})();
