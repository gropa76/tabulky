'use strict';
/* Tabulky – hlavní logika aplikace */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ico = n => `<svg class="i"><use href="#i-${n}"/></svg>`;
const NF = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 4 });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = o => JSON.parse(JSON.stringify(o));
const L = Formula.colLetter;
const PAGE = 200;

const S = {
  view: 'home', tables: [], recipes: [], cur: null, sel: null, editing: false,
  shown: PAGE, search: '', undo: [], redo: [], totFn: 'sum', result: null, ev: null,
};

/* ---------- pomocné ---------- */
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2600); }
const ISO = /^(\d{4})-(\d{2})-(\d{2})( \d{2}:\d{2})?$/;
const fmtVal = v => { if (typeof v === 'number') return NF.format(v); if (v == null) return ''; const m = ISO.exec(v); return m ? `${+m[3]}. ${+m[2]}. ${m[1]}${m[4] || ''}` : String(v); };
const fmtDate = ts => new Date(ts).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
const pl = (n, a, b, c) => `${n.toLocaleString('cs-CZ')} ${n === 1 ? a : n >= 2 && n <= 4 ? b : c}`;
const rowsTxt = n => pl(n, 'řádek', 'řádky', 'řádků');
const colsTxt = n => pl(n, 'sloupec', 'sloupce', 'sloupců');
function uniqueCol(cols, name) { let n = name, i = 2; while (cols.includes(n)) n = `${name} (${i++})`; return n; }
function numStr(n) { return String(n).replace('.', ','); }

function cellIn(v) {
  if (v instanceof Date) {
    const d = new Date(Math.round(v.getTime() / 60000) * 60000), p = x => String(x).padStart(2, '0');
    const s = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    return d.getHours() || d.getMinutes() ? `${s} ${p(d.getHours())}:${p(d.getMinutes())}` : s;
  }
  if (typeof v === 'boolean') return v ? 'PRAVDA' : 'NEPRAVDA';
  if (typeof v === 'string') return v.trim() === '' ? null : v.trim();
  return v ?? null;
}

/* ---------- ukládání ---------- */
let saveT = null;
function touch() {
  const t = S.cur; if (!t) return;
  t.updated = Date.now(); S.ev = null;
  clearTimeout(saveT); saveT = setTimeout(() => DB.put('tables', t).catch(() => toast('Uložení se nepovedlo')), 350);
  updateMeta();
}
function snapshot() { const t = S.cur; return JSON.stringify({ columns: t.columns, rows: t.rows }); }
function pushUndo() { S.undo.push(snapshot()); if (S.undo.length > 40) S.undo.shift(); S.redo = []; updateUndo(); }
function undo() { if (!S.undo.length) return; S.redo.push(snapshot()); Object.assign(S.cur, JSON.parse(S.undo.pop())); touch(); renderGrid(); updateUndo(); }
function redo() { if (!S.redo.length) return; S.undo.push(snapshot()); Object.assign(S.cur, JSON.parse(S.redo.pop())); touch(); renderGrid(); updateUndo(); }
function updateUndo() { $('#btnUndo').disabled = !S.undo.length; $('#btnRedo').disabled = !S.redo.length; }
function mutate(fn) { pushUndo(); fn(S.cur); touch(); renderGrid(); }

/* ---------- navigace ---------- */
function go(view, push = true) {
  if ((view === 'editor' || view === 'process') && !S.cur) { toast('Nejdřív otevřete nebo importujte tabulku'); view = 'home'; }
  closePop();
  S.view = view;
  $$('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + view));
  $$('.nav[data-go]').forEach(b => { b.classList.toggle('on', b.dataset.go === view); b.classList.toggle('off', b.dataset.go !== 'home' && !S.cur); });
  if (push && history.state?.view !== view) history.pushState({ view }, '');
  if (view === 'home') renderHome();
  if (view === 'editor') openEditor();
  if (view === 'process') renderProcess();
}
window.addEventListener('popstate', e => go(e.state?.view || 'home', false));

/* ---------- přehled ---------- */
function renderHome() {
  const list = [...S.tables].sort((a, b) => b.updated - a.updated);
  $('#tableList').innerHTML = list.length ? list.map(t => `
    <article class="card" data-open="${esc(t.id)}" tabindex="0">
      <h3>${esc(t.name)}</h3>
      <div class="mini">${'<i></i>'.repeat(12)}</div>
      <p class="sub">${rowsTxt(t.rows.length)} · ${colsTxt(t.columns.length)}<br>upraveno ${fmtDate(t.updated)}</p>
      <button class="icon-btn" data-tmenu="${esc(t.id)}" aria-label="Volby">${ico('more')}</button>
    </article>`).join('') : `
    <div class="empty"><b>Zatím tu nemáte žádnou tabulku</b>Importujte soubor z Excelu, nebo začněte prázdnou tabulkou.
      <div class="row"><button class="btn primary" data-act="import">${ico('upload')}Importovat Excel</button><button class="btn" data-act="demo">Vyzkoušet ukázku</button></div></div>`;
  $('#recipeList').innerHTML = S.recipes.length ? S.recipes.map(r => `
    <article class="card" data-recipe="${esc(r.id)}" tabindex="0">
      <h3>${esc(r.name)}</h3>
      <div class="chips-s">${r.steps.map(s => `<span>${esc(Pipeline.TYPES[s.type]?.label || s.type)}</span>`).join('')}</div>
      <button class="icon-btn" data-rdel="${esc(r.id)}" aria-label="Smazat postup">${ico('trash')}</button>
    </article>`).join('') : `<div class="empty">Postup si uložíte v části <b style="display:inline;font-size:inherit">Výstup</b> tlačítkem „Uložit postup“.</div>`;
  $('#storeInfo').textContent = DB.persistent ? 'Data se ukládají v tomto zařízení' : 'Pozor: ukládání v tomto prohlížeči nefunguje, data se po zavření ztratí';
}

$('#tableList').addEventListener('click', e => {
  const m = e.target.closest('[data-tmenu]');
  if (m) { e.stopPropagation(); tableMenu(m, S.tables.find(t => t.id === m.dataset.tmenu)); return; }
  const a = e.target.closest('[data-act]');
  if (a) { a.dataset.act === 'import' ? $('#fileIn').click() : createDemo(); return; }
  const c = e.target.closest('[data-open]'); if (c) openTable(c.dataset.open);
});
$('#tableList').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.open) openTable(e.target.dataset.open); });
$('#recipeList').addEventListener('click', async e => {
  const d = e.target.closest('[data-rdel]');
  if (d) {
    e.stopPropagation();
    const r = S.recipes.find(x => x.id === d.dataset.rdel);
    if (await confirmDlg('Smazat postup?', `Postup „${r.name}“ se smaže. Tabulek se to nedotkne.`, 'Smazat')) { await DB.del('recipes', r.id); S.recipes = S.recipes.filter(x => x !== r); renderHome(); }
    return;
  }
  const c = e.target.closest('[data-recipe]');
  if (c) {
    if (!S.cur) { toast('Nejdřív otevřete tabulku, na kterou chcete postup použít'); return; }
    S.cur.steps = clone(S.recipes.find(r => r.id === c.dataset.recipe).steps); touch(); go('process');
  }
});

function tableMenu(anchor, t) {
  showPop(anchor, [
    { label: 'Otevřít', icon: 'table', act: () => openTable(t.id) },
    { label: 'Přejmenovat', icon: 'pen', act: async () => { const n = await promptDlg('Přejmenovat tabulku', 'Název', t.name); if (n) { t.name = n; t.updated = Date.now(); await DB.put('tables', t); renderHome(); } } },
    { label: 'Duplikovat', icon: 'copy', act: async () => { const c = { ...clone(t), id: uid(), name: t.name + ' (kopie)', updated: Date.now() }; S.tables.push(c); await DB.put('tables', c); renderHome(); } },
    { label: 'Stáhnout .xlsx', icon: 'download', act: () => exportXlsx(t.name, Formula.materialize(t)) },
    '-',
    { label: 'Smazat', icon: 'trash', danger: true, act: async () => {
      if (!await confirmDlg('Smazat tabulku?', `Tabulka „${t.name}“ se ze zařízení nenávratně smaže.`, 'Smazat')) return;
      await DB.del('tables', t.id); S.tables = S.tables.filter(x => x !== t); if (S.cur === t) S.cur = null; renderHome(); go('home', false);
    } },
  ]);
}

function homeMenu(anchor) {
  showPop(anchor, [
    { label: 'Vyzkoušet ukázkovou tabulku', icon: 'table', act: createDemo },
    { label: 'Smazat více tabulek', sub: 'Zaškrtnete, které smazat', icon: 'trash', act: bulkDelete },
    '-',
    { label: 'Zálohovat všechna data', sub: 'Stáhne soubor .json – přenesete ho i do jiného zařízení', icon: 'save', act: exportBackup },
    { label: 'Obnovit ze zálohy', sub: 'Načte soubor .json ze zálohy', icon: 'upload', act: () => $('#backupIn').click() },
  ]);
}

async function bulkDelete() {
  if (!S.tables.length) { toast('Nemáte žádné tabulky'); return; }
  const list = [...S.tables].sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  const f = await openDlg('Smazat tabulky', `<p>Zaškrtněte tabulky, které chcete smazat. Původní soubory v počítači zůstanou.</p>
    <div class="pick">${list.map(t => `<label><input type="checkbox" name="t" value="${esc(t.id)}">${esc(t.name)}<small>${rowsTxt(t.rows.length)}</small></label>`).join('')}</div>
    <div class="row"><button type="button" class="link" data-pick="1">Vybrat vše</button><button type="button" class="link" data-pick="0">Zrušit výběr</button></div>`, 'Smazat vybrané', form => {
    form.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) $$('input[name=t]', form).forEach(x => x.checked = b.dataset.pick === '1'); });
  }, true);
  if (!f) return;
  const ids = f.getAll('t');
  if (!ids.length) { toast('Nic nebylo vybráno'); return; }
  if (!await confirmDlg('Opravdu smazat?', `Smaže se ${pl(ids.length, 'tabulka', 'tabulky', 'tabulek')}. Vrátit to nepůjde.`, 'Smazat')) return;
  for (const id of ids) await DB.del('tables', id);
  S.tables = S.tables.filter(t => !ids.includes(t.id));
  if (S.cur && ids.includes(S.cur.id)) S.cur = null;
  renderHome(); go('home', false);
  toast(`Smazáno ${pl(ids.length, 'tabulka', 'tabulky', 'tabulek')}`);
}

async function addTable(t, open = true) {
  t.id = t.id || uid(); t.updated = Date.now(); t.steps = t.steps || [];
  S.tables.push(t); await DB.put('tables', t).catch(() => {});
  if (open) openTable(t.id); else renderHome();
}
function openTable(id) {
  const t = S.tables.find(x => x.id === id); if (!t) return;
  if (S.cur !== t) { S.cur = t; S.sel = null; S.undo = []; S.redo = []; S.shown = PAGE; S.search = ''; $('#search').value = ''; S.ev = null; }
  go('editor');
}
async function newTable() {
  const name = await promptDlg('Nová tabulka', 'Název', 'Nová tabulka'); if (!name) return;
  addTable({ name, columns: ['Sloupec A', 'Sloupec B', 'Sloupec C'], rows: Array.from({ length: 10 }, () => [null, null, null]) });
}
function createDemo() {
  const prov = [['U Zlatého lva', 'Břeclav'], ['Hospoda Na Valech', 'Mikulov'], ['Sklípek Pod Zámkem', 'Valtice'], ['Restaurace Lednice', 'Lednice'], ['Pivnice U Mostu', 'Hodonín'], ['Penzion Morava', 'Veselí nad Moravou']];
  const prod = [['Ležák 11° sud 50 l', 2450], ['Ležák 12° sud 30 l', 1790], ['Nealko lahev (bal. 20)', 420]];
  let s = 7; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280; const rows = [];
  for (let m = 9; m <= 11; m++) for (const [p, o] of prov) for (const [n, c] of prod) {
    if (rnd() < .35) continue;
    const q = 1 + Math.floor(rnd() * (c > 1000 ? 8 : 15));
    rows.push([`2026-${String(m).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 27)).padStart(2, '0')}`, p, o, n, q, c, null]);
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  rows.forEach((r, i) => r[6] = `=E${i + 2}*F${i + 2}`);
  addTable({ name: 'Ukázka – prodej po provozovnách', columns: ['Datum', 'Provozovna', 'Obec', 'Produkt', 'Množství (ks)', 'Cena za ks (Kč)', 'Tržba (Kč)'], rows });
}

/* ---------- spojení tabulek ---------- */
const MONTH_RX = [['ledna', 1], ['leden', 1], ['unora', 2], ['unor', 2], ['brezna', 3], ['brezen', 3], ['dubna', 4], ['duben', 4], ['kvetna', 5], ['kveten', 5], ['cervence', 7], ['cervenec', 7], ['cervna', 6], ['cerven', 6], ['srpna', 8], ['srpen', 8], ['zari', 9], ['rijna', 10], ['rijen', 10], ['listopadu', 11], ['listopad', 11], ['prosince', 12], ['prosinec', 12]];
function monthOf(name) {
  const n = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const y = /(20\d{2})/.exec(n);
  let m = null;
  for (const [w, k] of MONTH_RX) if (new RegExp('(^|[^a-z])' + w + '([^a-z]|$)').test(n)) { m = k; break; }
  if (!m) { const d = /(^|\D)(\d{1,2})[./-]\s*(20\d{2})/.exec(n); if (d && +d[2] >= 1 && +d[2] <= 12) m = +d[2]; }
  return m ? { y: y ? +y[1] : null, m } : null;
}
async function mergeDialog() {
  if (S.tables.length < 2) { toast('Ke spojení potřebujete aspoň dvě tabulky'); return; }
  const list = [...S.tables].sort((a, b) => { const x = monthOf(a.name), z = monthOf(b.name); if (x && z) return ((x.y || 0) - (z.y || 0)) || x.m - z.m; if (x) return -1; if (z) return 1; return a.name.localeCompare(b.name, 'cs'); });
  const year = (list.map(t => monthOf(t.name)).find(m => m && m.y) || {}).y || new Date().getFullYear();
  const body = `<p>Zaškrtněte tabulky, které chcete složit pod sebe. Sloupce se spárují podle názvu.</p>
    <div class="pick">${list.map(t => `<label><input type="checkbox" name="t" value="${esc(t.id)}" ${monthOf(t.name) ? 'checked' : ''}>${esc(t.name)}<small>${rowsTxt(t.rows.length)}</small></label>`).join('')}</div>
    <div class="row"><button type="button" class="link" data-pick="1">Vybrat vše</button><button type="button" class="link" data-pick="0">Zrušit výběr</button></div>
    <label class="fld">Název nové tabulky<input type="text" name="name" value="Roční přehled ${year}"></label>
    <div class="chk"><label><input type="checkbox" name="src" checked> Přidat sloupec s měsícem / názvem tabulky</label></div>`;
  const f = await openDlg('Spojit tabulky', body, 'Spojit', form => {
    form.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) $$('input[name=t]', form).forEach(x => x.checked = b.dataset.pick === '1'); });
  });
  if (!f) return;
  const ids = f.getAll('t');
  if (ids.length < 2) { toast('Vyberte aspoň dvě tabulky'); return; }
  const chosen = list.filter(t => ids.includes(t.id));
  const allMonths = chosen.every(t => monthOf(t.name));
  const srcName = allMonths ? 'Měsíc' : 'Zdroj';
  const key = c => String(c).trim().toLowerCase();
  const cols = [], keys = [];
  for (const t of chosen) for (const c of t.columns) if (!keys.includes(key(c))) { keys.push(key(c)); cols.push(String(c).trim()); }
  const addSrc = f.get('src') === 'on';
  const outCols = addSrc ? [uniqueCol(cols, srcName), ...cols] : cols;
  const rows = [];
  for (const t of chosen) {
    const vals = Formula.materialize(t), map = vals.columns.map(c => keys.indexOf(key(c)));
    const mo = monthOf(t.name);
    const label = allMonths && mo ? (mo.y ? `${mo.y}-${String(mo.m).padStart(2, '0')}` : String(mo.m).padStart(2, '0')) : t.name;
    for (const r of vals.rows) {
      if (r.every(v => v == null || v === '')) continue;
      const row = cols.map(() => null);
      r.forEach((v, i) => { row[map[i]] = v; });
      rows.push(addSrc ? [label, ...row] : row);
    }
  }
  const name = String(f.get('name') || '').trim() || 'Spojená tabulka';
  await addTable({ name, columns: outCols, rows });
  toast(`Spojeno ${pl(chosen.length, 'tabulka', 'tabulky', 'tabulek')} · ${rowsTxt(rows.length)}`);
}

/* ---------- import / export ---------- */
// načte jeden list do podoby { columns, rows, subIdx } – subIdx = řádky se součty z Excelu
function parseSheet(ws) {
  if (!ws || !ws['!ref']) return null;
  const range = XLSX.utils.decode_range(ws['!ref']);
  let maxC = -1, maxR = -1;
  for (const k in ws) {
    if (k[0] === '!') continue;
    const cell = ws[k];
    if (cell.f == null && (cell.v == null || cell.v === '' || (typeof cell.v === 'string' && !cell.v.trim()))) continue;
    const a = XLSX.utils.decode_cell(k); if (a.c > maxC) maxC = a.c; if (a.r > maxR) maxR = a.r;
  }
  if (maxC < 0) return null;
  const fromA1 = range.s.r === 0 && range.s.c === 0;
  const grid = [], formulas = [];
  for (let r = range.s.r; r <= maxR; r++) {
    const row = [], fr = [];
    for (let c = range.s.c; c <= maxC; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      let v = cell ? cellIn(cell.t === 'z' ? null : cell.v) : null;
      if (typeof v === 'string') v = v.trim() || null;
      const f = cell && cell.f ? String(cell.f) : null;
      if (f && fromA1 && !f.includes('!') && !/[\[{]/.test(f) && !/^SUBTOTAL\(/i.test(f)) v = '=' + f;
      row.push(v); fr.push(f);
    }
    grid.push(row); formulas.push(fr);
  }
  const width = maxC - range.s.c + 1;
  const cols = [];
  for (let c = 0; c < width; c++) { const h = grid[0][c]; cols.push(uniqueCol(cols, h == null || String(h)[0] === '=' ? 'Sloupec ' + L(c) : String(h).trim())); }
  const rows = grid.slice(1), fs = formulas.slice(1);
  while (rows.length && rows[rows.length - 1].every(v => v == null)) { rows.pop(); fs.pop(); }
  const subIdx = new Set();
  rows.forEach((r, i) => {
    const filled = r.filter(v => v != null).length;
    const hasSub = fs[i].some(f => f && /SUBTOTAL\(/i.test(f));
    const label = r.some(v => typeof v === 'string' && /(^|\s)(celkem|celkový součet|celkovy soucet|mezisoučet|grand total|total)\s*$/i.test(v));
    if (hasSub || (label && filled <= 3)) subIdx.add(i);
  });
  // ručně dopsaný celkový součet na konci: řádek s jediným číslem, které se rovná součtu sloupce nad ním
  for (let i = rows.length - 1, checked = 0; i > 0 && checked < 3; i--) {
    const filled = rows[i].map((v, c) => [v, c]).filter(([v]) => v != null);
    if (!filled.length) continue;
    checked++;
    if (filled.length !== 1 || typeof filled[0][0] !== 'number') break;
    const [val, c] = filled[0];
    let sum = 0;
    for (let k = 0; k < i; k++) { if (subIdx.has(k)) continue; const v = rows[k][c]; if (typeof v === 'number') sum += v; else if (typeof v === 'string' && v[0] === '=') { sum = NaN; break; } }
    if (isNaN(sum)) { const t = Formula.evaluator({ columns: cols, rows }); sum = 0; for (let k = 0; k < i; k++) { if (subIdx.has(k)) continue; const v = t.get(k, c); if (typeof v === 'number') sum += v; } }
    if (Math.abs(sum - val) <= Math.max(0.06, Math.abs(val) * 0.001)) subIdx.add(i);
    break;
  }
  return { columns: cols, rows, subIdx };
}

async function importFiles(files) {
  let n = 0, last = null, skippedTotal = 0;
  for (const f of files) {
    let wb;
    try { wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true, cellFormula: true, sheetStubs: true }); }
    catch (e) { toast(`Soubor ${f.name} se nepodařilo načíst`); continue; }
    const base = f.name.replace(/\.[^.]+$/, '');
    const meta = (wb.Workbook && wb.Workbook.Sheets) || [];
    const sheets = wb.SheetNames.map((sn, i) => ({ sn, hidden: !!(meta[i] && meta[i].Hidden), data: parseSheet(wb.Sheets[sn]) })).filter(x => x.data && x.data.rows.length);
    if (!sheets.length) { toast(`V souboru ${f.name} nejsou žádná data`); continue; }
    let chosen = sheets.filter(x => !x.hidden).slice(0, 1);
    if (!chosen.length) chosen = [sheets[0]];
    let skipSub = true;
    const subCount = sheets.reduce((s, x) => s + x.data.subIdx.size, 0);
    if (sheets.length > 1 || subCount) {
      const body = `${sheets.length > 1 ? `<p>Soubor <b>${esc(f.name)}</b> má víc listů. Vyberte, které načíst:</p>
        <div class="pick">${sheets.map((x, i) => `<label><input type="checkbox" name="s" value="${i}" ${chosen.includes(x) ? 'checked' : ''}>${esc(x.sn)}${x.hidden ? ' (skrytý)' : ''}<small>${rowsTxt(x.data.rows.length - x.data.subIdx.size)}</small></label>`).join('')}</div>` : `<p>Soubor <b>${esc(f.name)}</b></p>`}
        ${subCount ? `<div class="chk"><label><input type="checkbox" name="sub" checked> Vynechat řádky se součty z Excelu („… Celkem“, „Celkový součet“)</label></div>
        <p>Jinak by se v appce sečetly podruhé.</p>` : ''}`;
      const res = await openDlg('Import tabulky', body, 'Načíst');
      if (!res) continue;
      if (sheets.length > 1) chosen = res.getAll('s').map(i => sheets[+i]);
      skipSub = subCount ? res.get('sub') === 'on' : false;
      if (!chosen.length) continue;
    }
    for (const x of chosen) {
      const d = x.data;
      const tmp = { columns: d.columns, rows: d.rows.map(r => [...r]) };
      if (skipSub) [...d.subIdx].sort((a, b) => b - a).forEach(i => { tmp.rows.splice(i, 1); Formula.adjust.deleteRow(tmp, i); });
      const rows = tmp.rows;
      if (skipSub) skippedTotal += d.subIdx.size;
      const t = { name: chosen.length > 1 || sheets.length > 1 ? `${base} – ${x.sn}` : base, columns: d.columns, rows };
      await addTable(t, false); last = t; n++;
    }
  }
  if (n === 1) openTable(last.id);
  else if (n > 1) go('home');
  if (n) toast(`Načteno ${pl(n, 'tabulka', 'tabulky', 'tabulek')}` + (skippedTotal ? ` · vynecháno ${rowsTxt(skippedTotal)} se součty` : ''));
}

let dlCap = null;
try { if (window.claude && window.claude.use) window.claude.use('downloads').then(d => { dlCap = d; }).catch(() => {}); } catch (_) {}
async function download(name, blob) {
  if (dlCap) {
    try { await dlCap.save({ filename: name, data: blob }); toast('Soubor uložen'); }
    catch (e) { if (e && e.code !== 'declined') toast('Stažení se nepovedlo'); }
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const safeName = n => String(n || 'tabulka').replace(/[\\/:*?"<>|]/g, '').slice(0, 90).trim() || 'tabulka';
function exportXlsx(name, data) {
  const aoa = [data.columns, ...data.rows.map(r => r.map(v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T12:00:00') : v))];
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true, dateNF: 'd\\.m\\.yyyy' });
  ws['!cols'] = data.columns.map((c, i) => ({ wch: Math.min(60, Math.max(8, String(c).length + 2, ...data.rows.slice(0, 300).map(r => String(fmtVal(r[i])).length + 1))) }));
  // vzhled jako v appce
  const line = { style: 'thin', color: { rgb: 'C9CFDD' } };
  const st = {
    head: { font: { bold: true, color: { rgb: '101828' } }, fill: { fgColor: { rgb: 'EEF1F7' } }, border: { bottom: { style: 'medium', color: { rgb: '1F4FD8' } } } },
    sub: { font: { bold: true }, fill: { fgColor: { rgb: 'E8EEFF' } }, border: { bottom: line } },
    grand: { font: { bold: true, sz: 12 }, fill: { fgColor: { rgb: 'DCE3F5' } }, border: { top: { style: 'medium', color: { rgb: '101828' } } } },
  };
  const paint = (r, style) => data.columns.forEach((_, c) => { const a = XLSX.utils.encode_cell({ r, c }); if (!ws[a]) ws[a] = { t: 's', v: '' }; ws[a].s = style; });
  paint(0, st.head);
  if (data.totals) {
    const rows = [{}];
    data.rows.forEach((r, i) => {
      const lab = typeof r[0] === 'string' ? r[0] : '';
      if (lab === 'CELKEM') { paint(i + 1, st.grand); rows.push({}); }
      else if (lab.startsWith('Celkem ')) { paint(i + 1, st.sub); rows.push({}); }
      else rows.push({ level: 1 });
    });
    ws['!rows'] = rows;
    ws['!outline'] = { above: false };
  }
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Výstup');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  download(safeName(name) + '.xlsx', new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}
function exportCsv(name, data) {
  const q = v => { if (v == null) return ''; const s = typeof v === 'number' ? numStr(v) : String(v); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const txt = '﻿' + [data.columns, ...data.rows].map(r => r.map(q).join(';')).join('\r\n');
  download(safeName(name) + '.csv', new Blob([txt], { type: 'text/csv;charset=utf-8' }));
}
function exportBackup() {
  const d = { app: 'tabulky', verze: 1, ulozeno: new Date().toISOString(), tables: S.tables, recipes: S.recipes };
  download(`tabulky-zaloha-${new Date().toISOString().slice(0, 10)}.json`, new Blob([JSON.stringify(d)], { type: 'application/json' }));
}
async function importBackup(f) {
  try {
    const d = JSON.parse(await f.text());
    if (d.app !== 'tabulky') throw 0;
    for (const t of d.tables || []) { if (!t.id || !Array.isArray(t.rows)) continue; const i = S.tables.findIndex(x => x.id === t.id); if (i >= 0) S.tables[i] = t; else S.tables.push(t); await DB.put('tables', t); }
    for (const r of d.recipes || []) { if (!r.id) continue; const i = S.recipes.findIndex(x => x.id === r.id); if (i >= 0) S.recipes[i] = r; else S.recipes.push(r); await DB.put('recipes', r); }
    S.cur = null; toast('Záloha obnovena'); go('home');
  } catch (e) { toast('Tohle není záloha z appky Tabulky'); }
}

/* ---------- editor ---------- */
function openEditor() { $('#tblName').value = S.cur.name; updateUndo(); renderGrid(); updateMeta(); }
function updateMeta() { if (S.cur) $('#tblMeta').textContent = `${rowsTxt(S.cur.rows.length)} · ${colsTxt(S.cur.columns.length)}`; }
function ev() { return S.ev || (S.ev = Formula.evaluator(S.cur)); }

function visibleRows() {
  const t = S.cur, q = S.search.trim().toLowerCase(), e = ev();
  const all = t.rows.map((_, i) => i);
  if (!q) return all;
  return all.filter(r => t.columns.some((_, c) => String(fmtVal(Formula.display(e.get(r, c)))).toLowerCase().includes(q)));
}

function tdHTML(r, c) {
  const raw = S.cur.rows[r][c], v = ev().get(r, c);
  const isF = typeof raw === 'string' && raw[0] === '=';
  let cls = [], txt;
  if (Formula.isErr(v)) { cls.push('e'); txt = v.err; }
  else if (typeof v === 'number') { cls.push('n'); txt = NF.format(v); }
  else txt = fmtVal(Formula.display(v));
  if (isF) cls.push('f');
  if (S.sel && S.sel.r === r && S.sel.c === c) cls.push('sel');
  if (S.search && String(txt).toLowerCase().includes(S.search.toLowerCase())) cls.push('hit');
  return `<td data-r="${r}" data-c="${c}" class="${cls.join(' ')}">${esc(txt)}</td>`;
}

function totals(idx) {
  if (S.totFn === 'off') return '';
  const e = ev(), lab = { sum: 'Σ', avg: 'Ø', min: 'min', max: 'max', count: 'počet' }[S.totFn];
  const cells = S.cur.columns.map((_, c) => {
    const n = []; for (const r of idx) { const v = e.get(r, c); if (typeof v === 'number') n.push(v); }
    if (!n.length) return '<td></td>';
    const s = n.reduce((a, b) => a + b, 0);
    const v = { sum: s, avg: s / n.length, min: Math.min(...n), max: Math.max(...n), count: n.length }[S.totFn];
    return `<td class="n" title="${esc($('#totFn').selectedOptions[0].text)}">${esc(NF.format(Math.round(v * 1e4) / 1e4))}</td>`;
  });
  return `<tfoot><tr><th>${lab}</th>${cells.join('')}</tr></tfoot>`;
}

function renderGrid() {
  const t = S.cur; if (!t) return;
  if (S.sel && (S.sel.r >= t.rows.length || S.sel.c >= t.columns.length)) S.sel = null;
  const idx = visibleRows(), show = idx.slice(0, S.shown);
  let h = `<thead><tr><th class="corner" title="Řádek 1 = názvy sloupců">1</th>${t.columns.map((c, i) => `<th data-h="${i}" title="Klikněte pro volby sloupce"><span class="L">${L(i)}</span><span class="nm">${esc(c)}</span></th>`).join('')}</tr></thead><tbody>`;
  for (const r of show) h += `<tr><th class="rh" data-row="${r}">${r + 2}</th>${t.columns.map((_, c) => tdHTML(r, c)).join('')}</tr>`;
  if (!t.columns.length) h += '<tr><td style="padding:24px;color:var(--mute)">Tabulka nemá žádný sloupec. Přidejte ho tlačítkem „Sloupec“.</td></tr>';
  h += '</tbody>' + totals(idx);
  $('#grid').innerHTML = h;
  $('#pageInfo').textContent = S.search ? `Nalezeno ${rowsTxt(idx.length)}` : idx.length > show.length ? `Zobrazeno ${show.length} z ${rowsTxt(idx.length)}` : rowsTxt(idx.length);
  $('#btnMoreRows').hidden = idx.length <= show.length;
  updateFbar();
}

function tdAt(r, c) { return $(`#grid td[data-r="${r}"][data-c="${c}"]`); }
function select(r, c, scroll = true) {
  const t = S.cur; if (!t.rows.length || !t.columns.length) return;
  r = Math.max(0, Math.min(t.rows.length - 1, r)); c = Math.max(0, Math.min(t.columns.length - 1, c));
  if (S.sel) tdAt(S.sel.r, S.sel.c)?.classList.remove('sel');
  S.sel = { r, c };
  let td = tdAt(r, c);
  if (!td && !S.search && r >= S.shown) { S.shown = Math.ceil((r + 1) / PAGE) * PAGE; renderGrid(); td = tdAt(r, c); }
  if (td) { td.classList.add('sel'); if (scroll) td.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  updateFbar();
}
function updateFbar() {
  const f = $('#fInput');
  if (!S.sel) { $('#cellRef').textContent = '–'; f.value = ''; f.disabled = true; return; }
  const raw = S.cur.rows[S.sel.r][S.sel.c];
  $('#cellRef').textContent = L(S.sel.c) + (S.sel.r + 2);
  f.disabled = false;
  if (document.activeElement !== f) f.value = typeof raw === 'number' ? numStr(raw) : raw ?? '';
}
function commit(r, c, str) {
  const dm = /^\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s*$/.exec(str || '');
  const val = dm ? `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}` : Formula.parseInput(str), old = S.cur.rows[r][c];
  if (val === old || (val == null && old == null)) { const td = tdAt(r, c); if (td) td.outerHTML = tdHTML(r, c); return false; }
  pushUndo(); S.cur.rows[r][c] = val; touch(); renderGrid(); return true;
}

function startEdit(r, c, initial) {
  select(r, c);
  const td = tdAt(r, c); if (!td) return;
  const raw = S.cur.rows[r][c];
  S.editing = true;
  td.innerHTML = '<input class="cell-in" autocomplete="off" spellcheck="false">';
  const inp = td.firstChild;
  inp.value = initial != null ? initial : typeof raw === 'number' ? numStr(raw) : raw ?? '';
  inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
  let done = false;
  const finish = (save, dr = 0, dc = 0) => {
    if (done) return; done = true; S.editing = false;
    if (save) commit(r, c, inp.value); else td.outerHTML = tdHTML(r, c);
    select(r + dr, c + dc); $('#gridWrap').focus({ preventScroll: true });
  };
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true, 1, 0); }
    else if (e.key === 'Tab') { e.preventDefault(); finish(true, 0, e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    e.stopPropagation();
  });
  inp.addEventListener('blur', () => finish(true));
  inp.addEventListener('input', () => { $('#fInput').value = inp.value; });
}

const grid = $('#grid'), wrap = $('#gridWrap');
wrap.tabIndex = 0;
let lastTap = { r: -1, c: -1, t: 0 };
grid.addEventListener('click', e => {
  const td = e.target.closest('td[data-r]');
  if (td) {
    if (S.editing) return;
    const r = +td.dataset.r, c = +td.dataset.c, now = Date.now();
    const again = S.sel && S.sel.r === r && S.sel.c === c && lastTap.r === r && lastTap.c === c && now - lastTap.t < 1200 && now - lastTap.t > 250;
    lastTap = { r, c, t: now };
    if (again && matchMedia('(pointer:coarse)').matches) startEdit(r, c); else { select(r, c, false); wrap.focus({ preventScroll: true }); }
    return;
  }
  const h = e.target.closest('th[data-h]'); if (h) { colMenu(h, +h.dataset.h); return; }
  const rh = e.target.closest('th[data-row]'); if (rh) rowMenu(rh, +rh.dataset.row);
});
grid.addEventListener('dblclick', e => { const td = e.target.closest('td[data-r]'); if (td && !S.editing) startEdit(+td.dataset.r, +td.dataset.c); });

wrap.addEventListener('keydown', e => {
  if (S.editing || !S.sel || S.view !== 'editor') return;
  const { r, c } = S.sel, k = e.key;
  const mv = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
  if (mv) { e.preventDefault(); select(r + mv[0], c + mv[1]); }
  else if (k === 'Tab') { e.preventDefault(); select(r, c + (e.shiftKey ? -1 : 1)); }
  else if (k === 'Enter' || k === 'F2') { e.preventDefault(); startEdit(r, c); }
  else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); commit(r, c, ''); select(r, c); }
  else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); startEdit(r, c, k); }
});
document.addEventListener('keydown', e => {
  if (S.view !== 'editor' || S.editing) return;
  if ((e.ctrlKey || e.metaKey) && !e.target.matches('input,textarea,select')) {
    if (e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    if (e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  }
});

const fInput = $('#fInput');
fInput.addEventListener('keydown', e => {
  if (!S.sel) return;
  if (e.key === 'Enter') { e.preventDefault(); const { r, c } = S.sel; commit(r, c, fInput.value); fInput.blur(); select(r + 1, c); wrap.focus({ preventScroll: true }); }
  if (e.key === 'Escape') { fInput.blur(); updateFbar(); wrap.focus({ preventScroll: true }); }
});
fInput.addEventListener('change', () => { if (S.sel) { const { r, c } = S.sel; commit(r, c, fInput.value); select(r, c, false); } });

$('#tblName').addEventListener('change', e => { const v = e.target.value.trim(); if (v) { S.cur.name = v; touch(); } else e.target.value = S.cur.name; });
$('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
$('#btnMoreRows').onclick = () => { S.shown += PAGE; renderGrid(); };
$('#totFn').onchange = e => { S.totFn = e.target.value; try { localStorage.setItem('tabulky-tot', S.totFn); } catch (_) {} renderGrid(); };
let searchT; $('#search').addEventListener('input', e => { clearTimeout(searchT); searchT = setTimeout(() => { S.search = e.target.value; S.shown = PAGE; renderGrid(); }, 200); });

/* řádky a sloupce */
function insertRow(at) { mutate(t => { Formula.adjust.insertRow(t, at); t.rows.splice(at, 0, t.columns.map(() => null)); }); select(at, S.sel ? S.sel.c : 0); }
function deleteRow(at) { mutate(t => { t.rows.splice(at, 1); Formula.adjust.deleteRow(t, at); }); }
function dupRow(at) { mutate(t => { Formula.adjust.insertRow(t, at + 1); const copy = [...t.rows[at]]; Formula.adjust.moveRow(copy, 1); t.rows.splice(at + 1, 0, copy); }); }
function insertCol(at, name) { mutate(t => { Formula.adjust.insertCol(t, at); t.columns.splice(at, 0, uniqueCol(t.columns, name || 'Sloupec ' + L(at))); t.rows.forEach(r => r.splice(at, 0, null)); }); }
function deleteCol(at) { mutate(t => { t.columns.splice(at, 1); t.rows.forEach(r => r.splice(at, 1)); Formula.adjust.deleteCol(t, at); }); }
function sortBy(c, dir) {
  const e = ev(), m = dir === 'desc' ? -1 : 1;
  const vals = S.cur.rows.map((_, r) => Formula.display(e.get(r, c)));
  const order = vals.map((_, i) => i).sort((a, b) => { const x = vals[a], y = vals[b], em = v => v == null || v === ''; if (em(x) || em(y)) return Pipeline.compareVals(x, y); return Pipeline.compareVals(x, y) * m || a - b; });
  mutate(t => { const old = t.rows; t.rows = order.map((from, to) => { const row = [...old[from]]; if (to !== from) Formula.adjust.moveRow(row, to - from); return row; }); });
  toast('Seřazeno');
}

function rowMenu(anchor, r) {
  showPop(anchor, [
    { label: 'Vložit řádek nad', icon: 'up', act: () => insertRow(r) },
    { label: 'Vložit řádek pod', icon: 'down', act: () => insertRow(r + 1) },
    { label: 'Duplikovat řádek', icon: 'copy', act: () => dupRow(r) },
    '-',
    { label: 'Smazat řádek', icon: 'trash', danger: true, act: () => deleteRow(r) },
  ]);
}
function colMenu(anchor, c) {
  const name = S.cur.columns[c];
  showPop(anchor, [
    { label: 'Přejmenovat', icon: 'pen', act: async () => { const n = await promptDlg('Přejmenovat sloupec', 'Nový název', name); if (n && n !== name) mutate(t => t.columns[c] = uniqueCol(t.columns.filter((_, i) => i !== c), n)); } },
    { label: 'Seřadit od nejmenšího (A→Z)', icon: 'sort', act: () => sortBy(c, 'asc') },
    { label: 'Seřadit od největšího (Z→A)', icon: 'sort', act: () => sortBy(c, 'desc') },
    { label: 'Výpočet do tohoto sloupce', icon: 'calc', act: () => calcDialog(c) },
    '-',
    { label: 'Vložit sloupec vlevo', icon: 'plus', act: () => insertCol(c) },
    { label: 'Vložit sloupec vpravo', icon: 'plus', act: () => insertCol(c + 1) },
    '-',
    { label: `Smazat sloupec „${name}“`, icon: 'trash', danger: true, act: async () => { if (await confirmDlg('Smazat sloupec?', `Sloupec „${name}“ i s daty se smaže. Vrátit to jde tlačítkem Zpět.`, 'Smazat')) deleteCol(c); } },
  ]);
}

$('#btnAddRow').onclick = e => showPop(e.currentTarget, [
  { label: 'Na konec tabulky', icon: 'down', act: () => { insertRow(S.cur.rows.length); } },
  ...(S.sel ? [{ label: `Pod vybraný řádek (${S.sel.r + 2})`, icon: 'plus', act: () => insertRow(S.sel.r + 1) }] : []),
]);
$('#btnAddCol').onclick = async () => { const n = await promptDlg('Nový sloupec', 'Název sloupce', 'Sloupec ' + L(S.cur.columns.length)); if (n) { insertCol(S.cur.columns.length, n); toast('Sloupec přidán na konec'); } };
$('#btnCalc').onclick = () => calcDialog(null);
$('#btnExport').onclick = e => showPop(e.currentTarget, [
  { label: 'Excel (.xlsx)', sub: 'Vzorce se uloží jako hodnoty', icon: 'download', act: () => exportXlsx(S.cur.name, Formula.materialize(S.cur)) },
  { label: 'CSV (středník)', icon: 'file', act: () => exportCsv(S.cur.name, Formula.materialize(S.cur)) },
]);

/* dialog Výpočet */
async function calcDialog(targetCol) {
  const t = S.cur, cols = t.columns;
  const opt = (sel) => cols.map((c, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(L(i))} – ${esc(c)}</option>`).join('');
  const numericIdx = cols.map((_, i) => i).filter(i => t.rows.slice(0, 30).some((_, r) => typeof ev().get(r, i) === 'number'));
  const a0 = numericIdx[0] ?? 0, b0 = numericIdx[1] ?? numericIdx[0] ?? 0;
  const body = `
    <label class="fld">Výsledek uložit do
      <select name="dest"><option value="new">Nového sloupce</option>${cols.map((c, i) => `<option value="${i}" ${i === targetCol ? 'selected' : ''}>Přepsat: ${esc(c)}</option>`).join('')}</select></label>
    <label class="fld" data-show="new">Název nového sloupce<input type="text" name="name" value="Výpočet"></label>
    <div class="fld3">
      <label class="fld">První hodnota<select name="a"><option value="num">Číslo…</option>${opt(a0)}</select></label>
      <label class="fld">Znak<select name="op"><option value="*">×</option><option value="/">÷</option><option value="+">+</option><option value="-">−</option></select></label>
      <label class="fld">Druhá hodnota<select name="b"><option value="num">Číslo…</option>${opt(b0 === a0 && cols.length > 1 ? -1 : b0)}</select></label>
    </div>
    <div class="fld2">
      <label class="fld" data-num="a">První číslo<input type="text" inputmode="decimal" name="an" value="1"></label>
      <label class="fld" data-num="b">Druhé číslo<input type="text" inputmode="decimal" name="bn" value="1,21"></label>
    </div>
    <label class="fld">Zaokrouhlit<select name="round"><option value="">Nezaokrouhlovat</option><option value="0">Na celá čísla</option><option value="1">Na 1 desetinné místo</option><option value="2">Na 2 desetinná místa</option></select></label>
    <div class="chk"><label><input type="checkbox" name="live" checked> Uložit jako vzorec (přepočítá se při změně)</label></div>
    <div class="preview-f" id="calcPrev"></div>`;
  const form = await openDlg('Výpočet sloupce', body, 'Spočítat', f => {
    const sync = () => {
      const d = f.dest.value, a = f.a.value, b = f.b.value;
      $('[data-show="new"]', f).hidden = d !== 'new';
      $('[data-num="a"]', f).hidden = a !== 'num'; $('[data-num="b"]', f).hidden = b !== 'num';
      const sym = { '*': '×', '/': '÷', '+': '+', '-': '−' }[f.op.value];
      const nm = v => v === 'num' ? null : cols[+v];
      const A = nm(a) ?? (f.an.value || '?'), B = nm(b) ?? (f.bn.value || '?');
      const self = d !== 'new' && (a === d || b === d);
      f.live.disabled = self; if (self) f.live.checked = false;
      $('#calcPrev', f).textContent = `${d === 'new' ? (f.elements.name.value || 'Výpočet') : cols[+d]} = ${A} ${sym} ${B}` + (f.round.value !== '' ? `, zaokrouhleno` : '') + (self ? ' (uloží se jako hodnoty)' : '');
    };
    f.addEventListener('input', sync); f.addEventListener('change', sync); sync();
  });
  if (!form) return;
  const g = n => form.get(n);
  const operand = (k, r) => g(k) === 'num' ? numStr(Formula.num(g(k + 'n')) ?? 0) : L(+g(k)) + (r + 2);
  const aNum = g('a') === 'num' ? Formula.num(g('an')) : null, bNum = g('b') === 'num' ? Formula.num(g('bn')) : null;
  if ((g('a') === 'num' && aNum == null) || (g('b') === 'num' && bNum == null)) { toast('Zadejte platné číslo'); return; }
  const op = g('op'), round = g('round'), live = g('live') === 'on';
  const isNew = g('dest') === 'new';
  mutate(t => {
    let dest;
    if (isNew) { dest = t.columns.length; t.columns.push(uniqueCol(t.columns, (g('name') || 'Výpočet').trim() || 'Výpočet')); t.rows.forEach(r => r.push(null)); }
    else dest = +g('dest');
    const self = !isNew && (g('a') === String(dest) || g('b') === String(dest));
    const e = Formula.evaluator(t);
    const results = t.rows.map((_, r) => {
      const expr = `${operand('a', r)}${op}${operand('b', r)}`;
      const f = round !== '' ? `ZAOKROUHLIT(${expr};${round})` : expr;
      if (live && !self) return '=' + f;
      const v = Formula.evaluate(f, (R, C) => R === 1 ? t.columns[C] : e.get(R - 2, C));
      return Formula.isErr(v) ? null : v;
    });
    results.forEach((v, r) => t.rows[r][dest] = v);
  });
  toast('Spočítáno');
}

/* ---------- zpracování (Výstup) ---------- */
function procInput() { return Formula.materialize(S.cur); }
function renderProcess() {
  const t = S.cur; t.steps = t.steps || [];
  $('#procSrc').textContent = `Z tabulky: ${t.name}`;
  $('#recipeSel').innerHTML = `<option value="">Načíst uložený postup…</option>` + S.recipes.map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
  runProcess();
}
function runProcess() {
  const t = S.cur, input = procInput();
  const res = Pipeline.run(input, t.steps);
  S.result = res;
  renderSteps(res.states);
  const out = res.table;
  $('#resInfo').textContent = t.steps.length ? `Výsledek: ${rowsTxt(out.rows.length)}` : `Zatím bez úprav: ${rowsTxt(out.rows.length)}`;
  $('#resSub').textContent = res.ok ? `· ${colsTxt(out.columns.length)}` : '· opravte označený krok';
  const max = 500;
  let h = `<thead><tr><th class="corner"></th>${out.columns.map((c, i) => `<th><span class="L">${L(i)}</span><span class="nm">${esc(c)}</span></th>`).join('')}</tr></thead><tbody>`;
  out.rows.slice(0, max).forEach((r, i) => { const tot = out.totals && typeof r[0] === 'string' && /^(Celkem |CELKEM$)/.test(r[0]); h += `<tr${tot ? ` class="${r[0] === 'CELKEM' ? 'gtot' : 'stot'}"` : ''}><th class="rh">${i + 2}</th>${r.map(v => `<td class="${typeof v === 'number' ? 'n' : ''}">${esc(fmtVal(v))}</td>`).join('')}</tr>`; });
  if (out.rows.length > max) h += `<tr><td colspan="${out.columns.length + 1}" style="color:var(--mute)">… a dalších ${rowsTxt(out.rows.length - max)} (stáhnou se všechny)</td></tr>`;
  if (!out.rows.length) h += `<tr><td colspan="${out.columns.length + 1}" style="color:var(--mute);padding:20px">Žádné řádky neodpovídají.</td></tr>`;
  $('#resGrid').innerHTML = h + '</tbody>';
  $('#btnJump').textContent = `Zobrazit výsledek (${rowsTxt(out.rows.length)})`;
}

function colSelect(key, val, cols, extra = '') {
  const miss = val && !cols.includes(val);
  return `<select data-k="${key}" class="${miss ? 'miss' : ''}">${miss ? `<option value="${esc(val)}" selected>⚠ ${esc(val)} (v tabulce chybí)</option>` : ''}${!val ? '<option value="" selected>Vyberte sloupec…</option>' : ''}${extra}${cols.map(c => `<option ${c === val ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`;
}
const optList = (obj, val) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === val ? 'selected' : ''}>${esc(v)}</option>`).join('');
function checks(key, sel, cols) {
  const missing = (sel || []).filter(c => !cols.includes(c));
  return `<div class="chk" data-arr="${key}">${[...cols, ...missing].map(c => `<label${missing.includes(c) ? ' style="border-color:var(--warn);color:var(--warn)"' : ''}><input type="checkbox" value="${esc(c)}" ${(sel || []).includes(c) ? 'checked' : ''}>${missing.includes(c) ? '⚠ ' : ''}${esc(c)}</label>`).join('')}</div>`;
}
function operand(key, o, cols) {
  const isNum = o.t === 'num';
  return `<select data-op="${key}" class="${!isNum && o.v && !cols.includes(o.v) ? 'miss' : ''}"><option value="__num" ${isNum ? 'selected' : ''}>Číslo…</option>${!isNum && o.v && !cols.includes(o.v) ? `<option selected value="${esc(o.v)}">⚠ ${esc(o.v)} (chybí)</option>` : ''}${cols.map(c => `<option ${!isNum && c === o.v ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>${isNum ? `<input type="text" inputmode="decimal" data-k="${key}.v" value="${esc(numStr(o.v ?? ''))}">` : ''}`;
}

function stepBody(s, cols) {
  switch (s.type) {
    case 'filter': return `<label class="fld">Sloupec${colSelect('col', s.col, cols)}</label>
      <label class="fld">Podmínka<select data-k="op">${optList(Pipeline.OPS, s.op)}</select></label>
      ${['empty', 'nempty'].includes(s.op) ? '' : `<label class="fld">Hodnota<input type="text" data-k="val" value="${esc(s.val)}" placeholder="např. Břeclav nebo 1000"></label>`}`;
    case 'group': return `<div class="fld">Seskupit podle${checks('by', s.by, cols)}</div>
      <div class="fld">Spočítat${(s.aggs || []).map((a, i) => `<div class="agg"><select data-k="aggs.${i}.fn">${optList(Pipeline.AGG, a.fn)}</select>${a.fn === 'count' ? colSelect(`aggs.${i}.col`, a.col, cols, `<option value="" ${!a.col ? 'selected' : ''}>Řádky</option>`).replace('<option value="" selected>Vyberte sloupec…</option>', '') : colSelect(`aggs.${i}.col`, a.col, cols)}<button type="button" class="icon-btn" data-aggdel="${i}" aria-label="Odebrat">${ico('x')}</button></div>`).join('')}
      <button type="button" class="link" data-aggadd>+ Další výpočet</button></div>`;
    case 'subtotal': return `<div class="fld2"><label class="fld">Skupina (např. odběratel)${colSelect('group', s.group, cols)}</label>
      <label class="fld">Podskupina (např. zboží)${colSelect('sub', s.sub, cols, `<option value="" ${!s.sub ? 'selected' : ''}>— bez podskupiny —</option>`).replace('<option value="" selected>Vyberte sloupec…</option>', '')}</label></div>
      <div class="fld">Sečíst sloupce${checks('vals', s.vals, cols)}</div>
      <div class="fld">Zobrazit i sloupce (např. město) – jen vedle skupiny, nesčítají se${checks('extra', s.extra || [], cols.filter(c => c !== s.group && c !== s.sub))}</div>
      <div class="fld2"><label class="fld">Funkce<select data-k="fn">${optList(Pipeline.AGG, s.fn)}</select></label>
      <div class="fld">&nbsp;<div class="chk"><label><input type="checkbox" data-k="cnt" ${s.cnt ? 'checked' : ''}> Počet řádků</label></div></div></div>`;
    case 'pivot': return `<div class="fld2"><label class="fld">Řádky${colSelect('row', s.row, cols)}</label><label class="fld">Sloupce${colSelect('col', s.col, cols)}</label></div>
      <div class="fld2"><label class="fld">Hodnota${colSelect('val', s.val, cols)}</label><label class="fld">Funkce<select data-k="fn">${optList(Pipeline.AGG, s.fn)}</select></label></div>`;
    case 'calc': return `<label class="fld">Výsledek<select data-k="dest"><option value="new" ${s.dest !== 'over' ? 'selected' : ''}>Nový sloupec</option><option value="over" ${s.dest === 'over' ? 'selected' : ''}>Přepsat existující</option></select></label>
      ${s.dest === 'over' ? `<label class="fld">Který sloupec${colSelect('target', s.target, cols)}</label>` : `<label class="fld">Název<input type="text" data-k="name" value="${esc(s.name)}"></label>`}
      <div class="fld3"><label class="fld">První${operand('a', s.a, cols)}</label><label class="fld">Znak<select data-k="op">${optList(Pipeline.CALC_OPS, s.op)}</select></label><label class="fld">Druhá${operand('b', s.b, cols)}</label></div>
      <label class="fld">Zaokrouhlit<select data-k="round"><option value="" ${s.round === '' ? 'selected' : ''}>Ne</option>${[0, 1, 2].map(d => `<option value="${d}" ${String(s.round) === String(d) ? 'selected' : ''}>${d === 0 ? 'Na celá čísla' : d + ' des. místa'}</option>`).join('')}</select></label>`;
    case 'datepart': return `<label class="fld">Sloupec s datem${colSelect('col', s.col, cols)}</label>
      <div class="fld2"><label class="fld">Vytáhnout<select data-k="part">${optList(Pipeline.PARTS, s.part)}</select></label><label class="fld">Název sloupce<input type="text" data-k="name" value="${esc(s.name)}"></label></div>`;
    case 'sort': return `<div class="fld2"><label class="fld">Sloupec${colSelect('col', s.col, cols)}</label><label class="fld">Pořadí<select data-k="dir"><option value="asc" ${s.dir === 'asc' ? 'selected' : ''}>Od nejmenšího</option><option value="desc" ${s.dir === 'desc' ? 'selected' : ''}>Od největšího</option></select></label></div>`;
    case 'select': return `<div class="fld">Ponechat sloupce${checks('cols', s.cols, cols)}</div><div class="row"><button type="button" class="link" data-all="1">Vybrat vše</button><button type="button" class="link" data-all="0">Zrušit vše</button></div>`;
    case 'rename': return `<div class="fld2"><label class="fld">Sloupec${colSelect('col', s.col, cols)}</label><label class="fld">Nový název<input type="text" data-k="to" value="${esc(s.to)}"></label></div>`;
    case 'dedupe': return `<div class="fld">Porovnat podle (nic nezaškrtnuto = celé řádky)${checks('cols', s.cols, cols)}</div>`;
    case 'limit': return `<label class="fld">Počet řádků<input type="number" min="0" data-k="n" value="${esc(s.n)}"></label>`;
  }
  return '';
}

function renderSteps(states) {
  const steps = S.cur.steps;
  if (!steps.length) { $('#steps').innerHTML = `<li class="empty" style="padding:18px">Přidejte první krok. Výsledek uvidíte hned vpravo${matchMedia('(max-width:760px)').matches ? ' (pod kroky)' : ''}.</li>`; return; }
  $('#steps').innerHTML = steps.map((s, i) => {
    const st = states[i] || { cols: [] };
    const bad = st.missing || st.error;
    return `<li class="step ${bad ? 'bad' : ''} ${st.skipped ? 'skip' : ''}" data-i="${i}">
      <div class="step-h"><b>${esc(Pipeline.TYPES[s.type].label)}</b>
        <button type="button" class="icon-btn" data-mv="-1" aria-label="Posunout nahoru" ${i === 0 ? 'disabled' : ''}>${ico('up')}</button>
        <button type="button" class="icon-btn" data-mv="1" aria-label="Posunout dolů" ${i === steps.length - 1 ? 'disabled' : ''}>${ico('down')}</button>
        <button type="button" class="icon-btn" data-del aria-label="Smazat krok">${ico('trash')}</button></div>
      <div class="step-b">${stepBody(s, st.cols)}
        ${st.missing ? `<div class="msg warn">${ico('warn')}<span>V tabulce chybí sloupec ${st.missing.map(m => `„${esc(m)}“`).join(', ')}. Vyberte místo něj jiný.</span></div>` : ''}
        ${st.error ? `<div class="msg warn">${ico('warn')}<span>${esc(st.error)}</span></div>` : ''}
        ${st.skipped ? `<div class="msg warn">Čeká na opravu předchozího kroku.</div>` : ''}
        ${st.count != null ? `<div class="msg ok">${ico('check')}<span>${rowsTxt(st.count)}</span></div>` : ''}
      </div></li>`;
  }).join('');
}

function setPath(o, path, v) { const k = path.split('.'); let x = o; for (let i = 0; i < k.length - 1; i++) x = x[k[i]]; x[k[k.length - 1]] = v; }
function stepChanged() { touch(); runProcess(); }
const stepsEl = $('#steps');
stepsEl.addEventListener('change', e => {
  const li = e.target.closest('.step'); if (!li) return;
  const s = S.cur.steps[+li.dataset.i], el = e.target;
  if (el.dataset.k) {
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.k.endsWith('.v') && (el.dataset.k.startsWith('a') || el.dataset.k.startsWith('b'))) v = Formula.num(v) ?? 0;
    setPath(s, el.dataset.k, v);
    if (s.type === 'calc' && el.dataset.k === 'dest' && v === 'over' && !s.target) s.target = (S.result.states[+li.dataset.i] || {}).cols?.[0] || '';
  } else if (el.dataset.op) {
    s[el.dataset.op] = el.value === '__num' ? { t: 'num', v: 1 } : { t: 'col', v: el.value };
  } else if (el.closest('[data-arr]')) {
    const box = el.closest('[data-arr]');
    s[box.dataset.arr] = $$('input:checked', box).map(x => x.value);
  }
  stepChanged();
});
stepsEl.addEventListener('click', e => {
  const li = e.target.closest('.step'); if (!li) return;
  const i = +li.dataset.i, steps = S.cur.steps, s = steps[i];
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.mv) { const j = i + +b.dataset.mv; [steps[i], steps[j]] = [steps[j], steps[i]]; stepChanged(); }
  else if ('del' in b.dataset) { steps.splice(i, 1); stepChanged(); }
  else if ('aggadd' in b.dataset) { const cols = S.result.states[i]?.cols || []; s.aggs.push({ fn: 'sum', col: cols[cols.length - 1] || '' }); stepChanged(); }
  else if (b.dataset.aggdel) { s.aggs.splice(+b.dataset.aggdel, 1); stepChanged(); }
  else if (b.dataset.all) { s.cols = b.dataset.all === '1' ? [...(S.result.states[i]?.cols || [])] : []; stepChanged(); }
});

$('#btnAddStep').onclick = e => showPop(e.currentTarget, Object.entries(Pipeline.TYPES).map(([k, v]) => ({
  label: v.label, sub: v.hint, act: () => {
    const cur = S.result ? S.result.table : procInput();
    S.cur.steps.push(Pipeline.defaults(k, cur.columns, cur.rows)); stepChanged();
    setTimeout(() => { const last = stepsEl.lastElementChild; last && last.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 30);
  },
})));
$('#recipeSel').onchange = e => {
  const r = S.recipes.find(x => x.id === e.target.value); e.target.value = ''; if (!r) return;
  S.cur.steps = clone(r.steps); stepChanged(); toast(`Postup „${r.name}“ načten`);
};
$('#btnSaveRecipe').onclick = async () => {
  if (!S.cur.steps.length) { toast('Postup je prázdný – nejdřív přidejte kroky'); return; }
  const name = await promptDlg('Uložit postup', 'Název postupu (např. „Měsíční tržby podle obcí“)', ''); if (!name) return;
  const ex = S.recipes.find(r => r.name.toLowerCase() === name.toLowerCase());
  const r = ex || { id: uid(), name };
  r.steps = clone(S.cur.steps); r.updated = Date.now();
  if (!ex) S.recipes.push(r);
  await DB.put('recipes', r); renderProcess(); toast(ex ? 'Postup přepsán' : 'Postup uložen');
};
$('#btnJump').onclick = () => $('.result').scrollIntoView({ behavior: 'smooth' });
$('#btnResExport').onclick = () => exportXlsx(`${S.cur.name} – výstup`, S.result.table);
$('#btnResSave').onclick = async () => {
  const name = await promptDlg('Uložit výsledek jako tabulku', 'Název', `${S.cur.name} – výstup`); if (!name) return;
  const out = S.result.table;
  addTable({ name, columns: [...out.columns], rows: out.rows.map(r => [...r]) });
  toast('Uloženo jako nová tabulka');
};

/* ---------- vyskakovací menu a dialogy ---------- */
const pop = $('#pop');
function showPop(anchor, items) {
  pop.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : `<button type="button" data-i="${i}" class="${it.danger ? 'danger' : ''}">${it.icon ? ico(it.icon) : ''}<span>${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span></button>`).join('');
  pop.hidden = false;
  const r = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
  let x = Math.min(r.left, innerWidth - pw - 8), y = r.bottom + 6;
  if (y + ph > innerHeight - 8) y = Math.max(8, r.top - ph - 6);
  pop.style.left = Math.max(8, x) + 'px'; pop.style.top = y + 'px';
  pop.onclick = e => { const b = e.target.closest('button[data-i]'); if (!b) return; closePop(); items[+b.dataset.i].act(); };
  setTimeout(() => pop.querySelector('button')?.focus({ preventScroll: true }), 0);
}
function closePop() { pop.hidden = true; }
document.addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target)) closePop(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });
window.addEventListener('resize', closePop);
$('.grid-wrap').addEventListener('scroll', closePop, { passive: true });

const dlg = $('#dlg'); let dlgForm = $('#dlgForm');
function openDlg(title, body, okLabel, setup, danger) {
  return new Promise(resolve => {
    const fresh = dlgForm.cloneNode(false); dlgForm.replaceWith(fresh); dlgForm = fresh;
    dlgForm.innerHTML = `<div class="dlg-h">${esc(title)}</div><div class="dlg-f">${body}</div>
      <div class="dlg-a"><button type="button" class="btn" value="cancel" data-cancel>Zrušit</button><button class="btn ${danger ? 'danger' : 'primary'}" value="ok">${esc(okLabel)}</button></div>`;
    setup && setup(dlgForm);
    let res = null;
    dlgForm.onsubmit = e => { e.preventDefault(); const fd = new FormData(dlgForm); res = fd; dlg.close(); };
    $('[data-cancel]', dlgForm).onclick = () => dlg.close();
    dlg.onclose = () => resolve(res);
    dlg.showModal();
    const first = $('input[type=text]', dlgForm); if (first) { first.focus(); first.select(); }
  });
}
async function promptDlg(title, label, value) {
  const f = await openDlg(title, `<label class="fld">${esc(label)}<input type="text" name="v" value="${esc(value)}" required></label>`, 'Uložit');
  return f ? String(f.get('v')).trim() || null : null;
}
async function confirmDlg(title, text, ok) { return !!(await openDlg(title, `<p>${esc(text)}</p>`, ok, null, true)); }

/* ---------- události ---------- */
$$('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
$('#btnImport').onclick = () => $('#fileIn').click();
$('#btnNew').onclick = newTable;
$('#btnMerge').onclick = mergeDialog;
$('#btnHomeMore').onclick = e => homeMenu(e.currentTarget);
$('#fileIn').onchange = e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) importFiles(f); };
$('#backupIn').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importBackup(f); };
const drop = $('#drop');
['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => { if (S.view === 'home' && e.dataTransfer?.types.includes('Files')) { e.preventDefault(); drop.classList.add('over'); } }));
['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { drop.classList.remove('over'); }));
document.addEventListener('drop', e => { if (e.dataTransfer?.files.length) { e.preventDefault(); importFiles([...e.dataTransfer.files]); } });

let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('#btnInstall').hidden = false; });
$('#btnInstall').onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('#btnInstall').hidden = true; };
window.addEventListener('appinstalled', () => { $('#btnInstall').hidden = true; toast('Appka je nainstalovaná'); });

/* ---------- start ---------- */
(async () => {
  try { S.totFn = localStorage.getItem('tabulky-tot') || 'sum'; } catch (_) {}
  $('#totFn').value = S.totFn;
  await DB.open();
  try { navigator.storage?.persist?.(); } catch (_) {}
  [S.tables, S.recipes] = await Promise.all([DB.all('tables'), DB.all('recipes')]);
  history.replaceState({ view: 'home' }, '');
  go('home', false);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
