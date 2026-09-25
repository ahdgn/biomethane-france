/* ============================================
   Qualify — panneau latéral : fiche d'un site
   (données publiques, lecture seule) et, en mode
   « qualifier », le formulaire Airtable pré-rempli.
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
    document.getElementById('qualify-start-btn').addEventListener('click', () => { if (current) open(current, 'qualify'); });
    document.getElementById('qualify-prev').addEventListener('click', () => step(-1));
    document.getElementById('qualify-next').addEventListener('click', () => step(1));
    document.addEventListener('keydown', (e) => {
      if (drawer.hidden) return;
      if (e.key === 'Escape') close();
      // flèches gauche / droite : site précédent / suivant, sauf dans un champ de saisie
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName);
      if (!typing && e.key === 'ArrowLeft') step(-1);
      if (!typing && e.key === 'ArrowRight') step(1);
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

  // mode 'fiche' : lecture, formulaire non chargé (un bouton l'ouvre) ;
  // mode 'qualify' : formulaire Airtable chargé sous la fiche
  function open(d, mode = 'fiche') {
    const wasHidden = drawer.hidden;
    current = d;
    MapView.closeSheet();
    document.getElementById('qualify-title').textContent = mode === 'qualify' ? 'Qualifier ce site' : 'Fiche site';
    drawer.classList.toggle('mode-qualify', mode === 'qualify');
    const site = document.getElementById('qualify-site');
    site.innerHTML = MapView.detailHtml(d);
    site.scrollTop = 0;
    MapView.bindActions(site);
    const note = document.getElementById('qualify-noform');
    const start = document.getElementById('qualify-start');
    if (mode !== 'qualify') {
      // lecture : pas d'iframe (une page Airtable par fiche ouverte, sinon)
      frame.hidden = true;
      frame.removeAttribute('src');
      note.hidden = true;
      start.hidden = false;
    } else if (REGISTER_FORM_URL) {
      start.hidden = true;
      note.hidden = true;
      frame.hidden = false;
      frame.src = embedUrl(d);
    } else {
      start.hidden = true;
      note.hidden = false;
      frame.hidden = true;
      frame.removeAttribute('src');
    }
    drawer.hidden = false;
    document.body.classList.add('qualify-open');
    Filters.setSite(d.id); // l'URL désigne le site : lien direct partageable
    DataTable.highlight(d.id);
    updateNav();
    // la colonne principale vient de se resserrer : carte et graphiques à recadrer
    if (wasHidden) setTimeout(() => { MapView.invalidateSize(); Charts.resize(); }, 220);
  }

  function close() {
    drawer.hidden = true;
    document.body.classList.remove('qualify-open');
    frame.removeAttribute('src'); // stoppe l'iframe
    current = null;
    Filters.setSite(null);
    setTimeout(() => { MapView.invalidateSize(); Charts.resize(); }, 220);
  }

  /* ---- Navigation dans la liste filtrée (ordre du tableau) ---- */
  function position() {
    const list = DataTable.getSorted();
    const i = current ? list.findIndex(d => d.id === current.id) : -1;
    return { list, i };
  }
  function updateNav() {
    const { list, i } = position();
    const nav = document.getElementById('qualify-nav');
    nav.hidden = i < 0 || list.length < 2;
    if (nav.hidden) return;
    document.getElementById('qualify-pos').textContent = `${(i + 1).toLocaleString('fr-FR')} / ${list.length.toLocaleString('fr-FR')}`;
    document.getElementById('qualify-prev').disabled = i <= 0;
    document.getElementById('qualify-next').disabled = i >= list.length - 1;
  }
  function step(delta) {
    const { list, i } = position();
    if (i < 0) return;
    const next = list[i + delta];
    if (!next) return;
    open(next, 'fiche');
    MapView.focusOn(next.id, true, false); // centre la carte sans rouvrir de popup
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

  return { init, open, close, siteKey, updateNav };
})();
