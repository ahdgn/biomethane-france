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
  const { REGISTER_FORM_URL, siteKey } = CONFIG;

  let drawer, frame, current = null;

  function init() {
    drawer = document.getElementById('qualify-drawer');
    frame = document.getElementById('qualify-frame');
    document.getElementById('qualify-close').addEventListener('click', close);
    document.getElementById('qualify-link').addEventListener('click', copyLink);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !drawer.hidden) close();
    });
  }

  // Le formulaire Airtable s'embarque via /embed/<lien partagé>
  function embedUrl(d) {
    const base = REGISTER_FORM_URL.includes('/embed/')
      ? REGISTER_FORM_URL
      : REGISTER_FORM_URL.replace('airtable.com/', 'airtable.com/embed/');
    const p = new URLSearchParams();
    p.set('prefill_Clé', d.key);
    p.set('hide_Clé', 'true');                 // clé pré-remplie, cachée
    p.set('prefill_Base', d.base === 'cogen' ? 'Élec. biogaz' : 'Injection');
    p.set('prefill_Nom du site', d.nom || '');
    p.set('prefill_Commune', [d.commune, d.departement].filter(Boolean).join(' · '));
    if (d.pipeline && d.pipeline.project) p.set('prefill_Projet', d.pipeline.project);
    return `${base}?${p.toString()}`;
  }

  // mode 'fiche' : lecture ; mode 'qualify' : idem, formulaire mis en avant
  function open(d, mode = 'fiche') {
    current = d;
    MapView.closeSheet();
    document.getElementById('qualify-title').textContent = mode === 'qualify' ? 'Qualifier ce site' : 'Fiche site';
    drawer.classList.toggle('mode-qualify', mode === 'qualify');
    const site = document.getElementById('qualify-site');
    site.innerHTML = MapView.detailHtml(d);
    MapView.bindActions(site);
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
    Filters.setSite(d.id); // l'URL désigne le site : lien direct partageable
    setTimeout(() => { MapView.invalidateSize(); Charts.resize(); }, 220);
  }

  function close() {
    drawer.hidden = true;
    document.body.classList.remove('qualify-open');
    frame.removeAttribute('src'); // stoppe l'iframe
    current = null;
    Filters.setSite(null);
    setTimeout(() => { MapView.invalidateSize(); Charts.resize(); }, 220);
  }

  // Copie le lien direct vers la fiche (filtres + site) dans le presse-papiers
  function copyLink() {
    const btn = document.getElementById('qualify-link');
    const done = (ok) => {
      btn.textContent = ok ? 'Lien copié' : 'Copie impossible';
      setTimeout(() => { btn.textContent = 'Copier le lien'; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(location.href).then(() => done(true), () => done(false));
    } else {
      done(false);
    }
  }

  return { init, open, close, siteKey };
})();
