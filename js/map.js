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

    // Liens des popups : « 50 km autour » -> filtre rayon ; « Qualifier » -> panneau registre
    map.on('popupopen', (e) => {
      const el = e.popup.getElement();
      const a = el.querySelector('a[data-radius-id]');
      if (a) a.addEventListener('click', (ev) => {
        ev.preventDefault();
        const d = dataById.get(a.dataset.radiusId);
        if (d) Filters.setRadius(d.lat, d.lon, 50, d.nom);
        map.closePopup();
      });
      const q = el.querySelector('a[data-qualify-id]');
      if (q) q.addEventListener('click', (ev) => {
        ev.preventDefault();
        const d = dataById.get(q.dataset.qualifyId);
        if (d) Qualify.open(d);
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
    // sites du pipeline Nautilus (registre, projet renseigné) : halo ambre
    const ring = d.inPipeline
      ? `border:2.5px solid ${PALETTE.amber};box-shadow:0 0 0 2px rgba(251,174,64,0.35);`
      : `border:1.5px solid #fff;box-shadow:0 1px 3px rgba(30,66,96,0.4);`;
    return L.divIcon({
      className: 'site-marker',
      html: `<div style="width:${size}px;height:${size}px;background:${color};${shape}
        ${ring}
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
    if (d.base === 'cogen')
      rows.splice(1, 0, ['Combustible', d.combustible || (d.codeCombustible ? `code ${d.codeCombustible}` : '—')]);
    if (d.echeanceAnnee != null)
      rows.push(['Échéance contrat (est.)',
        d.echeanceTrancheLabel ? `${d.echeanceAnnee} · tranche ${d.echeanceTrancheLabel}` : String(d.echeanceAnnee)]);
    if (d.score != null) {
      const det = d.scoreDetail
        ? Object.entries(d.scoreDetail).map(([k, v]) => `${CONFIG.SCORE_LABELS[k] || k} ${fmtNum(v, 0)}`).join(' · ')
        : '';
      rows.push(['Score v2', `${fmtNum(d.score, 0)} / 100 · priorité ${d.priorite}${det ? ' (' + det + ')' : ''}`]);
    }
    if (d.base === 'cogen') {
      rows.push(['Réseau GRDF (est.)', d.distGrdf != null
        ? `${fmtNum(d.distGrdf, 1)} km à vol d'oiseau`
        : `> ${CONFIG.PARAMS.reseau.rayon_recherche_km} km ou zone ELD`]);
      if (d.distInjection != null)
        rows.push(['Injection la plus proche', `${fmtNum(d.distInjection, 1)} km · ${d.injectionProche || ''}`]);
    }
    if (d.icpe)
      rows.push(['ICPE (Géorisques)', [d.icpe.lib_regime ? `régime ${d.icpe.lib_regime.toLowerCase()}` : null,
        d.icpe.nom, d.icpe.maj ? `màj ${d.icpe.maj}` : null].filter(Boolean).join(' · ')]);
    if (d.zonage)
      rows.push(['Zonage de raccordement', [d.zonage.libelle, d.zonage.maturite,
        d.zonage.capamax != null ? `capacité max ${fmtNum(d.zonage.capamax, 0)} Nm³/h` : null,
        d.zonage.capaattent ? `en attente ${d.zonage.capaattent}` : null].filter(Boolean).join(' · ')]);
    if (d.inPipeline)
      rows.push(['Pipeline Nautilus', [d.pipeline.project, d.pipeline.status, d.pipeline.confidence].filter(Boolean).join(' · ')]);
    if (d.evalStatus && d.evalStatus !== 'unknown')
      rows.push(['Relation', CONFIG.EVAL_LABELS[d.evalStatus] || d.evalStatus]);
    if (d.gridRating)
      rows.push(['Difficulté raccordement (équipe)', CONFIG.GRID_LABELS[d.gridRating] || d.gridRating]);
    if (d.pipeline && d.pipeline.tags && d.pipeline.tags.length)
      rows.push(['Connaissance équipe', d.pipeline.tags.map(t => CONFIG.TAG_LABELS[t] || t).join(' · ')]);
    if (d.pipeline && d.pipeline.capital) rows.push(['Capital', d.pipeline.capital]);
    if (d.pipeline && d.pipeline.icpe) rows.push(['Régime ICPE', d.pipeline.icpe]);
    if (d.pipeline && d.pipeline.intrants) rows.push(['Intrants', d.pipeline.intrants]);
    if (d.cpb) {
      const c = d.cpb;
      const coefTxt = fmtNum(c.coef, 2);
      rows.push(['Coefficient CPB (est.)', c.atteignable
        ? `${coefTxt} en ${c.conv} · 0,95 atteignable ${c.first === c.last ? 'en ' + c.first : 'de ' + c.first + ' à ' + c.last}`
        : `${coefTxt} en ${c.conv} (âge ${c.ageConv} ans) · 0,95 hors d'atteinte`]);
    }

    const hypNote = d.echeanceHyp
      ? `<div class="legend-note">Hypothèse : ${escapeHtml(d.echeanceHyp)}</div>` : '';
    const geoNote = d.geoPrecision === 'commune'
      ? `<div class="legend-note">Position au centre de la commune</div>`
      : d.geoPrecision === 'site (ICPE)'
        ? `<div class="legend-note">Position de l'installation classée (Géorisques, ${escapeHtml(d.icpe && d.icpe.confiance || 'rapprochement par commune')})</div>` : '';
    const gl = CONFIG.gmapsLinks(d);
    const gmaps = [gl.primary, gl.secondary].filter(Boolean).map(l =>
      `<a class="popup-link" href="${l.href}" title="${escapeHtml(l.title)}"
           target="_blank" rel="noopener noreferrer">${escapeHtml(l.label)}</a>`).join('\n        ');
    const radiusLink = (d.lat != null && d.lon != null)
      ? `<a class="popup-link" href="#" data-radius-id="${escapeHtml(d.id)}"
           title="Ne garder que les sites autour de celui-ci">⌖ 50 km autour</a>` : '';
    const icpeLink = d.icpe && d.icpe.url
      ? `<a class="popup-link" href="${escapeHtml(d.icpe.url)}" target="_blank" rel="noopener noreferrer"
           title="Fiche de l'installation classée sur Géorisques">Fiche ICPE ↗</a>` : '';
    const qualifyLink = `<a class="popup-link" href="#" data-qualify-id="${escapeHtml(d.id)}"
           title="Ouvrir le panneau de qualification et inscrire ce site au registre équipe">✎ Qualifier</a>`;
    const plNote = d.pipeline && d.pipeline.notes
      ? Object.entries(d.pipeline.notes).map(([k, v]) => `<div class="legend-note"><b>${escapeHtml(k)}</b> : ${escapeHtml(v)}</div>`).join('')
      : '';

    return `
      <div class="popup-title">${escapeHtml(d.nom)}</div>
      <div class="popup-sub">${escapeHtml([d.commune, d.departement].filter(Boolean).join(' · '))}</div>
      <dl class="popup-grid">
        ${rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(String(v || '—'))}</dd>`).join('')}
      </dl>
      <div class="popup-foot">
        <span class="status-tag ${d.ouvert ? 'open' : 'closed'}">${d.ouvert ? 'Ouvert' : 'Fermé'}</span>
        ${qualifyLink}
        ${radiusLink}
        ${gmaps}
        ${icpeLink}
      </div>
      ${hypNote}${geoNote}${plNote}`;
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
        const diamond = t.startsWith('Élec.') ? ' diamond' : '';
        return `<div class="legend-item" data-type="${escapeHtml(t)}" role="button" tabindex="0"
             title="Cliquer pour masquer / afficher ce type">
          <span class="type-dot${diamond}" style="background:${typeColor(t)}"></span>
          <span class="type-name">${escapeHtml(t)}</span>
          <span class="type-count">${counts[t].toLocaleString('fr-FR')}</span>
        </div>`;
      }).join('')}
      ${hasCogen && hasCommune ? '<div class="legend-note">◆ élec. biogaz — position à la commune</div>' : ''}
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
