/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// WATERFALL DESDE EL SALDO BANCARIO DE CORTE (oct-2026) — modelo puro
//
// Identidad que se muestra:  saldo al corte + flujo proyectado = saldo final.
//
// · Saldo al corte: el de Saldos Bancos (mismo criterio de conversión que el
//   resto de la app: el US$ guardado con cada saldo). Cada cuenta tiene su
//   fecha; la de la sociedad es la MÁS RECIENTE y, si sus cuentas difieren, se
//   declara (lo ocurrido entre esas fechas puede estar o no en el saldo).
// · Mes del corte: la proyección es MENSUAL, sin fecha por movimiento, así que no
//   se puede separar qué parte del mes ya está en el banco. Ese mes NO entra a
//   la identidad (no puede duplicar nada ya cobrado o pagado) y se muestra aparte
//   con su monto, junto con el saldo final que resultaría si estuviera completo
//   pendiente. Lo que falte cobrar o pagar de ese mes queda fuera del saldo final
//   y así se dice.
// · Proyectado: los meses POSTERIORES al mes del corte.
// · Histórico: los meses de la temporada anteriores al mes del corte. Ya están en
//   el saldo bancario; se informan y no vuelven a sumar.
// · Temporada futura: su saldo inicial es el saldo al corte más el flujo
//   proyectado de los meses que median (puente). No se inventa ningún saldo de
//   inicio de temporada: ese saldo histórico no se guarda.
// · Temporada terminada antes del mes del corte: no hay proyección; solo
//   histórico.
// · Sin saldo bancario registrado: se usa el saldo base del código, SIN FECHA,
//   desde el mes en curso (comportamiento anterior) y se declara.
// ═══════════════════════════════════════════════════════════════════════════════

const MN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const num = (v) => Number(v) || 0;
const sumar = (arr, idx) => idx.reduce((s, i) => s + num(arr[i]), 0);

export function rotuloMesDeFecha(fechaISO) {
  const [y, m] = String(fechaISO).slice(0, 10).split("-").map(Number);
  if (!y || !m) return null;
  return `${MN[m - 1]}-${String(y).slice(2)}`;
}

// cuentas: las vigentes de la sociedad (cuentasSaldoEmpresa), con su `fecha`.
export function corteEmpresa(cuentas, meses, mesIdxHoy) {
  const fechas = (cuentas || []).map(c => String(c.fecha || "").slice(0, 10)).filter(Boolean).sort();
  if (!fechas.length) return { conSaldo: false, fecha: null, fechaMin: null, fechasDistintas: false, mesIdx: mesIdxHoy, mes: meses[mesIdxHoy] };
  const fecha = fechas[fechas.length - 1], fechaMin = fechas[0];
  const mes = rotuloMesDeFecha(fecha);
  const ix = meses.indexOf(mes);
  // Corte anterior al horizonte: todos los meses del horizonte son posteriores.
  return { conSaldo: true, fecha, fechaMin, fechasDistintas: fecha !== fechaMin, mesIdx: ix >= 0 ? ix : -1, mes: ix >= 0 ? mes : null };
}

// flujo: arreglo mensual (63 meses) con signo; idx: índices de la temporada.
export function planEmpresa({ flujo = [], idx = [], saldoCorte = 0, corte }) {
  const mc = corte.mesIdx;
  const first = idx[0], last = idx[idx.length - 1];
  const historico = idx.filter(i => i < mc);
  const corteEnTemporada = idx.includes(mc);
  const proyectados = idx.filter(i => i > mc);
  const puente = [];
  for (let i = mc + 1; i < first; i++) puente.push(i);
  const flujoHistorico = sumar(flujo, historico);
  const flujoMesCorte = corteEnTemporada ? num(flujo[mc]) : 0;
  const base = { historico, proyectados, puente, corteEnTemporada, flujoHistorico, flujoMesCorte, corte };
  if (!proyectados.length || last === undefined) {
    return { ...base, estado: "terminada", saldoInicio: null, flujoProyectado: 0, saldoFinal: null, saldoFinalConMesCorte: null };
  }
  const saldoInicio = num(saldoCorte) + sumar(flujo, puente);
  const flujoProyectado = sumar(flujo, proyectados);
  const saldoFinal = saldoInicio + flujoProyectado;
  return { ...base, estado: first > mc ? "futura" : "en_curso", saldoInicio, flujoProyectado, saldoFinal,
    saldoFinalConMesCorte: saldoFinal + flujoMesCorte };
}

// Conciliación mes a mes (una fila por sociedad y mes) desde el mes más antiguo
// entre el inicio de la temporada y el mes del corte, hasta el fin de temporada.
export function conciliacionMensual({ empresas, flujoPorEmp, saldoCortePorEmp, cortePorEmp, idx, meses }) {
  const filas = [];
  const last = idx[idx.length - 1];
  empresas.forEach(n => {
    const c = cortePorEmp[n], f = flujoPorEmp[n] || [];
    const desde = Math.max(0, Math.min(idx[0], c.mesIdx));
    let acum = num(saldoCortePorEmp[n]);
    for (let i = desde; i <= last; i++) {
      const enTemp = idx.includes(i);
      let clase;
      if (i < c.mesIdx) { if (!enTemp) continue; clase = "historico"; }
      else if (i === c.mesIdx) clase = "mes_corte";
      else clase = enTemp ? "proyectado" : "puente";
      const v = num(f[i]);
      if (clase === "proyectado" || clase === "puente") acum += v;
      filas.push({ empresa: n, idx: i, mes: meses[i], clase, flujo: v,
        saldoAcum: (clase === "proyectado" || clase === "puente") ? acum : null });
    }
  });
  return filas;
}
