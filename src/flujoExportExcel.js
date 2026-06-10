/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// EXPORT FLUJO DE CAJA CONSOLIDADO → Excel (.xlsx)
// ───────────────────────────────────────────────────────────────────
// Genera un libro con:
//   · Hoja "Consolidado" (nivel categoría) que referencia con FÓRMULAS
//     a las hojas de cada empresa.
//   · Una hoja por empresa del consolidado (nivel línea), con filas
//     desplegables (outline) por categoría y meses agrupados por
//     temporada (también desplegables).
// Todas las celdas calculadas son FÓRMULAS Excel (SUMA, resta, saldo
// arrastrado), de modo que el archivo recalcula al editar inputs.
//
// Reutiliza el árbol `empresasConOverrides` que la app ya calcula, así
// los números cuadran exactamente con lo que se ve en pantalla.
// ═══════════════════════════════════════════════════════════════════
import * as XLSX from 'xlsx';

const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Misma generación que FinanzasModule: Apr-26 → Jun-31 (63 meses)
function genMonths() {
  const out = [];
  let y = 2026, m = 3;
  while (out.length < 63) {
    out.push({ label:`${MN[m]}-${String(y).slice(2)}`, y, m, idx:out.length });
    m++; if (m > 11) { m = 0; y++; }
  }
  return out;
}
function seasonOf(mo) { return mo.m >= 6 ? mo.y : mo.y - 1; }

// Orden y etiquetas canónicas de categorías
const CAT_ORDER = ['ing_op','ing_nop','egr_var','egr_fijo','egr_nop','imp'];
const CAT_LABEL = {
  ing_op:'Ingresos Operacionales',
  ing_nop:'Ingresos No Operacionales',
  egr_var:'Egresos Operacionales (variables)',
  egr_fijo:'Costos Fijos / SG&A',
  egr_nop:'Egresos No Operacionales',
  imp:'Impuestos',
};
const ING_CATS = ['ing_op','ing_nop'];
const EGR_CATS = ['egr_var','egr_fijo','egr_nop','imp'];

const NUMFMT = '#,##0;(#,##0);-';

const L = (c0) => XLSX.utils.encode_col(c0);            // 0-based col → "A"
const ref = (r1, c0) => `${L(c0)}${r1}`;                // 1-based row, 0-based col

// ── Construye la metadata de columnas (meses + total temporada + total) ──
function buildColumns(months, seasons) {
  const cols = [];        // {kind, c, label, monthIdx?, members?, seasonKey?}
  const monthOrder = [];  // {c, monthIdx} en orden cronológico
  let c = 1;              // col 0 = etiqueta
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
  cols.push({ kind:'grand', c, label:'Total', members:tempCols });
  return { cols, monthOrder, lastCol:c };
}

// Llena las columnas temp/grand de una fila ADITIVA, sumando las celdas
// de meses de esa misma fila (las temp suman sus meses; grand suma temps).
function fillAdditive(cells, r1, cols) {
  cols.forEach(col => {
    if (col.kind === 'temp') {
      const first = col.members[0], last = col.members[col.members.length - 1];
      cells[ref(r1, col.c)] = { t:'n', f:`SUM(${ref(r1, first)}:${ref(r1, last)})`, z:NUMFMT };
    } else if (col.kind === 'grand') {
      const parts = col.members.map(cc => ref(r1, cc)).join(',');
      cells[ref(r1, col.c)] = { t:'n', f:`SUM(${parts})`, z:NUMFMT };
    }
  });
}

// ── Escribe un "estado de flujo" en una hoja ────────────────────────
// catCellFn(cat, monthCol0) → string de fórmula (sin "=") para la celda
//   de meses de la fila subtotal de categoría. Para empresa: SUMA vertical
//   de líneas. Para consolidado: SUMA cruzada entre hojas.
function buildSheet({ title, desc, cols, monthOrder, lines, saldoIni }) {
  // lines: { cat: [ {label, vals:[...]} ] }  (vals indexado por monthOrder pos)
  const cells = {};
  const rows = [];        // !rows outline levels (0-based)
  const merges = [];
  let r = 0;              // 0-based row pointer
  const setRowLevel = (r0, lvl) => { rows[r0] = { level:lvl }; };

  // Fila 1: título
  cells[ref(r+1, 0)] = { t:'s', v:title };
  if (desc) cells[ref(r+1, 4)] = { t:'s', v:desc };
  r++;
  // Fila 2: cabecera de temporadas (merge sobre meses + temp)
  const seasonHdrRow = r + 1;
  // agrupamos por seasonKey contiguo
  {
    let i = 0;
    while (i < cols.length) {
      const col = cols[i];
      if (col.kind === 'mes') {
        // buscar rango de esta temporada (meses + su temp)
        const sk = seasonKeyForMonthGroup(cols, i);
        let j = i;
        while (j < cols.length && !(cols[j].kind === 'temp')) j++;
        // j apunta al temp de la temporada
        const startC = cols[i].c, endC = cols[j].c;
        cells[ref(seasonHdrRow, startC)] = { t:'s', v:`Temporada ${sk}` };
        merges.push({ s:{ r:seasonHdrRow-1, c:startC }, e:{ r:seasonHdrRow-1, c:endC } });
        i = j + 1;
      } else { i++; }
    }
  }
  r++;
  // Fila 3: etiquetas de columna
  const colHdrRow = r + 1;
  cells[ref(colHdrRow, 0)] = { t:'s', v:'Concepto' };
  cols.forEach(col => { cells[ref(colHdrRow, col.c)] = { t:'s', v:col.label }; });
  r++;

  // Fila: Saldo inicial caja
  const saldoIniRow = r + 1;
  cells[ref(saldoIniRow, 0)] = { t:'s', v:'Saldo inicial caja' };
  setRowLevel(r, 0);
  r++;

  // Categorías → líneas (nivel 2) + subtotal (nivel 1)
  const catRows = {};
  CAT_ORDER.forEach(cat => {
    const catLines = lines[cat] || [];
    const firstLineRow = r + 1;
    catLines.forEach(ln => {
      cells[ref(r+1, 0)] = { t:'s', v:'    ' + ln.label };
      monthOrder.forEach((mc, k) => {
        const v = Number(ln.vals[k]) || 0;
        cells[ref(r+1, mc.c)] = { t:'n', v, z:NUMFMT };
      });
      fillAdditive(cells, r+1, cols);
      setRowLevel(r, 2);
      r++;
    });
    const lastLineRow = r; // 1-based last line row = r (porque r ya avanzó)
    // subtotal categoría
    const subRow = r + 1;
    catRows[cat] = subRow;
    cells[ref(subRow, 0)] = { t:'s', v:CAT_LABEL[cat] };
    monthOrder.forEach(mc => {
      if (catLines.length > 0) {
        cells[ref(subRow, mc.c)] = { t:'n', f:`SUM(${ref(firstLineRow, mc.c)}:${ref(lastLineRow, mc.c)})`, z:NUMFMT };
      } else {
        cells[ref(subRow, mc.c)] = { t:'n', v:0, z:NUMFMT };
      }
    });
    fillAdditive(cells, subRow, cols);
    setRowLevel(r, 1);
    r++;
  });

  // (+) Ingresos del mes
  const ingRow = r + 1;
  cells[ref(ingRow, 0)] = { t:'s', v:'(+) Ingresos del mes' };
  monthOrder.forEach(mc => {
    const parts = ING_CATS.map(c2 => ref(catRows[c2], mc.c)).join('+');
    cells[ref(ingRow, mc.c)] = { t:'n', f:parts, z:NUMFMT };
  });
  fillAdditive(cells, ingRow, cols);
  setRowLevel(r, 0); r++;

  // (−) Egresos del mes
  const egrRow = r + 1;
  cells[ref(egrRow, 0)] = { t:'s', v:'(−) Egresos del mes' };
  monthOrder.forEach(mc => {
    const parts = EGR_CATS.map(c2 => ref(catRows[c2], mc.c)).join('+');
    cells[ref(egrRow, mc.c)] = { t:'n', f:parts, z:NUMFMT };
  });
  fillAdditive(cells, egrRow, cols);
  setRowLevel(r, 0); r++;

  // (=) Flujo neto
  const flujoRow = r + 1;
  cells[ref(flujoRow, 0)] = { t:'s', v:'(=) Flujo neto' };
  monthOrder.forEach(mc => {
    cells[ref(flujoRow, mc.c)] = { t:'n', f:`${ref(ingRow, mc.c)}-${ref(egrRow, mc.c)}`, z:NUMFMT };
  });
  fillAdditive(cells, flujoRow, cols);
  setRowLevel(r, 0); r++;

  // (=) Saldo final caja
  const saldoFinRow = r + 1;
  cells[ref(saldoFinRow, 0)] = { t:'s', v:'(=) Saldo final caja' };
  monthOrder.forEach(mc => {
    cells[ref(saldoFinRow, mc.c)] = { t:'n', f:`${ref(saldoIniRow, mc.c)}+${ref(flujoRow, mc.c)}`, z:NUMFMT };
  });
  // saldo final: temp = último mes de la temporada; grand = último mes total
  cols.forEach(col => {
    if (col.kind === 'temp') {
      const last = col.members[col.members.length - 1];
      cells[ref(saldoFinRow, col.c)] = { t:'n', f:`${ref(saldoFinRow, last)}`, z:NUMFMT };
    } else if (col.kind === 'grand') {
      const lastMonthCol = monthOrder[monthOrder.length - 1].c;
      cells[ref(saldoFinRow, col.c)] = { t:'n', f:`${ref(saldoFinRow, lastMonthCol)}`, z:NUMFMT };
    }
  });
  setRowLevel(r, 0); r++;

  // ── Saldo inicial: month0 = input/cross-ref; monthK = saldo final mes previo ──
  // (se llena al final porque depende de saldoFinRow)
  monthOrder.forEach((mc, k) => {
    if (k === 0) {
      if (typeof saldoIni === 'string') cells[ref(saldoIniRow, mc.c)] = { t:'n', f:saldoIni, z:NUMFMT };
      else cells[ref(saldoIniRow, mc.c)] = { t:'n', v:Number(saldoIni) || 0, z:NUMFMT };
    } else {
      const prev = monthOrder[k-1].c;
      cells[ref(saldoIniRow, mc.c)] = { t:'n', f:`${ref(saldoFinRow, prev)}`, z:NUMFMT };
    }
  });
  cols.forEach(col => {
    if (col.kind === 'temp') {
      const first = col.members[0];
      cells[ref(saldoIniRow, col.c)] = { t:'n', f:`${ref(saldoIniRow, first)}`, z:NUMFMT };
    } else if (col.kind === 'grand') {
      const firstMonthCol = monthOrder[0].c;
      cells[ref(saldoIniRow, col.c)] = { t:'n', f:`${ref(saldoIniRow, firstMonthCol)}`, z:NUMFMT };
    }
  });

  return { cells, rows, merges, lastRow:r, lastCol:cols[cols.length-1].c,
           catRows, saldoIniRow, flujoRow, saldoFinRow, ingRow, egrRow };
}

function seasonKeyForMonthGroup(cols, i) {
  // el temp de la temporada lleva seasonKey; búscalo hacia adelante
  for (let j = i; j < cols.length; j++) if (cols[j].kind === 'temp') return cols[j].seasonKey;
  return '';
}

// Convierte el dict de celdas en worksheet con !ref, !cols, !rows, !merges
function cellsToSheet({ cells, rows, merges, lastRow, lastCol, cols }) {
  const ws = {};
  Object.keys(cells).forEach(addr => { ws[addr] = cells[addr]; });
  ws['!ref'] = `A1:${L(lastCol)}${lastRow}`;
  // anchos + outline de columnas (meses nivel 1, temp/grand nivel 0)
  const wcols = [{ wch:34 }];
  for (let c = 1; c <= lastCol; c++) {
    const meta = cols.find(x => x.c === c);
    const lvl = meta && meta.kind === 'mes' ? 1 : 0;
    wcols[c] = { wch:11, level:lvl };
  }
  ws['!cols'] = wcols;
  ws['!rows'] = rows.map(rr => rr || { level:0 });
  if (merges.length) ws['!merges'] = merges;
  // resumen de outline arriba/izquierda = false (default Excel: abajo/derecha)
  return ws;
}

// ═══════════════════════════════════════════════════════════════════
// API principal
// ═══════════════════════════════════════════════════════════════════
export function exportarFlujoConsolidado({ empresasConOverrides, empNames, saldoIniPorEmp, lastSeasonStartYear = 2028, fileName }) {
  // 1. meses dentro del horizonte (hasta temporada lastSeasonStartYear)
  const allMonths = genMonths();
  const months = allMonths.filter(mo => seasonOf(mo) <= lastSeasonStartYear);
  // temporadas (orden cronológico, contiguas)
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

  // 2. Hojas por empresa (línea) — primero las construimos para capturar filas
  const empBuilt = {};       // empName → resultado buildSheet
  const sheetName = {};      // empName → nombre de hoja (<=31 chars, único)
  const usedNames = new Set();
  empNames.forEach(n => {
    let nm = n.replace(/[\\/?*\[\]:]/g, '').slice(0, 28);
    let base = nm, i = 2;
    while (usedNames.has(nm)) { nm = `${base}_${i++}`.slice(0,31); }
    usedNames.add(nm);
    sheetName[n] = nm;
  });

  empNames.forEach(n => {
    const emp = empresasConOverrides[n];
    // líneas por categoría (omite líneas todo-cero en el horizonte)
    const lines = {};
    CAT_ORDER.forEach(cat => {
      const sec = (emp.sections || []).find(s => s.cat === cat);
      const arr = [];
      if (sec) {
        sec.lines.forEach(ln => {
          const vals = months.map(mo => Number(ln.proy[mo.idx]) || 0);
          if (vals.some(v => v !== 0)) arr.push({ label:ln.label, vals });
        });
      }
      lines[cat] = arr;
    });
    const saldoIni = Number(saldoIniPorEmp?.[n]) || 0;
    empBuilt[n] = buildSheet({
      title:`${emp.emoji || ''} ${n}`.trim(), desc:emp.desc || '',
      cols, monthOrder, lines, saldoIni,
    });
  });

  // 3. Hoja Consolidado (categoría) — referencia cruzada a hojas empresa
  const consCells = {}; const consRows = []; const consMerges = [];
  {
    // construimos un buildSheet "manual" para consolidado a nivel categoría
    const cells = {}; const rows = []; const merges = [];
    let r = 0;
    const setLvl = (r0, lvl) => { rows[r0] = { level:lvl }; };
    cells[ref(r+1,0)] = { t:'s', v:'🏛 Consolidado Grupo Mediterra' };
    cells[ref(r+1,4)] = { t:'s', v:`${empNames.length} empresas · Apr-26 → ${months[months.length-1].label}` };
    r++;
    const seasonHdrRow = r+1;
    { let i=0; while(i<cols.length){ const col=cols[i]; if(col.kind==='mes'){ const sk=seasonKeyForMonthGroup(cols,i); let j=i; while(j<cols.length && cols[j].kind!=='temp') j++; cells[ref(seasonHdrRow,cols[i].c)]={t:'s',v:`Temporada ${sk}`}; merges.push({s:{r:seasonHdrRow-1,c:cols[i].c},e:{r:seasonHdrRow-1,c:cols[j].c}}); i=j+1;} else i++; } }
    r++;
    const colHdrRow=r+1;
    cells[ref(colHdrRow,0)]={t:'s',v:'Concepto'};
    cols.forEach(col=>{cells[ref(colHdrRow,col.c)]={t:'s',v:col.label};});
    r++;
    const saldoIniRow=r+1;
    cells[ref(saldoIniRow,0)]={t:'s',v:'Saldo inicial caja'};
    setLvl(r,0); r++;
    // categorías: month cell = suma cruzada de subtotales por empresa
    const catRows={};
    CAT_ORDER.forEach(cat=>{
      const subRow=r+1; catRows[cat]=subRow;
      cells[ref(subRow,0)]={t:'s',v:CAT_LABEL[cat]};
      monthOrder.forEach(mc=>{
        const parts = empNames.map(n=>`'${sheetName[n]}'!${ref(empBuilt[n].catRows[cat], mc.c)}`).join('+');
        cells[ref(subRow,mc.c)]={t:'n',f:parts,z:NUMFMT};
      });
      fillAdditive(cells, subRow, cols);
      setLvl(r,1); r++;
    });
    const ingRow=r+1; cells[ref(ingRow,0)]={t:'s',v:'(+) Ingresos del mes'};
    monthOrder.forEach(mc=>{cells[ref(ingRow,mc.c)]={t:'n',f:ING_CATS.map(c2=>ref(catRows[c2],mc.c)).join('+'),z:NUMFMT};});
    fillAdditive(cells,ingRow,cols); setLvl(r,0); r++;
    const egrRow=r+1; cells[ref(egrRow,0)]={t:'s',v:'(−) Egresos del mes'};
    monthOrder.forEach(mc=>{cells[ref(egrRow,mc.c)]={t:'n',f:EGR_CATS.map(c2=>ref(catRows[c2],mc.c)).join('+'),z:NUMFMT};});
    fillAdditive(cells,egrRow,cols); setLvl(r,0); r++;
    const flujoRow=r+1; cells[ref(flujoRow,0)]={t:'s',v:'(=) Flujo neto'};
    monthOrder.forEach(mc=>{cells[ref(flujoRow,mc.c)]={t:'n',f:`${ref(ingRow,mc.c)}-${ref(egrRow,mc.c)}`,z:NUMFMT};});
    fillAdditive(cells,flujoRow,cols); setLvl(r,0); r++;
    const saldoFinRow=r+1; cells[ref(saldoFinRow,0)]={t:'s',v:'(=) Saldo final caja'};
    monthOrder.forEach(mc=>{cells[ref(saldoFinRow,mc.c)]={t:'n',f:`${ref(saldoIniRow,mc.c)}+${ref(flujoRow,mc.c)}`,z:NUMFMT};});
    cols.forEach(col=>{ if(col.kind==='temp'){const last=col.members[col.members.length-1];cells[ref(saldoFinRow,col.c)]={t:'n',f:`${ref(saldoFinRow,last)}`,z:NUMFMT};} else if(col.kind==='grand'){const lm=monthOrder[monthOrder.length-1].c;cells[ref(saldoFinRow,col.c)]={t:'n',f:`${ref(saldoFinRow,lm)}`,z:NUMFMT};} });
    setLvl(r,0); r++;
    // saldo inicial: month0 = suma cruzada saldo inicial empresas; monthK = saldo fin previo
    monthOrder.forEach((mc,k)=>{
      if(k===0){ const parts=empNames.map(n=>`'${sheetName[n]}'!${ref(empBuilt[n].saldoIniRow, mc.c)}`).join('+'); cells[ref(saldoIniRow,mc.c)]={t:'n',f:parts,z:NUMFMT}; }
      else { const prev=monthOrder[k-1].c; cells[ref(saldoIniRow,mc.c)]={t:'n',f:`${ref(saldoFinRow,prev)}`,z:NUMFMT}; }
    });
    cols.forEach(col=>{ if(col.kind==='temp'){const first=col.members[0];cells[ref(saldoIniRow,col.c)]={t:'n',f:`${ref(saldoIniRow,first)}`,z:NUMFMT};} else if(col.kind==='grand'){const fm=monthOrder[0].c;cells[ref(saldoIniRow,col.c)]={t:'n',f:`${ref(saldoIniRow,fm)}`,z:NUMFMT};} });

    const lastCol = cols[cols.length-1].c;
    const ws = cellsToSheet({ cells, rows, merges, lastRow:r, lastCol, cols });
    XLSX.utils.book_append_sheet(wb, ws, 'Consolidado');
  }

  // 4. Append hojas empresa
  empNames.forEach(n => {
    const b = empBuilt[n];
    const ws = cellsToSheet({ cells:b.cells, rows:b.rows, merges:b.merges, lastRow:b.lastRow, lastCol:b.lastCol, cols });
    XLSX.utils.book_append_sheet(wb, ws, sheetName[n]);
  });

  const fname = fileName || `Flujo_Consolidado_Mediterra_${months[months.length-1].label}.xlsx`;
  XLSX.writeFile(wb, fname);
  return fname;
}
