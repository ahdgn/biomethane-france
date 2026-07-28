/* ============================================
   Config — source unique de vérité
   (palette, couleurs par type, formats, données)
   ============================================ */

const CONFIG = (() => {

  // Palette Nautilus (Masterbook)
  const PALETTE = {
    teal: '#22788C',
    navy: '#1E4260',
    deepNavy: '#002D5F',
    steel: '#3E6B96',
    lightBlue: '#9BB4D2',
    gold: '#CDAC81',
    sage: '#6F8F6D',
    terracotta: '#D9844A',
    amber: '#FBAE40',
    violet: '#503C64',
    ink: '#1A1A1A',
    grey: '#7F7F7F',
    hairline: '#D5DCE4',
  };

  // Couleur par type de site — utilisée PARTOUT :
  // marqueurs carte, légende carte, graphiques, badges tableau.
  const TYPE_COLORS = {
    'Agricole autonome': PALETTE.teal,
    'Agricole territorial': PALETTE.sage,
    'Industriel territorial': PALETTE.steel,
    'Station d\'épuration': PALETTE.violet,
    'Déchets ménagers et biodéchets': PALETTE.terracotta,
    'ISDND': PALETTE.gold,
    'Power-to-méthane': PALETTE.amber,
    'Cogénération — Bioénergies': PALETTE.navy,
    'Cogénération — Autres filières': PALETTE.grey,
  };
  const TYPE_FALLBACK = PALETTE.grey;

  // Jeux de données. Le dashboard s'adapte : la base cogé est
  // activée simplement en la déclarant ici.
  const DATASETS = [
    {
      id: 'injection',
      label: 'Injection',
      labelLong: 'Points d\'injection biométhane',
      url: 'data/points-injection.json',
      marker: 'circle',
      normalize: (d, i) => ({
        id: 'inj-' + (d.id_unique_projet != null ? d.id_unique_projet : i),
        base: 'injection',
        nom: d.nom_du_projet || 'Sans nom',
        commune: d.commune || '',
        departement: d.departement || '',
        region: d.region || '',
        type: d.site || 'Inconnu',
        capacite: d.capacite_de_production_gwh_an || 0, // GWh PCS/an
        annee: d.annee_mes || null,
        dateMes: d.date_de_mes || null,
        operateur: d.grx_demandeur || '',
        reseau: d.type_de_reseau || '',
        ouvert: d.site_ouvert === 'True',
        lat: d.coordonnees ? d.coordonnees.lat : null,
        lon: d.coordonnees ? d.coordonnees.lon : null,
        geoPrecision: 'site',
      }),
    },
    {
      id: 'cogen',
      label: 'Cogénérations',
      labelLong: 'Cogénérations (cibles de conversion)',
      url: 'data/cogenerations.json',
      marker: 'diamond',
      optional: true, // absent tant que l'ETL n'a pas tourné
      normalize: (d, i) => ({
        id: 'cog-' + i,
        base: 'cogen',
        nom: d.nom || 'Confidentiel',
        commune: d.commune || '',
        departement: d.departement || '',
        region: d.region || '',
        type: d.filiere === 'Bioénergies'
          ? 'Cogénération — Bioénergies'
          : 'Cogénération — Autres filières',
        filiere: d.filiere || '',
        capacite: d.energie_gwh_an || 0, // GWh électriques/an
        annee: d.annee_mes || null,
        dateMes: d.date_mes || null,
        operateur: d.gestionnaire || '',
        reseau: d.technologie || '',
        ouvert: d.statut === 'En service',
        lat: d.lat,
        lon: d.lon,
        geoPrecision: d.geo_precision || 'commune',
        puissanceKw: d.puissance_kw || null,
        combustible: d.combustible || '',
      }),
    },
  ];

  // Unité de capacité par base (les GWh injection ≠ GWh électriques)
  const CAP_UNITS = { injection: 'GWh/an', cogen: 'GWh él/an' };

  /* ---- Plancher de l'axe temps ----
     Le registre EDF OA remonte à 1939 (vieilles centrales thermiques à
     vapeur : 57 des 63 cogés d'avant 2000 sont en gaz ou fioul). Ces MES
     sont réelles, mais étaler l'axe sur 88 ans écrase la zone utile
     (2011-2026). Tout ce qui précède est donc agrégé sous « < 2000 »,
     dans le graphe comme dans le curseur de période. */
  const YEAR_FLOOR = 2000;
  const YEAR_FLOOR_LABEL = '< ' + YEAR_FLOOR;

  const SOURCE_NOTE = 'Registre ODRÉ (biométhane, 01/01/2025) · Registre EDF OA (cogénérations)';

  // ---- Formats français ----
  const fmtInt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('fr-FR'));
  const fmtNum = (n, dec = 1) =>
    n == null ? '—' : n.toLocaleString('fr-FR', { maximumFractionDigits: dec });
  const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  const fmtDate = (iso) => {
    if (!iso) return '—';
    const t = Date.parse(iso.length === 10 ? iso + 'T00:00:00' : iso);
    return Number.isNaN(t) ? iso : dateFmt.format(new Date(t));
  };
  const escapeHtml = (text) => String(text == null ? '' : text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const typeColor = (type) => TYPE_COLORS[type] || TYPE_FALLBACK;

  /* ---- Échéance de contrat estimée ----
     Durées vérifiées (Run 1, 27/07/2026) :
     · Injection : tarif OA 15 ans (arrêté du 13/12/2021 et prédécesseurs).
     · Cogé biogaz (Bioénergies) : 20 ans — BG16 (arrêté du 13/12/2016, abrogé
       par l'arrêté du 08/09/2025) ; BG11/BG06 prolongés de 15 à 20 ans par
       l'arrêté du 24/02/2017.
     · Cogé gaz naturel (Thermique non renouvelable) : C13 = 12 ans (CODOA
       avant le 28/05/2016), C16 = 15 ans (2016 → abrogation 21/02/2021).
     Rattachement C13/C16 par année de MES (heuristique, à confirmer site
     par site) ; pas d'hypothèse pour les autres cas. */
  function echeance(d) {
    if (!d.annee) return { annee: null, hyp: null };
    if (d.base === 'injection') {
      return { annee: d.annee + 15, hyp: 'tarif OA injection — 15 ans' };
    }
    if (d.type === 'Cogénération — Bioénergies') {
      return { annee: d.annee + 20, hyp: 'contrat biogaz BG — 20 ans (BG16 ; BG11/BG06 prolongés, arrêté du 24/02/2017)' };
    }
    if ((d.filiere || '') === 'Thermique non renouvelable') {
      if (d.annee <= 2016) return { annee: d.annee + 12, hyp: 'contrat C13 — 12 ans (gaz naturel, à confirmer)' };
      if (d.annee <= 2021) return { annee: d.annee + 15, hyp: 'contrat C16 — 15 ans (gaz naturel, à confirmer)' };
    }
    return { annee: null, hyp: null };
  }

  /* ---- Filtre prospection 1 ----
     Périmètre thèse (CR weekly 12/06/2026 + stratégie d'entrée v2) :
     · Injection : types agricoles + industriel territorial, site ouvert,
       capacité 5-25 GWh/an (cible brownfield ; < 25 GWh = guichet ouvert).
     · Cogé : filière Bioénergies, en service, >= 1 GWh él/an (exclusion
       micro-unités), combustible non renseigné = méthanisation (un
       combustible spécifié — bois, déchets ménagers/industriels,
       papeterie, biogaz de STEP — est hors cible de conversion). */
  const PROSPECTION1_TYPES_INJ = ['Agricole autonome', 'Agricole territorial', 'Industriel territorial'];
  function prospection1(d) {
    if (d.base === 'injection') {
      return PROSPECTION1_TYPES_INJ.includes(d.type)
        && d.ouvert && d.capacite >= 5 && d.capacite <= 25;
    }
    if (d.base === 'cogen') {
      return d.type === 'Cogénération — Bioénergies'
        && d.ouvert && d.capacite >= 1 && !d.combustible;
    }
    return false;
  }

  return { PALETTE, TYPE_COLORS, TYPE_FALLBACK, DATASETS, CAP_UNITS, SOURCE_NOTE,
           YEAR_FLOOR, YEAR_FLOOR_LABEL,
           fmtInt, fmtNum, fmtDate, escapeHtml, typeColor, echeance, prospection1 };
})();
