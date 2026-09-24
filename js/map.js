/* ============================================
   Map — Leaflet + clusters
   Taille des marqueurs = capacité · couleur = type
   Légende dynamique et interactive
   ============================================ */

const MapView = (() => {
  const { PALETTE, fmtNum, fmtDate, escapeHtml, typeColor, CAP_UNITS } = CONFIG;

  const FRANCE_BOUNDS = L.latLngBounds([41.2, -5.5], [51.3, 9.8]);

  let map;
  let clusterGroup;
  let legendDiv;
  // légende repliée par défaut sur petit écran (elle couvrirait la carte)
  let legendCollapsed = window.matchMedia('(max-width: 860px)').matches;
  const markers = new Map(); // id -> marker
  const dataById = new Map(); // id -> site (lien rayon des popups)
  let radiusCircle = null;

  function init() {
    map = L.map('map', {
      center: FRANCE_BOUNDS.getCenter(),
      zoom: 6,
      // sur un écran de téléphone (carte ~300 px de haut), la France
      // entière demande un zoom < 5 : le plancher doit descendre à 4
      minZoom: 4,
      zoomControl: true,
      // pas de zoom fractionnaire : cadrage au plus juste sur la France
      zoomSnap: 0.25,
    });

    // Esri World Light Gray : fond clair institutionnel servi sans clé
    // (CARTO impose désormais une clé API — tuiles filigranées sinon).
    // Tuiles natives jusqu'au zoom 16, suréchantillonnées au-delà.
    const baseMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Fond de carte &copy; <a href="https://www.esri.com/">Esri</a> · Données &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxNativeZoom: 16,
      maxZoom: 19,
    }).addTo(map);
    // Vue satellite (port de biomethane-germany, demande équipe 09/09/2026) :
    // vérifier une installation sur imagerie avant d'aller sur site.
    // Esri World Imagery, servi sans clé.
    const baseSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Imagerie &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics',
      maxNativeZoom: 18,
      maxZoom: 19,
    });
    L.control.layers({ 'Carte': baseMap, 'Satellite': baseSat }, null,
      { position: 'topleft', collapsed: false }).addTo(map);

    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

    // Bouton recentrer
    const recenter = L.control({ position: 'topleft' });
    recenter.onAdd = () => {
      const div = L.DomUtil.create('div', 'leaflet-bar');
      const a = L.DomUtil.create('a', '', div);
      a.href = '#';
      a.title = 'Recentrer sur la France';
      a.setAttribute('aria-label', 'Recentrer sur la France');
      a.innerHTML = '⌂';
      L.DomEvent.on(a, 'click', (e) => {
        L.DomEvent.preventDefault(e);
        fitFrance();
      });
      return div;
    };
    recenter.addTo(map);

    clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 46,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      chunkedLoading: true,
      iconCreateFunction: (cluster) => {
        const n = cluster.getChildCount();
        const size = n < 10 ? 30 : n < 100 ? 36 : 44;
        return L.divIcon({
          html: `<div class="cluster-icon">${n.toLocaleString('fr-FR')}</div>`,
          className: 'marker-cluster',
          iconSize: [size, size],
        });
      },
    });
    map.addLayer(clusterGroup);

    addLegend();

    // Lien « 50 km autour » des popups -> filtre rayon
    map.on('popupopen', (e) => {
      const el = e.popup.getElement();
      const a = el.querySelector('a[data-radius-id]');
      if (a) a.addEventListener('click', (ev) => {
        ev.preventDefault();
        const d = dataById.get(a.dataset.radiusId);
        if (d) Filters.setRadius(d.lat, d.lon, 50, d.nom);
        map.closePopup();
      });
    });

    // vue d'entrée : la France entière, quelle que soit la taille de l'écran
    fitFrance();
  }

  function fitFrance() {
    if (map) map.fitBounds(FRANCE_BOUNDS, { padding: [10, 10] });
  }

  /* Cercle du filtre rayon : dessiné / retiré par Filters via showRadius /
     hideRadius. Double trait (halo blanc + pointillés teal), lisible sur
     fond clair comme sur imagerie satellite. */
  function showRadius(lat, lon, km) {
    hideRadius();
    const casing = L.circle([lat, lon], {
      radius: km * 1000, color: '#FFFFFF', weight: 5, opacity: 0.85,
      fill: false, interactive: false,
    });
    const dash = L.circle([lat, lon], {
      radius: km * 1000, color: PALETTE.teal, weight: 2.25,
      dashArray: '8 8', fillColor: PALETTE.teal, fillOpacity: 0.05,
      interactive: false,
    });
    radiusCircle = L.layerGroup([casing, dash]).addTo(map);
    map.fitBounds(dash.getBounds(), { padding: [20, 20] });
  }
  function hideRadius() {
    if (radiusCircle) { map.removeLayer(radiusCircle); radiusCircle = null; }
  }

  /* Rayon proportionnel à la racine de la capacité (5 → 13 px) */
  function radiusFor(capacite) {
    if (!capacite || capacite <= 0) return 5;
    return Math.max(5, Math.min(13, 3.4 + Math.sqrt(capacite) * 1.15));
  }

  function createIcon(d) {
    const color = typeColor(d.type);
    const r = radiusFor(d.capacite);
    const size = r * 2;
    const isCogen = d.base === 'cogen';
    const shape = isCogen
      ? `border-radius: 3px; transform: rotate(45deg);`
      : `border-radius: 50%;`;
    return L.divIcon({
      className: 'site-marker',
      html: `<div style="width:${size}px;height:${size}px;background:${color};${shape}
        border:1.5px solid #fff;box-shadow:0 1px 3px rgba(30,66,96,0.4);
        ${d.ouvert ? '' : 'opacity:0.45;'}"></div>`,
      iconSize: [size, size],
      iconAnchor: [r, r],
      popupAnchor: [0, -r - 2],
    });
  }

  function popupHtml(d) {
    const unit = CAP_UNITS[d.base] || 'GWh/an';
    const rows = [
      ['Type', d.type],
      ['Capacité', `${fmtNum(d.capacite, 2)} ${unit}`],
      ['Mise en service', fmtDate(d.dateMes)],
      ['Réseau', [d.operateur, d.reseau].filter(Boolean).join(' · ')],
    ];
    if (d.base === 'cogen' && d.puissanceKw)
      rows.splice(2, 0, ['Puissance', `${fmtNum(d.puissanceKw, 0)} kW`]);
    if (d.base === 'cogen' && d.combustible)
      rows.splice(1, 0, ['Combustible', d.combustible]);
    if (d.echeanceAnnee != null)
      rows.push(['Échéance contrat (est.)', String(d.echeanceAnnee)]);

    const hypNote = d.echeanceHyp
      ? `<div class="legend-note">Hypothèse : ${escapeHtml(d.echeanceHyp)}</div>` : '';
    const geoNote = d.geoPrecision === 'commune'
      ? `<div class="legend-note">Position au centre de la commune</div>` : '';
    const gmaps = (d.lat != null && d.lon != null)
      ? `<a class="popup-link" href="https://www.google.com/maps?q=${d.lat},${d.lon}"
           target="_blank" rel="noopener noreferrer">Google Maps ↗</a>` : '';
    const radiusLink = (d.lat != null && d.lon != null)
      ? `<a class="popup-link" href="#" data-radius-id="${escapeHtml(d.id)}"
           title="Ne garder que les sites autour de celui-ci">⌖ 50 km autour</a>` : '';

    return `
      <div class="popup-title">${escapeHtml(d.nom)}</div>
      <div class="popup-sub">${escapeHtml([d.commune, d.departement].filter(Boolean).join(' · '))}</div>
      <dl class="popup-grid">
        ${rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(String(v || '—'))}</dd>`).join('')}
      </dl>
      <div class="popup-foot">
        <span class="status-tag ${d.ouvert ? 'open' : 'closed'}">${d.ouvert ? 'Ouvert' : 'Fermé'}</span>
        ${radiusLink}
        ${gmaps}
      </div>
      ${hypNote}${geoNote}`;
  }

  function update(data) {
    clusterGroup.clearLayers();
    markers.clear();

    dataById.clear();
    const layer = [];
    data.forEach(d => {
      dataById.set(d.id, d);
      if (d.lat == null || d.lon == null) return;
      const marker = L.marker([d.lat, d.lon], {
        icon: createIcon(d),
        title: d.nom,
        alt: d.nom,
      });
      marker.bindPopup(popupHtml(d), { maxWidth: 300 });
      layer.push(marker);
      markers.set(d.id, marker);
    });
    clusterGroup.addLayers(layer);

    document.getElementById('map-empty').hidden = data.length > 0;
    updateLegend(data);
  }

  function focusOn(id) {
    const marker = markers.get(id);
    if (!marker) return;
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 12), { animate: true });
    clusterGroup.zoomToShowLayer(marker, () => marker.openPopup());
  }

  /* ---- Légende dynamique : types présents + effectifs, cliquable ---- */

  function addLegend() {
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = () => {
      legendDiv = L.DomUtil.create('div', 'map-legend');
      L.DomEvent.disableClickPropagation(legendDiv);
      L.DomEvent.disableScrollPropagation(legendDiv);
      return legendDiv;
    };
    legend.addTo(map);
  }

  function updateLegend(data) {
    if (!legendDiv) return;
    const counts = {};
    let hasCogen = false, hasCommune = false;
    data.forEach(d => {
      counts[d.type] = (counts[d.type] || 0) + 1;
      if (d.base === 'cogen') hasCogen = true;
      if (d.geoPrecision === 'commune') hasCommune = true;
    });
    const types = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

    if (!types.length) { legendDiv.innerHTML = ''; return; }

    legendDiv.classList.toggle('collapsed', legendCollapsed);
    legendDiv.innerHTML = `
      <button class="map-legend-toggle" aria-expanded="${!legendCollapsed}"
              aria-label="Afficher ou masquer la légende">
        <span class="map-legend-title">Types de site</span>
        <span class="chevron" aria-hidden="true">▼</span>
      </button>
      <div class="map-legend-body">
      ${types.map(t => {
        const diamond = t.startsWith('Cogénération') ? ' diamond' : '';
        return `<div class="legend-item" data-type="${escapeHtml(t)}" role="button" tabindex="0"
             title="Cliquer pour masquer / afficher ce type">
          <span class="type-dot${diamond}" style="background:${typeColor(t)}"></span>
          <span class="type-name">${escapeHtml(t)}</span>
          <span class="type-count">${counts[t].toLocaleString('fr-FR')}</span>
        </div>`;
      }).join('')}
      ${hasCogen && hasCommune ? '<div class="legend-note">◆ cogénérations — position à la commune</div>' : ''}
      <div class="legend-note">Taille du point ∝ capacité</div>
      </div>`;

    legendDiv.querySelector('.map-legend-toggle').addEventListener('click', () => {
      legendCollapsed = !legendCollapsed;
      legendDiv.classList.toggle('collapsed', legendCollapsed);
      legendDiv.querySelector('.map-legend-toggle').setAttribute('aria-expanded', String(!legendCollapsed));
    });

    legendDiv.querySelectorAll('.legend-item').forEach(el => {
      const toggle = () => Filters.toggleType(el.dataset.type);
      el.addEventListener('click', toggle);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    });
  }

  function invalidateSize() {
    if (map) map.invalidateSize();
  }

  // popupHtml exposé : réutilisé pour la fiche site (one-pager) et les tests
  return { init, update, focusOn, invalidateSize, fitFrance, showRadius, hideRadius, popupHtml };
})();
