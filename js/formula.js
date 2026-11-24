'use strict';
/* Vzorce jako v Excelu: =B2*C2, =SUMA(B2:B20), =ZAOKROUHLIT(B2*1,21;2), =KDYŽ(B2>100;"ano";"ne")
   Řádek 1 = záhlaví, data začínají řádkem 2. */
const Formula = (() => {
  const colLetter = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const colIndex = L => { let n = 0; for (const ch of L.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const ERR = e => ({ err: e });
  const isErr = v => !!v && typeof v === 'object' && !Array.isArray(v) && 'err' in v;

  // "1 234,50 Kč" -> 1234.5 ; vrací null, když to není číslo
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v == null || v === '') return null;
    let s = String(v).replace(/[\s ]/g, '').replace(/kč|czk|€|eur/gi, '');
    if (/^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '');
    s = s.replace(',', '.');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
    return parseFloat(s);
  }

  // co uživatel napsal do buňky -> uložená hodnota
  function parseInput(str) {
    if (str == null) return null;
    const s = String(str).trim();
    if (s === '') return null;
    if (s[0] === '=' && s.length > 1) return s;
    if (/^-?[\d\s .,]+$/.test(s)) { const n = num(s); if (n != null) return n; }
    return s;
  }

  function tokenize(src) {
    const t = []; let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
      const rest = src.slice(i); let m;
      if (rest.startsWith('#REF!')) { t.push({ k: 'err', v: '#REF!' }); i += 5; continue; }
      if ((m = /^[A-Za-zÀ-ž_][A-Za-zÀ-ž_.0-9]*(?=\s*\()/.exec(rest))) { t.push({ k: 'fn', v: m[0].toUpperCase() }); i += m[0].length; continue; }
      if ((m = /^\$?([A-Za-z]{1,3})\$?(\d+)(?::\$?([A-Za-z]{1,3})\$?(\d+))?/.exec(rest))) {
        const a = { c: colIndex(m[1]), r: +m[2] };
        if (m[3]) t.push({ k: 'range', a, b: { c: colIndex(m[3]), r: +m[4] } }); else t.push({ k: 'ref', a });
        i += m[0].length; continue;
      }
      if ((m = /^\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?/.exec(rest))) { t.push({ k: 'num', v: parseFloat(m[0].replace(',', '.')) }); i += m[0].length; continue; }
      if (c === '"') { const j = src.indexOf('"', i + 1); if (j < 0) throw ERR('#CHYBA'); t.push({ k: 'str', v: src.slice(i + 1, j) }); i = j + 1; continue; }
      if (c === ';' || c === ',') { t.push({ k: 'sep' }); i++; continue; }
      if ((m = /^(<=|>=|<>)/.exec(rest))) { t.push({ k: 'op', v: m[0] }); i += 2; continue; }
      if ('+-*/^()%&<>='.includes(c)) { t.push({ k: 'op', v: c }); i++; continue; }
      throw ERR('#CHYBA');
    }
    return t;
  }

  function toN(v) {
    if (isErr(v)) throw v;
    if (Array.isArray(v)) throw ERR('#HODNOTA');
    if (v == null || v === '') return 0;
    const n = num(v);
    if (n == null) throw ERR('#HODNOTA');
    return n;
  }
  const toS = v => { if (isErr(v)) throw v; if (v == null) return ''; if (v === true) return 'PRAVDA'; if (v === false) return 'NEPRAVDA'; return String(v); };

  function arith(a, b, o) {
    const x = toN(a), y = toN(b);
    switch (o) {
      case '+': return x + y;
      case '-': return x - y;
      case '*': return x * y;
      case '/': if (y === 0) throw ERR('#DĚLENÍ0'); return x / y;
      case '^': return Math.pow(x, y);
    }
  }
  function compare(a, b, o) {
    if (isErr(a)) throw a; if (isErr(b)) throw b;
    const x = num(a), y = num(b);
    let d;
    if (x != null && y != null) d = x - y;
    else d = toS(a).toLowerCase().localeCompare(toS(b).toLowerCase(), 'cs');
    return { '=': d === 0, '<>': d !== 0, '<': d < 0, '>': d > 0, '<=': d <= 0, '>=': d >= 0 }[o];
  }
  function nums(args) {
    const out = [];
    for (const a of args) {
      if (Array.isArray(a)) { for (const v of a) { if (isErr(v)) throw v; if (typeof v === 'number') out.push(v); } }
      else { if (isErr(a)) throw a; const n = num(a); if (n != null) out.push(n); }
    }
    return out;
  }
  const truthy = v => { if (isErr(v)) throw v; if (typeof v === 'boolean') return v; const n = num(v); return n != null ? n !== 0 : !!v; };

  function call(name, args) {
    const n = name.normalize('NFD').replace(/[̀-ͯ]/g, '');
    switch (n) {
      case 'SUM': case 'SUMA': return nums(args).reduce((s, x) => s + x, 0);
      case 'AVERAGE': case 'PRUMER': { const a = nums(args); if (!a.length) throw ERR('#DĚLENÍ0'); return a.reduce((s, x) => s + x, 0) / a.length; }
      case 'MIN': { const a = nums(args); return a.length ? Math.min(...a) : 0; }
      case 'MAX': { const a = nums(args); return a.length ? Math.max(...a) : 0; }
      case 'COUNT': case 'POCET': return nums(args).length;
      case 'COUNTA': case 'POCET2': { let c = 0; for (const a of args) for (const v of (Array.isArray(a) ? a : [a])) if (v != null && v !== '') c++; return c; }
      case 'ROUND': case 'ZAOKROUHLIT': { const d = args.length > 1 ? toN(args[1]) : 0; const p = Math.pow(10, d); return Math.round((toN(args[0]) + Number.EPSILON) * p) / p; }
      case 'ABS': return Math.abs(toN(args[0]));
      case 'IF': case 'KDYZ': return truthy(args[0]) ? (args.length > 1 ? args[1] : true) : (args.length > 2 ? args[2] : false);
      case 'CONCAT': case 'CONCATENATE': case 'CONCATENATE2': case 'SPOJIT': return args.map(a => Array.isArray(a) ? a.map(toS).join('') : toS(a)).join('');
      default: throw ERR('#NÁZEV?');
    }
  }

  // getCell(r = číslo řádku v Excelu, c = index sloupce)
  function evaluate(src, getCell) {
    let t, p = 0;
    try { t = tokenize(src); } catch (e) { return isErr(e) ? e : ERR('#CHYBA'); }
    const isOp = v => t[p] && t[p].k === 'op' && t[p].v === v;
    const next = () => t[p++];
    function cmp() { let a = add(); while (t[p] && t[p].k === 'op' && ['=', '<', '>', '<=', '>=', '<>'].includes(t[p].v)) { const o = next().v; a = compare(a, add(), o); } return a; }
    function add() { let a = mul(); while (isOp('+') || isOp('-') || isOp('&')) { const o = next().v; const b = mul(); a = o === '&' ? toS(a) + toS(b) : arith(a, b, o); } return a; }
    function mul() { let a = pow(); while (isOp('*') || isOp('/')) { const o = next().v; a = arith(a, pow(), o); } return a; }
    function pow() { let a = un(); while (isOp('^')) { next(); a = arith(a, un(), '^'); } return a; }
    function un() {
      if (isOp('-')) { next(); return -toN(un()); }
      if (isOp('+')) { next(); return un(); }
      let v = prim(); while (isOp('%')) { next(); v = toN(v) / 100; } return v;
    }
    function prim() {
      const k = next(); if (!k) throw ERR('#CHYBA');
      if (k.k === 'num' || k.k === 'str') return k.v;
      if (k.k === 'err') throw ERR(k.v);
      if (k.k === 'ref') return getCell(k.a.r, k.a.c);
      if (k.k === 'range') {
        const out = [];
        for (let r = Math.min(k.a.r, k.b.r); r <= Math.max(k.a.r, k.b.r); r++)
          for (let c = Math.min(k.a.c, k.b.c); c <= Math.max(k.a.c, k.b.c); c++) out.push(getCell(r, c));
        return out;
      }
      if (k.k === 'op' && k.v === '(') { const v = cmp(); if (!isOp(')')) throw ERR('#CHYBA'); next(); return v; }
      if (k.k === 'fn') {
        if (!isOp('(')) throw ERR('#CHYBA'); next();
        const args = [];
        if (!isOp(')')) { args.push(cmp()); while (t[p] && t[p].k === 'sep') { next(); args.push(cmp()); } }
        if (!isOp(')')) throw ERR('#CHYBA'); next();
        return call(k.v, args);
      }
      throw ERR('#CHYBA');
    }
    try {
      const v = cmp();
      if (p < t.length) return ERR('#CHYBA');
      if (Array.isArray(v)) return v.length === 1 ? v[0] : ERR('#HODNOTA');
      if (typeof v === 'number' && !isFinite(v)) return ERR('#ČÍSLO');
      return v;
    } catch (e) { return isErr(e) ? e : ERR(e instanceof RangeError ? '#CYKLUS' : '#CHYBA'); }
  }

  // Výpočet všech buněk tabulky (s mezipamětí a hlídáním zacyklení)
  function evaluator(table) {
    const cache = new Map(), stack = new Set();
    function get(r, c) {
      const row = table.rows[r];
      const v = row ? row[c] : null;
      if (typeof v !== 'string' || v[0] !== '=') return v ?? null;
      const key = r * 4096 + c;
      if (cache.has(key)) return cache.get(key);
      if (stack.has(key)) return ERR('#CYKLUS');
      stack.add(key);
      let res;
      try {
        res = evaluate(v.slice(1), (R, C) => {
          if (R === 1) return table.columns[C] ?? null;
          const ri = R - 2;
          if (ri < 0 || ri >= table.rows.length || C < 0 || C >= table.columns.length) return null;
          return get(ri, C);
        });
      } catch (e) { res = ERR('#CYKLUS'); }
      stack.delete(key); cache.set(key, res);
      return res;
    }
    return { get };
  }

  const display = v => isErr(v) ? v.err : v === true ? 'PRAVDA' : v === false ? 'NEPRAVDA' : v;

  // Tabulka jen s hodnotami (pro zpracování a export)
  function materialize(table) {
    const ev = evaluator(table);
    return { columns: [...table.columns], rows: table.rows.map((row, r) => table.columns.map((_, c) => display(ev.get(r, c)))) };
  }

  // Přepis odkazů ve vzorcích při vložení/smazání/přesunu řádků a sloupců
  const REF = /("[^"]*")|(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?::(\$?)([A-Za-z]{1,3})(\$?)(\d+))?(?![\w(])/g;
  function rewrite(f, mr, mc) {
    return '=' + f.slice(1).replace(REF, (m, s, ca, L1, ra, R1, cb, L2, rb, R2) => {
      if (s) return s;
      const one = (L, R, cAbs, rAbs, mode) => { const c = mc(colIndex(L), mode, !!cAbs), r = mr(+R, mode, !!rAbs); return c == null || r == null || r < 1 || c < 0 ? null : { c, r }; };
      const out = (cA, c, rA, r) => `${cA}${colLetter(c)}${rA}${r}`;
      if (L2) {
        const a = one(L1, R1, ca, ra, 'start'), b = one(L2, R2, cb, rb, 'end');
        if (!a || !b || a.r > b.r || a.c > b.c) return '#REF!';
        return out(ca, a.c, ra, a.r) + ':' + out(cb, b.c, rb, b.r);
      }
      const a = one(L1, R1, ca, ra, 'single');
      return a ? out(ca, a.c, ra, a.r) : '#REF!';
    });
  }
  const isF = v => typeof v === 'string' && v[0] === '=';
  function eachFormula(table, fn) { for (const row of table.rows) for (let c = 0; c < row.length; c++) if (isF(row[c])) row[c] = fn(row[c]); }
  const id = x => x;
  const insMap = n => x => x >= n ? x + 1 : x;
  const delMap = n => (x, mode) => mode === 'single' ? (x === n ? null : x > n ? x - 1 : x) : mode === 'start' ? (x > n ? x - 1 : x) : (x >= n ? x - 1 : x);

  const adjust = {
    insertRow: (t, i) => eachFormula(t, f => rewrite(f, insMap(i + 2), id)),
    deleteRow: (t, i) => eachFormula(t, f => rewrite(f, delMap(i + 2), id)),
    insertCol: (t, i) => eachFormula(t, f => rewrite(f, id, insMap(i))),
    deleteCol: (t, i) => eachFormula(t, f => rewrite(f, id, delMap(i))),
    moveRow: (row, dr) => { for (let c = 0; c < row.length; c++) if (isF(row[c])) row[c] = rewrite(row[c], (x, m, abs) => abs ? x : x + dr, id); },
  };

  return { colLetter, colIndex, num, parseInput, evaluate, evaluator, materialize, display, isErr, adjust };
})();
