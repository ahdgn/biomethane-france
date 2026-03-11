/* ============================================
   Map — Leaflet + MarkerCluster
   ============================================ */

const MapView = (() => {
  let map;
  let clusterGroup;
  let markers = new Map(); // id -> marker

  const TYPE_COLORS = {
    'Agricole autonome': '#10b981',
    'Agricole territorial': '#34d399',
    'Industriel territorial': '#3b82f6',
    'Station d\'épuration': '#8b5cf6',
    'Déchets ménagers et biodéchets': '#f59e0b',
    'ISDND': '#ef4444',
    'Power-to-méthane': '#ec4899',
  };

  function init() {
    map = L.map('map', {
      center: [46.8, 2.5],
      zoom: 6,
      zoomControl: true,
      attributionControl: true,
    });

    // Dark tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      chunkedLoading: true,
    });

    map.addLayer(clusterGroup);

    // Add legend
    addLegend();
  }

  function createIcon(siteType) {
    const color = TYPE_COLORS[siteType] || '#94a3b8';
    return L.divIcon({
      className: 'custom-marker',
      html: `<div style="
        width: 12px; height: 12px;
        background: ${color};
        border: 2px solid rgba(255,255,255,0.8);
        border-radius: 50%;
        box-shadow: 0 0 6px ${color}80;
      "></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
      popupAnchor: [0, -8],
    });
  }

  function update(data) {
    clusterGroup.clearLayers();
    markers.clear();

    data.forEach(d => {
      if (!d.coordonnees || d.coordonnees.lat == null || d.coordonnees.lon == null) return;

      const marker = L.marker([d.coordonnees.lat, d.coordonnees.lon], {
        icon: createIcon(d.site),
      });

      const statusClass = d.site_ouvert === 'True' ? 'open' : 'closed';
      const statusText = d.site_ouvert === 'True' ? 'Ouvert' : 'Fermé';
      const capacity = (d.capacite_de_production_gwh_an || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

      marker.bindPopup(`
        <strong>${escapeHtml(d.nom_du_projet || 'Sans nom')}</strong><br>
        <span style="color: var(--text-muted);">${escapeHtml(d.commune || '')} · ${escapeHtml(d.departement || '')}</span><br>
        <br>
        <b>Type:</b> ${escapeHtml(d.site || '')}<br>
        <b>Capacité:</b> ${capacity} GWh/an<br>
        <b>Mise en service:</b> ${d.date_de_mes || '—'}<br>
        <b>Réseau:</b> ${escapeHtml(d.grx_demandeur || '')} (${escapeHtml(d.type_de_reseau || '')})<br>
        <br>
        <span class="popup-status ${statusClass}">${statusText}</span>
      `, { maxWidth: 300 });

      clusterGroup.addLayer(marker);
      markers.set(d.id_unique_projet, marker);
    });
  }

  function focusOn(id) {
    const marker = markers.get(id);
    if (marker) {
      map.setView(marker.getLatLng(), 13, { animate: true });
      clusterGroup.zoomToShowLayer(marker, () => {
        marker.openPopup();
      });
    }
  }

  function addLegend() {
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = () => {
      const div = L.DomUtil.create('div', 'map-legend');
      div.style.cssText = `
        background: rgba(26,29,39,0.92);
        border: 1px solid #2e3347;
        border-radius: 8px;
        padding: 10px 14px;
        font-size: 11px;
        line-height: 1.8;
        color: #e2e8f0;
        backdrop-filter: blur(8px);
      `;

      let html = '<strong style="font-size:12px;margin-bottom:4px;display:block;">Types de site</strong>';
      for (const [type, color] of Object.entries(TYPE_COLORS)) {
        html += `<div style="display:flex;align-items:center;gap:6px;">
          <span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;"></span>
          ${escapeHtml(type)}
        </div>`;
      }
      div.innerHTML = html;
      return div;
    };
    legend.addTo(map);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function invalidateSize() {
    if (map) map.invalidateSize();
  }

  return { init, update, focusOn, invalidateSize };
})();
