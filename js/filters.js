/* ============================================
   Filters — State management & filter logic
   ============================================ */

const Filters = (() => {
  // Filter state
  const state = {
    search: '',
    region: '',
    siteTypes: [],
    yearMin: 2011,
    yearMax: 2026,
    operator: '',
    status: '', // '' = all, 'True' = open, 'False' = closed
  };

  let allData = [];
  let filteredData = [];
  let onChangeCallbacks = [];

  function init(data) {
    allData = data;
    populateFilterOptions(data);
    bindEvents();
    applyFilters();
  }

  function populateFilterOptions(data) {
    // Regions
    const regions = [...new Set(data.map(d => d.region).filter(Boolean))].sort();
    const regionSelect = document.getElementById('filter-region');
    regions.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      regionSelect.appendChild(opt);
    });

    // Site types
    const siteTypes = [...new Set(data.map(d => d.site).filter(Boolean))].sort();
    const container = document.getElementById('filter-site-type');
    siteTypes.forEach(type => {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = type;
      checkbox.checked = true;
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(type));
      container.appendChild(label);
    });
    state.siteTypes = [...siteTypes];

    // Operators
    const operators = [...new Set(data.map(d => d.grx_demandeur).filter(Boolean))].sort();
    const operatorSelect = document.getElementById('filter-operator');
    operators.forEach(op => {
      const opt = document.createElement('option');
      opt.value = op;
      opt.textContent = op;
      operatorSelect.appendChild(opt);
    });

    // Year range
    const years = data.map(d => d.annee_mes).filter(Boolean);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const yearMinInput = document.getElementById('filter-year-min');
    const yearMaxInput = document.getElementById('filter-year-max');
    yearMinInput.min = minYear;
    yearMinInput.max = maxYear;
    yearMinInput.value = minYear;
    yearMaxInput.min = minYear;
    yearMaxInput.max = maxYear;
    yearMaxInput.value = maxYear;
    state.yearMin = minYear;
    state.yearMax = maxYear;
    updateYearLabel();
  }

  function bindEvents() {
    // Search
    const searchInput = document.getElementById('filter-search');
    let searchTimeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        state.search = searchInput.value.trim().toLowerCase();
        applyFilters();
      }, 250);
    });

    // Region
    document.getElementById('filter-region').addEventListener('change', (e) => {
      state.region = e.target.value;
      applyFilters();
    });

    // Site type checkboxes
    document.getElementById('filter-site-type').addEventListener('change', () => {
      const checked = document.querySelectorAll('#filter-site-type input:checked');
      state.siteTypes = [...checked].map(cb => cb.value);
      applyFilters();
    });

    // Year range
    document.getElementById('filter-year-min').addEventListener('input', (e) => {
      state.yearMin = parseInt(e.target.value);
      if (state.yearMin > state.yearMax) {
        state.yearMax = state.yearMin;
        document.getElementById('filter-year-max').value = state.yearMax;
      }
      updateYearLabel();
      applyFilters();
    });

    document.getElementById('filter-year-max').addEventListener('input', (e) => {
      state.yearMax = parseInt(e.target.value);
      if (state.yearMax < state.yearMin) {
        state.yearMin = state.yearMax;
        document.getElementById('filter-year-min').value = state.yearMin;
      }
      updateYearLabel();
      applyFilters();
    });

    // Operator
    document.getElementById('filter-operator').addEventListener('change', (e) => {
      state.operator = e.target.value;
      applyFilters();
    });

    // Status buttons
    document.querySelectorAll('.status-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.status = btn.dataset.status;
        applyFilters();
      });
    });

    // Reset
    document.getElementById('btn-reset').addEventListener('click', resetFilters);
  }

  function updateYearLabel() {
    document.getElementById('year-range-label').textContent = `${state.yearMin} — ${state.yearMax}`;
  }

  function applyFilters() {
    filteredData = allData.filter(d => {
      // Search
      if (state.search) {
        const name = (d.nom_du_projet || '').toLowerCase();
        const commune = (d.commune || '').toLowerCase();
        if (!name.includes(state.search) && !commune.includes(state.search)) return false;
      }

      // Region
      if (state.region && d.region !== state.region) return false;

      // Site type
      if (state.siteTypes.length > 0 && !state.siteTypes.includes(d.site)) return false;
      if (state.siteTypes.length === 0) return false;

      // Year range
      if (d.annee_mes < state.yearMin || d.annee_mes > state.yearMax) return false;

      // Operator
      if (state.operator && d.grx_demandeur !== state.operator) return false;

      // Status
      if (state.status && d.site_ouvert !== state.status) return false;

      return true;
    });

    updateKPIs();
    notifyChange();
  }

  function updateKPIs() {
    document.getElementById('kpi-total').textContent = filteredData.length.toLocaleString('fr-FR');

    const totalCapacity = filteredData.reduce((sum, d) => sum + (d.capacite_de_production_gwh_an || 0), 0);
    document.getElementById('kpi-capacity').textContent = totalCapacity.toLocaleString('fr-FR', {
      maximumFractionDigits: 1
    });

    const activeSites = filteredData.filter(d => d.site_ouvert === 'True').length;
    document.getElementById('kpi-active').textContent = activeSites.toLocaleString('fr-FR');

    const regions = new Set(filteredData.map(d => d.region).filter(Boolean));
    document.getElementById('kpi-regions').textContent = regions.size;
  }

  function resetFilters() {
    state.search = '';
    state.region = '';
    state.operator = '';
    state.status = '';

    document.getElementById('filter-search').value = '';
    document.getElementById('filter-region').value = '';
    document.getElementById('filter-operator').value = '';

    // Reset checkboxes
    document.querySelectorAll('#filter-site-type input').forEach(cb => { cb.checked = true; });
    state.siteTypes = [...document.querySelectorAll('#filter-site-type input')].map(cb => cb.value);

    // Reset year range
    const years = allData.map(d => d.annee_mes).filter(Boolean);
    state.yearMin = Math.min(...years);
    state.yearMax = Math.max(...years);
    document.getElementById('filter-year-min').value = state.yearMin;
    document.getElementById('filter-year-max').value = state.yearMax;
    updateYearLabel();

    // Reset status buttons
    document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.status-btn[data-status=""]').classList.add('active');

    applyFilters();
  }

  function onChange(callback) {
    onChangeCallbacks.push(callback);
  }

  function notifyChange() {
    onChangeCallbacks.forEach(cb => cb(filteredData));
  }

  function getFiltered() {
    return filteredData;
  }

  return { init, onChange, getFiltered, applyFilters };
})();
