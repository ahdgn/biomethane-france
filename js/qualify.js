/* ============================================
   Qualify — panneau latéral de qualification
   d'un site : identité (données publiques, lecture
   seule) + formulaire Airtable pré-rempli.
   Aucune écriture directe : la fiche est créée
   par le formulaire partagé d'Airtable, puis
   ramenée dans l'app par la sync du registre
   (tools/sync_register.py -> data/pipeline.json).
   Port de biomethane-germany, cf. REGISTER.md.
   ============================================ */

const Qualify = (() => {
  const { fmtNum, fmtDate, escapeHtml, EVAL_LABELS, GRID_LABELS, CAP_UNITS,
          REGISTER_FORM_URL } = CONFIG;

  let drawer, frame, current = null;

  function init() {
    drawer = document.getElementById('qualify-drawer');
    frame = document.getElementById('qualify-frame');
    document.getElementById('qualify-close').addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !drawer.hidden) close();
    });
  }

  // Clé du registre : code EIC (élec. biogaz) ou identifiant ODRÉ (injection)
  function siteKey(d) {
    return d.id.replace(/^(cog|inj)-/, '');
  }

  // Le formulaire Airtable s'embarque via /embed/<lien partagé>
  function embedUrl(d) {
    const base = REGISTER_FORM_URL.includes('/embed/')
      ? REGISTER_FORM_URL
      : REGISTER_FORM_URL.replace('airtable.com/', 'airtable.com/embed/');
    const p = new URLSearchParams();
    p.set('prefill_Clé', siteKey(d));
    p.set('hide_Clé', 'true');                 // clé pré-remplie, cachée
    p.set('prefill_Base', d.base === 'cogen' ? 'Élec. biogaz' : 'Injection');
    p.set('prefill_Nom du site', d.nom || '');
    p.set('prefill_Commune', [d.commune, d.departement].filter(Boolean).join(' · '));
    if (d.pipeline && d.pipeline.project) p.set('prefill_Projet', d.pipeline.project);
    return `${base}?${p.toString()}`;
  }

  function identityHtml(d) {
    const unit = CAP_UNITS[d.base] || '';
    const rows = [
      ['Clé', siteKey(d)],
      ['Localisation', [d.commune, d.departement, d.region].filter(Boolean).join(' · ')],
      ['Type', d.type],
      ['Capacité', `${fmtNum(d.capacite, 2)} ${unit}`],
      ['Mise en service', fmtDate(d.dateMes)],
    ];
    if (d.base === 'cogen' && d.puissanceKw) rows.splice(3, 0, ['Puissance', `${fmtNum(d.puissanceKw, 0)} kWé`]);
    if (d.echeanceAnnee != null) rows.push(['Échéance contrat (est.)', String(d.echeanceAnnee)]);
    if (d.cpbCoef != null) rows.push(['Coefficient CPB (est.)', fmtNum(d.cpbCoef, 2)]);
    if (d.base === 'cogen') rows.push(['Réseau GRDF (est.)', d.distGrdf != null ? `${fmtNum(d.distGrdf, 1)} km` : 'inconnue']);
    if (d.score != null) rows.push(['Score v2', `${fmtNum(d.score, 0)} / 100 · ${d.priorite}`]);
    if (d.evalStatus && d.evalStatus !== 'unknown')
      rows.push(['Statut actuel', EVAL_LABELS[d.evalStatus] || d.evalStatus]);
    if (d.gridRating)
      rows.push(['Difficulté raccordement', GRID_LABELS[d.gridRating] || d.gridRating]);
    return `
      <div class="qualify-name">${escapeHtml(d.nom)}</div>
      <dl class="popup-grid">
        ${rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(String(v || '—'))}</dd>`).join('')}
      </dl>`;
  }

  function open(d) {
    current = d;
    document.getElementById('qualify-site').innerHTML = identityHtml(d);
    const note = document.getElementById('qualify-noform');
    if (REGISTER_FORM_URL) {
      note.hidden = true;
      frame.hidden = false;
      frame.src = embedUrl(d);
    } else {
      note.hidden = false;
      frame.hidden = true;
      frame.removeAttribute('src');
    }
    drawer.hidden = false;
    document.body.classList.add('qualify-open');
    setTimeout(() => { MapView.invalidateSize(); Charts.resize(); }, 220);
  }

  function close() {
    drawer.hidden = true;
    document.body.classList.remove('qualify-open');
    frame.removeAttribute('src'); // stoppe l'iframe
    current = null;
    setTimeout(() => { MapView.invalidateSize(); Charts.resize(); }, 220);
  }

  return { init, open, close, siteKey };
})();
