/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// EXPORT FLUJO DE CAJA CONSOLIDADO → Excel (.xlsx) con formato
// ───────────────────────────────────────────────────────────────────
//   · Hoja "Consolidado" (nivel categoría) que referencia con FÓRMULAS
//     a las hojas de cada empresa.
//   · Una hoja por empresa del consolidado (nivel línea), con filas
//     desplegables (outline) por categoría y meses agrupados por
//     temporada (también desplegables).
// Todas las celdas calculadas son FÓRMULAS Excel (SUMA, resta, saldo
// arrastrado). Inputs editables en azul sobre fondo amarillo.
//
// Reutiliza el árbol `empresasConOverrides` que la app ya calcula, así
// los números cuadran exactamente con lo que se ve en pantalla.
// Usa xlsx-js-style (fork de SheetJS con soporte de estilos).
// ═══════════════════════════════════════════════════════════════════
import * as XLSXns from 'xlsx-js-style';
const XLSX = XLSXns.utils ? XLSXns : (XLSXns.default || XLSXns);

const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function genMonths() {
  const out = [];
  let y = 2026, m = 3;                // Apr-26
  while (out.length < 63) {
    out.push({ label:`${MN[m]}-${String(y).slice(2)}`, y, m, idx:out.length });
    m++; if (m > 11) { m = 0; y++; }
  }
  return out;
}
function seasonOf(mo) { return mo.m >= 6 ? mo.y : mo.y - 1; }

const CAT_ORDER = ['ing_op','ing_nop','egr_var','egr_fijo','egr_nop','imp'];
const CAT_LABEL = {
  ing_op:'· Ingresos Operacionales',
  ing_nop:'· Ingresos No Operacionales',
  egr_var:'· Egresos Operacionales (variables)',
  egr_fijo:'· Costos Fijos / SG&A',
  egr_nop:'· Egresos No Operacionales',
  imp:'· Impuestos',
};
const ING_CATS = ['ing_op','ing_nop'];
const EGR_CATS = ['egr_var','egr_fijo','egr_nop','imp'];

const FMT = '$#,##0;($#,##0);-';
// formato con color por signo: verde positivo, rojo negativo, gris el cero
const FMT_SIGN = '[Green]$#,##0;[Red]($#,##0);-';
const FONT = 'Arial';
const NAVY='1F3864', BLUE='305496', LBLUE='D9E1F2', GRAY='E7E6E6', YELLOW='FFF2CC', BORDERC='D9D9D9', INPUTBLUE='0000FF';

const L = (c0) => XLSX.utils.encode_col(c0);
const ref = (r1, c0) => `${L(c0)}${r1}`;

// ── estilos ─────────────────────────────────────────────────────────
const thin = { style:'thin', color:{ rgb:BORDERC } };
const BORD = { top:thin, bottom:thin, left:thin, right:thin };
const S = {
  title:    { font:{ name:FONT, sz:13, bold:true, color:{rgb:'FFFFFF'} }, fill:{ fgColor:{rgb:NAVY} }, alignment:{ horizontal:'left', vertical:'center' } },
  titleSub: { font:{ name:FONT, sz:10, italic:true, color:{rgb:'FFFFFF'} }, fill:{ fgColor:{rgb:NAVY} }, alignment:{ horizontal:'left', vertical:'center' } },
  seasonHdr:{ font:{ name:FONT, sz:10, bold:true, color:{rgb:'FFFFFF'} }, fill:{ fgColor:{rgb:BLUE} }, alignment:{ horizontal:'center', vertical:'center' }, border:BORD },
  colHdr:   { font:{ name:FONT, sz:9, bold:true, color:{rgb:'FFFFFF'} }, fill:{ fgColor:{rgb:NAVY} }, alignment:{ horizontal:'center', vertical:'center' }, border:BORD },
  concept:  { font:{ name:FONT, sz:10, bold:true, color:{rgb:'FFFFFF'} }, fill:{ fgColor:{rgb:NAVY} }, alignment:{ horizontal:'left', vertical:'center' }, border:BORD },
  catLabel: { font:{ name:FONT, sz:10, bold:true, color:{rgb:NAVY} }, fill:{ fgColor:{rgb:GRAY} }, alignment:{ horizontal:'left' }, border:BORD },
  catNum:   { font:{ name:FONT, sz:10, bold:true }, fill:{ fgColor:{rgb:GRAY} }, alignment:{ horizontal:'right' }, numFmt:FMT, border:BORD },
  lineLabel:{ font:{ name:FONT, sz:10 }, alignment:{ horizontal:'left', indent:1 }, border:BORD },
  linkLabel:{ font:{ name:FONT, sz:10, color:{rgb:'006100'} }, alignment:{ horizontal:'left', indent:2 }, border:BORD },
  linkNum:  { font:{ name:FONT, sz:10, color:{rgb:'006100'} }, alignment:{ horizontal:'right' }, numFmt:FMT, border:BORD },
  input:    { font:{ name:FONT, sz:10, color:{rgb:INPUTBLUE} }, fill:{ fgColor:{rgb:YELLOW} }, alignment:{ horizontal:'right' }, numFmt:FMT, border:BORD },
  formula:  { font:{ name:FONT, sz:10 }, alignment:{ horizontal:'right' }, numFmt:FMT, border:BORD },
  sumLabel: { font:{ name:FONT, sz:10, bold:true }, alignment:{ horizontal:'left' }, border:BORD },
  sumNum:   { font:{ name:FONT, sz:10, bold:true }, alignment:{ horizontal:'right' }, numFmt:FMT, border:BORD },
  flujoLabel:{ font:{ name:FONT, sz:10, bold:true }, fill:{ fgColor:{rgb:GRAY} }, alignment:{ horizontal:'left' }, border:BORD },
  flujoNum: { font:{ name:FONT, sz:10, bold:true }, fill:{ fgColor:{rgb:GRAY} }, alignment:{ horizontal:'right' }, numFmt:FMT_SIGN, border:BORD },
  saldoLabel:{ font:{ name:FONT, sz:10, bold:true }, fill:{ fgColor:{rgb:LBLUE} }, alignment:{ horizontal:'left' }, border:BORD },
  saldoNum: { font:{ name:FONT, sz:10, bold:true }, fill:{ fgColor:{rgb:LBLUE} }, alignment:{ horizontal:'right' }, numFmt:FMT_SIGN, border:BORD },
};

function buildColumns(months, seasons) {
  const cols = [];
  const monthOrder = [];
  let c = 1;
  seasons.forEach(s => {
    const members = [];
    s.months.forEach(mo => {
      cols.push({ kind:'mes', c, label:mo.label, monthIdx:mo.idx });
      monthOrder.push({ c, monthIdx:mo.idx });
      members.push(c);
      c++;
    });
    cols.push({ kind:'temp', c, label:`Temp ${s.key}`, members, seasonKey:s.key });
    c++;
  });
  const tempCols = cols.filter(x => x.kind === 'temp').map(x => x.c);
  cols.push({ kind:'grand', c, label:'TOTAL', members:tempCols });
  return { cols, monthOrder, lastCol:c };
}

function seasonKeyForMonthGroup(cols, i) {
  for (let j = i; j < cols.length; j++) if (cols[j].kind === 'temp') return cols[j].seasonKey;
  return '';
}

// Llena temp/grand de una fila aditiva (con valor cacheado + estilo)
function fillAdditive(cells, num, r1, cols, sty) {
  cols.forEach(col => {
    if (col.kind === 'temp') {
      const first = col.members[0], last = col.members[col.members.length - 1];
      const v = col.members.reduce((a,cc)=>a+(num[ref(r1,cc)]||0),0);
      num[ref(r1,col.c)] = v;
      cells[ref(r1, col.c)] = { t:'n', f:`SUM(${ref(r1, first)}:${ref(r1, last)})`, v, s:sty };
    } else if (col.kind === 'grand') {
      const parts = col.members.map(cc => ref(r1, cc)).join(',');
      const v = col.members.reduce((a,cc)=>a+(num[ref(r1,cc)]||0),0);
      num[ref(r1,col.c)] = v;
      cells[ref(r1, col.c)] = { t:'n', f:`SUM(${parts})`, v, s:sty };
    }
  });
}

// ── construye una hoja de "estado de flujo" (empresa o consolidado) ──
function buildStatement({ title, subtitle, cols, monthOrder, cats, saldoIniValue, saldoIniMonth0Formula, saldoIniMonth0Number }) {
  // cats: [{ cat, lines:[{label,vals}], monthFormula?(mc)->string }]
  const cells = {}; const rows = []; const merges = []; const num = {};
  let r = 0;
  const setLvl = (r0, lvl) => { rows[r0] = { level:lvl }; };
  const catByKey = {}; cats.forEach(c => { catByKey[c.cat] = c; });

  // Fila 1: título (merge sobre toda la fila)
  cells[ref(r+1,0)] = { t:'s', v:title, s:S.title };
  const lastColIdx = cols[cols.length-1].c;
  for (let c=1;c<=lastColIdx;c++) cells[ref(r+1,c)] = { t:'s', v:'', s: c<=4?S.title:S.title };
  if (subtitle) cells[ref(r+1,5)] = { t:'s', v:subtitle, s:S.titleSub };
  merges.push({ s:{r:r,c:0}, e:{r:r,c: subtitle?4:lastColIdx} });
  rows[r] = { level:0, hpx:22 };
  r++;

  // Fila 2: cabecera de temporadas
  const seasonHdrRow = r + 1;
  { let i=0; while(i<cols.length){ const col=cols[i]; if(col.kind==='mes'){ const sk=seasonKeyForMonthGroup(cols,i); let j=i; while(j<cols.length && cols[j].kind!=='temp') j++; cells[ref(seasonHdrRow,cols[i].c)]={t:'s',v:`Temporada ${sk}`,s:S.seasonHdr}; for(let cc=cols[i].c+1;cc<=cols[j].c;cc++) cells[ref(seasonHdrRow,cc)]={t:'s',v:'',s:S.seasonHdr}; merges.push({s:{r:seasonHdrRow-1,c:cols[i].c},e:{r:seasonHdrRow-1,c:cols[j].c}}); i=j+1;} else i++; } }
  cells[ref(seasonHdrRow,0)] = { t:'s', v:'', s:S.seasonHdr };
  setLvl(r,0); r++;

  // Fila 3: etiquetas de columna
  const colHdrRow = r + 1;
  cells[ref(colHdrRow,0)] = { t:'s', v:'Concepto', s:S.concept };
  cols.forEach(col => { cells[ref(colHdrRow,col.c)] = { t:'s', v:col.label, s:S.colHdr }; });
  setLvl(r,0); r++;

  // Saldo inicial caja
  const saldoIniRow = r + 1;
  cells[ref(saldoIniRow,0)] = { t:'s', v:'Saldo inicial caja', s:S.saldoLabel };
  setLvl(r,0); r++;

  // Categorías
  const catRows = {};
  CAT_ORDER.forEach(cat => {
    const def = catByKey[cat] || { lines:[] };
    const catLines = def.lines || [];
    const firstLineRow = r + 1;
    catLines.forEach(ln => {
      const isLink = !!ln.cellFormula;
      cells[ref(r+1,0)] = { t:'s', v:ln.label, s:isLink?S.linkLabel:S.lineLabel };
      monthOrder.forEach((mc,k) => {
        if (isLink) { const v=ln.cellNumber?ln.cellNumber(mc):0; num[ref(r+1,mc.c)]=v; cells[ref(r+1,mc.c)] = { t:'n', f:ln.cellFormula(mc), v, s:S.linkNum }; }
        else { const v=Number(ln.vals[k])||0; num[ref(r+1,mc.c)]=v; cells[ref(r+1,mc.c)] = { t:'n', v, s:S.input }; }
      });
      fillAdditive(cells, num, r+1, cols, isLink?S.linkNum:S.formula);
      setLvl(r,2); r++;
    });
    const lastLineRow = r;
    const subRow = r + 1; catRows[cat] = subRow;
    cells[ref(subRow,0)] = { t:'s', v:CAT_LABEL[cat], s:S.catLabel };
    monthOrder.forEach((mc,k) => {
      if (catLines.length > 0) {
        let v = 0; for (let lr=firstLineRow; lr<=lastLineRow; lr++) v += num[ref(lr,mc.c)]||0;
        num[ref(subRow,mc.c)] = v;
        cells[ref(subRow,mc.c)] = { t:'n', f:`SUM(${ref(firstLineRow,mc.c)}:${ref(lastLineRow,mc.c)})`, v, s:S.catNum };
      } else if (def.monthFormula) {
        const v = def.monthNumber ? def.monthNumber(mc) : 0;
        num[ref(subRow,mc.c)] = v;
        cells[ref(subRow,mc.c)] = { t:'n', f:def.monthFormula(mc), v, s:S.catNum };
      } else {
        num[ref(subRow,mc.c)] = 0;
        cells[ref(subRow,mc.c)] = { t:'n', v:0, s:S.catNum };
      }
    });
    fillAdditive(cells, num, subRow, cols, S.catNum);
    setLvl(r,1); r++;
  });

  // (+) Ingresos del mes
  const ingRow = r + 1;
  cells[ref(ingRow,0)] = { t:'s', v:'(+) Ingresos del mes', s:S.sumLabel };
  monthOrder.forEach(mc => { const v=ING_CATS.reduce((a,c2)=>a+(num[ref(catRows[c2],mc.c)]||0),0); num[ref(ingRow,mc.c)]=v; cells[ref(ingRow,mc.c)] = { t:'n', f:ING_CATS.map(c2=>ref(catRows[c2],mc.c)).join('+'), v, s:S.sumNum }; });
  fillAdditive(cells, num, ingRow, cols, S.sumNum); setLvl(r,0); r++;

  // (−) Egresos del mes
  const egrRow = r + 1;
  cells[ref(egrRow,0)] = { t:'s', v:'(−) Egresos del mes', s:S.sumLabel };
  monthOrder.forEach(mc => { const v=EGR_CATS.reduce((a,c2)=>a+(num[ref(catRows[c2],mc.c)]||0),0); num[ref(egrRow,mc.c)]=v; cells[ref(egrRow,mc.c)] = { t:'n', f:EGR_CATS.map(c2=>ref(catRows[c2],mc.c)).join('+'), v, s:S.sumNum }; });
  fillAdditive(cells, num, egrRow, cols, S.sumNum); setLvl(r,0); r++;

  // (=) Flujo neto
  const flujoRow = r + 1;
  cells[ref(flujoRow,0)] = { t:'s', v:'(=) Flujo neto', s:S.flujoLabel };
  monthOrder.forEach(mc => { const v=(num[ref(ingRow,mc.c)]||0)-(num[ref(egrRow,mc.c)]||0); num[ref(flujoRow,mc.c)]=v; cells[ref(flujoRow,mc.c)] = { t:'n', f:`${ref(ingRow,mc.c)}-${ref(egrRow,mc.c)}`, v, s:S.flujoNum }; });
  fillAdditive(cells, num, flujoRow, cols, S.flujoNum); setLvl(r,0); r++;

  // (=) Saldo final caja  (necesita saldo inicial numérico → se calcula primero)
  const saldoFinRow = r + 1;
  // pre-cálculo numérico del saldo inicial por mes
  const saldoIniNum = {};
  monthOrder.forEach((mc,k) => {
    if (k === 0) saldoIniNum[mc.c] = saldoIniMonth0Number != null ? saldoIniMonth0Number : (Number(saldoIniValue)||0);
    else saldoIniNum[mc.c] = saldoIniNum[monthOrder[k-1].c] + (num[ref(flujoRow,monthOrder[k-1].c)]||0);
  });
  cells[ref(saldoFinRow,0)] = { t:'s', v:'(=) Saldo final caja', s:S.saldoLabel };
  monthOrder.forEach(mc => { const v=(saldoIniNum[mc.c]||0)+(num[ref(flujoRow,mc.c)]||0); num[ref(saldoFinRow,mc.c)]=v; cells[ref(saldoFinRow,mc.c)] = { t:'n', f:`${ref(saldoIniRow,mc.c)}+${ref(flujoRow,mc.c)}`, v, s:S.saldoNum }; });
  cols.forEach(col => {
    if (col.kind === 'temp') { const last=col.members[col.members.length-1]; const v=num[ref(saldoFinRow,last)]||0; num[ref(saldoFinRow,col.c)]=v; cells[ref(saldoFinRow,col.c)]={t:'n',f:`${ref(saldoFinRow,last)}`,v,s:S.saldoNum}; }
    else if (col.kind === 'grand') { const lm=monthOrder[monthOrder.length-1].c; const v=num[ref(saldoFinRow,lm)]||0; num[ref(saldoFinRow,col.c)]=v; cells[ref(saldoFinRow,col.c)]={t:'n',f:`${ref(saldoFinRow,lm)}`,v,s:S.saldoNum}; }
  });
  setLvl(r,0); r++;

  // Saldo inicial: month0 input/formula; monthK = saldo final mes previo
  monthOrder.forEach((mc,k) => {
    const v = saldoIniNum[mc.c]||0; num[ref(saldoIniRow,mc.c)]=v;
    if (k === 0) {
      if (saldoIniMonth0Formula) cells[ref(saldoIniRow,mc.c)] = { t:'n', f:saldoIniMonth0Formula, v, s:S.saldoNum };
      else cells[ref(saldoIniRow,mc.c)] = { t:'n', v, s:S.input };
    } else {
      const prev = monthOrder[k-1].c;
      cells[ref(saldoIniRow,mc.c)] = { t:'n', f:`${ref(saldoFinRow,prev)}`, v, s:S.saldoNum };
    }
  });
  cols.forEach(col => {
    if (col.kind === 'temp') { const first=col.members[0]; const v=num[ref(saldoIniRow,first)]||0; num[ref(saldoIniRow,col.c)]=v; cells[ref(saldoIniRow,col.c)]={t:'n',f:`${ref(saldoIniRow,first)}`,v,s:S.saldoNum}; }
    else if (col.kind === 'grand') { const fm=monthOrder[0].c; const v=num[ref(saldoIniRow,fm)]||0; num[ref(saldoIniRow,col.c)]=v; cells[ref(saldoIniRow,col.c)]={t:'n',f:`${ref(saldoIniRow,fm)}`,v,s:S.saldoNum}; }
  });

  return { cells, rows, merges, num, lastRow:r, lastCol:lastColIdx, catRows, saldoIniRow, flujoRow, saldoFinRow };
}

function toSheet({ cells, rows, merges, lastRow, lastCol, cols }) {
  const ws = {};
  Object.keys(cells).forEach(addr => { ws[addr] = cells[addr]; });
  ws['!ref'] = `A1:${L(lastCol)}${lastRow}`;
  const wcols = [{ wch:36 }];
  for (let c = 1; c <= lastCol; c++) {
    const meta = cols.find(x => x.c === c);
    const lvl = meta && meta.kind === 'mes' ? 1 : 0;
    wcols[c] = { wch: meta && meta.kind === 'grand' ? 13 : 11.5, level:lvl };
  }
  ws['!cols'] = wcols;
  ws['!rows'] = rows.map(rr => rr || { level:0 });
  if (merges.length) ws['!merges'] = merges;
  // congelar: fila de meses (3) + columna concepto (A)
  ws['!freeze'] = { xSplit:1, ySplit:3, topLeftCell:'B4', activePane:'bottomRight', state:'frozen' };
  return ws;
}

// ═══════════════════════════════════════════════════════════════════
export function exportarFlujoConsolidado({ empresasConOverrides, empNames, saldoIniPorEmp, lastSeasonStartYear = null, fileName }) {
  const allMonths = genMonths();
  // lastSeasonStartYear null → flujo completo (hasta la última temporada proyectada)
  const months = lastSeasonStartYear == null ? allMonths : allMonths.filter(mo => seasonOf(mo) <= lastSeasonStartYear);
  const seasonsMap = {};
  months.forEach(mo => {
    const sy = seasonOf(mo);
    const key = `${sy}-${sy+1}`;
    if (!seasonsMap[key]) seasonsMap[key] = { key, sy, months:[] };
    seasonsMap[key].months.push(mo);
  });
  const seasons = Object.values(seasonsMap).sort((a,b)=>a.sy-b.sy);
  const { cols, monthOrder } = buildColumns(months, seasons);

  const wb = XLSX.utils.book_new();

  // nombres de hoja únicos
  const sheetName = {}; const usedNames = new Set();
  empNames.forEach(n => {
    let nm = n.replace(/[\\/?*\[\]:]/g, '').slice(0, 28);
    let base = nm, i = 2;
    while (usedNames.has(nm)) { nm = `${base}_${i++}`.slice(0,31); }
    usedNames.add(nm); sheetName[n] = nm;
  });

  // hojas empresa
  const empBuilt = {};
  empNames.forEach(n => {
    const emp = empresasConOverrides[n];
    const cats = CAT_ORDER.map(cat => {
      const sec = (emp.sections || []).find(s => s.cat === cat);
      const lines = [];
      if (sec) sec.lines.forEach(ln => {
        const vals = months.map(mo => Number(ln.proy[mo.idx]) || 0);
        if (vals.some(v => v !== 0)) lines.push({ label:ln.label, vals });
      });
      return { cat, lines };
    });
    empBuilt[n] = buildStatement({
      title:`${emp.emoji || ''} ${n}`.trim(),
      subtitle: emp.desc || '',
      cols, monthOrder, cats,
      saldoIniValue: Number(saldoIniPorEmp?.[n]) || 0,
    });
  });

  // hoja consolidado (categoría) → una línea desplegable por empresa que
  // enlaza a su hoja (fórmula + valor cacheado). El subtotal suma esas líneas.
  const consCats = CAT_ORDER.map(cat => ({
    cat,
    lines: empNames.map(n => ({
      label: `${empresasConOverrides[n].emoji || ''} ${n}`.trim(),
      cellFormula: (mc) => `'${sheetName[n]}'!${ref(empBuilt[n].catRows[cat], mc.c)}`,
      cellNumber:  (mc) => empBuilt[n].num[ref(empBuilt[n].catRows[cat], mc.c)] || 0,
    })),
  }));
  const saldoIniCons = monthOrder[0] && empNames.map(n => `'${sheetName[n]}'!${ref(empBuilt[n].saldoIniRow, monthOrder[0].c)}`).join('+');
  const saldoIniConsNum = monthOrder[0] ? empNames.reduce((a,n)=>a+(empBuilt[n].num[ref(empBuilt[n].saldoIniRow, monthOrder[0].c)]||0),0) : 0;
  const cons = buildStatement({
    title:'🏛 Consolidado Grupo Mediterra',
    subtitle:`${empNames.length} empresas · Apr-26 → ${months[months.length-1].label}`,
    cols, monthOrder, cats:consCats,
    saldoIniMonth0Formula: saldoIniCons,
    saldoIniMonth0Number: saldoIniConsNum,
  });
  XLSX.utils.book_append_sheet(wb, toSheet({ ...cons, cols }), 'Consolidado');

  empNames.forEach(n => {
    XLSX.utils.book_append_sheet(wb, toSheet({ ...empBuilt[n], cols }), sheetName[n]);
  });

  // Consolidado = primera pestaña y activa al abrir; forzar recálculo
  wb.Workbook = { ...(wb.Workbook||{}), Views:[{ activeTab:0 }], CalcPr:{ fullCalcOnLoad:true } };

  const fname = fileName || `Flujo_Consolidado_Mediterra_${months[months.length-1].label}.xlsx`;
  XLSX.writeFile(wb, fname);
  return fname;
}
