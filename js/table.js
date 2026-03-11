/* ============================================
   Table — Sortable, paginated data table
   ============================================ */

const DataTable = (() => {
  let currentData = [];
  let sortKey = 'capacite_de_production_gwh_an';
  let sortDir = 'desc';
  let currentPage = 1;
  const pageSize = 25;

  function init() {
    bindEvents();
  }

  function bindEvents() {
    // Sort headers
    document.querySelectorAll('#data-table th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (sortKey === key) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortKey = key;
          sortDir = 'asc';
        }
        updateSortUI();
        render();
      });
    });

    // Export CSV
    document.getElementById('btn-export').addEventListener('click', exportCSV);

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');

        if (btn.dataset.tab === 'dashboard') {
          // Charts may need resize
          window.dispatchEvent(new Event('resize'));
        }
        MapView.invalidateSize();
      });
    });
  }

  function update(data) {
    currentData = data;
    currentPage = 1;
    render();
  }

  function render() {
    const sorted = sortData(currentData);
    const totalPages = Math.ceil(sorted.length / pageSize);
    if (currentPage > totalPages) currentPage = totalPages || 1;

    const start = (currentPage - 1) * pageSize;
    const pageData = sorted.slice(start, start + pageSize);

    // Update count
    document.getElementById('table-count').textContent =
      `${currentData.length.toLocaleString('fr-FR')} résultat${currentData.length !== 1 ? 's' : ''}`;

    // Render rows
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    pageData.forEach(d => {
      const tr = document.createElement('tr');
      tr.dataset.id = d.id_unique_projet;

      const statusClass = d.site_ouvert === 'True' ? 'open' : 'closed';
      const statusText = d.site_ouvert === 'True' ? 'Ouvert' : 'Fermé';
      const capacity = (d.capacite_de_production_gwh_an || 0).toLocaleString('fr-FR', {
        maximumFractionDigits: 2,
      });

      tr.innerHTML = `
        <td title="${escapeHtml(d.nom_du_projet || '')}">${escapeHtml(d.nom_du_projet || '—')}</td>
        <td>${escapeHtml(d.commune || '—')}</td>
        <td>${escapeHtml(d.region || '—')}</td>
        <td>${escapeHtml(d.site || '—')}</td>
        <td>${capacity}</td>
        <td>${d.date_de_mes || '—'}</td>
        <td><span class="status-tag ${statusClass}">${statusText}</span></td>
      `;

      tr.addEventListener('click', () => {
        // Highlight
        document.querySelectorAll('#data-table tbody tr').forEach(r => r.classList.remove('highlighted'));
        tr.classList.add('highlighted');
        // Focus on map
        MapView.focusOn(d.id_unique_projet);
      });

      tbody.appendChild(tr);
    });

    renderPagination(totalPages);
  }

  function sortData(data) {
    return [...data].sort((a, b) => {
      let va = a[sortKey];
      let vb = b[sortKey];

      if (va == null) va = '';
      if (vb == null) vb = '';

      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va;
      }

      va = String(va).toLowerCase();
      vb = String(vb).toLowerCase();

      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  function updateSortUI() {
    document.querySelectorAll('#data-table th').forEach(th => {
      th.classList.remove('sorted-asc', 'sorted-desc');
      if (th.dataset.sort === sortKey) {
        th.classList.add(sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      }
    });
  }

  function renderPagination(totalPages) {
    const container = document.getElementById('pagination');
    container.innerHTML = '';

    if (totalPages <= 1) return;

    // Prev button
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '‹';
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener('click', () => { currentPage--; render(); });
    container.appendChild(prevBtn);

    // Page buttons
    const maxVisible = 7;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
      addPageBtn(container, 1);
      if (startPage > 2) {
        const dots = document.createElement('button');
        dots.textContent = '…';
        dots.disabled = true;
        container.appendChild(dots);
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      addPageBtn(container, i);
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        const dots = document.createElement('button');
        dots.textContent = '…';
        dots.disabled = true;
        container.appendChild(dots);
      }
      addPageBtn(container, totalPages);
    }

    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.textContent = '›';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.addEventListener('click', () => { currentPage++; render(); });
    container.appendChild(nextBtn);
  }

  function addPageBtn(container, page) {
    const btn = document.createElement('button');
    btn.textContent = page;
    btn.classList.toggle('active', page === currentPage);
    btn.addEventListener('click', () => { currentPage = page; render(); });
    container.appendChild(btn);
  }

  function exportCSV() {
    if (currentData.length === 0) return;

    const headers = [
      'Projet', 'Commune', 'Département', 'Région', 'Type',
      'Capacité (GWh/an)', 'Date MES', 'Opérateur', 'Réseau', 'Statut',
      'Latitude', 'Longitude',
    ];

    const rows = currentData.map(d => [
      d.nom_du_projet || '',
      d.commune || '',
      d.departement || '',
      d.region || '',
      d.site || '',
      d.capacite_de_production_gwh_an || 0,
      d.date_de_mes || '',
      d.grx_demandeur || '',
      d.type_de_reseau || '',
      d.site_ouvert === 'True' ? 'Ouvert' : 'Fermé',
      d.coordonnees ? d.coordonnees.lat : '',
      d.coordonnees ? d.coordonnees.lon : '',
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `biomethane-france-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  return { init, update };
})();
