/* Diagnóstico del calendario semanal original (Apr-26..Dec-27), sin dependencias.
   Regla de la app para ubicar una fecha (semanaDeDate): semana que empieza en
   domingo y la 1 contiene el 1-ene. Una fecha cuya semana no está en la lista del
   mes va a la ÚLTIMA semana del mes (semanaEnMes).
   Uso: node scripts/calendario/diagnostico.mjs [--md] */
const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MES_ES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
export const TABLA = {"Apr-26":["S14","S15","S16","S17"],"May-26":["S18","S19","S20","S21"],"Jun-26":["S22","S23","S24","S25"],"Jul-26":["S27","S28","S29","S30"],"Aug-26":["S31","S32","S33","S34"],"Sep-26":["S36","S37","S38","S39"],"Oct-26":["S40","S41","S42","S43"],"Nov-26":["S44","S45","S46","S47"],"Dec-26":["S48","S49","S50","S51"],"Jan-27":["S01","S02","S03","S04"],"Feb-27":["S05","S06","S07","S08"],"Mar-27":["S09","S10","S11","S12"],"Apr-27":["S13","S14","S15","S16"],"May-27":["S17","S18","S19","S20"],"Jun-27":["S21","S22","S23","S24"],"Jul-27":["S27","S28","S29","S30"],"Aug-27":["S31","S32","S33","S34"],"Sep-27":["S36","S37","S38","S39"],"Oct-27":["S40","S41","S42","S43"],"Nov-27":["S44","S45","S46","S47"],"Dec-27":["S48","S49","S50","S51"]};
// misma regla que semanaDeDate (días con Date.UTC: no depende de la zona horaria)
const sem = (d) => { const y = d.getFullYear(); const dias = (Date.UTC(y, d.getMonth(), d.getDate()) - Date.UTC(y, 0, 1)) / 86400000; return Math.ceil((dias + new Date(y, 0, 1).getDay() + 1) / 7); };
const lbl = (n) => `S${String(n).padStart(2, "0")}`;
export function diagnostico() {
  return Object.entries(TABLA).map(([mes, lista]) => {
    const [m, y] = mes.split("-"); const mi = MN.indexOf(m), yy = 2000 + +y;
    const ult = new Date(yy, mi + 1, 0).getDate();
    const w1 = sem(new Date(yy, mi, 1));
    const correcta = [0, 1, 2, 3].map(k => lbl(w1 + k));
    // días del mes que caen en cada posición (S1..S4) con la tabla actual y con la correcta
    const dias = (tabla) => { const out = [[], [], [], []]; for (let d = 1; d <= ult; d++) { const s = lbl(sem(new Date(yy, mi, d))); const k = tabla.indexOf(s); out[k >= 0 ? k : 3].push(d); } return out; };
    const rango = (a) => a.length ? `${a[0]}–${a[a.length - 1]} ${MES_ES[mi]}` : "ningún día";
    const actual = dias(lista), propuesta = dias(correcta);
    return { mes, tabla: lista, correcta, desfasado: JSON.stringify(lista) !== JSON.stringify(correcta),
      diasActual: actual.map(rango), diasPropuesta: propuesta.map(rango),
      // primera etiqueta de la tabla: qué fechas representa en realidad
      etiquetaS1: (() => { const n = +lista[0].slice(1); const ini = new Date(yy, 0, 1); ini.setDate(ini.getDate() - ini.getDay() + (n - 1) * 7); const fin = new Date(ini); fin.setDate(fin.getDate() + 6); return `${ini.getDate()} ${MES_ES[ini.getMonth()]}–${fin.getDate()} ${MES_ES[fin.getMonth()]}`; })(),
      mapa: Object.fromEntries(lista.map((l, k) => [l, correcta[k]])) };
  });
}
if (process.argv[1] && process.argv[1].endsWith("diagnostico.mjs")) {
  const r = diagnostico(), des = r.filter(x => x.desfasado);
  if (process.argv.includes("--md")) {
    console.log("| Mes | Tabla actual | Correcta (regla de la app) | La etiqueta S1 actual cubre | Días del mes en S1/S2/S3/S4 hoy | Con la tabla correcta | Clave antigua → nueva |");
    console.log("|---|---|---|---|---|---|---|");
    des.forEach(x => console.log(`| ${x.mes} | ${x.tabla.join(" ")} | ${x.correcta.join(" ")} | ${x.etiquetaS1} | ${x.diasActual.join(" · ")} | ${x.diasPropuesta.join(" · ")} | ${Object.entries(x.mapa).map(([a, b]) => `${a}→${b}`).join(", ")} |`));
  } else console.log(JSON.stringify({ desfasados: des.length, total: r.length, meses: des }, null, 2));
}
