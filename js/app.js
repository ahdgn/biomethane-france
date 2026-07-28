/* ============================================
   App — chargement, onglets, panneau
   redimensionnable, sidebar, footer
   ============================================ */

(async function () {
  const { DATASETS, SOURCE_NOTE, fmtInt } = CONFIG;

  /* ---- Écran de chargement ---- */
  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.innerHTML = `
    <div class="loading-spinner" role="status" aria-label="Chargement"></div>
    <div class="loading-text">Chargement des données…</div>`;
  document.body.appendChild(overlay);

  try {
    /* ---- Chargement des jeux de données ---- */
    const results = await Promise.all(DATASETS.map(async (ds) => {
      try {
        const resp = await fetch(ds.url);
        if (!resp.ok) throw new Error(`${ds.url} : HTTP ${resp.status}`);
        const raw = await resp.json();
        const records = raw.map(ds.normalize).map(r => {
          const e = CONFIG.echeance(r);
          r.echeanceAnnee = e.annee;
          r.echeanceHyp = e.hyp;
          return r;
        });
        return { ds, records };
      } catch (err) {
        if (ds.optional) return { ds, records: null }; // base facultative absente
        throw err;
      }
    }));

    const loaded = results.filter(r => r.records);
    const allData = loaded.flatMap(r => r.records);
    const loadedBases = loaded.map(r => r.ds.id);

    /* ---- Init des modules ---- */
    MapView.init();
    Charts.init();
    DataTable.init(loadedBases.includes('cogen'));
    Filters.init(allData, loadedBases);

    Filters.onChange((filtered) => {
      MapView.update(filtered);
      Charts.update(filtered);
      DataTable.update(filtered);
    });

    const filtered = Filters.getFiltered();
    MapView.update(filtered);
    Charts.update(filtered);
    DataTable.update(filtered);

    /* ---- Header / footer ---- */
    document.getElementById('header-meta').textContent =
      loaded.map(r => `${fmtInt(r.records.length)} ${r.ds.label.toLowerCase() === 'injection'
        ? 'points d\'injection' : r.ds.label.toLowerCase()}`).join(' · ');
    document.getElementById('footer-source').textContent = `Sources : ${SOURCE_NOTE}`;
    document.getElementById('footer-rights').textContent =
      `© ${new Date().getFullYear()} Nautilus — Tous droits réservés`;

    /* ---- Sidebar ---- */
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const backdrop = document.getElementById('sidebar-backdrop');
    const isMobile = () => window.matchMedia('(max-width: 860px)').matches;

    function setSidebar(collapsed) {
      sidebar.classList.toggle('collapsed', collapsed);
      sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
      backdrop.hidden = collapsed || !isMobile();
      setTimeout(() => { MapView.invalidateSize(); Charts.resize(); }, 200);
    }
    // sur mobile, la sidebar en surcouche démarre fermée
    if (isMobile()) setSidebar(true);
    sidebarToggle.addEventListener('click', () => setSidebar(!sidebar.classList.contains('collapsed')));
    backdrop.addEventListener('click', () => setSidebar(true));
    // sur mobile, un choix dans un sélecteur referme la surcouche pour montrer le résultat
    // (pas les cases à cocher ni les curseurs, qu'on ajuste en plusieurs gestes)
    sidebar.addEventListener('change', (e) => {
      if (isMobile() && e.target.tagName === 'SELECT') setSidebar(true);
    });

    /* ---- Onglets (accessibles) ---- */
    const tabs = [...document.querySelectorAll('.tab-btn[role="tab"]')];
    function selectTab(btn) {
      tabs.forEach(t => {
        const selected = t === btn;
        t.setAttribute('aria-selected', String(selected));
        document.getElementById(t.getAttribute('aria-controls')).hidden = !selected;
      });
      Charts.resize();
    }
    tabs.forEach((btn, i) => {
      btn.addEventListener('click', () => selectTab(btn));
      btn.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        next.focus();
        selectTab(next);
      });
    });

    /* ---- Panneau bas : redimensionnement ---- */
    const panel = document.getElementById('bottom-panel');
    const resizer = document.getElementById('panel-resizer');
    const maximizeBtn = document.getElementById('panel-maximize');
    const MIN_H = 41;
    // hauteur par défaut : ~38 % de la colonne principale (bornée 240–400 px)
    const defaultH = () => Math.max(240, Math.min(400,
      Math.round(document.querySelector('.main-content').clientHeight * 0.38)));

    // hauteur mémorisée ignorée si inutilisable (< 120 px : panneau quasi fermé)
    const savedH = parseInt(localStorage.getItem('bmf-panel-h') || '', 10);
    panel.style.height = (savedH >= 120 ? savedH : defaultH()) + 'px';
    // la carte vient de perdre la hauteur du panneau : on recadre sur la France
    requestAnimationFrame(() => { MapView.invalidateSize(); MapView.fitFrance(); });

    function maxH() {
      return document.querySelector('.main-content').clientHeight - 160;
    }
    function setPanelHeight(h, persist = true) {
      const clamped = Math.max(MIN_H, Math.min(maxH(), h));
      panel.style.height = clamped + 'px';
      if (persist) localStorage.setItem('bmf-panel-h', String(Math.round(clamped)));
      MapView.invalidateSize();
      Charts.resize();
    }

    let dragging = false, startY = 0, startH = 0;
    resizer.addEventListener('pointerdown', (e) => {
      dragging = true;
      startY = e.clientY;
      startH = panel.offsetHeight;
      resizer.classList.add('dragging');
      resizer.setPointerCapture(e.pointerId);
    });
    resizer.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      setPanelHeight(startH + (startY - e.clientY), false);
    });
    resizer.addEventListener('pointerup', (e) => {
      dragging = false;
      resizer.classList.remove('dragging');
      resizer.releasePointerCapture(e.pointerId);
      // on ne mémorise qu'une hauteur utilisable
      if (panel.offsetHeight >= 120) localStorage.setItem('bmf-panel-h', String(panel.offsetHeight));
    });
    resizer.addEventListener('dblclick', () => setPanelHeight(defaultH()));
    // clavier : flèches haut/bas sur le séparateur
    resizer.tabIndex = 0;
    resizer.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); setPanelHeight(panel.offsetHeight + 24); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setPanelHeight(panel.offsetHeight - 24); }
    });

    maximizeBtn.addEventListener('click', () => {
      const nearMax = panel.offsetHeight >= maxH() - 20;
      setPanelHeight(nearMax ? defaultH() : maxH());
      maximizeBtn.classList.toggle('flipped', !nearMax);
    });

    /* ---- Redimensionnement fenêtre ---- */
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        MapView.invalidateSize();
        Charts.resize();
        if (panel.offsetHeight > maxH()) setPanelHeight(maxH(), false);
      }, 120);
    });

    /* ---- Fin du chargement ---- */
    overlay.classList.add('fade-out');
    setTimeout(() => overlay.remove(), 400);

  } catch (error) {
    overlay.innerHTML = `
      <div class="loading-error">
        <div>Erreur de chargement des données</div>
        <small>${CONFIG.escapeHtml(error.message)}</small>
        <small>Lancez l'application via un serveur HTTP local (ex. <code>python -m http.server</code>).</small>
      </div>`;
    console.error('Erreur d\'initialisation :', error);
  }
})();
