/* ============================================
   Test de fumée — l'application se charge, les
   comptages sont ceux des données, les gestes
   du quotidien fonctionnent (desktop et mobile).

   Lancement : npm test   (Playwright + Chromium,
   voir README « Tests »). Sert le dépôt sur un
   port libre, ouvre Chromium sans interface, et
   sort en erreur au premier contrôle en échec.

   Les comptages attendus sont lus dans data/*.json
   (jamais recopiés ici) : le test vérifie que
   l'app montre ce que contiennent les fichiers.
   ============================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };

/* ---- serveur statique minimal (équivalent de python -m http.server) ---- */
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, url === '/' ? 'index.html' : url);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end(); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }));
  });
}

/* ---- attendus, lus dans les données ---- */
const inj = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/points-injection.json'), 'utf8'));
const cog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cogenerations.json'), 'utf8'));
const EXPECTED = {
  total: inj.length + cog.length,
  scored: inj.filter(d => d.score_v2 != null).length + cog.filter(d => d.score_v2 != null).length, // = périmètre prospection v2
  prioA: inj.filter(d => d.priorite_v2 === 'A').length + cog.filter(d => d.priorite_v2 === 'A').length,
  cogen: cog.length,
};

/* ---- outillage ---- */
const results = [];
let failed = 0;
function check(cond, label, detail) {
  results.push(`${cond ? 'OK  ' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
}
// erreurs réseau des fonds de carte et d'Airtable : hors périmètre du test
const IGNORED = /arcgisonline|airtable\.com|Failed to load resource/;
const count = (page) => page.evaluate(() => parseInt(document.getElementById('table-count').innerText.replace(/\s/g, ''), 10));

async function openPage(browser, viewport, extra, hash) {
  const ctx = await browser.newContext({ viewport, locale: 'fr-FR', ...(extra || {}) });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !IGNORED.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(BASE_URL + 'index.html' + (hash || ''));
  await page.waitForSelector('.loading-overlay', { state: 'detached', timeout: 30000 });
  await page.waitForTimeout(500);
  return { ctx, page, errors };
}

let BASE_URL = '';

(async () => {
  const { server, url } = await serve();
  BASE_URL = url;
  const browser = await chromium.launch();
  try {
    /* ---------- desktop ---------- */
    const d = await openPage(browser, { width: 1440, height: 900 });
    const p = d.page;

    check(await count(p) === EXPECTED.total, 'chargement : tous les sites affichés', `${await count(p)} / attendu ${EXPECTED.total}`);
    const header = await p.evaluate(() => document.getElementById('header-meta').textContent);
    check(/points d'injection/.test(header) && /élec/.test(header), 'en-tête : les deux bases chargées', header);

    // filtre prospection = sites scorés (qualify_v2.py score exactement le périmètre)
    await p.click('[data-preset="screening"]');
    await p.waitForTimeout(400);
    const nScreen = await count(p);
    check(nScreen === EXPECTED.scored, 'périmètre prospection v2 = sites scorés', `${nScreen} / attendu ${EXPECTED.scored}`);
    const kpiA = await p.evaluate(() => parseInt(document.querySelectorAll('.kpi-card .kpi-value')[1].firstChild.textContent.replace(/\s/g, ''), 10));
    check(kpiA === EXPECTED.prioA, 'KPI priorité A = données', `${kpiA} / attendu ${EXPECTED.prioA}`);
    const sort = await p.evaluate(() => document.querySelector('#data-table th[aria-sort="descending"]').dataset.sort);
    check(sort === 'score', 'tableau trié par score en mode screening', sort);

    // filtre priorité A
    await p.click('#filter-prio [data-prio="A"]');
    await p.waitForTimeout(400);
    check(await count(p) === EXPECTED.prioA, 'filtre priorité A = données', `${await count(p)}`);

    // base élec. seule (filtre dans la section Avancé, repliée par défaut)
    await p.evaluate(() => Filters.resetFilters());
    await p.evaluate(() => { document.getElementById('filter-advanced').open = true; });
    await p.click('#filter-base [data-base="cogen"]');
    await p.waitForTimeout(400);
    check(await count(p) === EXPECTED.cogen, 'base élec. biogaz = registre', `${await count(p)} / attendu ${EXPECTED.cogen}`);
    await p.evaluate(() => Filters.resetFilters());

    // recherche
    await p.evaluate(async () => { const i = document.getElementById('filter-search'); i.value = 'zzzz-aucun-site'; i.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 400)); });
    check(await count(p) === 0 && !(await p.evaluate(() => document.getElementById('map-empty').hidden)), 'recherche sans résultat : état vide affiché');
    await p.evaluate(() => Filters.resetFilters());

    // tableau -> popup -> fiche -> lien direct
    await p.click('[data-preset="zonetest"]');
    await p.waitForTimeout(400);
    await p.click('#tab-btn-donnees');
    await p.click('#table-body tr:first-child');
    await p.waitForTimeout(1200);
    const popup = await p.evaluate(() => { const e = document.querySelector('.leaflet-popup-content .popup-title'); return e ? e.textContent : ''; });
    check(!!popup, 'clic sur une ligne : popup ouverte sur la carte', popup);
    await p.click('.leaflet-popup a[data-fiche-id]');
    await p.waitForTimeout(400);
    const fiche = await p.evaluate(() => ({ open: !document.getElementById('qualify-drawer').hidden, hash: location.hash, iframe: document.getElementById('qualify-frame').hidden }));
    check(fiche.open && /site=/.test(fiche.hash) && fiche.iframe, 'fiche ouverte, URL avec site=, pas d\'iframe en lecture', fiche.hash);
    await p.click('#qualify-next');
    await p.waitForTimeout(400);
    check((await p.evaluate(() => document.getElementById('qualify-pos').textContent)).startsWith('2 /'), 'navigation suivant dans la fiche');
    const link = await p.evaluate(() => location.href);
    await p.click('#qualify-close');

    // onglet analyse : aucun graphique vide
    await p.click('#tab-btn-analyse');
    await p.waitForTimeout(300);
    const empties = await p.evaluate(() => [...document.querySelectorAll('.chart-empty')].filter(e => !e.hidden).length);
    check(empties === 0, 'onglet Analyse : aucun graphique vide sur la shortlist');

    // export CSV : un fichier, une ligne par site + en-tête
    await p.click('#tab-btn-donnees');
    const [download] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }), p.click('#btn-export')]);
    const csv = fs.readFileSync(await download.path(), 'utf8');
    const lines = csv.split('\r\n').filter(Boolean).length;
    check(lines === (await count(p)) + 1 && csv.charCodeAt(0) === 0xFEFF, 'export CSV : en-tête + une ligne par site, BOM UTF-8', `${lines} lignes`);

    check(d.errors.length === 0, 'desktop : aucune erreur console', d.errors.join(' | '));
    await d.ctx.close();

    /* ---------- lien direct ---------- */
    const l = await openPage(browser, { width: 1440, height: 900 }, null, link.slice(link.indexOf('#')));
    await l.page.waitForTimeout(800);
    const direct = await l.page.evaluate(() => ({ open: !document.getElementById('qualify-drawer').hidden, title: (document.querySelector('#qualify-site .popup-title') || {}).textContent }));
    check(direct.open && !!direct.title, 'lien direct : fiche rouverte au chargement', direct.title);
    check(l.errors.length === 0, 'lien direct : aucune erreur console', l.errors.join(' | '));
    await l.ctx.close();

    /* ---------- mobile ---------- */
    const m = await openPage(browser, { width: 390, height: 844 }, { isMobile: true, hasTouch: true });
    await m.page.click('#sidebar-toggle');
    await m.page.waitForTimeout(300);
    await m.page.click('[data-preset="zonetest"]');
    await m.page.waitForTimeout(400);
    await m.page.mouse.click(350, 400); // referme la surcouche des filtres
    await m.page.waitForTimeout(300);
    await m.page.evaluate(() => document.querySelector('.site-marker').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await m.page.waitForTimeout(400);
    const sheet = await m.page.evaluate(() => { const s = document.querySelector('.site-sheet'); if (!s || s.hidden) return null; const b = s.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; });
    check(!!sheet && sheet.top >= 0 && sheet.bottom <= 844, 'mobile : feuille basse visible au tap sur un marqueur', JSON.stringify(sheet));
    check(m.errors.length === 0, 'mobile : aucune erreur console', m.errors.join(' | '));
    await m.ctx.close();
  } catch (e) {
    check(false, 'exception pendant le test', e.message);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} contrôle(s) en échec` : `\n${results.length} contrôles OK`);
  process.exit(failed ? 1 : 0);
})();
