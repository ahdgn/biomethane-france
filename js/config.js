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
    'Élec. biogaz — méthanisation': PALETTE.navy,
    'Élec. biogaz — STEP / ISDND': PALETTE.violet,
    'Élec. bioénergies — autres combustibles': PALETTE.grey,
  };
  // Codes combustible du registre national (RTE / Enedis / ELD) :
  // B.MET = biogaz de méthanisation, B.EPU = biogaz de STEP, B.STO = biogaz
  // d'installation de stockage de déchets (ISDND), BAGAS = bagasse.
  const COMB_METHA = 'B.MET';
  const COMB_BIOGAZ_AUTRES = ['B.EPU', 'B.STO', 'BAGAS'];
  function elecType(d) {
    if (d.filiere !== 'Bioénergies') return 'Élec. bioénergies — autres combustibles';
    if (d.code_combustible === COMB_METHA) return 'Élec. biogaz — méthanisation';
    if (COMB_BIOGAZ_AUTRES.includes(d.code_combustible)) return 'Élec. biogaz — STEP / ISDND';
    return 'Élec. bioénergies — autres combustibles';
  }
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
        zonage: d.zonage && d.zonage.libelle ? d.zonage : null, // zonages « NC » (non communiqués) ignorés
        score: d.score_v2 != null ? d.score_v2 : null,   // score v2 (tools/qualify_v2.py), périmètre seulement
        priorite: d.priorite_v2 || null,
        scoreDetail: d.score_detail || null,
      }),
    },
    {
      id: 'cogen',
      label: 'Élec. biogaz',
      labelLong: 'Installations de production d\'électricité à partir de biogaz (cibles de conversion)',
      url: 'data/cogenerations.json',
      marker: 'diamond',
      optional: true, // absent tant que l'ETL n'a pas tourné
      /* Registre national des installations de production d'électricité,
         filière Bioénergies, toutes technologies (cogénération à combustion,
         « autre », moteur à piston, turbine…). Le périmètre méthanisation se
         lit sur le code combustible B.MET, pas sur la technologie : l'ancien
         radar (juin 2026) filtré sur « Cogénération » écartait plus de la
         moitié du parc, dont l'essentiel des sites 2007-2014. */
      normalize: (d, i) => ({
        id: 'cog-' + (d.code_eic || i),
        base: 'cogen',
        nom: d.nom || 'Confidentiel',
        commune: d.commune || '',
        departement: d.departement || '',
        region: d.region || '',
        type: elecType(d),
        filiere: d.filiere || '',
        capacite: d.energie_gwh_an || 0, // GWh électriques/an (énergie annuelle glissante injectée)
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
        codeCombustible: d.code_combustible || '',
        technologie: d.technologie || '',
        // enrichissement réseau (tools/enrich_grid.py) : proxies, cf. METHODOLOGIE 4.8
        distGrdf: d.dist_grdf_km != null ? d.dist_grdf_km : null,      // km, réseau GRDF en service
        distInjection: d.dist_injection_km != null ? d.dist_injection_km : null,
        injectionProche: d.injection_proche || '',
        zonage: d.zonage && d.zonage.libelle ? d.zonage : null, // zonages « NC » (non communiqués) ignorés
        score: d.score_v2 != null ? d.score_v2 : null,
        priorite: d.priorite_v2 || null,
        scoreDetail: d.score_detail || null,
      }),
    },
  ];
  /* ---- Registre équipe (Airtable -> data/pipeline.json) ----
     Catégories saisies par l'équipe dans Airtable (REGISTER.md) ; clés
     internes produites par tools/sync_register.py. Défauts : unknown / non noté. */
  const EVAL_LABELS = {
    owners: 'Exploitant connu',
    feedstock: "Fournisseurs d'intrants à proximité",
    rejected: 'Évalué et écarté',
    evaluating: "En cours d'évaluation",
    unknown: 'Non évalué',
  };
  const TAG_LABELS = {
    owners: "On connaît l'exploitant",
    worked: 'Déjà travaillé sur le site',
    politicians: 'Élus / collectivité connus',
    engineering: "Bureau d'études connu",
  };
  const GRID_LABELS = { easy: 'Facile', medium: 'Moyenne', hard: 'Difficile' };
  /* Lien partagé du formulaire Airtable « Qualifier un site » (voir REGISTER.md).
     Vide = le panneau montre l'identité du site et explique que le formulaire
     n'est pas encore branché. */
  const REGISTER_FORM_URL = 'https://airtable.com/app2bwaGaaTnIBUVq/pagMrWulp0TcVqzD5/form';

  // Libellés des critères du score v2 (clés de screening_params.json)
  const SCORE_LABELS = {
    puissance: 'puissance', fenetre_echeance: 'échéance', coefficient_cpb: 'coef. CPB', reseau: 'réseau GRDF',
    facteur_charge: 'facteur de charge', capacite: 'capacité', tarif_residuel: 'tarif restant', type: 'type',
    augmentation_prevue: 'augmentation prévue',
  };

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

  const SOURCE_NOTE = 'ODRÉ : points d\'injection de biométhane · registre national des installations de production d\'électricité (filière Bioénergies)';

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
    if (d.base === 'cogen' && d.type.startsWith('Élec. biogaz')) {
      return { annee: d.annee + 20, hyp: 'contrat biogaz BG — 20 ans (BG16 ; BG11/BG06 prolongés, arrêté du 24/02/2017)' };
    }
    if ((d.filiere || '') === 'Thermique non renouvelable') {
      if (d.annee <= 2016) return { annee: d.annee + 12, hyp: 'contrat C13 — 12 ans (gaz naturel, à confirmer)' };
      if (d.annee <= 2021) return { annee: d.annee + 15, hyp: 'contrat C16 — 15 ans (gaz naturel, à confirmer)' };
    }
    return { annee: null, hyp: null };
  }

  /* ---- Paramètres de screening (v2) ----
     Les seuils vivent dans tools/screening_params.json (chargé par app.js) ;
     les valeurs ci-dessous sont la copie de secours si le fichier est
     inaccessible. Sources : BC 14/09/2026, AdlF 18/09/2026, annexe
     réglementaire 24/09/2026. */
  const PARAMS = {
    cogen: {
      puissance_kw: { plancher: 250, cible: 500, priorite: 1000 },
      echeance_tranches: [
        { key: 'le2026', label: '≤ 2026', max: 2026 },
        { key: '2027-2028', label: '2027-2028', min: 2027, max: 2028 },
        { key: '2029-2030', label: '2029-2030', min: 2029, max: 2030 },
        { key: 'gt2030', label: '> 2030', min: 2031 },
      ],
    },
    injection: { types: ['Agricole autonome', 'Agricole territorial', 'Industriel territorial'],
                 capacite_gwh_an: { min: 5, max: null } },
    geographie: { zone_test: ['Hauts-de-France', 'Grand Est', 'Normandie'] },
    cpb: { coefficient_majore: 0.95, coefficient_base: 0.8, age_min_ans: 15, age_max_ans: 30,
           date_butoir_injection: '2029-12-31', annee_conversion_defaut: 2028 },
    reseau: { distance_km: { cible: 4, max: 5, seuil_exclusion: 10 }, distance_paliers_km: [2, 5, 10],
              rayon_recherche_km: 15 },
    score_v2: { priorites: { elec: { A: 75, B: 60, C: 45 }, injection: { A: 92, B: 85, C: 75 } } },
  };
  function setParams(p) {
    if (!p) return;
    if (p.cogen && p.cogen.puissance_kw) PARAMS.cogen.puissance_kw = p.cogen.puissance_kw;
    if (p.cogen && p.cogen.echeance_tranches) PARAMS.cogen.echeance_tranches = p.cogen.echeance_tranches;
    if (p.injection) {
      if (p.injection.types) PARAMS.injection.types = p.injection.types;
      if (p.injection.capacite_gwh_an) PARAMS.injection.capacite_gwh_an = p.injection.capacite_gwh_an;
    }
    if (p.geographie && p.geographie.zone_test) PARAMS.geographie.zone_test = p.geographie.zone_test;
    if (p.cpb) Object.assign(PARAMS.cpb, p.cpb);
    if (p.reseau) Object.assign(PARAMS.reseau, p.reseau);
    if (p.score_v2) Object.assign(PARAMS.score_v2, p.score_v2);
  }

  /* ---- Tranche d'échéance de contrat ----
     Regroupe l'échéance estimée (année de MES + durée réglementaire) selon
     les tranches de tools/screening_params.json. BC 14/09/2026 : « combien
     arrivent en fin de tarif dans 1, 2, 5, 10 ans ». Retourne { key, label }
     ou null si pas d'estimation. */
  function echeanceTranche(annee) {
    if (annee == null) return null;
    const t = PARAMS.cogen.echeance_tranches.find(tr =>
      (tr.min == null || annee >= tr.min) && (tr.max == null || annee <= tr.max));
    return t ? { key: t.key, label: t.label } : null;
  }

  /* ---- Coefficient CPB d'une cogénération convertie ----
     Arrêté du 26/12/2025 modifiant l'arrêté du 6 juillet 2024 : une
     installation de méthanisation ayant bénéficié d'un contrat historique,
     âgée de plus de 15 ans et de 30 ans au plus, dont la première injection
     intervient avant le 31/12/2029, reçoit 0,95 CPB par MWh injecté ; 0,8
     au-delà de 30 ans (et, en règle générale, 0,8 pour toute installation de
     plus de 15 ans). Avant 15 ans, le coefficient général de 1 s'applique
     (cas rare, à confirmer site par site).
     Le calcul est fait à l'année de conversion par défaut (paramètre) et
     donne aussi la fenêtre d'années où 0,95 est atteignable :
       première année = max(année courante, MES + 15)
       dernière année = min(2029, MES + 30)
     Uniquement pour les cogénérations biogaz avec année de MES. */
  function cpbInfo(d) {
    if (d.type !== 'Élec. biogaz — méthanisation' || !d.annee) return null;
    const c = PARAMS.cpb;
    const butoir = parseInt(String(c.date_butoir_injection).slice(0, 4), 10);
    const conv = c.annee_conversion_defaut;
    const now = new Date().getFullYear();
    const ageConv = conv - d.annee;
    let coef;
    if (ageConv < c.age_min_ans) coef = 1;
    else if (ageConv <= c.age_max_ans && conv <= butoir) coef = c.coefficient_majore;
    else coef = c.coefficient_base;
    const first = Math.max(now, d.annee + c.age_min_ans);
    const last = Math.min(butoir, d.annee + c.age_max_ans);
    const atteignable = first <= last;
    return { ageConv, coef, conv, first, last, atteignable };
  }

  /* ---- Filtre prospection v2 ----
     Périmètre thèse (reprise 18/09/2026, enseignements BC 14/09/2026) :
     · Injection : types agricoles + industriel territorial, site ouvert,
       capacité >= 5 GWh/an. Plus de plafond 25 GWh : ce plafond traduisait
       l'éligibilité au guichet ouvert, réservé aux < 13 GWh depuis l'arrêté
       du 10/08/2026 et abrogé au 31/12/2026 ; un brownfield injection se
       valorise désormais tarif en cours + passerelle CPB, quelle que soit
       sa taille.
     · Élec. biogaz : code combustible B.MET (biogaz de méthanisation, toutes
       technologies ; STEP, ISDND, bagasse, bois, déchets = hors cible de
       conversion), en service, puissance >= plancher (250 kWé, seuil
       BC/GRDF en dessous duquel une conversion n'est pas viable). L'ancien
       seuil « >= 1 GWh él/an » est remplacé par la puissance, qui est la
       donnée utilisée par la filière. */
  function prospection2(d) {
    if (d.base === 'injection') {
      const c = PARAMS.injection.capacite_gwh_an;
      return PARAMS.injection.types.includes(d.type) && d.ouvert
        && d.capacite >= (c.min || 0) && (c.max == null || d.capacite <= c.max);
    }
    if (d.base === 'cogen') {
      return d.type === 'Élec. biogaz — méthanisation' && d.ouvert
        && (d.puissanceKw || 0) >= PARAMS.cogen.puissance_kw.plancher;
    }
    return false;
  }

  /* ---- Zone test (AdlF 18/09/2026) ----
     Terrains vierges pour les premiers contacts : Nord, Est, Normandie.
     Filtre, pas de pondération : la vue nationale reste neutre. */
  function zoneTest(d) {
    return PARAMS.geographie.zone_test.includes(d.region);
  }

  return { PALETTE, TYPE_COLORS, TYPE_FALLBACK, DATASETS, CAP_UNITS, SOURCE_NOTE, SCORE_LABELS,
           EVAL_LABELS, TAG_LABELS, GRID_LABELS, REGISTER_FORM_URL,
           YEAR_FLOOR, YEAR_FLOOR_LABEL, PARAMS, setParams,
           fmtInt, fmtNum, fmtDate, escapeHtml, typeColor, echeance, echeanceTranche, cpbInfo,
           prospection2, zoneTest };
})();
