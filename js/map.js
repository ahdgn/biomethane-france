/* ============================================
   Map — Leaflet + clusters
   Taille des marqueurs = capacité · couleur = type
   Légende dynamique et interactive
   ============================================ */

const MapView = (() => {
  const { PALETTE, fmtNum, fmtDate, escapeHtml, typeColor, CAP_UNITS, isMobile } = CONFIG;

  const FRANCE_BOUNDS = L.latLngBounds([41.2, -5.5], [51.3, 9.8]);

  let map;
  let clusterGroup;
  let legendDiv;
  // légende repliée par défaut sur petit écran (elle couvrirait la carte)
  let legendCollapsed = isMobile();
  const markers = new Map(); // id -> marker
  const dataById = new Map(); // id -> site (lien rayon des popups)
  let radiusCircle = null;
  let sheet = null; // feuille basse mobile (remplace la popup Leaflet sur petit écran)

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

    // Liens d'action des popups (desktop) ; la feuille mobile passe par le même câblage
    map.on('popupopen', (e) => bindActions(e.popup.getElement()));
    // un clic sur la carte referme la feuille mobile, comme il referme une popup
    map.on('click', closeSheet);

    // vue d'entrée : la France entière, quelle que soit la taille de l'écran
    fitFrance();
  }

  /* ---- Actions d'une fiche (popup, feuille mobile, panneau latéral) ----
     « Rayon » -> filtre rayon ; « Qualifier » / « Fiche » -> panneau registre */
  function bindActions(root) {
    if (!root) return;
    const wire = (attr, fn) => root.querySelectorAll(`a[${attr}]`).forEach(a => {
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        const d = dataById.get(a.getAttribute(attr));
        closeAny();
        if (d) fn(d);
      });
    });
    wire('data-radius-id', (d) => Filters.setRadius(d.lat, d.lon, 50, d.nom));
    wire('data-qualify-id', (d) => Qualify.open(d, 'qualify'));
    wire('data-fiche-id', (d) => Qualify.open(d, 'fiche'));
  }
  function closeAny() { if (map) map.closePopup(); closeSheet(); }

  /* ---- Feuille basse mobile ----
     Une popup Leaflet vit dans un calque transformé (translate3d) : un
     position:fixed y est calculé par rapport au calque, pas à la fenêtre, et
     la popup sortait de l'écran. Sur petit écran, le résumé du site est donc
     rendu dans un élément du body, au-dessus du panneau bas. */
  function openSheet(d) {
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.className = 'site-sheet';
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-label', 'Résumé du site');
      sheet.innerHTML = '<button class="site-sheet-close" aria-label="Fermer">✕</button><div class="site-sheet-body"></div>';
      sheet.querySelector('.site-sheet-close').addEventListener('click', closeSheet);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
      document.body.appendChild(sheet);
    }
    const body = sheet.querySelector('.site-sheet-body');
    body.innerHTML = popupHtml(d);
    bindActions(body);
    sheet.hidden = false;
  }
  function closeSheet() {
    if (sheet) sheet.hidden = true;
  }
  // ouvre le résumé du site : feuille basse sur mobile, popup Leaflet sinon
  function openSummary(marker, d) {
    if (isMobile()) openSheet(d); else marker.openPopup();
  }

  function fitFrance(animate = true) {
    if (map) map.fitBounds(FRANCE_BOUNDS, { padding: [10, 10], animate });
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

  /* ---- Aides d'affichage ---- */
  const PRIO_COLORS = { A: PALETTE.sage, B: PALETTE.teal, C: PALETTE.amber, D: PALETTE.grey };
  function scoreBadge(d) {
    if (d.score == null) return '';
    const c = PRIO_COLORS[d.priorite] || PALETTE.grey;
    const det = d.scoreDetail
      ? Object.entries(d.scoreDetail).map(([k, v]) => `${CONFIG.SCORE_LABELS[k] || k} ${fmtNum(v, 0)}`).join(' · ') : '';
    return `<span class="score-badge" style="background:${c}" title="${escapeHtml(det)}">${fmtNum(d.score, 0)} · ${escapeHtml(d.priorite)}</span>`;
  }
  /* Barre du score : un segment par critère, longueur = poids, remplissage = points obtenus */
  function scoreBar(d) {
    if (!d.scoreDetail) return '';
    const w = CONFIG.PARAMS.score_v2[d.base === 'cogen' ? 'elec' : 'injection'] || {};
    const segs = Object.entries(d.scoreDetail).map(([k, v]) => {
      const max = w[k] || 0, pct = max ? Math.round(100 * v / max) : 0;
      return `<span class="sbar-seg" style="flex:${max || 1}" title="${escapeHtml((CONFIG.SCORE_LABELS[k] || k) + ' : ' + fmtNum(v, 0) + ' / ' + max)}"><span class="sbar-fill" style="width:${pct}%"></span></span>`;
    }).join('');
    return `<span class="sbar">${segs}</span>`;
  }
  const info = (txt) => txt ? ` <span class="info-ico" title="${escapeHtml(txt)}">ⓘ</span>` : '';
  function kmChip(km, max) {
    if (km == null) return `<span class="chip chip-grey" title="au-delà de ${max} km du réseau GRDF, ou zone ELD">> ${max} km</span>`;
    const cls = km <= 2 ? 'chip-green' : km <= 5 ? 'chip-amber' : 'chip-grey';
    return `<span class="chip ${cls}" title="distance au tronçon GRDF en service le plus proche, à vol d'oiseau">${fmtNum(km, 1)} km</span>`;
  }
  function actionBar(d) {
    const gl = CONFIG.gmapsLinks(d);
    const a = [];
    a.push(`<a class="act" href="#" data-fiche-id="${escapeHtml(d.id)}" title="Fiche complète du site (réseau, ICPE, zonage, registre équipe)"><span class="act-ico">☰</span>Fiche</a>`);
    a.push(`<a class="act" href="#" data-qualify-id="${escapeHtml(d.id)}" title="Inscrire ce site au registre équipe"><span class="act-ico">✎</span>Qualifier</a>`);
    if (d.lat != null && d.lon != null)
      a.push(`<a class="act" href="#" data-radius-id="${escapeHtml(d.id)}" title="Ne garder que les sites à 50 km"><span class="act-ico">⌖</span>Rayon</a>`);
    if (gl.primary)
      a.push(`<a class="act" href="${gl.primary.href}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(gl.primary.title)}"><span class="act-ico">◎</span>Maps</a>`);
    if (d.icpe && d.icpe.url)
      a.push(`<a class="act" href="${escapeHtml(d.icpe.url)}" target="_blank" rel="noopener noreferrer" title="Fiche de l'installation classée (Géorisques)"><span class="act-ico">⚙</span>ICPE</a>`);
    return `<div class="popup-actions">${a.join('')}</div>`;
  }
  function titleHtml(d) {
    return `
      <div class="popup-title"><span class="status-dot ${d.ouvert ? 'open' : 'closed'}" title="${d.ouvert ? 'En service' : 'Fermé'}"></span>${escapeHtml(d.nom)}${d.inPipeline ? ' <span class="chip chip-amber" title="Pipeline Nautilus">pipeline</span>' : ''}</div>
      <div class="popup-sub">${escapeHtml([d.commune, d.departement].filter(Boolean).join(' · '))}</div>`;
  }

  /* ---- Popup : résumé en six lignes + barre d'actions ---- */
  function popupHtml(d) {
    const unit = CAP_UNITS[d.base] || '';
    const isE = d.base === 'cogen';
    const rows = [];
    rows.push(['Type', isE && d.puissanceKw
      ? `${escapeHtml(d.type)} · ${fmtNum(d.puissanceKw, 0)} kWé`
      : `${escapeHtml(d.type)} · ${fmtNum(d.capacite, 1)} ${unit}`]);
    if (d.score != null) rows.push(['Score v2', scoreBadge(d)]);
    if (isE) rows.push(['Réseau GRDF', kmChip(d.distGrdf, CONFIG.PARAMS.reseau.rayon_recherche_km)]);
    if (d.echeanceAnnee != null)
      rows.push(['Échéance (est.)', `${d.echeanceAnnee}${d.echeanceTrancheLabel ? ` <span class="chip chip-grey">${escapeHtml(d.echeanceTrancheLabel)}</span>` : ''}`]);
    if (d.cpb) rows.push(['Coef. CPB (est.)', `${fmtNum(d.cpb.coef, 2)} en ${d.cpb.conv}${d.cpb.atteignable ? ` <span class="chip chip-green" title="0,95 atteignable de ${d.cpb.first} à ${d.cpb.last}">0,95 ${d.cpb.first}-${d.cpb.last}</span>` : ''}`]);
    rows.push(['Mise en service', `${fmtDate(d.dateMes)}${d.geoPrecision === 'commune' ? ' <span class="chip chip-grey" title="position au centre de la commune">≈ commune</span>' : ''}`]);
    return `
      ${titleHtml(d)}
      <dl class="popup-grid popup-grid-left">
        ${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}
      </dl>
      ${actionBar(d)}`;
  }

  /* ---- Fiche complète (panneau latéral) : quatre sections ---- */
  function section(title, rows, open = true) {
    const body = rows.filter(r => r && r[1] != null && r[1] !== '' && r[1] !== '—');
    if (!body.length) return '';
    return `<details class="fiche-sec"${open ? ' open' : ''}><summary>${title}</summary>
      <dl class="popup-grid popup-grid-left">${body.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></details>`;
  }
  function detailHtml(d) {
    const unit = CAP_UNITS[d.base] || '';
    const isE = d.base === 'cogen';
    const e = (v) => escapeHtml(String(v == null ? '' : v));
    const identite = [
      ['Clé registre', e(d.key)],
      ['Type', e(d.type)],
      isE ? ['Puissance', d.puissanceKw ? `${fmtNum(d.puissanceKw, 0)} kWé` : ''] : null,
      ['Capacité', `${fmtNum(d.capacite, 2)} ${unit}`],
      isE ? ['Combustible', e(d.combustible || (d.codeCombustible ? `code ${d.codeCombustible}` : ''))] : null,
      ['Technologie / réseau', e([d.operateur, d.reseau].filter(Boolean).join(' · '))],
      ['Mise en service', fmtDate(d.dateMes)],
      ['Statut', d.ouvert ? 'En service' : 'Fermé'],
      ['Position', e(d.geoPrecision === 'commune' ? 'centre de la commune (approximative)'
        : d.geoPrecision === 'site (ICPE)' ? `installation classée (Géorisques, ${d.icpe && d.icpe.confiance || 'commune'})` : 'coordonnées du registre')],
    ];
    const economie = [
      ['Score v2', d.score != null ? `${scoreBadge(d)} ${scoreBar(d)}` : ''],
      ['Échéance contrat (est.)', d.echeanceAnnee != null
        ? `${d.echeanceAnnee}${d.echeanceTrancheLabel ? ` <span class="chip chip-grey">${e(d.echeanceTrancheLabel)}</span>` : ''}${info(d.echeanceHyp)}` : ''],
      ['Coefficient CPB (est.)', d.cpb ? (d.cpb.atteignable
        ? `${fmtNum(d.cpb.coef, 2)} en ${d.cpb.conv} <span class="chip chip-green">0,95 ${d.cpb.first === d.cpb.last ? d.cpb.first : d.cpb.first + '-' + d.cpb.last}</span>${info('Arrêté du 26/12/2025 : 0,95 CPB/MWh si conversion entre 15 et 30 ans d’âge et première injection avant le 31/12/2029 ; 1 avant 15 ans ; 0,8 sinon. Calcul à l’année de conversion par défaut ' + d.cpb.conv + '.')}`
        : `${fmtNum(d.cpb.coef, 2)} en ${d.cpb.conv} <span class="chip chip-grey">0,95 hors d'atteinte</span>${info('Âge ' + d.cpb.ageConv + ' ans en ' + d.cpb.conv + '. Arrêté du 26/12/2025 : 0,95 entre 15 et 30 ans avec injection avant fin 2029.')}`) : ''],
    ];
    const reseau = isE ? [
      ['Réseau GRDF (est.)', `${kmChip(d.distGrdf, CONFIG.PARAMS.reseau.rayon_recherche_km)}${info('Distance à vol d’oiseau au tronçon GRDF en service le plus proche (open data GRDF, propane exclu, rayon 15 km). Tri, pas chiffrage : l’étude détaillée GRDF fait foi.' + (d.geoPrecision === 'commune' ? ' Mesurée depuis le centre de la commune.' : ''))}`],
      ['Injection la plus proche', d.distInjection != null ? `${fmtNum(d.distInjection, 1)} km · ${e(d.injectionProche)}` : ''],
      ['Zonage de raccordement', d.zonage ? e([d.zonage.libelle, d.zonage.maturite,
        d.zonage.capamax != null ? `capacité max ${fmtNum(d.zonage.capamax, 0)} Nm³/h` : null,
        d.zonage.capaattent ? `en attente ${d.zonage.capaattent}` : null].filter(Boolean).join(' · ')) : ''],
      ['ICPE (Géorisques)', d.icpe ? e([d.icpe.lib_regime ? `régime ${d.icpe.lib_regime.toLowerCase()}` : null, d.icpe.nom,
        d.icpe.adresse, d.icpe.maj ? `màj ${d.icpe.maj}` : null].filter(Boolean).join(' · ')) : ''],
    ] : [
      ['Zonage de raccordement', d.zonage ? e([d.zonage.libelle, d.zonage.maturite].filter(Boolean).join(' · ')) : ''],
    ];
    const pl = d.pipeline || {};
    const equipe = [
      ['Projet', e(pl.project || '')],
      ['Relation', d.evalStatus && d.evalStatus !== 'unknown' ? e(CONFIG.EVAL_LABELS[d.evalStatus] || d.evalStatus) : ''],
      ['Difficulté raccordement (équipe)', d.gridRating ? e(CONFIG.GRID_LABELS[d.gridRating] || d.gridRating) : ''],
      ['Connaissance équipe', pl.tags && pl.tags.length ? e(pl.tags.map(t => CONFIG.TAG_LABELS[t] || t).join(' · ')) : ''],
      ['Capital', e(pl.capital || '')], ['Régime ICPE (équipe)', e(pl.icpe || '')], ['Intrants', e(pl.intrants || '')],
      ...(pl.notes ? Object.entries(pl.notes).map(([k, v]) => [e(k), e(v)]) : []),
    ];
    const gl = CONFIG.gmapsLinks(d);
    const liens = [gl.primary, gl.secondary].filter(Boolean).map(l =>
      `<a class="popup-link" href="${l.href}" title="${escapeHtml(l.title)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label)}</a>`);
    if (d.icpe && d.icpe.url) liens.push(`<a class="popup-link" href="${escapeHtml(d.icpe.url)}" target="_blank" rel="noopener noreferrer">Fiche ICPE ↗</a>`);
    const equipeHtml = section('Équipe', equipe, true)
      || `<details class="fiche-sec"><summary>Équipe</summary><p class="fiche-empty">Aucune fiche au registre. <a href="#" class="popup-link" data-qualify-id="${escapeHtml(d.id)}">Qualifier ce site</a></p></details>`;
    return `
      ${titleHtml(d)}
      ${section('Identité', identite)}
      ${section('Économie', economie)}
      ${section('Réseau', reseau)}
      ${equipeHtml}
      <div class="fiche-links">${liens.join('')}</div>`;
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
      // sur mobile la popup est remplacée par la feuille basse ; sinon contenu
      // construit à l'ouverture seulement (2 000 marqueurs rebâtis à chaque filtre)
      if (isMobile()) marker.on('click', () => openSheet(d));
      else marker.bindPopup(() => popupHtml(d), { maxWidth: 340, minWidth: 260 });
      layer.push(marker);
      markers.set(d.id, marker);
    });
    clusterGroup.addLayers(layer);

    document.getElementById('map-empty').hidden = data.length > 0;
    updateLegend(data);
  }

  function focusOn(id, animate = true) {
    const marker = markers.get(id);
    if (!marker) return;
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 12), { animate });
    clusterGroup.zoomToShowLayer(marker, () => openSummary(marker, dataById.get(id)));
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
  return { init, update, focusOn, invalidateSize, fitFrance, showRadius, hideRadius, popupHtml, detailHtml,
           bindActions, closeSheet };
})();
