/* eslint-disable */
// Controles del SITIO DE LLAMADA (regla 10): la pantalla aplica las reglas de la vista
// semanal en la acción que escribe, no solo en la celda. Leen el código real de
// FinanzasModule.jsx. Puntos ciegos: un alias o un spread por variable no se ve.
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "FinanzasModule.jsx"), "utf8");
const bloque = (desde, largo = 1500) => { const i = src.indexOf(desde); if (i < 0) throw new Error("no encontrado: " + desde); return src.slice(i, i + largo); };

describe("vista semanal: sitios de llamada", () => {
  test("Reporte Semanal: la ventana parte en la MISMA semana en curso que la vista semanal", () => {
    const f = bloque("function reporte_getMovimientos4Semanas", 4000);
    expect(f).toMatch(/const semIdxActual = posicionHoyFlujo\(\)\.semIdx;/);
    expect(f).not.toMatch(/Math\.floor\(\(diaMes - 1\) \/ 7\)/);
  });
  test("Sublínea: editar el mensual con semanas cargadas no escribe (acción, no solo celda)", () => {
    const f = bloque("const updSlVal=(idx,v,semIdx)=>{", 1800);
    const iGuard = f.indexOf('some(s=>currentVals[`${idx}_${s}`]!==undefined)');
    const iBorra = f.indexOf("for(let s=0; s<5; s++) delete newVals");
    expect(iGuard).toBeGreaterThan(-1);
    expect(iGuard).toBeLessThan(iBorra);
    expect(f.slice(iGuard, iBorra)).toMatch(/return;/);
  });
  test("Concepto agregado: updAlVal no escribe el mensual si hay semanas", () => {
    const f = bloque("const updAlVal=(idx,v)=>setAddedLines(p=>{", 400);
    expect(f).toMatch(/!String\(idx\)\.includes\("_"\) && \[0,1,2,3\]\.some\(si=>alVals\[`\$\{idx\}_\$\{si\}`\]!==undefined\)\) return p;/);
  });
  test("Ingresos Financiamiento lleva su semana real (_semProy de Créditos)", () => {
    expect(src).toMatch(/if\(l\.label==="Ingresos Financiamiento"\)[^\n]*\n\s*return \{\.\.\.l, proy: calcIngresosPrestamosEmpresa\(empNombre, creditosData\), _semProy: flujoCredEmpresa\(empNombre, creditosData\)\.ingresos\.sem/);
  });
  test("Ingresos Financiamiento: editar una semana con desembolso de Créditos no lo congela como manual", () => {
    expect(src).toMatch(/_semProy: flujoCredEmpresa\(empNombre, creditosData\)\.ingresos\.sem, _semProyCreditos:true\}/);
    const f = bloque("const handleEditProy = useCallback(", 4000);
    const iGuard = f.indexOf("l0?._semProyCreditos");
    const iSemilla = f.indexOf("semillaSemanal(");
    expect(iGuard).toBeGreaterThan(-1);
    expect(iGuard).toBeLessThan(iSemilla);
    expect(f.slice(iGuard, f.indexOf("const c = cambioAlCargarSemana(")) ).toMatch(/return;/);
  });
  test("Sub-filas de Ingreso Renovación: sin semana inventada", () => {
    const f = bloque('line.label==="Ingreso Renovación"&&(()=>{', 2500);
    expect(f).not.toMatch(/col\.isLastInMonth\?raw/);
  });
});
