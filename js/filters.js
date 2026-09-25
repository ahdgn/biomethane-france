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
    grid: '',           // '' | '2' | '5' | '10' | 'far' : distance au réseau GRDF (élec. biogaz)
    prio: '',           // '' | 'A' | 'AB' | 'ABC' : priorité du score v2 (sites scorés seulement)
    pipeline: false,    // sites du pipeline Nautilus uniquement (registre, projet renseigné)
    relation: '',       // '' | owners | feedstock | rejected | evaluating | unknown
    site: null,         // id du site dont la fiche est ouverte (lien partageable, pas un filtre)
  };
  const RADIUS_MIN = 5, RADIUS_MAX = 150;
  const POWER_VALUES = ['250', '500', '1000'];

  /* Présélections : chaque preset est un jeu de valeurs d'état appliqué sur
     des filtres remis à zéro. Un preset est « actif » quand l'état lui
     correspond exactement (ni plus ni moins de filtres). */
  const PRESETS = {
    screening: { prospection: true },
    zonetest: { prospection: true, zone: true, prio: 'A' },
    elec5km: { prospection: true, base: 'cogen', grid: '5' },
  };
  // filtres qui ne concernent que l'électricité biogaz
  const ELEC_ONLY = ['power', 'grid', 'cpb'];
  // filtres rangés dans la section « Avancé » (dépliée si l'un d'eux est actif)
  const ADVANCED = ['base', 'operator', 'status'];

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
    // section Avancé dépliée seulement si un lien partagé y a mis un filtre
    document.getElementById('filter-advanced').open = ADVANCED.some(k => state[k])
      || state.types.size !== allTypes.length
      || state.yearMin !== bounds.yearMin || state.yearMax !== bounds.yearMax;
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
  function gridKeys() {
    return [...CONFIG.PARAMS.reseau.distance_paliers_km.map(String), 'far'];
  }

  function populateOptions() {
    // Paliers de distance au réseau GRDF (depuis screening_params.json)
    const paliers = CONFIG.PARAMS.reseau.distance_paliers_km;
    const grid = document.getElementById('filter-grid');
    grid.innerHTML = [
      { key: '', label: 'Toutes' },
      ...paliers.map(k => ({ key: String(k), label: `≤ ${k} km` })),
      { key: 'far', label: `> ${paliers[paliers.length - 1]} km / inconnue` },
    ].map(t => `<button class="seg-btn" data-grid="${t.key}" aria-pressed="${t.key === state.grid}">${escapeHtml(t.label)}</button>`).join('');

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
    if (p.has('g') && gridKeys().includes(p.get('g'))) state.grid = p.get('g');
    if (p.has('pr') && ['A', 'AB', 'ABC'].includes(p.get('pr'))) state.prio = p.get('pr');
    if (p.get('pl') === '1') state.pipeline = true;
    if (p.has('ev') && ['owners', 'feedstock', 'rejected', 'evaluating', 'unknown'].includes(p.get('ev'))) state.relation = p.get('ev');
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
    if (p.has('site')) state.site = p.get('site');
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
    if (state.grid) p.set('g', state.grid);
    if (state.prio) p.set('pr', state.prio);
    if (state.pipeline) p.set('pl', '1');
    if (state.relation) p.set('ev', state.relation);
    if (state.prospection) p.set('p', '2');
    if (state.zone) p.set('z', '1');
    if (state.power) p.set('k', state.power);
    if (state.radius) p.set('rad', `${state.radius.lat},${state.radius.lon},${state.radius.km}`);
    if (state.yearMin !== bounds.yearMin || state.yearMax !== bounds.yearMax)
      p.set('y', `${state.yearMin}-${state.yearMax}`);
    if (state.types.size !== allTypes.length) p.set('t', [...state.types].join('|'));
    if (state.site) p.set('site', state.site);
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

    // Période — le curseur déplacé est borné par l'autre (jamais de croisement).
    // Le libellé suit le geste, le filtrage (carte + graphiques + tableau,
    // ~300 ms) est debounce comme pour le rayon.
    const yearMinInput = document.getElementById('filter-year-min');
    const yearMaxInput = document.getElementById('filter-year-max');
    let yearTimeout;
    const applyYearLater = () => { clearTimeout(yearTimeout); yearTimeout = setTimeout(applyFilters, 160); };
    yearMinInput.addEventListener('input', () => {
      state.yearMin = Math.min(parseInt(yearMinInput.value, 10), state.yearMax);
      yearMinInput.value = state.yearMin;
      updateYearUI();
      applyYearLater();
    });
    yearMaxInput.addEventListener('input', () => {
      state.yearMax = Math.max(parseInt(yearMaxInput.value, 10), state.yearMin);
      yearMaxInput.value = state.yearMax;
      updateYearUI();
      applyYearLater();
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
    // Boutons ⓘ : chaque bouton déplie le bloc désigné par aria-controls
    document.querySelectorAll('.info-btn[aria-controls]').forEach(btn => {
      const pop = document.getElementById(btn.getAttribute('aria-controls'));
      if (!pop) return;
      btn.addEventListener('click', () => {
        const open = pop.hidden;
        pop.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
      });
    });

    // Fenêtre de décision (tranche d'échéance estimée)
    document.getElementById('filter-window').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-window]');
      if (!btn) return;
      state.window = btn.dataset.window;
      syncSegmented('filter-window', 'window', state.window);
      applyFilters();
    });
    // Registre équipe : pipeline et statut de relation
    document.getElementById('filter-pipeline').addEventListener('change', (e) => {
      state.pipeline = e.target.checked;
      applyFilters();
    });
    document.getElementById('filter-eval').addEventListener('change', (e) => {
      state.relation = e.target.value;
      applyFilters();
    });
    // Priorité du score v2
    document.getElementById('filter-prio').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-prio]');
      if (!btn) return;
      state.prio = btn.dataset.prio;
      syncSegmented('filter-prio', 'prio', state.prio);
      applyFilters();
    });
    // Distance au réseau GRDF (élec. biogaz)
    document.getElementById('filter-grid').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-grid]');
      if (!btn) return;
      state.grid = btn.dataset.grid;
      syncSegmented('filter-grid', 'grid', state.grid);
      applyFilters();
    });
    // Coefficient CPB (méthanisation)
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

    // Présélections
    document.getElementById('presets').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-preset]');
      if (!btn) return;
      applyPreset(btn.dataset.preset);
    });
    // Filtres élec. biogaz actifs avec l'injection affichée : bascule sur la base élec.
    document.getElementById('elec-only').addEventListener('click', () => {
      if (!loadedBases.includes('cogen')) return;
      state.base = 'cogen';
      syncSegmented('filter-base', 'base', state.base);
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
    syncSegmented('filter-grid', 'grid', state.grid);
    syncSegmented('filter-prio', 'prio', state.prio);
    document.getElementById('filter-pipeline').checked = state.pipeline;
    document.getElementById('filter-eval').value = state.relation;
    document.getElementById('filter-prospection').checked = state.prospection;
    document.getElementById('filter-zone').checked = state.zone;
    syncSegmented('filter-power', 'power', state.power);
    if (loadedBases.length > 1) syncSegmented('filter-base', 'base', state.base);
    updateYearUI();
  }

  /* ---------------- présélections ---------------- */

  function applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    // même preset déjà actif : second clic = retour à l'état neutre
    const again = presetActive(name);
    clearState();
    if (!again) Object.entries(preset).forEach(([k, v]) => {
      if (k === 'base' && !loadedBases.includes(v)) return;
      state[k] = v;
    });
    syncControls();
    applyFilters();
  }

  function presetActive(name) {
    const preset = PRESETS[name];
    const keys = Object.keys(preset).filter(k => k !== 'base' || loadedBases.includes(preset[k]));
    return keys.every(k => state[k] === preset[k]) && activeFilterCount() === keys.length;
  }

  function syncPresets() {
    document.querySelectorAll('#presets [data-preset]').forEach(b =>
      b.setAttribute('aria-pressed', String(presetActive(b.dataset.preset))));
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
    if (state.grid) n++;
    if (state.prio) n++;
    if (state.pipeline) n++;
    if (state.relation) n++;
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
    const gridFar = Math.max(...CONFIG.PARAMS.reseau.distance_paliers_km);

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
        // nom, commune, département, ou clé registre (code EIC / id ODRÉ, celle du classeur Excel)
        const hit = (d.nom || '').toLowerCase().includes(state.search)
          || (d.commune || '').toLowerCase().includes(state.search)
          || (d.departement || '').toLowerCase().includes(state.search)
          || (d.key || '').toLowerCase() === state.search;
        if (!hit) return false;
      }
      if (state.region && d.region !== state.region) return false;
      if (!state.types.has(d.type)) return false;
      if (d.annee != null && (d.annee < yearMin || d.annee > state.yearMax)) return false;
      if (state.operator && d.operateur !== state.operator) return false;
      if (state.window && d.echeanceTranche !== state.window) return false; // pas d'estimation -> hors fenêtre
      if (state.pipeline && !d.inPipeline) return false;
      if (state.relation && d.evalStatus !== state.relation) return false;
      // priorité du score v2 : seuls les sites scorés (périmètre) passent
      if (state.prio) {
        if (!d.priorite || !state.prio.includes(d.priorite)) return false;
      }
      // distance au réseau GRDF : ne concerne que l'électricité biogaz (l'injection passe)
      if (state.grid && d.base === 'cogen') {
        const km = d.distGrdf;
        if (state.grid === 'far') { if (km != null && km <= gridFar) return false; }
        else if (km == null || km > Number(state.grid)) return false;
      }
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
    syncPresets();
    // un filtre élec. biogaz est actif alors que l'injection reste affichée
    document.getElementById('elec-notice').hidden =
      !(ELEC_ONLY.some(k => state[k]) && state.base !== 'cogen' && loadedBases.includes('cogen'));

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
    if (state.prospection) {
      // mode screening : les indicateurs du tri, pas ceux du parc national
      const perimetre = allData.filter(d => (!state.base || d.base === state.base) && prospection2(d)).length;
      const nA = filteredData.filter(d => d.priorite === 'A').length;
      const nB = filteredData.filter(d => d.priorite === 'B').length;
      const maxKm = CONFIG.PARAMS.reseau.distance_km.max;
      const near = cog.filter(d => d.distGrdf != null && d.distGrdf <= maxKm).length;
      const inPipe = filteredData.filter(d => d.inPipeline).length;
      const evaluated = filteredData.filter(d => d.evalStatus && d.evalStatus !== 'unknown').length;
      cards.push(kpi('Sites du périmètre',
        `${fmtInt(filteredData.length)} <span class="kpi-sub">/ ${fmtInt(perimetre)}</span>`));
      cards.push(kpi('Priorité A',
        `${fmtInt(nA)} <span class="kpi-sub">· B ${fmtInt(nB)}</span>`, true));
      if (loadedBases.includes('cogen')) {
        cards.push(kpi(`Élec. ≤ ${maxKm} km du réseau`,
          `${fmtInt(near)} <span class="kpi-sub">/ ${fmtInt(cog.length)} élec.</span>`));
      } else {
        cards.push(kpi(`Capacité d'injection`,
          `${fmtNum(capInj, capInj >= 1000 ? 0 : 1)} <span class="kpi-sub">${CAP_UNITS.injection}</span>`));
      }
      cards.push(kpi('Au pipeline Nautilus',
        `${fmtInt(inPipe)} <span class="kpi-sub">· ${fmtInt(evaluated)} évalué${evaluated > 1 ? 's' : ''}</span>`));
      strip.innerHTML = cards.join('');
      return;
    }
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

  // remet tous les filtres à zéro (le site ouvert dans la fiche n'est pas un filtre)
  function clearState() {
    state.base = '';
    state.search = '';
    state.region = '';
    state.operator = '';
    state.status = '';
    state.window = '';
    state.cpb = '';
    state.grid = '';
    state.prio = '';
    state.pipeline = false;
    state.relation = '';
    state.prospection = false;
    state.zone = false;
    state.power = '';
    state.radius = null;
    updateRadiusUI();
    MapView.hideRadius();
    state.types = new Set(allTypes);
    state.yearMin = bounds.yearMin;
    state.yearMax = bounds.yearMax;
  }

  function resetFilters() {
    clearState();
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

  // Site ouvert dans la fiche : écrit dans l'URL pour partager un lien direct
  function setSite(id) {
    state.site = id || null;
    writeURL();
  }

  function onChange(cb) { onChangeCallbacks.push(cb); }
  function getFiltered() { return filteredData; }
  function getState() { return state; }

  return { init, onChange, getFiltered, getState, toggleType, resetFilters, setRadius, clearRadius, setSite,
           applyPreset };
})();
