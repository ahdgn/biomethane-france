/* ============================================
   App — Main initialization
   ============================================ */

(async function () {
  // Show loading overlay
  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.innerHTML = `
    <div class="loading-spinner"></div>
    <div class="loading-text">Chargement des données...</div>
  `;
  document.body.appendChild(overlay);

  try {
    // Load data
    const response = await fetch('points-dinjection-de-biomethane-en-france.json');
    if (!response.ok) throw new Error('Erreur de chargement des données');
    const data = await response.json();

    // Init modules
    MapView.init();
    Charts.init();
    DataTable.init();
    Filters.init(data);

    // Wire up filter changes
    Filters.onChange((filtered) => {
      MapView.update(filtered);
      Charts.update(filtered);
      DataTable.update(filtered);
    });

    // Initial render with all data
    const filtered = Filters.getFiltered();
    MapView.update(filtered);
    Charts.update(filtered);
    DataTable.update(filtered);

    // Set last updated
    document.getElementById('last-updated').textContent =
      `${data.length} sites · Données open data`;

    // Sidebar toggle
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('collapsed');
      setTimeout(() => MapView.invalidateSize(), 300);
    });

    // Resize handling
    window.addEventListener('resize', () => MapView.invalidateSize());

    // Remove loading overlay
    overlay.classList.add('fade-out');
    setTimeout(() => overlay.remove(), 500);

  } catch (error) {
    overlay.innerHTML = `
      <div style="color: #ef4444; font-size: 16px; text-align: center;">
        <div style="font-size: 40px; margin-bottom: 16px;">⚠</div>
        <div>Erreur de chargement</div>
        <div style="color: #94a3b8; font-size: 13px; margin-top: 8px;">${error.message}</div>
        <div style="color: #94a3b8; font-size: 12px; margin-top: 12px;">
          Assurez-vous de lancer l'app via un serveur HTTP local.
        </div>
      </div>
    `;
    console.error('App init error:', error);
  }
})();
