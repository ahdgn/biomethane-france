/* ============================================
   Filters — état, logique de filtrage, KPI,
   synchronisation URL (état partageable)
   ============================================ */

const Filters = (() => {
  const { fmtInt, fmtNum, escapeHtml, typeColor, DATASETS, CAP_UNITS, prospection2, zoneTest,
          YEAR_FLOOR, YEAR_FLOOR_LABEL } = CONFIG;

  const state = {
    base: '',        // '' = toutes les bases
    search: '',
    region: '',
    types: new Set(),
    yearMin: null,
    yearMax: null,
    operator: '',
    status: '',      // '' | 'open' | 'closed'
    window: '',      // '' | clé de tranche d'échéance (le2026, 2027-2028, 2029-2030, gt2030)
    cpb: '',         // '' | '095' | '08' : coefficient CPB atteignable (cogé biogaz)
    prospection: false, // filtre prospection v2 (périmètre thèse, 18/09/2026)
    zone: false,        // zone test (Hauts-de-France, Grand Est, Normandie)
    power: '',          // '' | '250' | '500' | '1000' : puissance cogé minimale (kWé)
    radius: null,       // null | { lat, lon, km, label } : recherche par rayon
  };
  const RADIUS_MIN = 5, RADIUS_MAX = 150;
  const POWER_VALUES = ['250', '500', '1000'];

  const bounds = { yearMin: null, yearMax: null, hasPre: false };
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
    if (state.radius) {
      updateRadiusUI();
      MapView.showRadius(state.radius.lat, state.radius.lon, state.radius.km);
    }
  }

  function computeBounds() {
    const years = allData.map(d => d.annee).filter(Boolean);
    // borne basse plafonnée à YEAR_FLOOR : posé au minimum, le curseur
    // vaut « < 2000 » et n'exclut aucune MES ancienne (cf. applyFilters)
    bounds.hasPre = years.some(y => y < YEAR_FLOOR);
    bounds.yearMin = Math.max(Math.min(...years), YEAR_FLOOR);
    bounds.yearMax = Math.max(...years);
    state.yearMin = bounds.yearMin;
    state.yearMax = bounds.yearMax;
  }

  function windowKeys() {
    return CONFIG.PARAMS.cogen.echeance_tranches.map(t => t.key);
  }

  function populateOptions() {
    // Tranches d'échéance (depuis screening_params.json)
    const win = document.getElementById('filter-window');
    win.innerHTML = [{ key: '', label: 'Toutes' }, ...CONFIG.PARAMS.cogen.echeance_tranches]
      .map(t => `<button class="seg-btn" data-window="${escapeHtml(t.key)}" aria-pressed="${t.key === state.window}">${escapeHtml(t.label)}</button>`)
      .join('');

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
      const diamond = type.startsWith('Élec.') ? ' diamond' : '';
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
    document.getElementById('year-bound-min').textContent =
      bounds.hasPre ? YEAR_FLOOR_LABEL : bounds.yearMin;
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
    if (p.has('w')) {
      // anciens liens (v1) : échue -> ≤ 2026, 2026-2029 -> 2027-2028, 2030+ -> > 2030
      const legacy = { 'echue': 'le2026', '2026-2029': '2027-2028', '2030+': 'gt2030' };
      const w = legacy[p.get('w')] || p.get('w');
      if (windowKeys().includes(w)) state.window = w;
    }
    if (p.has('c') && ['095', '08'].includes(p.get('c'))) state.cpb = p.get('c');
    if (p.get('p') === '1' || p.get('p') === '2') state.prospection = true; // p=1 : anciens liens
    if (p.get('z') === '1') state.zone = true;
    if (p.has('k') && POWER_VALUES.includes(p.get('k'))) state.power = p.get('k');
    if (p.has('rad')) {
      const [la, lo, km] = p.get('rad').split(',').map(Number);
      if (Number.isFinite(la) && Number.isFinite(lo) && Number.isFinite(km) && km >= RADIUS_MIN && km <= RADIUS_MAX)
        state.radius = { lat: la, lon: lo, km: Math.round(km / 5) * 5, label: '' };
    }
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
    if (state.cpb) p.set('c', state.cpb);
    if (state.prospection) p.set('p', '2');
    if (state.zone) p.set('z', '1');
    if (state.power) p.set('k', state.power);
    if (state.radius) p.set('rad', `${state.radius.lat},${state.radius.lon},${state.radius.km}`);
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

    // Filtre prospection v2
    document.getElementById('filter-prospection').addEventListener('change', (e) => {
      state.prospection = e.target.checked;
      applyFilters();
    });
    // Zone test
    document.getElementById('filter-zone').addEventListener('change', (e) => {
      state.zone = e.target.checked;
      applyFilters();
    });
    // Puissance cogé minimale
    document.getElementById('filter-power').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-power]');
      if (!btn) return;
      state.power = btn.dataset.power;
      syncSegmented('filter-power', 'power', state.power);
      applyFilters();
    });
    const infoBtn = document.getElementById('prospection-info-btn');
    const infoPop = document.getElementById('prospection-info');
    infoBtn.addEventListener('click', () => {
      const open = infoPop.hidden;
      infoPop.hidden = !open;
      infoBtn.setAttribute('aria-expanded', String(open));
    });

    // Fenêtre de décision (tranche d'échéance estimée)
    document.getElementById('filter-window').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-window]');
      if (!btn) return;
      state.window = btn.dataset.window;
      syncSegmented('filter-window', 'window', state.window);
      applyFilters();
    });
    // Coefficient CPB (cogé biogaz)
    document.getElementById('filter-cpb').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cpb]');
      if (!btn) return;
      state.cpb = btn.dataset.cpb;
      syncSegmented('filter-cpb', 'cpb', state.cpb);
      applyFilters();
    });

    // Filtre rayon : curseur continu — le cercle et le zoom suivent le
    // geste, le filtrage est debounce pour rester fluide.
    let radiusTimeout;
    document.getElementById('radius-km').addEventListener('input', (e) => {
      if (!state.radius) return;
      state.radius.km = parseInt(e.target.value, 10);
      updateRadiusUI();
      MapView.showRadius(state.radius.lat, state.radius.lon, state.radius.km);
      clearTimeout(radiusTimeout);
      radiusTimeout = setTimeout(applyFilters, 160);
    });
    document.getElementById('radius-clear').addEventListener('click', clearRadius);

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
    const atFloor = bounds.hasPre && state.yearMin === bounds.yearMin;
    const minLabel = atFloor ? YEAR_FLOOR_LABEL : String(state.yearMin);
    document.getElementById('year-range-label').textContent =
      state.yearMin === state.yearMax ? minLabel : `${minLabel} – ${state.yearMax}`;
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
    syncSegmented('filter-cpb', 'cpb', state.cpb);
    document.getElementById('filter-prospection').checked = state.prospection;
    document.getElementById('filter-zone').checked = state.zone;
    syncSegmented('filter-power', 'power', state.power);
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
    if (state.cpb) n++;
    if (state.prospection) n++;
    if (state.zone) n++;
    if (state.power) n++;
    if (state.radius) n++;
    if (state.types.size !== allTypes.length) n++;
    if (state.yearMin !== bounds.yearMin || state.yearMax !== bounds.yearMax) n++;
    return n;
  }

  /* ---------------- filtrage ---------------- */

  function applyFilters() {
    // curseur au minimum = borne « < 2000 » : aucune limite basse
    const yearMin = state.yearMin === bounds.yearMin ? -Infinity : state.yearMin;

    filteredData = allData.filter(d => {
      if (state.prospection && !prospection2(d)) return false;
      if (state.zone && !zoneTest(d)) return false;
      if (state.radius) {
        if (d.lat == null || d.lon == null) return false;
        if (haversineKm(state.radius.lat, state.radius.lon, d.lat, d.lon) > state.radius.km) return false;
      }
      // puissance : ne concerne que les cogés (l'injection n'a pas de kWé)
      if (state.power && d.base === 'cogen' && (d.puissanceKw || 0) < Number(state.power)) return false;
      if (state.base && d.base !== state.base) return false;
      if (state.search) {
        const hit = (d.nom || '').toLowerCase().includes(state.search)
          || (d.commune || '').toLowerCase().includes(state.search);
        if (!hit) return false;
      }
      if (state.region && d.region !== state.region) return false;
      if (!state.types.has(d.type)) return false;
      if (d.annee != null && (d.annee < yearMin || d.annee > state.yearMax)) return false;
      if (state.operator && d.operateur !== state.operator) return false;
      if (state.window && d.echeanceTranche !== state.window) return false; // pas d'estimation -> hors fenêtre
      // coefficient CPB : ne concerne que les cogés biogaz (l'injection passe)
      if (state.cpb && d.base === 'cogen') {
        if (!d.cpb) return false; // thermique ou sans année de MES
        if (state.cpb === '095' ? !d.cpb.atteignable : d.cpb.atteignable) return false;
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
      cards.push(kpi('Élec. biogaz',
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
    state.cpb = '';
    state.prospection = false;
    state.zone = false;
    state.power = '';
    state.radius = null;
    updateRadiusUI();
    MapView.hideRadius();
    state.types = new Set(allTypes);
    state.yearMin = bounds.yearMin;
    state.yearMax = bounds.yearMax;
    syncControls();
    applyFilters();
  }

  /* ---------------- filtre rayon ---------------- */

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // Appelé par le lien « 50 km autour » des popups carte
  function setRadius(lat, lon, km, label) {
    state.radius = { lat, lon, km, label: label || '' };
    updateRadiusUI();
    MapView.showRadius(lat, lon, km);
    applyFilters();
  }

  function clearRadius() {
    state.radius = null;
    updateRadiusUI();
    MapView.hideRadius();
    applyFilters();
  }

  function updateRadiusUI() {
    const group = document.getElementById('group-radius');
    if (!group) return;
    group.hidden = !state.radius;
    if (!state.radius) return;
    document.getElementById('radius-label').textContent = state.radius.label
      ? `${state.radius.km} km autour de ${state.radius.label}`
      : `${state.radius.km} km autour du point choisi`;
    document.getElementById('radius-km').value = state.radius.km;
  }

  function onChange(cb) { onChangeCallbacks.push(cb); }
  function getFiltered() { return filteredData; }
  function getState() { return state; }

  return { init, onChange, getFiltered, getState, toggleType, resetFilters, setRadius, clearRadius };
})();
