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
// [Color10] = verde oscuro (008000), legible; [Green] de Excel es verde
// fosforescente (00FF00) e ilegible sobre blanco.
// formato con color por signo: verde positivo, rojo negativo
const FMT_SIGN = '[Color10]$#,##0;[Red]($#,##0);-';
// formato por naturaleza: ingresos siempre verde, egresos siempre rojo
const FMT_GREEN = '[Color10]$#,##0;[Color10]($#,##0);-';
const FMT_RED   = '[Red]$#,##0;[Red]($#,##0);-';
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
  catNumIng:{ font:{ name:FONT, sz:10, bold:true }, fill:{ fgColor:{rgb:GRAY} }, alignment:{ horizontal:'right' }, numFmt:FMT_GREEN, border:BORD },
  catNumEgr:{ font:{ name:FONT, sz:10, bold:true }, fill:{ fgColor:{rgb:GRAY} }, alignment:{ horizontal:'right' }, numFmt:FMT_RED, border:BORD },
  lineLabel:{ font:{ name:FONT, sz:10 }, alignment:{ horizontal:'left', indent:1 }, border:BORD },
  linkLabel:{ font:{ name:FONT, sz:10 }, alignment:{ horizontal:'left', indent:2 }, border:BORD },
  linkNumIng:{ font:{ name:FONT, sz:10 }, alignment:{ horizontal:'right' }, numFmt:FMT_GREEN, border:BORD },
  linkNumEgr:{ font:{ name:FONT, sz:10 }, alignment:{ horizontal:'right' }, numFmt:FMT_RED, border:BORD },
  input:    { font:{ name:FONT, sz:10, color:{rgb:INPUTBLUE} }, fill:{ fgColor:{rgb:YELLOW} }, alignment:{ horizontal:'right' }, numFmt:FMT, border:BORD },
  formulaIng:{ font:{ name:FONT, sz:10 }, alignment:{ horizontal:'right' }, numFmt:FMT_GREEN, border:BORD },
  formulaEgr:{ font:{ name:FONT, sz:10 }, alignment:{ horizontal:'right' }, numFmt:FMT_RED, border:BORD },
  sumLabel: { font:{ name:FONT, sz:10, bold:true }, alignment:{ horizontal:'left' }, border:BORD },
  sumNumIng:{ font:{ name:FONT, sz:10, bold:true }, alignment:{ horizontal:'right' }, numFmt:FMT_GREEN, border:BORD },
  sumNumEgr:{ font:{ name:FONT, sz:10, bold:true }, alignment:{ horizontal:'right' }, numFmt:FMT_RED, border:BORD },
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
    const isIng = ING_CATS.includes(cat);
    const natNum  = isIng ? S.catNumIng  : S.catNumEgr;
    const natLink = isIng ? S.linkNumIng : S.linkNumEgr;
    const natFx   = isIng ? S.formulaIng : S.formulaEgr;
    const def = catByKey[cat] || { lines:[] };
    const catLines = def.lines || [];
    const firstLineRow = r + 1;
    catLines.forEach(ln => {
      const isLink = !!ln.cellFormula;
      cells[ref(r+1,0)] = { t:'s', v:ln.label, s:isLink?S.linkLabel:S.lineLabel };
      monthOrder.forEach((mc,k) => {
        if (isLink) { const v=ln.cellNumber?ln.cellNumber(mc):0; num[ref(r+1,mc.c)]=v; cells[ref(r+1,mc.c)] = { t:'n', f:ln.cellFormula(mc), v, s:natLink }; }
        else { const v=Number(ln.vals[k])||0; num[ref(r+1,mc.c)]=v; cells[ref(r+1,mc.c)] = { t:'n', v, s:S.input }; }
      });
      fillAdditive(cells, num, r+1, cols, isLink?natLink:natFx);
      setLvl(r,2); r++;
    });
    const lastLineRow = r;
    const subRow = r + 1; catRows[cat] = subRow;
    cells[ref(subRow,0)] = { t:'s', v:CAT_LABEL[cat], s:S.catLabel };
    monthOrder.forEach((mc,k) => {
      if (catLines.length > 0) {
        let v = 0; for (let lr=firstLineRow; lr<=lastLineRow; lr++) v += num[ref(lr,mc.c)]||0;
        num[ref(subRow,mc.c)] = v;
        cells[ref(subRow,mc.c)] = { t:'n', f:`SUM(${ref(firstLineRow,mc.c)}:${ref(lastLineRow,mc.c)})`, v, s:natNum };
      } else if (def.monthFormula) {
        const v = def.monthNumber ? def.monthNumber(mc) : 0;
        num[ref(subRow,mc.c)] = v;
        cells[ref(subRow,mc.c)] = { t:'n', f:def.monthFormula(mc), v, s:natNum };
      } else {
        num[ref(subRow,mc.c)] = 0;
        cells[ref(subRow,mc.c)] = { t:'n', v:0, s:natNum };
      }
    });
    fillAdditive(cells, num, subRow, cols, natNum);
    setLvl(r,1); r++;
  });

  // (+) Ingresos del mes
  const ingRow = r + 1;
  cells[ref(ingRow,0)] = { t:'s', v:'(+) Ingresos del mes', s:S.sumLabel };
  monthOrder.forEach(mc => { const v=ING_CATS.reduce((a,c2)=>a+(num[ref(catRows[c2],mc.c)]||0),0); num[ref(ingRow,mc.c)]=v; cells[ref(ingRow,mc.c)] = { t:'n', f:ING_CATS.map(c2=>ref(catRows[c2],mc.c)).join('+'), v, s:S.sumNumIng }; });
  fillAdditive(cells, num, ingRow, cols, S.sumNumIng); setLvl(r,0); r++;

  // (−) Egresos del mes
  const egrRow = r + 1;
  cells[ref(egrRow,0)] = { t:'s', v:'(−) Egresos del mes', s:S.sumLabel };
  monthOrder.forEach(mc => { const v=EGR_CATS.reduce((a,c2)=>a+(num[ref(catRows[c2],mc.c)]||0),0); num[ref(egrRow,mc.c)]=v; cells[ref(egrRow,mc.c)] = { t:'n', f:EGR_CATS.map(c2=>ref(catRows[c2],mc.c)).join('+'), v, s:S.sumNumEgr }; });
  fillAdditive(cells, num, egrRow, cols, S.sumNumEgr); setLvl(r,0); r++;

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
// Helper interno: arma columnas (meses + temporadas + total) para un horizonte.
function buildHorizonte(lastSeasonStartYear) {
  const allMonths = genMonths();
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
  return { months, cols, monthOrder };
}

// Arma las categorías (líneas con valores no nulos) de una empresa para el horizonte.
// formulaLines (opcional): { [label]: { cellFormula(mc)->string } } — líneas cuyos
// valores mensuales van como FÓRMULA Excel (ej. Allpa: SUMIF a la hoja Parametros)
// en vez de inputs estáticos. El número cacheado se toma de emp.proy.
function catsDeEmpresa(emp, months, formulaLines = null) {
  return CAT_ORDER.map(cat => {
    const sec = (emp.sections || []).find(s => s.cat === cat);
    const lines = [];
    if (sec) sec.lines.forEach(ln => {
      const vals = months.map(mo => Number(ln.proy[mo.idx]) || 0);
      const hasVal = vals.some(v => v !== 0);
      const fl = formulaLines && formulaLines[ln.label];
      if (fl) {
        if (!hasVal) return;
        lines.push({
          label: ln.label,
          cellFormula: fl.cellFormula,
          cellNumber: (mc) => Number(ln.proy[mc.monthIdx]) || 0,
        });
      } else if (hasVal) {
        lines.push({ label: ln.label, vals });
      }
    });
    return { cat, lines };
  });
}

// ── estilos hoja Parámetros ──────────────────────────────────────────
const PS = {
  title:  { font:{ name:FONT, sz:13, bold:true, color:{rgb:'FFFFFF'} }, fill:{ fgColor:{rgb:NAVY} }, alignment:{ horizontal:'left', vertical:'center' } },
  secHdr: { font:{ name:FONT, sz:11, bold:true, color:{rgb:'FFFFFF'} }, fill:{ fgColor:{rgb:BLUE} }, alignment:{ horizontal:'left', vertical:'center' }, border:BORD },
  colHdr: { font:{ name:FONT, sz:9, bold:true, color:{rgb:'FFFFFF'} }, fill:{ fgColor:{rgb:NAVY} }, alignment:{ horizontal:'center', vertical:'center' }, border:BORD },
  txt:    { font:{ name:FONT, sz:10 }, alignment:{ horizontal:'left' }, border:BORD },
  txtSub: { font:{ name:FONT, sz:10, italic:true, color:{rgb:'595959'} }, alignment:{ horizontal:'left', indent:1 }, border:BORD },
  inNum:  { font:{ name:FONT, sz:10, color:{rgb:INPUTBLUE} }, fill:{ fgColor:{rgb:YELLOW} }, alignment:{ horizontal:'right' }, numFmt:FMT, border:BORD },
  inKg:   { font:{ name:FONT, sz:10, color:{rgb:INPUTBLUE} }, fill:{ fgColor:{rgb:YELLOW} }, alignment:{ horizontal:'right' }, numFmt:'#,##0', border:BORD },
  inUsd:  { font:{ name:FONT, sz:10, color:{rgb:INPUTBLUE} }, fill:{ fgColor:{rgb:YELLOW} }, alignment:{ horizontal:'right' }, numFmt:'#,##0.00', border:BORD },
  inTxt:  { font:{ name:FONT, sz:10, color:{rgb:INPUTBLUE} }, fill:{ fgColor:{rgb:YELLOW} }, alignment:{ horizontal:'center' }, border:BORD },
  inPct:  { font:{ name:FONT, sz:10, color:{rgb:INPUTBLUE} }, fill:{ fgColor:{rgb:YELLOW} }, alignment:{ horizontal:'right' }, numFmt:'0.##', border:BORD },
  der:    { font:{ name:FONT, sz:10 }, alignment:{ horizontal:'right' }, numFmt:FMT, border:BORD },
  derB:   { font:{ name:FONT, sz:10, bold:true }, fill:{ fgColor:{rgb:GRAY} }, alignment:{ horizontal:'right' }, numFmt:FMT, border:BORD },
  movMes: { font:{ name:FONT, sz:9 }, alignment:{ horizontal:'center' }, border:BORD },
  movNum: { font:{ name:FONT, sz:9 }, alignment:{ horizontal:'right' }, numFmt:FMT, border:BORD },
};

// ═══════════════════════════════════════════════════════════════════
// HOJA "Parametros" — Allpa Farms (Chile). Inputs vivos + fórmulas.
// Columnas A-G: inputs y derivados legibles.  Col H: separador.
// Columnas-fuente (SUMIF del flujo): I/J Ingresos · K/L Cosecha · M/N Transporte.
// Reproduce calcAllpa: ingresos = anticipos (US$/kg×kg) + liquidación
// (max(0, kg×US$ − Σanticipos)); cosecha = kg_total_temp × US$/kg repartido
// por %; transporte = costo_persona × personas por cada mes de pago.
// ═══════════════════════════════════════════════════════════════════
function buildParametrosAllpa(paramsAF, months) {
  const labelByIdx = {}; months.forEach(mo => { labelByIdx[mo.idx] = mo.label; });
  const cells = {}; const merges = []; const wrows = [];
  const put = (r1, c0, cell) => { cells[ref(r1, c0)] = cell; };
  // Columnas fuente para el SUMIF del flujo
  const ING_MES=8, ING_MON=9, COS_MES=10, COS_MON=11, TRA_MES=12, TRA_MON=13;
  const LAST_COL = 13;
  let r = 1;

  // Título
  put(r,0,{ t:'s', v:'⚙ Parámetros — Allpa Farms (Chile)', s:PS.title });
  for (let c=1;c<=LAST_COL;c++) put(r,c,{ t:'s', v:'', s:PS.title });
  merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:7} });
  put(r,ING_MES,{ t:'s', v:'Ingresos', s:PS.colHdr }); put(r,ING_MON,{ t:'s', v:'(fuente)', s:PS.colHdr });
  put(r,COS_MES,{ t:'s', v:'Cosecha', s:PS.colHdr }); put(r,COS_MON,{ t:'s', v:'(fuente)', s:PS.colHdr });
  put(r,TRA_MES,{ t:'s', v:'Transp.', s:PS.colHdr }); put(r,TRA_MON,{ t:'s', v:'(fuente)', s:PS.colHdr });
  wrows[r-1] = { hpx:20 }; r++;
  put(r,0,{ t:'s', v:'Celdas amarillas = editables. El flujo recalcula solo (SUMIF por mes).', s:PS.txtSub });
  merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:7} }); r++;
  r++;

  const seasonKeys = Object.keys(paramsAF || {}).sort();

  // ══ INGRESOS ══
  put(r,0,{ t:'s', v:'① INGRESOS POR VARIEDAD (anticipos + liquidación)', s:PS.secHdr });
  for (let c=1;c<=7;c++) put(r,c,{ t:'s', v:'', s:PS.secHdr });
  merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:7} }); r++;
  const IH = ['Temporada','Variedad / Concepto','kg total','US$/kg','Ingreso bruto','Σ Anticipos','Liquidación'];
  IH.forEach((h,c)=>put(r,c,{ t:'s', v:h, s:PS.colHdr }));
  put(r,ING_MES,{ t:'s', v:'Mes cobro', s:PS.colHdr }); put(r,ING_MON,{ t:'s', v:'Monto US$', s:PS.colHdr });
  r++;

  const kgCellsBySeason = {};   // temporada → [celdas kg de sus variedades] (para cosecha viva)
  seasonKeys.forEach(sk => {
    const d = paramsAF[sk] || {};
    (d.variedades || []).forEach(v => {
      const usd = Number(v.usd_kg) || 0;
      const totalKg = Object.values(v.kg_mes || {}).reduce((s,k)=>s+(Number(k)||0),0);
      const rV = r;
      const kgCell = ref(rV, 2), usdCell = ref(rV, 3), ingBrutoCell = ref(rV, 4), sumAntCell = ref(rV, 5), liqCell = ref(rV, 6);
      (kgCellsBySeason[sk] || (kgCellsBySeason[sk] = [])).push(kgCell);
      // anticipos (filas siguientes)
      const antRows = [];
      let sumAnt = 0;
      (v.anticipos || []).forEach(a => {
        const antUsd = Number(a.usd_kg) || 0;
        const monto = antUsd * totalKg; sumAnt += monto;
        antRows.push({ mes:a.mes || '', antUsd, monto });
      });
      const ingBruto = totalKg * usd;
      const liq = Math.max(0, ingBruto - sumAnt);
      // fila variedad
      put(rV,0,{ t:'s', v:sk, s:PS.txt });
      put(rV,1,{ t:'s', v:v.nombre || '(variedad)', s:PS.txt });
      put(rV,2,{ t:'n', v:totalKg, s:PS.inKg });
      put(rV,3,{ t:'n', v:usd, s:PS.inUsd });
      put(rV,4,{ t:'n', f:`${kgCell}*${usdCell}`, v:ingBruto, s:PS.der });
      // liquidación fuente (en fila variedad): mes_liq + monto liq
      put(rV,ING_MES,{ t:'s', v:v.mes_liq || '', s:PS.inTxt });
      put(rV,ING_MON,{ t:'n', f:liqCell, v:liq, s:PS.movNum });
      r++;
      // filas anticipo
      antRows.forEach(a => {
        const rA = r;
        const antUsdCell = ref(rA, 3);
        put(rA,0,{ t:'s', v:'', s:PS.txt });
        put(rA,1,{ t:'s', v:'   ↳ Anticipo', s:PS.txtSub });
        put(rA,3,{ t:'n', v:a.antUsd, s:PS.inUsd });
        put(rA,ING_MES,{ t:'s', v:a.mes, s:PS.inTxt });
        put(rA,ING_MON,{ t:'n', f:`${antUsdCell}*${kgCell}`, v:a.monto, s:PS.movNum });
        r++;
      });
      // Σ anticipos y liquidación (referencian las filas anticipo por columna J)
      const jCells = antRows.map((_,i)=>ref(rV+1+i, ING_MON));
      const sumAntF = jCells.length ? jCells.join('+') : '0';
      put(rV,5,{ t:'n', f:sumAntF, v:sumAnt, s:PS.der });
      put(rV,6,{ t:'n', f:`MAX(0,${ingBrutoCell}-${sumAntCell})`, v:liq, s:PS.derB });
    });
  });
  r++;

  // ══ COSECHA ══
  put(r,0,{ t:'s', v:'② COSTO COSECHA (remuneración)', s:PS.secHdr });
  for (let c=1;c<=7;c++) put(r,c,{ t:'s', v:'', s:PS.secHdr });
  merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:7} }); r++;
  ['Temporada','Concepto','US$/kg','kg total temp.','Costo total','%',''].forEach((h,c)=>put(r,c,{ t:'s', v:h, s:PS.colHdr }));
  put(r,COS_MES,{ t:'s', v:'Mes pago', s:PS.colHdr }); put(r,COS_MON,{ t:'s', v:'Monto US$', s:PS.colHdr });
  r++;

  seasonKeys.forEach(sk => {
    const d = paramsAF[sk] || {};
    const cosecha = d.cosecha || {};
    const usdCos = Number(cosecha.usd_kg) || 0;
    let totalKgAll = 0;
    (d.variedades || []).forEach(v => {
      totalKgAll += Object.values(v.kg_mes || {}).reduce((s,k)=>s+(Number(k)||0),0);
    });
    const semanas = cosecha.semanas_pago || [];
    if (usdCos === 0 && semanas.length === 0) return;
    const rC = r;
    const usdCosCell = ref(rC, 2), kgTotCell = ref(rC, 3), costoTotCell = ref(rC, 4);
    const totalCos = totalKgAll * usdCos;
    // kg total temp = suma VIVA de las celdas kg de las variedades de esta temporada
    const kgRefs = kgCellsBySeason[sk] || [];
    const kgTotF = kgRefs.length ? kgRefs.join('+') : '0';
    put(rC,0,{ t:'s', v:sk, s:PS.txt });
    put(rC,1,{ t:'s', v:'Cosecha', s:PS.txt });
    put(rC,2,{ t:'n', v:usdCos, s:PS.inUsd });
    put(rC,3,{ t:'n', f:kgTotF, v:totalKgAll, s:PS.der });   // kg total temp (fórmula viva)
    put(rC,4,{ t:'n', f:`${usdCosCell}*${kgTotCell}`, v:totalCos, s:PS.derB });
    r++;
    semanas.forEach(sp => {
      const rS = r; const pctCell = ref(rS, 5);
      const pct = Number(sp.pct) || 0;
      const monto = totalCos * (pct/100);
      put(rS,0,{ t:'s', v:'', s:PS.txt });
      put(rS,1,{ t:'s', v:'   ↳ Pago', s:PS.txtSub });
      put(rS,5,{ t:'n', v:pct, s:PS.inPct });
      put(rS,COS_MES,{ t:'s', v:sp.mes || '', s:PS.inTxt });
      put(rS,COS_MON,{ t:'n', f:`${costoTotCell}*${pctCell}/100`, v:monto, s:PS.movNum });
      r++;
    });
  });
  r++;

  // ══ TRANSPORTE ══
  put(r,0,{ t:'s', v:'③ TRANSPORTE', s:PS.secHdr });
  for (let c=1;c<=7;c++) put(r,c,{ t:'s', v:'', s:PS.secHdr });
  merges.push({ s:{r:r-1,c:0}, e:{r:r-1,c:7} }); r++;
  ['Temporada','Concepto','Costo/persona','Personas','Total','',''].forEach((h,c)=>put(r,c,{ t:'s', v:h, s:PS.colHdr }));
  put(r,TRA_MES,{ t:'s', v:'Mes pago', s:PS.colHdr }); put(r,TRA_MON,{ t:'s', v:'Monto US$', s:PS.colHdr });
  r++;

  seasonKeys.forEach(sk => {
    const d = paramsAF[sk] || {};
    const trsp = d.transporte || {};
    const costo = Number(trsp.costo_persona) || 0;
    const personas = Number(trsp.personas) || 0;
    const meses = trsp.meses_pago || [];
    if (costo === 0 && personas === 0 && meses.length === 0) return;
    const rT = r;
    const costoCell = ref(rT, 2), persCell = ref(rT, 3), totCell = ref(rT, 4);
    const total = costo * personas;
    put(rT,0,{ t:'s', v:sk, s:PS.txt });
    put(rT,1,{ t:'s', v:'Transporte', s:PS.txt });
    put(rT,2,{ t:'n', v:costo, s:PS.inNum });
    put(rT,3,{ t:'n', v:personas, s:PS.inNum });
    put(rT,4,{ t:'n', f:`${costoCell}*${persCell}`, v:total, s:PS.derB });
    r++;
    meses.forEach(mp => {
      const rM = r;
      put(rM,0,{ t:'s', v:'', s:PS.txt });
      put(rM,1,{ t:'s', v:'   ↳ Pago', s:PS.txtSub });
      put(rM,TRA_MES,{ t:'s', v:mp || '', s:PS.inTxt });
      put(rM,TRA_MON,{ t:'n', f:totCell, v:total, s:PS.movNum });
      r++;
    });
  });

  const lastRow = r;
  const ws = {};
  Object.keys(cells).forEach(a => ws[a] = cells[a]);
  ws['!ref'] = `A1:${L(LAST_COL)}${lastRow}`;
  ws['!cols'] = [
    { wch:12 }, { wch:24 }, { wch:12 }, { wch:10 }, { wch:13 }, { wch:12 }, { wch:13 }, { wch:2 },
    { wch:11 }, { wch:13 }, { wch:11 }, { wch:13 }, { wch:11 }, { wch:13 },
  ];
  if (wrows.length) ws['!rows'] = wrows.map(x => x || {});
  if (merges.length) ws['!merges'] = merges;
  ws['!freeze'] = { xSplit:0, ySplit:5, topLeftCell:'A6', activePane:'bottomLeft', state:'frozen' };

  const sf = (mesCol, monCol) => (mc) =>
    `SUMIF('Parametros'!$${L(mesCol)}:$${L(mesCol)},"${labelByIdx[mc.monthIdx]}",'Parametros'!$${L(monCol)}:$${L(monCol)})`;
  const formulaLines = {
    'Ingreso Exportación Cerezas': { cellFormula: sf(ING_MES, ING_MON) },
    'Remuneración Cosecha':        { cellFormula: sf(COS_MES, COS_MON) },
    'Transporte':                  { cellFormula: sf(TRA_MES, TRA_MON) },
  };
  return { ws, formulaLines };
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT FLUJO DE UNA SOLA EMPRESA → Excel (.xlsx).
// Hoja "<Empresa>" (flujo) + —para empresas con parámetros vivos— hoja
// "Parametros" con inputs editables que recalculan el flujo vía fórmulas.
// Reutiliza buildStatement, así los números cuadran con la pantalla.
export function exportarFlujoEmpresa({ emp, empName, saldoIni = 0, lastSeasonStartYear = null, fileName, paramsAF = null }) {
  if (!emp) throw new Error('Empresa sin datos');
  const { months, cols, monthOrder } = buildHorizonte(lastSeasonStartYear);

  // Empresas con hoja de parámetros viva (por ahora: Allpa Farms Chile)
  let paramSheet = null, formulaLines = null;
  if (empName === 'Allpa Farms' && paramsAF) {
    const built = buildParametrosAllpa(paramsAF, months);
    paramSheet = built.ws; formulaLines = built.formulaLines;
  }

  const cats = catsDeEmpresa(emp, months, formulaLines);
  const built = buildStatement({
    title:`${emp.emoji || ''} ${empName}`.trim(),
    subtitle: emp.desc || '',
    cols, monthOrder, cats,
    saldoIniValue: Number(saldoIni) || 0,
  });

  const wb = XLSX.utils.book_new();
  const sheetNm = (String(empName).replace(/[\\/?*\[\]:]/g, '').slice(0, 28)) || 'Flujo';
  XLSX.utils.book_append_sheet(wb, toSheet({ ...built, cols }), sheetNm);
  if (paramSheet) XLSX.utils.book_append_sheet(wb, paramSheet, 'Parametros');
  wb.Workbook = { ...(wb.Workbook||{}), Views:[{ activeTab:0 }], CalcPr:{ fullCalcOnLoad:true } };

  const safeName = String(empName).replace(/[^\w\-]+/g,'_').slice(0,40);
  const fname = fileName || `Flujo_${safeName}_${months[months.length-1].label}.xlsx`;
  XLSX.writeFile(wb, fname);
  return fname;
}

// ═══════════════════════════════════════════════════════════════════
export function exportarFlujoConsolidado({ empresasConOverrides, empNames, saldoIniPorEmp, lastSeasonStartYear = null, fileName, escenarioNombre = null }) {
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
    title:`🏛 Consolidado Grupo Mediterra${escenarioNombre?` — Escenario: ${escenarioNombre}`:''}`,
    subtitle:`${escenarioNombre?`🧪 ${escenarioNombre} · `:''}${empNames.length} empresas · Apr-26 → ${months[months.length-1].label}`,
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

  const escTag = escenarioNombre ? `_${String(escenarioNombre).replace(/[^\w\-]+/g,'_').slice(0,30)}` : '';
  const fname = fileName || `Flujo_Consolidado_Mediterra${escTag}_${months[months.length-1].label}.xlsx`;
  XLSX.writeFile(wb, fname);
  return fname;
}
