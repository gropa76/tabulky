'use strict';
/* Zpracování tabulky po krocích. Kroky odkazují na sloupce NÁZVEM,
   takže uložený postup jde použít i na jinou tabulku. */
const Pipeline = (() => {
  const num = Formula.num;
  const TYPES = {
    filter:   { label: 'Filtrovat řádky',        hint: 'Nechá jen řádky, které splňují podmínku' },
    group:    { label: 'Seskupit a spočítat',    hint: 'Součty, průměry, počty podle skupin' },
    pivot:    { label: 'Kontingenční tabulka',   hint: 'Řádky × sloupce s hodnotami' },
    subtotal: { label: 'Přehled s mezisoučty',   hint: 'Např. odběratel → zboží, pod každým odběratelem celkem' },
    calc:     { label: 'Výpočet + − × ÷',         hint: 'Nový nebo přepočítaný sloupec' },
    datepart: { label: 'Měsíc / rok z data',     hint: 'Vytáhne z data měsíc, čtvrtletí nebo rok' },
    sort:     { label: 'Seřadit',                hint: 'Podle sloupce vzestupně nebo sestupně' },
    select:   { label: 'Vybrat sloupce',         hint: 'Ponechá jen zaškrtnuté sloupce' },
    rename:   { label: 'Přejmenovat sloupec',    hint: '' },
    dedupe:   { label: 'Odstranit duplicity',    hint: 'Smaže opakující se řádky' },
    limit:    { label: 'Prvních N řádků',        hint: 'Např. TOP 10 po seřazení' },
  };
  const AGG = { sum: 'Součet', avg: 'Průměr', count: 'Počet', min: 'Minimum', max: 'Maximum', distinct: 'Počet různých' };
  const OPS = { eq: 'je rovno', ne: 'není rovno', contains: 'obsahuje', ncontains: 'neobsahuje', starts: 'začíná na', gt: 'je větší než', ge: 'je větší nebo rovno', lt: 'je menší než', le: 'je menší nebo rovno', empty: 'je prázdné', nempty: 'není prázdné' };
  const CALC_OPS = { '+': '+', '-': '−', '*': '×', '/': '÷' };
  const PARTS = { month: 'Měsíc (2026-11)', monthname: 'Název měsíce (listopad)', quarter: 'Čtvrtletí (2026 Q4)', year: 'Rok', week: 'Týden (2026-T48)', weekday: 'Den v týdnu', day: 'Datum bez času' };
  const MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
  const DAYS = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
  const pad = n => String(n).padStart(2, '0');
  const r6 = x => Math.round(x * 1e6) / 1e6;
  const empty = v => v == null || v === '';
  const coll = new Intl.Collator('cs', { numeric: true, sensitivity: 'base' });

  function parseDate(v) {
    if (v instanceof Date) return v;
    if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5) + new Date().getTimezoneOffset() * 6e4);
    if (typeof v !== 'string') return null;
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v); if (m) return new Date(+m[1], m[2] - 1, +m[3]);
    m = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/.exec(v); if (m) return new Date(+m[3], m[2] - 1, +m[1]);
    return null;
  }
  function isoWeek(d) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y = t.getUTCFullYear(); return [y, Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7)]; }

  function compareVals(a, b) {
    if (empty(a) && empty(b)) return 0; if (empty(a)) return 1; if (empty(b)) return -1;
    const x = num(a), y = num(b);
    if (x != null && y != null) return x - y;
    return coll.compare(String(a), String(b));
  }

  function aggregate(fn, vals) {
    if (fn === 'count') return vals.filter(v => !empty(v)).length;
    if (fn === 'distinct') return new Set(vals.filter(v => !empty(v)).map(v => String(v).toLowerCase())).size;
    const n = vals.map(num).filter(x => x != null);
    if (fn === 'sum') return r6(n.reduce((s, x) => s + x, 0));
    if (!n.length) return null;
    if (fn === 'avg') return r6(n.reduce((s, x) => s + x, 0) / n.length);
    if (fn === 'min') return Math.min(...n);
    if (fn === 'max') return Math.max(...n);
    return null;
  }

  // které sloupce krok potřebuje
  function colsUsed(s) {
    switch (s.type) {
      case 'filter': case 'sort': case 'rename': case 'datepart': return [s.col];
      case 'group': return [...(s.by || []), ...(s.aggs || []).filter(a => a.fn !== 'count' || a.col).map(a => a.col)];
      case 'pivot': return [s.row, s.col, s.fn === 'count' ? null : s.val];
      case 'subtotal': return [s.group, s.sub || null, ...(s.vals || []), ...(s.extra || [])];
      case 'calc': return [s.a?.t === 'col' ? s.a.v : null, s.b?.t === 'col' ? s.b.v : null, s.dest === 'over' ? s.target : null];
      case 'select': case 'dedupe': return s.cols || [];
      default: return [];
    }
  }

  function defaults(type, cols, rows) {
    const numCols = cols.filter((c, i) => rows.slice(0, 50).some(r => typeof r[i] === 'number'));
    const dateCols = cols.filter((c, i) => !numCols.includes(c) && rows.slice(0, 20).some(r => typeof r[i] === 'string' && parseDate(r[i])));
    const txtCols = cols.filter(c => !numCols.includes(c) && !dateCols.includes(c));
    const n0 = numCols[numCols.length - 1] || cols[0] || '', t0 = txtCols[0] || cols[0] || '';
    const d0 = dateCols[0] || cols[0] || '';
    switch (type) {
      case 'filter': return { type, col: t0, op: 'eq', val: '' };
      case 'group': return { type, by: t0 ? [t0] : [], aggs: [{ fn: 'sum', col: n0 }] };
      case 'pivot': return { type, row: t0, col: txtCols[1] || t0, val: n0, fn: 'sum' };
      case 'subtotal': return { type, group: t0, sub: txtCols.find(c => c !== t0 && c !== txtCols[0]) || txtCols[1] || '', vals: numCols.length ? [n0] : [], extra: [], fn: 'sum', cnt: false };
      case 'calc': return { type, dest: 'new', name: 'Výpočet', target: n0, a: { t: 'col', v: numCols[0] || cols[0] || '' }, op: '*', b: { t: 'num', v: 1 }, round: '' };
      case 'datepart': return { type, col: d0, part: 'month', name: 'Měsíc' };
      case 'sort': return { type, col: n0, dir: 'desc' };
      case 'select': return { type, cols: [...cols] };
      case 'rename': return { type, col: cols[0] || '', to: '' };
      case 'dedupe': return { type, cols: [] };
      case 'limit': return { type, n: 10 };
    }
  }

  function uniqueName(cols, name) { let n = name || 'Sloupec', i = 2; while (cols.includes(n)) n = `${name} (${i++})`; return n; }

  function apply(s, t) {
    const ix = c => t.columns.indexOf(c);
    const cols = t.columns, rows = t.rows;
    switch (s.type) {
      case 'filter': {
        const i = ix(s.col), q = s.val ?? '', qs = String(q).toLowerCase().trim(), qn = num(q);
        const test = v => {
          const vs = v == null ? '' : String(v).toLowerCase().trim(), vn = num(v);
          switch (s.op) {
            case 'eq': return qn != null && vn != null ? vn === qn : vs === qs;
            case 'ne': return qn != null && vn != null ? vn !== qn : vs !== qs;
            case 'contains': return vs.includes(qs);
            case 'ncontains': return !vs.includes(qs);
            case 'starts': return vs.startsWith(qs);
            case 'empty': return vs === '';
            case 'nempty': return vs !== '';
            default: {
              let a = vn, b = qn;
              if (a == null || b == null) { const da = parseDate(v), db = parseDate(q); if (!da || !db) return false; a = +da; b = +db; }
              return s.op === 'gt' ? a > b : s.op === 'ge' ? a >= b : s.op === 'lt' ? a < b : a <= b;
            }
          }
        };
        return { columns: cols, rows: rows.filter(r => test(r[i])) };
      }
      case 'group': {
        const by = (s.by || []).map(ix), aggs = s.aggs || [];
        const groups = new Map();
        for (const r of rows) {
          const key = JSON.stringify(by.map(i => r[i] == null ? '' : String(r[i]).trim()));
          if (!groups.has(key)) groups.set(key, { first: r, list: [] });
          groups.get(key).list.push(r);
        }
        const outCols = [...s.by];
        aggs.forEach(a => outCols.push(uniqueName(outCols, a.fn === 'count' && !a.col ? 'Počet řádků' : `${AGG[a.fn]} – ${a.col}`)));
        const out = [...groups.values()].map(g => [...by.map(i => g.first[i]), ...aggs.map(a => a.fn === 'count' && !a.col ? g.list.length : aggregate(a.fn, g.list.map(r => r[ix(a.col)])))]);
        return { columns: outCols, rows: out };
      }
      case 'pivot': {
        const ri = ix(s.row), ci = ix(s.col), vi = ix(s.val);
        const rk = [], ck = [], cells = new Map();
        const k = v => v == null || v === '' ? '(prázdné)' : String(v);
        for (const r of rows) {
          const a = k(r[ri]), b = k(r[ci]);
          if (!rk.includes(a)) rk.push(a); if (!ck.includes(b)) ck.push(b);
          const key = a + '\u0000' + b; if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(vi >= 0 ? r[vi] : 1);
        }
        rk.sort(coll.compare); ck.sort(coll.compare);
        const fn = s.fn || 'sum';
        const out = rk.map(a => {
          const line = ck.map(b => { const v = cells.get(a + '\u0000' + b); return v ? aggregate(fn, v) : null; });
          const all = ck.flatMap(b => cells.get(a + '\u0000' + b) || []);
          return [a, ...line, aggregate(fn, all)];
        });
        const totals = ck.map(b => aggregate(fn, rk.flatMap(a => cells.get(a + '\u0000' + b) || [])));
        out.push(['Celkem', ...totals, aggregate(fn, [...cells.values()].flat())]);
        return { columns: [s.row, ...ck, 'Celkem'], rows: out };
      }
      case 'subtotal': {
        const gi = ix(s.group), si = s.sub ? ix(s.sub) : -1, vals = s.vals || [], vi = vals.map(ix), fn = s.fn || 'sum';
        const k = v => v == null || v === '' ? '(prázdné)' : String(v).trim();
        const calc = list => [...(s.cnt ? [list.length] : []), ...vi.map(i => aggregate(fn, list.map(r => r[i])))];
        const xi = (s.extra || []).map(ix);
        const info = list => xi.map(i => { const u = [...new Set(list.map(r => r[i]).filter(v => v != null && v !== '').map(v => String(v).trim()))]; return u.length ? (u.length > 3 ? u.slice(0, 3).join(', ') + ' …' : u.join(', ')) : null; });
        const groups = new Map();
        for (const r of rows) { const g = k(r[gi]); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); }
        const out = [];
        for (const g of [...groups.keys()].sort(coll.compare)) {
          const list = groups.get(g);
          if (si >= 0) {
            const subs = new Map();
            for (const r of list) { const x = k(r[si]); if (!subs.has(x)) subs.set(x, []); subs.get(x).push(r); }
            const ex = info(list);
            for (const x of [...subs.keys()].sort(coll.compare)) out.push([g, ...ex, x, ...calc(subs.get(x))]);
            out.push([`Celkem ${g}`, ...ex, null, ...calc(list)]);
          } else out.push([g, ...info(list), ...calc(list)]);
        }
        out.push(['CELKEM', ...xi.map(() => null), ...(si >= 0 ? [null] : []), ...calc(rows)]);
        const name = v => fn === 'sum' ? v : `${AGG[fn]} – ${v}`;
        const outCols = [s.group, ...(s.extra || []), ...(si >= 0 ? [s.sub] : []), ...(s.cnt ? ['Počet řádků'] : []), ...vals.map(name)];
        const uniq = []; outCols.forEach(c => uniq.push(uniqueName(uniq, c)));
        return { columns: uniq, rows: out, totals: true };
      }
      case 'calc': {
        const val = (o, r) => o.t === 'col' ? num(r[ix(o.v)]) : num(o.v);
        const d = s.round === '' || s.round == null ? null : +s.round;
        const res = rows.map(r => {
          const a = val(s.a, r), b = val(s.b, r);
          if (a == null || b == null) return null;
          let x = s.op === '+' ? a + b : s.op === '-' ? a - b : s.op === '*' ? a * b : b === 0 ? null : a / b;
          if (x == null) return null;
          return d == null ? r6(x) : Math.round((x + Number.EPSILON) * 10 ** d) / 10 ** d;
        });
        if (s.dest === 'over') { const i = ix(s.target); return { columns: cols, rows: rows.map((r, k) => { const n = [...r]; n[i] = res[k]; return n; }) }; }
        return { columns: [...cols, uniqueName(cols, s.name || 'Výpočet')], rows: rows.map((r, k) => [...r, res[k]]) };
      }
      case 'datepart': {
        const i = ix(s.col);
        const f = v => {
          const d = parseDate(v); if (!d) return null;
          switch (s.part) {
            case 'month': return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
            case 'monthname': return MONTHS[d.getMonth()];
            case 'quarter': return `${d.getFullYear()} Q${Math.floor(d.getMonth() / 3) + 1}`;
            case 'year': return d.getFullYear();
            case 'week': { const [y, w] = isoWeek(d); return `${y}-T${pad(w)}`; }
            case 'weekday': return DAYS[d.getDay()];
            default: return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          }
        };
        return { columns: [...cols, uniqueName(cols, s.name || PARTS[s.part])], rows: rows.map(r => [...r, f(r[i])]) };
      }
      case 'sort': { const i = ix(s.col), m = s.dir === 'desc' ? -1 : 1; return { columns: cols, rows: [...rows].sort((a, b) => { const c = compareVals(a[i], b[i]); return empty(a[i]) || empty(b[i]) ? c : c * m; }) }; }
      case 'select': { const keep = cols.filter(c => (s.cols || []).includes(c)); const is = keep.map(ix); return { columns: keep, rows: rows.map(r => is.map(i => r[i])) }; }
      case 'rename': { const out = [...cols]; const i = ix(s.col); if (s.to && s.to.trim()) out[i] = uniqueName(cols.filter((_, k) => k !== i), s.to.trim()); return { columns: out, rows }; }
      case 'dedupe': {
        const is = (s.cols && s.cols.length ? s.cols : cols).map(ix), seen = new Set();
        return { columns: cols, rows: rows.filter(r => { const k = JSON.stringify(is.map(i => r[i] == null ? '' : String(r[i]).trim().toLowerCase())); if (seen.has(k)) return false; seen.add(k); return true; }) };
      }
      case 'limit': return { columns: cols, rows: rows.slice(0, Math.max(0, parseInt(s.n, 10) || 0)) };
    }
    return t;
  }

  // vrací výsledek + stav každého kroku (sloupce před krokem, chybějící sloupce, chyba)
  function run(input, steps) {
    let cur = { columns: [...input.columns], rows: input.rows };
    const states = []; let stopped = false;
    for (const s of steps) {
      const before = cur.columns;
      if (stopped) { states.push({ cols: before, skipped: true }); continue; }
      const missing = colsUsed(s).filter(c => c != null && c !== '' && !before.includes(c));
      const blank = colsUsed(s).some(c => c === '');
      if (missing.length) { states.push({ cols: before, missing }); stopped = true; continue; }
      if (blank) { states.push({ cols: before, error: 'Vyberte sloupec.' }); stopped = true; continue; }
      try { cur = apply(s, cur); cur.totals = !!cur.totals && s.type === 'subtotal'; states.push({ cols: before, count: cur.rows.length }); }
      catch (e) { states.push({ cols: before, error: String(e && e.message || e) }); stopped = true; }
    }
    return { table: cur, states, ok: !stopped };
  }

  return { TYPES, AGG, OPS, CALC_OPS, PARTS, defaults, run, colsUsed, parseDate, compareVals };
})();
