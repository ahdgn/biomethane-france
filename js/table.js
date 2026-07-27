/* ============================================
   Table — tri accessible (aria-sort), pagination
   avec sélecteur de taille, export CSV filtré
   ============================================ */

const DataTable = (() => {
  const { fmtNum, fmtDate, escapeHtml, typeColor, CAP_UNITS } = CONFIG;

  let currentData = [];
  let sortKey = 'capacite';
  let sortDir = 'desc';
  let currentPage = 1;
  let pageSize = 25;
  let hasCogen = false;

  function init(withCogen) {
    hasCogen = withCogen;
    if (hasCogen) addBaseColumn();
    bindEvents();
    updateSortUI();
  }

  function addBaseColumn() {
    const row = document.querySelector('#data-table thead tr');
    const th = document.createElement('th');
    th.scope = 'col';
    th.dataset.sort = 'base';
    th.textContent = 'Base';
    row.insertBefore(th, row.firstElementChild);
  }

  function bindEvents() {
    document.querySelectorAll('#data-table th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (sortKey === key) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortKey = key;
          // premier clic : ordre le plus utile selon la colonne
          sortDir = (key === 'capacite' || key === 'dateMes' || key === 'ouvert') ? 'desc' : 'asc';
        }
        updateSortUI();
        render();
      });
    });

    document.getElementById('page-size').addEventListener('change', (e) => {
      pageSize = parseInt(e.target.value, 10);
      currentPage = 1;
      render();
    });

    document.getElementById('btn-export').addEventListener('click', exportCSV);
  }

  function update(data) {
    currentData = data;
    currentPage = 1;
    render();
  }

  function render() {
    const sorted = sortData(currentData);
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * pageSize;
    const pageData = sorted.slice(start, start + pageSize);

    document.getElementById('table-count').innerHTML =
      `<strong>${total.toLocaleString('fr-FR')}</strong> site${total > 1 ? 's' : ''}`;
    document.getElementById('table-range').textContent = total === 0 ? '' :
      `${(start + 1).toLocaleString('fr-FR')}–${Math.min(start + pageSize, total).toLocaleString('fr-FR')} sur ${total.toLocaleString('fr-FR')}`;
    document.getElementById('table-empty').hidden = total > 0;

    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    pageData.forEach(d => {
      const tr = document.createElement('tr');
      tr.dataset.id = d.id;
      tr.title = 'Cliquer pour localiser sur la carte';

      const unit = CAP_UNITS[d.base] || '';
      const baseCell = hasCogen
        ? `<td>${d.base === 'cogen' ? 'Cogé' : 'Injection'}</td>` : '';

      tr.innerHTML = `
        ${baseCell}
        <td title="${escapeHtml(d.nom)}">${escapeHtml(d.nom || '—')}</td>
        <td>${escapeHtml(d.commune || '—')}</td>
        <td>${escapeHtml(d.region || '—')}</td>
        <td><span class="type-cell">
          <span class="type-dot${d.base === 'cogen' ? ' diamond' : ''}" style="background:${typeColor(d.type)}"></span>
          <span class="type-name" title="${escapeHtml(d.type)}">${escapeHtml(d.type || '—')}</span>
        </span></td>
        <td class="col-num" title="${unit}">${fmtNum(d.capacite, 2)}</td>
        <td>${fmtDate(d.dateMes)}</td>
        <td><span class="status-tag ${d.ouvert ? 'open' : 'closed'}">${d.ouvert ? 'Ouvert' : 'Fermé'}</span></td>
      `;

      tr.addEventListener('click', () => {
        document.querySelectorAll('#data-table tbody tr').forEach(r => r.classList.remove('highlighted'));
        tr.classList.add('highlighted');
        MapView.focusOn(d.id);
      });

      tbody.appendChild(tr);
    });

    renderPagination(totalPages);
  }

  function sortData(data) {
    return [...data].sort((a, b) => {
      let va = a[sortKey];
      let vb = b[sortKey];
      if (va == null) va = sortKey === 'capacite' ? -Infinity : '';
      if (vb == null) vb = sortKey === 'capacite' ? -Infinity : '';

      let cmp;
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else if (typeof va === 'boolean' && typeof vb === 'boolean') cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), 'fr', { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }

  function updateSortUI() {
    document.querySelectorAll('#data-table th[data-sort]').forEach(th => {
      if (th.dataset.sort === sortKey) {
        th.setAttribute('aria-sort', sortDir === 'asc' ? 'ascending' : 'descending');
      } else {
        th.setAttribute('aria-sort', 'none');
      }
    });
  }

  function renderPagination(totalPages) {
    const container = document.getElementById('pagination');
    container.innerHTML = '';
    if (totalPages <= 1) return;

    const mk = (label, page, opts = {}) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      if (opts.disabled) btn.disabled = true;
      if (opts.current) btn.setAttribute('aria-current', 'page');
      if (opts.aria) btn.setAttribute('aria-label', opts.aria);
      if (page != null && !opts.disabled && !opts.current) {
        btn.addEventListener('click', () => { currentPage = page; render(); });
      }
      container.appendChild(btn);
      return btn;
    };

    mk('‹', currentPage - 1, { disabled: currentPage === 1, aria: 'Page précédente' });

    const maxVisible = 7;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    const endPage = Math.min(totalPages, startPage + maxVisible - 1);
    startPage = Math.max(1, endPage - maxVisible + 1);

    if (startPage > 1) {
      mk('1', 1, { current: currentPage === 1 });
      if (startPage > 2) mk('…', null, { disabled: true });
    }
    for (let i = startPage; i <= endPage; i++) mk(String(i), i, { current: i === currentPage });
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) mk('…', null, { disabled: true });
      mk(String(totalPages), totalPages, { current: currentPage === totalPages });
    }

    mk('›', currentPage + 1, { disabled: currentPage === totalPages, aria: 'Page suivante' });
  }

  function exportCSV() {
    if (currentData.length === 0) return;

    const headers = ['Base', 'Projet', 'Commune', 'Département', 'Région', 'Type',
      'Capacité (GWh/an)', 'Unité capacité', 'Mise en service', 'Opérateur', 'Réseau / technologie',
      'Statut', 'Latitude', 'Longitude', 'Précision géo'];

    const rows = currentData.map(d => [
      d.base === 'cogen' ? 'Cogénération' : 'Injection',
      d.nom, d.commune, d.departement, d.region, d.type,
      d.capacite != null ? String(d.capacite).replace('.', ',') : '',
      CAP_UNITS[d.base] || '',
      d.dateMes || '',
      d.operateur, d.reseau,
      d.ouvert ? 'Ouvert' : 'Fermé',
      d.lat != null ? String(d.lat).replace('.', ',') : '',
      d.lon != null ? String(d.lon).replace('.', ',') : '',
      d.geoPrecision || '',
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell == null ? '' : cell).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');

    const BOM = '\uFEFF'; // BOM UTF-8 pour Excel
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `biomethane-france-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return { init, update };
})();
