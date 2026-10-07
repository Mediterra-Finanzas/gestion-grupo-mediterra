/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// PROGRAMAS COMERCIALES Y LIQUIDACIÓN — Allegria Foods
//
// Pantalla de la operación: estimaciones sin contraparte, programas de
// clientes y productores que llegan durante la temporada, y los cobros y
// pagos reales. El cálculo está en src/programas.js; acá solo se edita.
//
// Lo que la pantalla tiene que dejar obvio:
//   · Tres cifras distintas por cuota: TOTAL ACORDADO, IMPUTADO y
//     PENDIENTE QUE SUSTITUYE ESTIMACIÓN. Imputar no cambia el acuerdo.
//   · Un movimiento declara qué cumple. Si no se sabe, queda pendiente de
//     conciliación: visible y sin descontar de ninguna liquidación.
//   · Una cuota en borrador no consume estimación, pero su cobro descuenta.
//   · Nada se borra con historial: se archiva con motivo.
// ═══════════════════════════════════════════════════════════════════
import React, { useState } from "react";
import InputNumero from "./InputNumero.jsx";
import {
  resumenLado,
  normalizarPrograma, normalizarCuota, nuevoIdPrograma, nuevoIdCuota,
  cuotaAcordado, cuotaRealizado, cuotaPendiente, cuotaSustituye,
  estAcordado, estPendiente, estDisponible, estSobreSustituida,
  efectoImputacion, imputarMovimiento, moverRealizacion,
  archivarPrograma, tieneHistorial, nuevoMovimientoSinAsignar, esDato,
  aplicarMovimiento, aplicadoDeMovimiento, sinAplicarDeMovimiento, anularMovimientoSinAsignar,
  registrarDecisionSinFecha, normalizarSaldo, resumenSaldo, puedeReconocer,
  agregarAplicacion, ejecutarAplicacion, aplicarCompensacion,
  aplazarAplicacion, anularAplicacion, inconsistenciasSaldos,
  excedentePorReconocer, reconocerDesdePosicion, destinosCompensacion, previaCompensacion,
  agregarAntecedente, completarAntecedente, anularAntecedente,
  antecedenteFaltantes, normalizarAntecedente,
  registrarEstimacionCaja, quitarEstimacionCaja, mesProyeccion,
  cuotaEstimada, cuotaVencidaContractual, MODELO_VERSION,
} from "./programas.js";
import { realizacionesVigentes, anularRealizacion, normalizarAnticipo } from "./anticipos.js";
// Misma fuente de horizonte y corte que el flujo y el modelo.
import { mIdx as mIdxHor, mesIdxActual as mesIdxActualHor } from "./horizonte.js";

const MODAL_LBL = {
  usd_kg: "US$/kg × kilos del programa",
  monto: "Monto fijo en USD",
  por_confirmar: "Por confirmar",
};
const ESTADO_LBL = { borrador: "borrador", vigente: "vigente", anulada: "anulada" };
const num = (x) => new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(Number(x) || 0);
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// ── Resumen de un lado, con las siete líneas acordadas ─────────────
export function ResumenLado({ r, esCli, C, $$, mesLiq }) {
  if (!r) return null;
  const L = ({ t, v, c, s, sangria }) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, paddingLeft: sangria ? 10 : 0 }}>
      <span style={{ color: C.muted }}>{t}</span>
      <strong style={{ color: c || C.text }}>{s ? `${v}` : $$(v)}</strong>
    </div>
  );
  const cub = r.cubetas || { vencido: 0, horizonte: 0, fuera_horizonte: 0, sin_fecha: 0 };
  return (
    <div style={{ fontSize: 10, color: C.muted, marginTop: 8, lineHeight: 1.75 }}>
      <L t={`${esCli ? "Venta" : "Retorno al productor"} ${r.definitiva !== null ? "definitiva" : "de presupuesto"}`} v={r.base} />
      {r.definitiva !== null && (
        <L t="Variación contra presupuesto" sangria
           v={`${r.variacionBase >= 0 ? "+" : ""}${$$(r.variacionBase)}`}
           c={Math.abs(r.variacionBase) < 0.5 ? C.muted2 : C.warning} s />
      )}
      <L t={esCli ? "Anticipos ya cobrados" : "Anticipos ya pagados"} v={r.realizado}
         c={r.realizado > 0 ? C.success : C.muted2} />
      <L t={`Saldo económico pendiente (${esCli ? "por cobrar" : "por pagar"})`} v={r.saldoEconomico} />

      <div style={{ marginTop: 4, paddingTop: 4, borderTop: `1px dashed ${C.border}` }}>
        <L t="Anticipos pendientes" v={r.pendientes} c={r.pendientes > 0 ? C.warning : C.muted2} />
        {/* Las sangrías de acá SUMAN el total de arriba: son las tres cubetas
            con fecha, excluyentes entre sí. Lo que no es partición va más
            abajo, rotulado como informativo. */}
        {cub.vencido > 0 &&
          <L t="· vencidos, antes del corte (no entran al acumulado)" v={cub.vencido} c={C.danger} sangria />}
        {cub.horizonte > 0 &&
          <L t="· dentro del horizonte" v={cub.horizonte} sangria />}
        {cub.fuera_horizonte > 0 &&
          <L t="· después del horizonte (no tienen columna en el flujo)" v={cub.fuera_horizonte} c={C.warning} sangria />}
        <L t={`Liquidación ${r.ubicacionLiquidacionTexto || (mesLiq ? `(${mesLiq})` : "sin mes")}`} v={r.liquidacion} />
        {r.compensadoAplicado > 0 &&
          <L t="· compensaciones aplicadas que la reducen" v={r.compensadoAplicado} c={C.success} sangria />}
        <L t="Total calendarizado" v={r.totalCalendarizado} />
        {r.pendienteDeCalendarizar > 0 && (
          <>
            <L t="Pendiente de calendarizar (sin fecha)" v={r.pendienteDeCalendarizar} c={C.warning} />
            {r.pendienteSinFechaReservado > 0 && (
              <L t="· anticipos sin fecha, reservados" v={r.pendienteSinFechaReservado} c={C.warning} sangria />
            )}
          </>
        )}
        {(r.vencidoContractual > 0 || r.proyeccionEstimada > 0) && (
          <div style={{ marginTop: 3, color: C.muted2 }}>
            De los montos de arriba, informativo (no se suman a ellos):
            {r.vencidoContractual > 0 && (
              <L t="· con fecha contractual vencida" v={r.vencidoContractual} c={C.danger} sangria />
            )}
            {r.proyeccionEstimada > 0 && (
              <L t="· proyectado sobre fechas ESTIMADAS, no pactadas" v={r.proyeccionEstimada} c={C.warning} sangria />
            )}
          </div>
        )}
      </div>

      {(r.excedenteReal > 0 || r.excesoCompromisos > 0) && (
        <div style={{ marginTop: 4, paddingTop: 4, borderTop: `1px dashed ${C.border}` }}>
          {r.excedenteReal > 0 && (
            <>
              <L t={`Excedente real (${esCli ? "cobrado" : "pagado"} por sobre la base)`} v={r.excedenteReal} c={C.danger} />
              <div style={{ color: C.muted2, paddingLeft: 10 }}>
                Es lo único que puede llegar a ser {esCli ? "una devolución al cliente" : "una recuperación del productor"},
                y solo con respaldo. Si la base es presupuestaria, todavía no es deuda.
              </div>
            </>
          )}
          {r.excesoCompromisos > 0 && (
            <>
              <L t="Exceso de compromisos del calendario" v={r.excesoCompromisos} c={C.warning} />
              <div style={{ color: C.muted2, paddingLeft: 10 }}>
                El calendario compromete más de lo que esta operación soporta. Hay que revisar el calendario o la base:
                no crea ninguna obligación.
              </div>
            </>
          )}
        </div>
      )}

      {r.pendienteSinFechaEnLiquidacion > 0 && (
        <div style={{ color: C.muted2, marginTop: 3 }}>
          {$$(r.pendienteSinFechaEnLiquidacion)} de anticipos sin fecha están dentro de la liquidación.
        </div>
      )}
      {r.sobreSustitucion > 0 && (
        <div style={{ color: C.danger, marginTop: 3 }}>
          Sobre-sustitución de {$$(r.sobreSustitucion)}: hay cuotas vigentes que reemplazan más estimación de la disponible.
        </div>
      )}
      {r.sinAsignarUsd > 0 && (
        <div style={{ color: C.warning, marginTop: 3 }}>
          {$$(r.sinAsignarUsd)} en movimientos pendientes de conciliación: no descuentan de esta liquidación.
        </div>
      )}
      {r.realizadoFuera > 0 && (
        <div style={{ color: C.muted2, marginTop: 3 }}>
          {$$(r.realizadoFuera)} {esCli ? "cobrados" : "pagados"} en operaciones fuera de presupuesto: no reducen esta liquidación.
        </div>
      )}
      {r.faltanDatos > 0 && (
        <div style={{ color: C.warning, marginTop: 3 }}>
          {r.faltanDatos} cuota(s) vigente(s) sin datos suficientes: su acordado no se calcula y no se asume cero.
        </div>
      )}
      {!r.cuadra && (
        <div style={{ color: C.danger, marginTop: 3 }}>
          El cuadre de esta columna no cierra. Revisa los avisos de arriba antes de usar la cifra.
        </div>
      )}
      {(r.posiciones || []).length > 0 && (
        <details style={{ marginTop: 5 }}>
          <summary style={{ cursor: "pointer", color: C.muted2 }}>
            {r.posiciones.length} operación(es) con posición propia · bloque presupuestario {$$(r.bloque?.base)}
          </summary>
          {r.posiciones.map(q => (
            <div key={q.programaId} style={{ fontSize: 9, color: C.muted2, marginTop: 2 }}>
              {q.contraparte || "sin nombre"} · base {$$(q.base)} · {esCli ? "cobrado" : "pagado"} {$$(q.realizado)} ·
              {" "}liquidación {$$(q.liquidacion)}
              {q.excedenteReal > 0 ? ` · excedente real ${$$(q.excedenteReal)}` : ""}
              {q.variacionBase !== null ? ` · variación ${q.variacionBase >= 0 ? "+" : ""}${$$(q.variacionBase)}` : ""}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

// ── Panel completo ────────────────────────────────────────────────
export default function ProgramasPanel({
  programas = [], onChange, estimaciones = {}, onEstimaciones, resumenes = {},
  definitivas = {}, onDefinitiva, sinAsignar = [], onSinAsignar,
  saldosFavor = [], onSaldosFavor, decisionesSinFecha = {}, onDecisionSinFecha,
  modeloVersion = 1,
  kgFruta = 0, meses = [], readOnly = false, usuario = "", C, $$,
}) {
  const lista = (Array.isArray(programas) ? programas : []).map(normalizarPrograma);
  const setLista = (next) => { if (!readOnly && onChange) onChange(next); };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 8 }}>
        {["cliente", "productor"].map(lado => (
          <Columna key={lado} lado={lado} C={C} $$={$$} meses={meses} readOnly={readOnly} usuario={usuario}
            kgFruta={kgFruta}
            programas={lista.filter(p => p.lado === lado)}
            todos={lista}
            estimaciones={estimaciones[lado] || []}
            onEstimaciones={v => onEstimaciones && onEstimaciones(lado, v)}
            resumen={resumenes[lado]}
            definitiva={definitivas[lado] || null}
            onDefinitiva={v => onDefinitiva && onDefinitiva(lado, v)}
            saldosFavor={(saldosFavor || []).filter(x => x && x.lado === lado)}
            onSaldosFavor={next => onSaldosFavor && onSaldosFavor([
              ...(saldosFavor || []).filter(x => x && x.lado !== lado), ...next])}
            decisiones={decisionesSinFecha} onDecision={onDecisionSinFecha}
            modeloVersion={modeloVersion}
            sinAsignar={(sinAsignar || []).filter(m => m && m.lado === lado)}
            onSinAsignar={next => onSinAsignar && onSinAsignar([
              ...(sinAsignar || []).filter(m => m && m.lado !== lado), ...next])}
            setLista={setLista}
          />
        ))}
      </div>
    </div>
  );
}

function Columna({
  lado, programas, todos, estimaciones, onEstimaciones, resumen, definitiva, onDefinitiva,
  sinAsignar, onSinAsignar, saldosFavor = [], onSaldosFavor,
  decisiones = {}, onDecision, modeloVersion = 1,
  kgFruta, meses, readOnly, usuario, C, $$, setLista,
}) {
  const esCli = lado === "cliente";
  const col = esCli ? C.green : C.red;
  const [verArchivados, setVerArchivados] = useState(false);
  const [draftMov, setDraftMov] = useState(null);
  const [aplic, setAplic] = useState(null);           // aplicar un movimiento de la bandeja
  const [anulMov, setAnulMov] = useState(null);       // anular un movimiento, con motivo
  const [archDraft, setArchDraft] = useState(null);   // archivar con motivo, sin prompt
  const vivos = programas.filter(p => !p.archivado);
  const archivados = programas.filter(p => p.archivado);
  const inSt = { padding: "4px 7px", background: C.card2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 11, outline: "none" };
  const selSt = { ...inSt, padding: "4px 6px" };

  // ── Destinos posibles de un movimiento de la bandeja ─────────────
  // Las mismas estimaciones y cuotas de este lado que ya se usan para
  // reasignar. Una sola lista: no hay dos nociones de destino.
  const destinos = [
    ...(estimaciones || []).map(normalizarAnticipo).map(e => ({ tipo: "estimacion", id: e.id,
      etiqueta: `estimación ${e.mes || "sin mes"} · acordado ${$$(estAcordado(e, kgFruta))}` })),
    ...vivos.flatMap(x => x.cuotas.map(c => ({ tipo: "cuota", id: c.id,
      etiqueta: `${c.historico ? "registro histórico" : "cuota " + (c.fecha_prevista || c.mes || "sin fecha")}`
        + ` · ${x.contraparte || "sin nombre"} · acordado ${$$(cuotaAcordado(c, x.kilos).valor || 0)}` }))),
  ];
  const resumenCon = (estsX, progsX) => resumenLado({
    estimaciones: estsX, programas: progsX, lado, kgFruta,
    basePresupuesto: resumen?.basePresupuesto || 0, mIdx: mIdxHor,
    mesIdxActual: mesIdxActualHor(), modeloVersion, decisionesSinFecha: decisiones,
    sinAsignar,
  });

  const confirmarAplicar = (mov) => {
    const destino = destinos.find(d => `${d.tipo}:${d.id}` === `${aplic.destinoTipo}:${aplic.destinoId}`);
    if (!destino) { window.alert("Elige a qué estimación o cuota se aplica el movimiento."); return; }
    let res;
    try {
      res = aplicarMovimiento({ movimiento: mov, estimaciones, programas: todos,
        usd: aplic.usd, hacia: { tipo: destino.tipo, id: destino.id }, usuario });
    } catch (e) { window.alert(e.message); return; }
    const rA = resumenCon(estimaciones, todos), rD = resumenCon(res.estimaciones, res.programas);
    const ok = window.confirm(
      `Aplicar ${$$(res.realizacion.usd)} del movimiento del ${mov.fecha}` +
      (mov.referencia ? ` (${mov.referencia})` : "") + `.\n\n` +
      `A: ${destino.etiqueta}\n\n` +
      `Un movimiento de la bandeja NO descontaba nada todavía. Al aplicarlo pasa a ser ` +
      `${esCli ? "cobro" : "pago"} de esa operación y recién ahí descuenta.\n\n` +
      `Del movimiento: aplicado ${$$(res.aplicado)} · sin asignar ${$$(res.sinAplicar)}\n` +
      `Realizado del lado:     ${$$(rA.realizado)} → ${$$(rD.realizado)}  (sube: antes no descontaba)\n` +
      `Pendientes con fecha:   ${$$(rA.pendientes)} → ${$$(rD.pendientes)}\n` +
      `Liquidación:            ${$$(rA.liquidacion)} → ${$$(rD.liquidacion)}\n` +
      `Saldo económico:        ${$$(rA.saldoEconomico)} → ${$$(rD.saldoEconomico)}\n\n` +
      `El dinero registrado no aumenta: el movimiento se consume, no se duplica.\n\n¿Confirmas?`);
    if (!ok) return;
    onEstimaciones(res.estimaciones);
    setLista(res.programas);
    setAplic(null);
  };

  const confirmarAnularMov = (mov) => {
    try {
      const anulado = anularMovimientoSinAsignar(mov, { motivo: anulMov.motivo, usuario,
        estimaciones, programas: todos });
      onSinAsignar(sinAsignar.map(x => (x.id === mov.id ? anulado : x)));
      setAnulMov(null);
    } catch (e) { setAnulMov({ ...anulMov, error: e.message }); }
  };

  const agregar = () => setLista([...todos, normalizarPrograma({
    id: nuevoIdPrograma(), lado, contraparte: "", kilos: null, cuotas: [], antecedentes: [],
  })]);
  const reemplazar = (id, nuevo) => setLista(todos.map(p => (p.id === id ? normalizarPrograma(nuevo) : p)));
  const quitar = (p) => {
    if (tieneHistorial(p)) {
      window.alert("Este programa tiene movimientos o sustituciones: no se borra.\n\n" +
        "Archívalo con motivo para conservar la trazabilidad.");
      return;
    }
    if (!window.confirm(`Eliminar el programa de «${p.contraparte || "sin nombre"}»? No tiene historial.`)) return;
    setLista(todos.filter(x => x.id !== p.id));
  };
  const archivar = (p) => {
    const ya = p.cuotas.reduce((s2, c) => s2 + cuotaRealizado(c), 0);
    setArchDraft({ id: p.id, contraparte: p.contraparte || "sin nombre", motivo: "", realizado: ya });
  };
  const confirmarArchivar = () => {
    const p = todos.find(x => x.id === archDraft.id);
    if (!p) { setArchDraft(null); return; }
    try {
      const arch = archivarPrograma(p, { motivo: archDraft.motivo, usuario });
      reemplazar(p.id, arch);
      setArchDraft(null);
    } catch (e) { setArchDraft({ ...archDraft, error: e.message }); }
  };

  return (
    <div style={{ background: `${col}0d`, border: `1px solid ${col}33`, borderRadius: 10, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: col }}>
          {esCli ? "Clientes" : "Productores"}
        </span>
        {!readOnly && (
          <button onClick={agregar}
            style={{ marginLeft: "auto", padding: "3px 9px", background: `${col}18`, border: `1px solid ${col}55`,
              borderRadius: 6, color: col, cursor: "pointer", fontSize: 10, fontWeight: 700 }}>
            + Agregar {esCli ? "cliente" : "productor"}
          </button>
        )}
      </div>

      <AvisoCompatibilidad avisos={resumen?.avisosCompatibilidad || []} decisiones={decisiones}
        onDecision={onDecision} esCli={esCli} C={C} $$={$$} readOnly={readOnly} usuario={usuario} />

      <LiquidacionDefinitiva definitiva={definitiva} onDefinitiva={onDefinitiva} resumen={resumen}
        esCli={esCli} C={C} $$={$$} readOnly={readOnly} usuario={usuario} />

      {archDraft && !readOnly && (
        <div style={{ marginBottom: 8, padding: "7px 8px", background: C.cardAlt,
          border: `1px solid ${C.warning}55`, borderRadius: 7 }}>
          <div style={{ fontSize: 10, color: C.text, fontWeight: 700 }}>
            Archivar «{archDraft.contraparte}»
          </div>
          <div style={{ fontSize: 9, color: C.muted2, margin: "3px 0 5px", lineHeight: 1.6 }}>
            Sus cuotas dejan de proyectar y de sustituir estimación, así que la estimación recupera
            pendiente. Los {$$(archDraft.realizado)} ya {esCli ? "cobrados" : "pagados"} NO se mueven
            y siguen descontando.
          </div>
          <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
            <input type="text" value={archDraft.motivo} placeholder="motivo del archivo (queda registrado)"
              onChange={e => setArchDraft({ ...archDraft, motivo: e.target.value, error: null })}
              style={{ padding: "3px 6px", minWidth: 220, background: C.card2,
                border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 10 }} />
            <button onClick={confirmarArchivar}
              style={{ padding: "3px 9px", background: C.warning, border: "none", borderRadius: 6,
                color: "#fff", cursor: "pointer", fontSize: 9, fontWeight: 700 }}>Archivar</button>
            <button onClick={() => setArchDraft(null)}
              style={{ padding: "3px 7px", background: "transparent", border: `1px solid ${C.border}`,
                borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 9 }}>Cancelar</button>
          </div>
          {archDraft.error && (
            <div style={{ fontSize: 9, color: C.danger, marginTop: 3 }}>{archDraft.error}</div>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {vivos.length === 0 && (
          <div style={{ fontSize: 10, color: C.muted2, fontStyle: "italic" }}>
            Sin {esCli ? "clientes" : "productores"} cargados. La estimación de arriba sigue proyectando sola.
          </div>
        )}
        {vivos.map(p => (
          <Tarjeta key={p.id} p={p} esCli={esCli} col={col} C={C} $$={$$} meses={meses}
            readOnly={readOnly} usuario={usuario} kgFruta={kgFruta}
            presupuestoGlobal={resumen?.basePresupuesto || 0}
            modeloVersion={modeloVersion} decisiones={decisiones}
            estimaciones={estimaciones} onEstimaciones={onEstimaciones}
            todos={todos} setLista={setLista}
            onReemplazar={nuevo => reemplazar(p.id, nuevo)}
            sinAsignar={sinAsignar} onSinAsignar={onSinAsignar}
            onBorrar={() => quitar(p)} onArchivar={() => archivar(p)} />
        ))}
      </div>

      {archivados.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button onClick={() => setVerArchivados(v => !v)}
            style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 9, textDecoration: "underline" }}>
            {archivados.length} programa(s) archivado(s)
          </button>
          {verArchivados && archivados.map(p => (
            <div key={p.id} style={{ fontSize: 9, color: C.muted2, marginTop: 3 }}>
              {p.contraparte || "sin nombre"} · {p.motivoArchivo} · {$$(p.cuotas.reduce((s, c) => s + cuotaRealizado(c), 0))}
              {" "}{esCli ? "cobrados" : "pagados"} siguen descontando
            </div>
          ))}
        </div>
      )}

      <SaldosFavorBloque saldos={saldosFavor} onSaldos={onSaldosFavor} esCli={esCli} C={C} $$={$$}
        meses={meses} readOnly={readOnly} usuario={usuario} resumen={resumen} />

      {/* Bandeja de conciliación */}
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px dashed ${C.border}` }}>
        <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 3 }}>
          Movimientos pendientes de conciliación
        </div>
        {sinAsignar.length === 0 && (
          <div style={{ fontSize: 9, color: C.muted2, fontStyle: "italic" }}>Ninguno.</div>
        )}
        {sinAsignar.map(m => {
          const ctxMov = { estimaciones, programas: todos };
          const aplicado = aplicadoDeMovimiento(m.id, ctxMov);
          const resta = sinAplicarDeMovimiento(m, ctxMov);
          return (
          <div key={m.id} style={{ marginTop: 3, paddingTop: 3, borderTop: `1px dotted ${C.border}` }}>
            <div style={{ display: "flex", gap: 7, fontSize: 9, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ color: C.muted }}>{m.fecha}</span>
              <strong style={{ color: m.anulada ? C.muted2 : C.warning,
                textDecoration: m.anulada ? "line-through" : "none" }}>{$$(m.usd)}</strong>
              {m.referencia && <span style={{ color: C.muted2, fontStyle: "italic" }}>{m.referencia}</span>}
              {m.anulada ? (
                <span style={{ color: C.muted2 }}>anulado · {m.motivoAnulacion}</span>
              ) : (
                <>
                  {/* Cada importe con su efecto, para que no quede dudoso cuál
                      descuenta: el aplicado YA descuenta en su operación; el
                      que sigue sin asignar es el único que no descuenta. */}
                  <span style={{ color: aplicado > 0 ? C.success : C.muted2 }}>
                    aplicado {$$(aplicado)}{aplicado > 0 ? " · ya descuenta en su operación" : ""}
                  </span>
                  <span style={{ color: resta > 0 ? C.warning : C.muted2 }}>
                    sin asignar {$$(resta)}{resta > 0 ? " · solo este importe no descuenta" : ""}
                  </span>
                  {!readOnly && resta > 0 && (
                    <button onClick={() => setAplic({ movId: m.id, usd: resta, destinoTipo: "", destinoId: "" })}
                      style={{ background: "transparent", border: "none", color: C.success, cursor: "pointer", fontSize: 9, textDecoration: "underline" }}>
                      aplicar
                    </button>
                  )}
                  {!readOnly && (
                    <button onClick={() => setAnulMov({ id: m.id, motivo: "", error: null })}
                      style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 9, textDecoration: "underline" }}>anular</button>
                  )}
                </>
              )}
            </div>
            {aplic && aplic.movId === m.id && !readOnly && (
              <div style={{ marginTop: 3, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 9, color: C.muted }}>Aplicar</span>
                <InputNumero formato="monto" value={aplic.usd} placeholder="US$"
                  onChange={v => setAplic({ ...aplic, usd: v })}
                  style={{ padding: "3px 6px", width: 100, textAlign: "right", background: C.card2,
                    border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 10 }} />
                <span style={{ fontSize: 9, color: C.muted }}>de {$$(resta)} a</span>
                <select value={`${aplic.destinoTipo}:${aplic.destinoId}`}
                  onChange={e => { const [t, ...r] = e.target.value.split(":");
                    setAplic({ ...aplic, destinoTipo: t, destinoId: r.join(":") }); }}
                  style={{ ...selSt, fontSize: 10, maxWidth: 300 }}>
                  <option value=":">— destino —</option>
                  {destinos.map(d => (
                    <option key={`${d.tipo}:${d.id}`} value={`${d.tipo}:${d.id}`}>{d.etiqueta}</option>
                  ))}
                </select>
                <button onClick={() => confirmarAplicar(m)}
                  style={{ padding: "3px 9px", background: C.success, border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 9, fontWeight: 700 }}>
                  Ver efecto y aplicar
                </button>
                <button onClick={() => setAplic(null)}
                  style={{ padding: "3px 7px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 9 }}>Cancelar</button>
                <div style={{ flexBasis: "100%", fontSize: 9, color: C.muted2, marginTop: 2 }}>
                  Mientras está sin asignar, el movimiento no descuenta de ninguna liquidación.
                  Al aplicarlo, ESE importe pasa a ser cobro/pago de la operación destino y
                  descuenta de SU liquidación; el realizado sube y el dinero registrado no. Se
                  puede aplicar por partes: lo que quede sin asignar sigue sin descontar.
                </div>
              </div>
            )}
            {anulMov && anulMov.id === m.id && !readOnly && (
              <div style={{ marginTop: 3, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                <input type="text" value={anulMov.motivo} placeholder="motivo de la anulación"
                  onChange={e => setAnulMov({ ...anulMov, motivo: e.target.value, error: null })}
                  style={{ ...inSt, minWidth: 180, fontSize: 10 }} />
                <button onClick={() => confirmarAnularMov(m)}
                  style={{ padding: "3px 9px", background: C.danger, border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 9, fontWeight: 700 }}>Anular</button>
                <button onClick={() => setAnulMov(null)}
                  style={{ padding: "3px 7px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 9 }}>Cancelar</button>
                <div style={{ flexBasis: "100%", fontSize: 9, color: C.muted2, marginTop: 2 }}>
                  No se borra: queda anulado con su motivo y su historial. Si tiene importes
                  aplicados hay que anular primero esas realizaciones.
                  {anulMov.error && <strong style={{ color: C.danger }}> {anulMov.error}</strong>}
                </div>
              </div>
            )}
          </div>
        );})}
        {!readOnly && (draftMov ? (
          <div style={{ marginTop: 4, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
            <input type="date" value={draftMov.fecha} onChange={e => setDraftMov({ ...draftMov, fecha: e.target.value })}
              style={{ padding: "3px 6px", background: C.card2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 10 }} />
            <InputNumero formato="monto" value={draftMov.usd} placeholder="US$" onChange={n => setDraftMov({ ...draftMov, usd: n })}
              style={{ padding: "3px 6px", width: 100, textAlign: "right", background: C.card2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 10 }} />
            <input type="text" value={draftMov.referencia} placeholder="referencia / cartola"
              onChange={e => setDraftMov({ ...draftMov, referencia: e.target.value })}
              style={{ padding: "3px 6px", minWidth: 130, background: C.card2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 10 }} />
            <button onClick={() => {
              try {
                onSinAsignar([...sinAsignar, nuevoMovimientoSinAsignar({ ...draftMov, lado, usuario })]);
                setDraftMov(null);
              } catch (e) { window.alert(e.message); }
            }} style={{ padding: "3px 9px", background: C.success, border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 9, fontWeight: 700 }}>
              Guardar
            </button>
            <button onClick={() => setDraftMov(null)}
              style={{ padding: "3px 7px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 9 }}>Cancelar</button>
          </div>
        ) : (
          <button onClick={() => setDraftMov({ fecha: hoyISO(), usd: "", referencia: "" })}
            style={{ marginTop: 4, padding: "2px 8px", background: "transparent", border: `1px dashed ${C.border}`,
              borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 9 }}>
            + Registrar {esCli ? "cobro" : "pago"} sin operación identificada
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Liquidación definitiva del lado ───────────────────────────────
function LiquidacionDefinitiva({ definitiva, onDefinitiva, resumen, esCli, C, $$, readOnly, usuario }) {
  const [editando, setEditando] = useState(false);
  const [draft, setDraft] = useState({ total: "", nota: "" });
  if (!definitiva && !editando) {
    return readOnly ? null : (
      <div style={{ marginBottom: 8 }}>
        <button onClick={() => { setDraft({ total: "", nota: "" }); setEditando(true); }}
          style={{ padding: "2px 8px", background: "transparent", border: `1px dashed ${C.border}`,
            borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 9 }}>
          + Cargar liquidación definitiva ({esCli ? "venta real" : "retorno real"})
        </button>
      </div>
    );
  }
  if (editando) {
    return (
      <div style={{ marginBottom: 8, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, color: C.muted, fontWeight: 700 }}>
          {esCli ? "Venta definitiva US$" : "Retorno definitivo US$"}:
        </span>
        <InputNumero formato="monto" value={draft.total} placeholder="US$" onChange={n => setDraft({ ...draft, total: n })}
          style={{ padding: "3px 6px", width: 110, textAlign: "right", background: C.card2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 10 }} />
        <input type="text" value={draft.nota} placeholder="referencia de la liquidación"
          onChange={e => setDraft({ ...draft, nota: e.target.value })}
          style={{ padding: "3px 6px", minWidth: 130, background: C.card2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 10 }} />
        <button onClick={() => {
          if (!(Number(draft.total) > 0)) { window.alert("Ingresa el total definitivo."); return; }
          onDefinitiva({ total: Number(draft.total), nota: draft.nota, usuario, ts: new Date().toISOString() });
          setEditando(false);
        }} style={{ padding: "3px 9px", background: C.success, border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 9, fontWeight: 700 }}>Guardar</button>
        <button onClick={() => setEditando(false)}
          style={{ padding: "3px 7px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 9 }}>Cancelar</button>
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 8, background: `${C.info}11`, border: `1px solid ${C.info}44`, borderRadius: 8, padding: "6px 9px", fontSize: 9, color: C.text }}>
      <strong>Liquidación definitiva cargada: {$$(definitiva.total)}.</strong>{" "}
      Reemplaza la base presupuestada en el flujo. Presupuesto {$$(resumen?.basePresupuesto)} ·
      variación <strong style={{ color: Math.abs(resumen?.variacionBase || 0) < 0.5 ? C.muted2 : C.warning }}>
        {(resumen?.variacionBase || 0) >= 0 ? "+" : ""}{$$(resumen?.variacionBase || 0)}
      </strong>.
      {definitiva.nota ? ` ${definitiva.nota}.` : ""}
      {!readOnly && (
        <> <button onClick={() => { if (window.confirm("Quitar la liquidación definitiva y volver al presupuesto?")) onDefinitiva(null); }}
          style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 9, textDecoration: "underline" }}>quitar</button></>
      )}
    </div>
  );
}

// ── Tarjeta de un programa ────────────────────────────────────────
function Tarjeta({
  p, esCli, col, C, $$, meses, readOnly, usuario, kgFruta, presupuestoGlobal = 0,
  estimaciones, onEstimaciones, todos, setLista, onReemplazar, onBorrar, onArchivar,
  sinAsignar = [], onSinAsignar, modeloVersion = 1, decisiones = {},
}) {
  const [abierto, setAbierto] = useState(true);
  const [form, setForm] = useState(null);       // registrar movimiento
  const [asociar, setAsociar] = useState(null); // mover un movimiento existente
  const [ante, setAnte] = useState(null);       // cargar monto informado
  const [compl, setCompl] = useState(null);     // completar con su fecha real
  const [anulAnte, setAnulAnte] = useState(null);
  const [anulRea, setAnulRea] = useState(null);   // anular un movimiento, sin prompt
  const inSt = { padding: "4px 7px", background: C.card2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 11, outline: "none" };
  const selSt = { ...inSt, padding: "4px 6px" };
  const chip = (t, c) => <span style={{ fontSize: 9, color: c, background: `${c}18`, border: `1px solid ${c}44`, borderRadius: 10, padding: "1px 7px", fontWeight: 700 }}>{t}</span>;

  const totalAcordado = p.cuotas.reduce((s, c) => s + (cuotaAcordado(c, p.kilos).valor || 0), 0);
  const totalRealizado = p.cuotas.reduce((s, c) => s + cuotaRealizado(c), 0);
  const totalPend = p.cuotas.reduce((s, c) => {
    if (c.estado !== "vigente") return s;
    const v = cuotaPendiente(c, p.kilos); return s + (v || 0);
  }, 0);

  const upd = (patch) => onReemplazar({ ...p, ...patch });
  // Presupuesto asignado: se sugiere desde kilos y precio, pero lo confirmas tú.
  // Nunca se recorta ni se amplía solo.
  const sugerencia = (esDato(p.kilos) && esDato(p.precio_usd_kg))
    ? Number(p.kilos) * Number(p.precio_usd_kg) : null;
  const asignadoOtros = (todos || []).filter(x => x.lado === p.lado && x.id !== p.id && !x.archivado)
    .reduce((s2, x) => s2 + (esDato(x.presupuesto_asignado) ? Number(x.presupuesto_asignado) : 0), 0);
  const asignadoTotal = asignadoOtros + (esDato(p.presupuesto_asignado) ? Number(p.presupuesto_asignado) : 0);
  const remanente = presupuestoGlobal - asignadoTotal;
  const confirmarAsignacion = (n) => {
    const nuevoTotal = asignadoOtros + (Number(n) || 0);
    if (nuevoTotal > presupuestoGlobal + 0.5) {
      const dif = nuevoTotal - presupuestoGlobal;
      if (!window.confirm(
        `Las asignaciones sumarían ${$$(nuevoTotal)} contra ${$$(presupuestoGlobal)} de presupuesto: ` +
        `${$$(dif)} de más.\n\n` +
        `Aceptar = es una AMPLIACIÓN y la diferencia queda a la vista.\n` +
        `Cancelar = prefiero REASIGNAR, bajando otra operación primero.\n\n` +
        `En ningún caso se recorta ni se amplía el presupuesto solo.`)) return;
    }
    upd({ presupuesto_asignado: n });
  };
  const updCuota = (id, patch) => onReemplazar({ ...p, cuotas: p.cuotas.map(c => c.id === id ? normalizarCuota({ ...c, ...patch }) : c) });
  // `v: MODELO_VERSION` se estampa al CREAR: así un registro nuevo sin fecha
  // queda reservado (pendiente de calendarizar) y no se confunde con uno
  // antiguo. Lo ya guardado no lleva la marca y conserva su comportamiento.
  const addCuota = () => onReemplazar({ ...p, cuotas: [...p.cuotas, normalizarCuota({
    id: nuevoIdCuota(), estado: "borrador", modalidad: "por_confirmar", v: MODELO_VERSION })] });
  // Un solo registro histórico por programa, en borrador por construcción.
  const addHistorico = () => onReemplazar({ ...p, cuotas: [normalizarCuota({
    id: nuevoIdCuota(), historico: true, modalidad: "por_confirmar", v: MODELO_VERSION,
    nota: `anticipos históricos ${p.contraparte || ""}`.trim() }), ...p.cuotas] });
  const delCuota = (c) => {
    if ((c.realizaciones || []).length > 0) {
      window.alert(`Esta cuota tiene ${$$(cuotaRealizado(c))} registrados. Anula los movimientos antes de borrarla.`);
      return;
    }
    onReemplazar({ ...p, cuotas: p.cuotas.filter(x => x.id !== c.id) });
  };

  // Registrar un movimiento sobre una cuota, preguntando si estaba incluido.
  const guardarMov = () => {
    const usd = Number(form.usd) || 0;
    if (usd <= 0) { window.alert(`Ingresa el monto en US$ efectivamente ${esCli ? "cobrado" : "pagado"}.`); return; }
    if (!form.fecha) { window.alert("Ingresa la fecha real del movimiento."); return; }
    const c = p.cuotas.find(x => x.id === form.cuotaId);
    const ef = efectoImputacion({ cuota: c, kilosPrograma: p.kilos, usd, incluido: true });
    const efAd = efectoImputacion({ cuota: c, kilosPrograma: p.kilos, usd, incluido: false });
    const incluido = window.confirm(
      `¿Este ${esCli ? "cobro" : "pago"} de ${$$(usd)} estaba INCLUIDO en el total acordado de la cuota?\n\n` +
      `Aceptar = incluido:\n` +
      `   total acordado ${$$(ef.acordadoDespues)} · pendiente ${$$(ef.pendienteAntes)} → ${$$(ef.pendienteDespues)}\n\n` +
      `Cancelar = adicional al acuerdo:\n` +
      `   total acordado ${$$(efAd.acordadoAntes)} → ${$$(efAd.acordadoDespues)} · pendiente se mantiene en ${$$(efAd.pendienteDespues)}\n\n` +
      `Imputar no modifica el acuerdo por su cuenta: esta respuesta lo define.`);
    onReemplazar({ ...p, cuotas: p.cuotas.map(c2 => c2.id === form.cuotaId
      ? imputarMovimiento(c2, p.kilos, { fecha: form.fecha, usd, nota: form.nota,
          referencia: form.nota, usuario, incluido })
      : c2) });
    setForm(null);
  };

  const anular = (cuotaId, reaId) => setAnulRea({ cuotaId, reaId, motivo: "" });
  const confirmarAnularRea = () => {
    if (!String(anulRea.motivo || "").trim()) {
      setAnulRea({ ...anulRea, error: "La anulación necesita un motivo para conservar la trazabilidad." });
      return;
    }
    try {
      onReemplazar({ ...p, cuotas: p.cuotas.map(c => c.id === anulRea.cuotaId
        ? normalizarCuota(anularRealizacion(c, anulRea.reaId,
            { motivo: String(anulRea.motivo).trim(), usuario })) : c) });
      setAnulRea(null);
    } catch (e) { setAnulRea({ ...anulRea, error: e.message }); }
  };

  // ── Antecedentes: montos informados sin fecha verificada ────────
  // El monto es dato real; la fecha NO se inventa. No descuenta, no se
  // proyecta y no se afirma conciliado con bancos.
  const antes = (p.antecedentes || []).map(normalizarAntecedente);
  const antesPend = antes.filter(a => a.estado === "pendiente");
  const totalInformado = antesPend.reduce((s2, a) => s2 + (Number(a.usd) || 0), 0);

  const guardarAnte = () => {
    try {
      onReemplazar(agregarAntecedente(p, { ...ante, usuario }));
      setAnte(null);
    } catch (e) { window.alert(e.message); }
  };
  const guardarCompletar = () => {
    try {
      const a = antes.find(x => x.id === compl.id);
      const destino = compl.cuotaId
        ? `la cuota elegida (pasa a contar como ${esCli ? "cobrado" : "pagado"})`
        : "la bandeja de conciliación (sigue sin descontar de ninguna liquidación)";
      if (!window.confirm(
        `Convertir ${$$(a.usd)} con fecha real ${compl.fecha}.\n\n` +
        `Va a ${destino}.\n\n` +
        `El antecedente no se borra: queda marcado como convertido, así el monto no se registra dos veces.`)) return;
      const res = completarAntecedente(p, compl.id, {
        fecha: compl.fecha, cuotaId: compl.cuotaId || null, incluido: true, usuario });
      onReemplazar(res.programa);
      if (res.movimiento && onSinAsignar) onSinAsignar([...(sinAsignar || []), res.movimiento]);
      setCompl(null);
    } catch (e) { window.alert(e.message); }
  };
  const guardarAnulAnte = () => {
    try {
      onReemplazar(anularAntecedente(p, anulAnte.id, { motivo: anulAnte.motivo, usuario }));
      setAnulAnte(null);
    } catch (e) { window.alert(e.message); }
  };

  // ── Reasignar un movimiento ya registrado ───────────────────────
  // Origen y destino pueden ser una estimación o una cuota de este lado. Lo
  // único que el modelo prohíbe es estimación → estimación (reabriría el
  // pendiente de la de origen). La bandeja NO entra: un movimiento sin asignar
  // no es una realización, así que moverlo no es lo mismo y no está soportado.
  const ests = (estimaciones || []).map(normalizarAnticipo);
  const progsLado = (todos || []).filter(x => x.lado === p.lado && !x.archivado);
  const movimientosMovibles = [
    ...ests.flatMap(e => realizacionesVigentes(e).map(r => ({
      reaId: r.id, usd: r.usd, fecha: r.fecha, nota: r.nota,
      desde: { tipo: "estimacion", id: e.id },
      etiqueta: `estimación ${e.mes || "sin mes"} · ${r.fecha} · ${$$(r.usd)}${r.nota ? " · " + r.nota : ""}`,
    }))),
    ...progsLado.flatMap(x => x.cuotas.flatMap(c =>
      (c.realizaciones || []).filter(r => r && !r.anulada).map(r => ({
        reaId: r.id, usd: r.usd, fecha: r.fecha, nota: r.nota,
        desde: { tipo: "cuota", id: c.id },
        etiqueta: `${c.historico ? "registro histórico" : "cuota " + (c.fecha_prevista || c.mes || "sin fecha")}`
          + ` · ${x.contraparte || "sin nombre"} · ${r.fecha} · ${$$(r.usd)}${r.nota ? " · " + r.nota : ""}`,
      })))),
  ];
  const destinos = [
    ...ests.map(e => ({ tipo: "estimacion", id: e.id,
      etiqueta: `estimación ${e.mes || "sin mes"} · acordado ${$$(estAcordado(e, kgFruta))}` })),
    ...progsLado.flatMap(x => x.cuotas.map(c => ({ tipo: "cuota", id: c.id,
      etiqueta: `${c.historico ? "registro histórico" : "cuota " + (c.fecha_prevista || c.mes || "sin fecha")}`
        + ` · ${x.contraparte || "sin nombre"} · acordado ${$$(cuotaAcordado(c, x.kilos).valor || 0)}` }))),
  ];
  const buscarMov = (reaId) => movimientosMovibles.find(m => m.reaId === reaId) || null;
  const buscarDestino = (tipo, id) => destinos.find(d => d.tipo === tipo && d.id === id) || null;

  const pendienteDe = (tipo, id, estsX, progsX) => {
    if (tipo === "estimacion") {
      const e = estsX.map(normalizarAnticipo).find(z => z.id === id);
      // Con `progsX`: el pendiente descuenta lo que la estimación ORIGINÓ, esté
      // donde esté. Sin ese argumento, una estimación cuyo movimiento se movió
      // a una cuota aparecería reabriendo su pendiente, que es justo lo que el
      // modelo prohíbe.
      return e ? (estPendiente(e, kgFruta, progsX) || 0) : 0;
    }
    for (const x of (progsX || [])) {
      const c = x.cuotas.find(z => z.id === id);
      if (c) return cuotaPendiente(c, x.kilos) || 0;
    }
    return 0;
  };
  // El efecto se toma del MISMO resumen que alimenta la pantalla, el flujo y el
  // Excel. No se replica la regla acá: una copia podría divergir y mostrar un
  // número que no es el que después aparece.
  const resumenCon = (estsX, progsX) => resumenLado({
    estimaciones: estsX, programas: progsX, lado: p.lado, kgFruta,
    basePresupuesto: presupuestoGlobal, mIdx: mIdxHor, mesIdxActual: mesIdxActualHor(),
    modeloVersion, decisionesSinFecha: decisiones,
  });

  const confirmarAsociar = () => {
    const { reaId, destinoTipo, destinoId } = asociar;
    const mov = buscarMov(reaId);
    if (!mov) { window.alert("Elige el movimiento a reasignar."); return; }
    const destino = buscarDestino(destinoTipo, destinoId);
    if (!destino) { window.alert("Elige el destino."); return; }
    if (mov.desde.tipo === destino.tipo && mov.desde.id === destino.id) {
      window.alert("El movimiento ya está ahí."); return;
    }
    if (mov.desde.tipo === "estimacion" && destino.tipo === "estimacion") {
      window.alert("Un movimiento no se pasa de una estimación a otra: reabriría el " +
        "pendiente de la de origen.\n\nSi la asignación actual es incorrecta, anúlalo " +
        "con motivo y regístralo donde corresponde."); return;
    }
    let res;
    try {
      res = moverRealizacion({ estimaciones: ests, programas: todos, reaId,
        desde: mov.desde, hacia: { tipo: destino.tipo, id: destino.id }, usuario });
    } catch (e) { window.alert(e.message); return; }
    if (!res.movida) { window.alert("No encontré ese movimiento."); return; }

    // Efecto ANTES de confirmar, con la misma regla del modelo.
    const rA = resumenCon(ests, todos), rD = resumenCon(res.estimaciones, res.programas);
    const realAntes = rA.realizado, realDesp = rD.realizado;
    const dLiq = rD.liquidacion - rA.liquidacion;
    const pOrigAntes = pendienteDe(mov.desde.tipo, mov.desde.id, ests, todos);
    const pOrigDesp  = pendienteDe(mov.desde.tipo, mov.desde.id, res.estimaciones, res.programas);
    const pDestAntes = pendienteDe(destino.tipo, destino.id, ests, todos);
    const pDestDesp  = pendienteDe(destino.tipo, destino.id, res.estimaciones, res.programas);
    const ok = window.confirm(
      `Reasignar ${$$(mov.usd)} del ${mov.fecha}.\n\n` +
      `DE:    ${mov.etiqueta}\n` +
      `A:     ${destino.etiqueta}\n\n` +
      `El movimiento conserva su identidad, monto, fecha e historial: NO se vuelve a registrar.\n\n` +
      `Pendiente del origen:  ${$$(pOrigAntes)} → ${$$(pOrigDesp)}\n` +
      `Pendiente del destino: ${$$(pDestAntes)} → ${$$(pDestDesp)}\n` +
      `Liquidación del lado:  ${dLiq === 0 ? "sin cambio" : (dLiq > 0 ? "+" : "−") + $$(Math.abs(dLiq))}\n` +
      `Realizado total:       ${$$(realAntes)} → ${$$(realDesp)}` +
      (Math.abs(realAntes - realDesp) > 0.005 ? "  ⚠ NO DEBERÍA CAMBIAR" : "  (sin cambio, como corresponde)") +
      `\n\n¿Confirmas?`);
    if (!ok) return;
    onEstimaciones(res.estimaciones);
    setLista(res.programas);
    setAsociar(null);
  };

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 9, background: C.card, padding: "8px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <button onClick={() => setAbierto(a => !a)}
          style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 11 }}>
          {abierto ? "▾" : "▸"}
        </button>
        <input type="text" value={p.contraparte} disabled={readOnly} placeholder={esCli ? "cliente" : "productor"}
          onChange={e => upd({ contraparte: e.target.value })}
          style={{ ...inSt, width: 150, fontWeight: 700 }} />
        {p.fueraPresupuesto && chip("fuera de presupuesto", C.warning)}
        {!readOnly && (
          <label style={{ fontSize: 9, color: C.muted, display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}
            title="Operación no incorporada al presupuesto: no proyecta ni reduce la liquidación de las demás. Sus movimientos reales se muestran aparte.">
            <input type="checkbox" checked={!!p.fueraPresupuesto} onChange={() => upd({ fueraPresupuesto: !p.fueraPresupuesto })} />
            fuera de presupuesto
          </label>
        )}
        {!readOnly && (
          <button onClick={onArchivar} title="Archivar con motivo (conserva historial)"
            style={{ marginLeft: "auto", padding: "2px 8px", background: "transparent", border: `1px solid ${C.border}`,
              borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 9 }}>Archivar</button>
        )}
        {!readOnly && !tieneHistorial(p) && (
          <button onClick={onBorrar} title="Eliminar (solo sin historial)"
            style={{ background: "transparent", border: "none", color: C.danger, cursor: "pointer", fontSize: 14 }}>×</button>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 10, color: C.muted, marginTop: 5 }}>
        <span>Kilos <strong style={{ color: esDato(p.kilos) ? C.text : C.warning }}>{esDato(p.kilos) ? num(p.kilos) : "falta"}</strong></span>
        <span>Total acordado <strong style={{ color: C.text }}>{$$(totalAcordado)}</strong></span>
        <span>{esCli ? "Cobrado" : "Pagado"} <strong style={{ color: totalRealizado > 0 ? C.success : C.muted2 }}>{$$(totalRealizado)}</strong></span>
        <span>Pendiente vigente <strong style={{ color: totalPend > 0 ? C.warning : C.muted2 }}>{$$(totalPend)}</strong></span>
      </div>

      {abierto && (
        <div style={{ marginTop: 8, borderTop: `1px dashed ${C.border}`, paddingTop: 8 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 8 }}>
            <Campo lbl="Kilos del programa" C={C}>
              <InputNumero formato="monto" value={esDato(p.kilos) ? p.kilos : ""} placeholder="falta"
                disabled={readOnly} onChange={n => upd({ kilos: n })} style={{ ...inSt, width: 95, textAlign: "right" }} />
            </Campo>
            <Campo lbl="Precio del programa (informativo)" C={C}>
              <InputNumero formato="tasa" value={esDato(p.precio_usd_kg) ? p.precio_usd_kg : ""} placeholder="US$/kg"
                disabled={readOnly} onChange={n => upd({ precio_usd_kg: n })} style={{ ...inSt, width: 80, textAlign: "right" }} />
            </Campo>
            <Campo lbl="Presupuesto asignado a esta operación" C={C}>
              <InputNumero formato="monto" value={esDato(p.presupuesto_asignado) ? p.presupuesto_asignado : ""}
                placeholder={sugerencia != null ? `sugerido ${num(sugerencia)}` : "sin asignar"}
                disabled={readOnly} onChange={n => confirmarAsignacion(n)}
                style={{ ...inSt, width: 110, textAlign: "right" }} />
            </Campo>
            <Campo lbl="Importe definitivo (liquidación individual)" C={C}>
              <InputNumero formato="monto" value={esDato(p.importe_definitivo) ? p.importe_definitivo : ""}
                placeholder="sin liquidar" disabled={readOnly}
                onChange={n => upd({ importe_definitivo: n })} style={{ ...inSt, width: 110, textAlign: "right" }} />
            </Campo>
          </div>
          <div style={{ fontSize: 9, color: C.muted2, marginBottom: 6, lineHeight: 1.6 }}>
            Presupuesto global {$$(presupuestoGlobal)} · asignado {$$(asignadoTotal)} ·
            {" "}remanente <strong style={{ color: remanente < 0 ? C.danger : C.muted }}>{$$(remanente)}</strong>.
            {esDato(p.presupuesto_asignado) && esDato(p.importe_definitivo) && (
              <> Variación de esta operación: <strong style={{ color: C.warning }}>
                {(Number(p.importe_definitivo) - Number(p.presupuesto_asignado)) >= 0 ? "+" : ""}
                {$$(Number(p.importe_definitivo) - Number(p.presupuesto_asignado))}</strong>.</>
            )}
            {" "}Asignar saca a la operación del bloque entera: su presupuesto, sus movimientos y sus pendientes.
          </div>
          <div style={{ fontSize: 9, color: C.muted2, marginBottom: 6 }}>
            Los kilos se usan para calcular las cuotas en US$/kg. El precio no alimenta el flujo:
            la base de la liquidación es el presupuesto de la fruta, o la liquidación definitiva si la cargas.
          </div>

          <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 4 }}>
            Calendario — cada cuota con su total acordado, lo imputado y lo que sustituye
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {p.cuotas.length === 0 && (
              <div style={{ fontSize: 9, color: C.muted2, fontStyle: "italic" }}>
                Sin cuotas. El programa puede existir así: su parte se {esCli ? "cobra" : "paga"} en la liquidación.
              </div>
            )}
            {p.cuotas.map(c => (
              <Cuota key={c.id} c={c} p={p} esCli={esCli} C={C} $$={$$} meses={meses} readOnly={readOnly}
                inSt={inSt} selSt={selSt} chip={chip} kgFruta={kgFruta}
                usuario={usuario}
                estimaciones={estimaciones} todos={todos}
                onUpd={patch => updCuota(c.id, patch)} onDel={() => delCuota(c)}
                onRegistrar={() => setForm({ cuotaId: c.id, fecha: hoyISO(), usd: "", nota: "" })}
                onAsociar={() => setAsociar({ reaId: "", destinoTipo: "cuota", destinoId: c.id })}
                onAnular={reaId => anular(c.id, reaId)} />
            ))}
            {!readOnly && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button onClick={addCuota}
                  style={{ padding: "3px 9px", background: "transparent", border: `1px dashed ${C.border}`,
                    borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 10 }}>
                  + Agregar cuota al calendario
                </button>
                {!p.cuotas.some(c => c.historico) && (
                  <button onClick={addHistorico}
                    title="Para los anticipos ya cobrados o pagados de esta contraparte. No es un acuerdo pendiente y no proyecta."
                    style={{ padding: "3px 9px", background: "transparent", border: `1px dashed ${C.border}`,
                      borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 10 }}>
                    + Registro de anticipos históricos
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ marginTop: 10, paddingTop: 7, borderTop: `1px dashed ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 700 }}>
              Montos informados sin fecha verificada
              {totalInformado > 0 && <span style={{ color: C.warning }}> · {$$(totalInformado)}</span>}
            </div>
            <div style={{ fontSize: 9, color: C.muted2, marginTop: 2, lineHeight: 1.6 }}>
              Información pendiente de completar. No cuenta como {esCli ? "cobrado" : "pagado"},
              no se proyecta en el flujo, no descuenta de ninguna liquidación y no está conciliada con bancos.
              Con su fecha real recién se convierte en movimiento.
            </div>
            {antes.length === 0 && (
              <div style={{ fontSize: 9, color: C.muted2, fontStyle: "italic", marginTop: 3 }}>Ninguno.</div>
            )}
            {antes.map(a => {
              const falta = antecedenteFaltantes(a);
              return (
                <div key={a.id} style={{ marginTop: 3 }}>
                  <div style={{ display: "flex", gap: 7, fontSize: 9, alignItems: "center", flexWrap: "wrap" }}>
                    <strong style={{ color: a.estado === "pendiente" ? C.warning : C.muted2,
                      textDecoration: a.estado === "anulado" ? "line-through" : "none" }}>{$$(a.usd)}</strong>
                    {a.referencia && <span style={{ color: C.muted2, fontStyle: "italic" }}>{a.referencia}</span>}
                    {a.estado === "pendiente" && falta.length > 0 && (
                      <span style={{ color: C.muted2 }}>falta: {falta.join(", ")}</span>
                    )}
                    {a.estado === "convertido" && (
                      <span style={{ color: C.success }}>
                        convertido el {a.fecha} → {a.convertidoEn?.tipo === "cuota" ? "cuota del calendario" : "bandeja de conciliación"}
                      </span>
                    )}
                    {a.estado === "anulado" && <span style={{ color: C.muted2 }}>anulado · {a.motivoAnulacion}</span>}
                    {!readOnly && a.estado === "pendiente" && (
                      <>
                        <button onClick={() => setCompl({ id: a.id, fecha: "", cuotaId: "" })}
                          style={{ background: "transparent", border: "none", color: C.success, cursor: "pointer", fontSize: 9, textDecoration: "underline" }}>
                          completar con su fecha
                        </button>
                        <button onClick={() => setAnulAnte({ id: a.id, motivo: "" })}
                          style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 9, textDecoration: "underline" }}>
                          anular
                        </button>
                      </>
                    )}
                  </div>
                  {compl && compl.id === a.id && !readOnly && (
                    <div style={{ marginTop: 3, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 9, color: C.muted }}>Fecha real</span>
                      <input type="date" value={compl.fecha} onChange={e => setCompl({ ...compl, fecha: e.target.value })} style={inSt} />
                      <select value={compl.cuotaId} onChange={e => setCompl({ ...compl, cuotaId: e.target.value })} style={selSt}>
                        <option value="">sin operación identificada → bandeja</option>
                        {p.cuotas.map(c => (
                          <option key={c.id} value={c.id}>
                            cuota {c.fecha_prevista || c.mes || "sin fecha"} · {$$(cuotaAcordado(c, p.kilos).valor || 0)}
                          </option>
                        ))}
                      </select>
                      <button onClick={guardarCompletar}
                        style={{ padding: "3px 9px", background: C.success, border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 9, fontWeight: 700 }}>Convertir</button>
                      <button onClick={() => setCompl(null)}
                        style={{ padding: "3px 7px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 9 }}>Cancelar</button>
                    </div>
                  )}
                  {anulAnte && anulAnte.id === a.id && !readOnly && (
                    <div style={{ marginTop: 3, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                      <input type="text" value={anulAnte.motivo} placeholder="motivo de la anulación"
                        onChange={e => setAnulAnte({ ...anulAnte, motivo: e.target.value })}
                        style={{ ...inSt, minWidth: 160 }} />
                      <button onClick={guardarAnulAnte}
                        style={{ padding: "3px 9px", background: C.danger, border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 9, fontWeight: 700 }}>Anular</button>
                      <button onClick={() => setAnulAnte(null)}
                        style={{ padding: "3px 7px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 9 }}>Cancelar</button>
                    </div>
                  )}
                </div>
              );
            })}
            {!readOnly && (ante ? (
              <div style={{ marginTop: 4, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                <InputNumero formato="monto" value={ante.usd} placeholder="US$ informado"
                  onChange={n => setAnte({ ...ante, usd: n })} style={{ ...inSt, width: 110, textAlign: "right" }} />
                <input type="text" value={ante.referencia} placeholder="referencia informada"
                  onChange={e => setAnte({ ...ante, referencia: e.target.value })} style={{ ...inSt, minWidth: 130 }} />
                <input type="text" value={ante.respaldo} placeholder="respaldo (si existe)"
                  onChange={e => setAnte({ ...ante, respaldo: e.target.value })} style={{ ...inSt, minWidth: 120 }} />
                <button onClick={guardarAnte}
                  style={{ padding: "3px 9px", background: C.success, border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 9, fontWeight: 700 }}>Guardar</button>
                <button onClick={() => setAnte(null)}
                  style={{ padding: "3px 7px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 9 }}>Cancelar</button>
                <div style={{ flexBasis: "100%", fontSize: 9, color: C.muted2, marginTop: 2 }}>
                  Sin campo de fecha a propósito: su ausencia es justamente el pendiente por resolver.
                </div>
              </div>
            ) : (
              <button onClick={() => setAnte({ usd: "", referencia: "", respaldo: "", nota: "" })}
                style={{ marginTop: 4, padding: "2px 8px", background: "transparent", border: `1px dashed ${C.border}`,
                  borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 9 }}>
                + Registrar monto informado sin fecha
              </button>
            ))}
          </div>

          {anulRea && !readOnly && (
            <div style={{ marginTop: 8, padding: "7px 8px", background: C.cardAlt,
              border: `1px solid ${C.danger}55`, borderRadius: 7, display: "flex", gap: 6,
              alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, color: C.muted, fontWeight: 700 }}>
                Anular el movimiento registrado:
              </span>
              <input type="text" value={anulRea.motivo} placeholder="motivo (queda en el historial)"
                onChange={e => setAnulRea({ ...anulRea, motivo: e.target.value, error: null })}
                style={{ ...inSt, flex: 1, minWidth: 180 }} />
              <button onClick={confirmarAnularRea}
                style={{ padding: "4px 11px", background: C.danger, border: "none", borderRadius: 6,
                  color: "#fff", cursor: "pointer", fontSize: 10, fontWeight: 700 }}>Anular</button>
              <button onClick={() => setAnulRea(null)}
                style={{ padding: "4px 9px", background: "transparent", border: `1px solid ${C.border}`,
                  borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 10 }}>Cancelar</button>
              <div style={{ flexBasis: "100%", fontSize: 9, color: C.muted2, marginTop: 3 }}>
                No se borra: queda anulado con su motivo. Deja de contar en el realizado y la
                estimación de origen recupera su capacidad.
                {anulRea.error && <strong style={{ color: C.danger }}> {anulRea.error}</strong>}
              </div>
            </div>
          )}

          {form && !readOnly && (
            <div style={{ marginTop: 8, padding: "7px 8px", background: C.cardAlt, border: `1px solid ${C.border}`,
              borderRadius: 7, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, color: C.muted, fontWeight: 700 }}>
                {esCli ? "Cobro recibido" : "Pago efectuado"}:
              </span>
              <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} style={inSt} />
              <InputNumero formato="monto" value={form.usd} placeholder="US$" onChange={n => setForm({ ...form, usd: n })}
                style={{ ...inSt, width: 110, textAlign: "right" }} />
              <input type="text" value={form.nota} placeholder="referencia / cartola"
                onChange={e => setForm({ ...form, nota: e.target.value })} style={{ ...inSt, flex: 1, minWidth: 120 }} />
              <button onClick={guardarMov}
                style={{ padding: "4px 11px", background: C.success, border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 10, fontWeight: 700 }}>Guardar</button>
              <button onClick={() => setForm(null)}
                style={{ padding: "4px 9px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 10 }}>Cancelar</button>
              <div style={{ flexBasis: "100%", fontSize: 9, color: C.muted2, marginTop: 3 }}>
                Monto fijo en USD y fecha real. Al guardar se te pregunta si estaba incluido en el total acordado
                o si es adicional, y se muestra el efecto antes de confirmar.
              </div>
            </div>
          )}

          {asociar && !readOnly && (
            <div style={{ marginTop: 8, padding: "7px 8px", background: C.cardAlt, border: `1px solid ${C.border}`,
              borderRadius: 7, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, color: C.muted, fontWeight: 700 }}>Reasignar un movimiento ya registrado:</span>
              <select value={asociar.reaId}
                onChange={e => setAsociar({ ...asociar, reaId: e.target.value })} style={{ ...selSt, maxWidth: 330 }}>
                <option value="">— movimiento de origen —</option>
                {movimientosMovibles.map(m => (
                  <option key={m.reaId} value={m.reaId}>{m.etiqueta}</option>
                ))}
              </select>
              <span style={{ fontSize: 10, color: C.muted }}>→</span>
              <select value={`${asociar.destinoTipo}:${asociar.destinoId}`}
                onChange={e => { const [t, ...r] = e.target.value.split(":");
                  setAsociar({ ...asociar, destinoTipo: t, destinoId: r.join(":") }); }}
                style={{ ...selSt, maxWidth: 330 }}>
                <option value=":">— destino —</option>
                {destinos.map(d => (
                  <option key={`${d.tipo}:${d.id}`} value={`${d.tipo}:${d.id}`}>{d.etiqueta}</option>
                ))}
              </select>
              <button onClick={confirmarAsociar}
                style={{ padding: "4px 11px", background: C.success, border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 10, fontWeight: 700 }}>
                Ver efecto y mover
              </button>
              <button onClick={() => setAsociar(null)}
                style={{ padding: "4px 9px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 10 }}>Cancelar</button>
              <div style={{ flexBasis: "100%", fontSize: 9, color: C.muted2, marginTop: 3 }}>
                Mueve el movimiento, no lo vuelve a registrar: conserva su identidad, monto, fecha e
                historial. Antes de confirmar se muestran origen, destino y el efecto sobre los
                pendientes y la liquidación. De una estimación a otra no se permite: reabriría el
                pendiente de la de origen.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Una cuota del calendario ──────────────────────────────────────
function Cuota({
  c, p, esCli, C, $$, meses, readOnly, inSt, selSt, chip, kgFruta,
  estimaciones, todos, onUpd, onDel, onRegistrar, onAsociar, onAnular, usuario,
}) {
  const [estDraft, setEstDraft] = useState(null);   // estimación de caja, con motivo
  const ac = cuotaAcordado(c, p.kilos);
  const re = cuotaRealizado(c);
  const pend = cuotaPendiente(c, p.kilos);
  const reas = realizacionesVigentes(c);
  const anuladas = (c.realizaciones || []).filter(x => x && x.anulada);
  const sustTotal = (c.sustituye || []).reduce((s, x) => s + (Number(x.usd) || 0), 0);
  const vigente = c.estado === "vigente";
  // El vencimiento se mide SIEMPRE contra la fecha contractual: una estimación
  // futura no deja de vencer un compromiso.
  const vencidaContrato = vigente && cuotaVencidaContractual(c, mIdxHor, mesIdxActualHor());
  const mesProy = mesProyeccion(c);

  const guardarEstimacion = () => {
    try {
      if (estDraft.quitar) {
        onUpd(quitarEstimacionCaja(c, { motivo: estDraft.motivo, usuario }));
      } else {
        onUpd(registrarEstimacionCaja(c, { mes: estDraft.mes, motivo: estDraft.motivo, usuario }));
      }
      setEstDraft(null);
    } catch (e) { setEstDraft({ ...estDraft, error: e.message }); }
  };

  const setSust = (estimacionId, usd) => {
    const otras = (c.sustituye || []).filter(s => s.estimacionId !== estimacionId);
    onUpd({ sustituye: usd > 0 ? [...otras, { estimacionId, usd }] : otras });
  };

  // Registro de anticipos históricos: no es un acuerdo pendiente. Se muestra
  // distinto, sin selector de estado y sin mes de flujo, para que no se
  // confunda con una cuota ni pueda activarse.
  if (c.historico) {
    return (
      <div style={{ border: `1px dashed ${C.muted2}66`, borderRadius: 7, padding: "6px 8px",
        background: `${C.muted2}0d` }}>
        <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
          {chip("registro de anticipos históricos", C.muted)}
          <span style={{ fontSize: 10, color: C.muted }}>
            {esCli ? "ya cobrado" : "ya pagado"} <strong style={{ color: C.success }}>{$$(re)}</strong>
            {" "}en {reas.length} movimiento{reas.length === 1 ? "" : "s"}
          </span>
          <span style={{ fontSize: 9, color: C.muted2 }}>
            no es un acuerdo pendiente · no proyecta · no se puede activar
          </span>
          {!readOnly && (
            <button onClick={onRegistrar} style={{ marginLeft: "auto", padding: "2px 8px",
              background: `${C.primary}14`, border: `1px solid ${C.primary}55`, borderRadius: 6,
              color: C.primary, cursor: "pointer", fontSize: 9, fontWeight: 700 }}>
              + Agregar {esCli ? "cobro histórico" : "pago histórico"}
            </button>
          )}
        </div>
        <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
          {reas.map(x => (
            <div key={x.id} style={{ fontSize: 9, color: C.muted, display: "flex", gap: 7, flexWrap: "wrap" }}>
              <span>{x.fecha}</span><strong style={{ color: C.text }}>{$$(x.usd)}</strong>
              {x.nota && <span style={{ color: C.muted2, fontStyle: "italic" }}>{x.nota}</span>}
              {!readOnly && (
                <button onClick={() => onAnular(x.id)} style={{ background: "transparent", border: "none",
                  color: C.muted2, cursor: "pointer", fontSize: 9, textDecoration: "underline" }}>anular</button>
              )}
            </div>
          ))}
          {reas.length === 0 && (
            <div style={{ fontSize: 9, color: C.muted2, fontStyle: "italic" }}>
              Sin movimientos cargados todavía.
            </div>
          )}
        </div>
        <div style={{ fontSize: 9, color: C.muted2, marginTop: 4, lineHeight: 1.6 }}>
          Lo cargado acá descuenta de la liquidación porque ya se movió, y no afecta
          ninguna cuota del calendario futuro.
        </div>
      </div>
    );
  }

  return (
    <div style={{ border: `1px solid ${vigente ? `${C.success}44` : C.border}`, borderRadius: 7, padding: "6px 8px", background: C.card2 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input type="date" value={c.fecha_prevista || ""} disabled={readOnly} title="Fecha prevista del acuerdo"
          onChange={e => onUpd({ fecha_prevista: e.target.value })} style={{ ...inSt, fontSize: 10 }} />
        <select value={c.mes || ""} disabled={readOnly} title="Mes en que se proyecta en el flujo"
          onChange={e => onUpd({ mes: e.target.value })} style={{ ...selSt, color: c.mes ? C.text : C.muted }}>
          <option value="">— mes de flujo —</option>
          {meses.map(m => <option key={m} value={m}>{m}</option>)}
          {c.mes && !meses.includes(c.mes) && <option value={c.mes}>{c.mes} (fuera de temp.)</option>}
        </select>
        <select value={c.modalidad} disabled={readOnly} onChange={e => onUpd({ modalidad: e.target.value })}
          style={{ ...selSt, color: c.modalidad === "por_confirmar" ? C.warning : C.text }}>
          {Object.entries(MODAL_LBL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {c.modalidad === "usd_kg" ? (
          <>
            <InputNumero formato="tasa" value={esDato(c.usd_kg) ? c.usd_kg : ""} placeholder="falta" disabled={readOnly}
              onChange={n => onUpd({ usd_kg: n })} style={{ ...inSt, width: 70, textAlign: "right" }} />
            <span style={{ fontSize: 10, color: C.muted }}>US$/kg</span>
          </>
        ) : (
          <>
            <InputNumero formato="monto" value={esDato(c.monto) ? c.monto : ""} placeholder="USD" disabled={readOnly}
              onChange={n => onUpd({ monto: n })} style={{ ...inSt, width: 95, textAlign: "right" }} />
            <span style={{ fontSize: 10, color: C.muted }}>USD{c.modalidad === "por_confirmar" ? " (referencia)" : ""}</span>
          </>
        )}
        <select value={c.estado} disabled={readOnly} onChange={e => onUpd({ estado: e.target.value })}
          title="En borrador no proyecta ni consume estimación. Su cobro sí descuenta."
          style={{ ...selSt, color: vigente ? C.success : C.muted }}>
          {Object.entries(ESTADO_LBL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {vencidaContrato && chip(`vencida ${c.mes}`, C.danger)}
        {c.estimacion_caja && chip(`caja estimada ${c.estimacion_caja.mes}`, C.warning)}
        {c.mes && !c.estimacion_caja && (readOnly ? (c.mes_estimado ? chip("mes estimado", C.warning) : null) : (
          <label style={{ fontSize: 9, color: c.mes_estimado ? C.warning : C.muted2,
            display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}
            title="Sin fecha pactada: el mes de flujo es una estimación nuestra. Proyecta igual, pero queda rotulado y contado aparte.">
            <input type="checkbox" checked={!!c.mes_estimado}
              onChange={() => onUpd({ mes_estimado: !c.mes_estimado })} />
            mes estimado
          </label>
        ))}
        {!readOnly && c.mes && (
          <button onClick={() => setEstDraft(c.estimacion_caja
            ? { mes: c.estimacion_caja.mes, motivo: "", quitar: false }
            : { mes: "", motivo: "", quitar: false })}
            title="Proyectar la caja en otro mes sin tocar la fecha contractual"
            style={{ background: "transparent", border: "none", color: C.warning,
              cursor: "pointer", fontSize: 9, textDecoration: "underline" }}>
            {c.estimacion_caja ? "cambiar estimación" : "estimar caja"}
          </button>
        )}
        {!readOnly && (
          <button onClick={onRegistrar}
            style={{ padding: "2px 8px", background: `${C.primary}14`, border: `1px solid ${C.primary}55`,
              borderRadius: 6, color: C.primary, cursor: "pointer", fontSize: 9, fontWeight: 700 }}>
            + Registrar {esCli ? "cobro recibido" : "pago efectuado"}
          </button>
        )}
      </div>

      {(c.estimacion_caja || vencidaContrato) && (
        <div style={{ fontSize: 9, marginTop: 3, lineHeight: 1.6,
          color: vencidaContrato ? C.danger : C.warning }}>
          {vencidaContrato && (
            <>Compromiso <strong>vencido</strong>: fecha contractual {c.fecha_prevista || c.mes}
              {c.estimacion_caja ? ". Sigue vencido aunque la caja se proyecte en " + c.estimacion_caja.mes : ", no reprogramado"}.{" "}</>
          )}
          {c.estimacion_caja && (
            <span style={{ color: C.muted }}>
              Caja estimada en <strong>{c.estimacion_caja.mes}</strong> · contractual{" "}
              <strong>{c.mes}</strong> · motivo: {c.estimacion_caja.motivo}
              {c.estimacion_caja.usuario ? ` · ${c.estimacion_caja.usuario}` : ""}
              {c.estimacion_caja.ts ? ` · ${String(c.estimacion_caja.ts).slice(0, 10)}` : ""}
              {(c.estimacion_caja.historial || []).length > 0 &&
                ` · ${c.estimacion_caja.historial.length} estimación(es) anterior(es)`}
            </span>
          )}
        </div>
      )}

      {estDraft && !readOnly && (
        <div style={{ marginTop: 5, padding: "6px 7px", background: C.cardAlt,
          border: `1px solid ${C.warning}55`, borderRadius: 7, display: "flex", gap: 5,
          alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: C.muted, fontWeight: 700 }}>Estimación de caja:</span>
          <select value={estDraft.quitar ? "" : estDraft.mes}
            onChange={e => setEstDraft({ ...estDraft, mes: e.target.value, quitar: false, error: null })}
            style={selSt}>
            <option value="">— mes estimado —</option>
            {meses.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <input type="text" value={estDraft.motivo} placeholder="motivo (obligatorio)"
            onChange={e => setEstDraft({ ...estDraft, motivo: e.target.value, error: null })}
            style={{ ...inSt, flex: 1, minWidth: 150 }} />
          <button onClick={guardarEstimacion}
            style={{ padding: "3px 9px", background: C.warning, border: "none", borderRadius: 6,
              color: "#fff", cursor: "pointer", fontSize: 9, fontWeight: 700 }}>Guardar</button>
          {c.estimacion_caja && (
            <button onClick={() => setEstDraft({ ...estDraft, quitar: true, mes: "" })}
              style={{ padding: "3px 7px", background: "transparent", border: `1px solid ${C.border}`,
                borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 9 }}>
              volver al mes contractual
            </button>
          )}
          <button onClick={() => setEstDraft(null)}
            style={{ padding: "3px 7px", background: "transparent", border: `1px solid ${C.border}`,
              borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 9 }}>Cancelar</button>
          <div style={{ flexBasis: "100%", fontSize: 9, color: C.muted2, marginTop: 2 }}>
            La fecha contractual ({c.fecha_prevista || c.mes}) no se modifica. Se guardan las dos
            fechas, el motivo y tu usuario. Un compromiso vencido sigue vencido.
            {estDraft.error && <strong style={{ color: C.danger }}> {estDraft.error}</strong>}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
        {!readOnly && (
          <button onClick={onAsociar}
            style={{ padding: "2px 8px", background: "transparent", border: `1px solid ${C.border}`,
              borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 9 }}>
            Asociar movimiento existente
          </button>
        )}
        {!readOnly && <button onClick={onDel} title="Eliminar la cuota"
          style={{ marginLeft: "auto", background: "transparent", border: "none", color: C.danger, cursor: "pointer", fontSize: 13 }}>×</button>}
      </div>

      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", fontSize: 9, color: C.muted, marginTop: 4 }}>
        <span>Total acordado <strong style={{ color: ac.valor === null ? C.warning : C.text }}>
          {ac.valor === null ? "falta dato" : $$(ac.valor)}</strong></span>
        <span>{esCli ? "Imputado" : "Imputado"} <strong style={{ color: re > 0 ? C.success : C.muted2 }}>{$$(re)}</strong></span>
        <span>Pendiente <strong style={{ color: pend === null ? C.warning : (pend > 0 ? C.warning : C.muted2) }}>
          {pend === null ? "—" : $$(pend)}</strong></span>
        {c.extra_acordado > 0 && chip(`${$$(c.extra_acordado)} adicionales al acuerdo`, C.muted)}
        {!vigente && chip(c.estado === "borrador"
          ? "borrador: no proyecta ni sustituye" : "anulada", c.estado === "borrador" ? C.warning : C.muted)}
        {!c.mes && c.estado === "vigente" && chip("sin mes: se liquida al final", C.warning)}
        {re > 0 && !vigente && chip(`${$$(re)} ya ${esCli ? "cobrados" : "pagados"}: descuentan igual`, C.success)}
      </div>

      {/* Sustitución de estimaciones */}
      {(estimaciones || []).length > 0 && (
        <div style={{ marginTop: 5, paddingTop: 4, borderTop: `1px dashed ${C.border}` }}>
          <div style={{ fontSize: 9, color: C.muted, marginBottom: 2 }}>
            Pendiente que reemplaza estimación {vigente ? "" : "(no se aplica mientras esté en borrador)"}:
          </div>
          {(estimaciones || []).map(e0 => {
            const e = normalizarAnticipo(e0);
            const disp = estDisponible(e, kgFruta, todos);
            const actual = (c.sustituye || []).find(s => s.estimacionId === e.id);
            const usd = actual ? Number(actual.usd) || 0 : 0;
            // Lo disponible ya descuenta esta misma cuota cuando está vigente,
            // así que para el tope hay que volver a sumarla.
            const maximo = disp + (vigente ? usd : 0);
            return (
              <div key={e.id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 9, flexWrap: "wrap" }}>
                <span style={{ color: C.muted2 }}>
                  {e.mes || "sin mes"} · acordado {$$(estAcordado(e, kgFruta))} · disponible {$$(disp)}
                </span>
                <InputNumero formato="monto" value={usd || ""} placeholder="0" disabled={readOnly}
                  onChange={n => {
                    if (n > maximo + 0.005 && !window.confirm(
                      `Estás sustituyendo ${$$(n)} de una estimación con ${$$(maximo)} disponibles.\n\n` +
                      `El exceso de ${$$(n - maximo)} queda marcado como sobre-sustitución para resolver a mano: ` +
                      `no se recorta solo.\n\n¿Confirmas?`)) return;
                    setSust(e.id, n);
                  }}
                  style={{ ...inSt, width: 90, textAlign: "right", fontSize: 9, padding: "2px 5px" }} />
                {estSobreSustituida(e, kgFruta, todos) > 0 &&
                  chip(`sobre-sustituida en ${$$(estSobreSustituida(e, kgFruta, todos))}`, C.danger)}
              </div>
            );
          })}
          {sustTotal > 0 && (
            <div style={{ fontSize: 9, color: C.muted2, marginTop: 2 }}>
              Sustituye {$$(sustTotal)} en total. El resto del acuerdo ({$$(Math.max(0, (ac.valor || 0) - sustTotal))})
              es anticipo que no reemplaza estimación: reduce la liquidación sin cambiar el total.
            </div>
          )}
        </div>
      )}

      {reas.length > 0 && (
        <div style={{ marginTop: 5, paddingTop: 4, borderTop: `1px dashed ${C.border}`, display: "flex", flexDirection: "column", gap: 2 }}>
          {reas.map(x => (
            <div key={x.id} style={{ display: "flex", gap: 7, fontSize: 9, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ color: C.muted }}>{x.fecha || "sin fecha"}</span>
              <strong style={{ color: C.success }}>{$$(x.usd)}</strong>
              {x.nota && <span style={{ color: C.muted2, fontStyle: "italic" }}>{x.nota}</span>}
              {x.origen && <span style={{ color: C.muted2 }}>· movido desde la estimación</span>}
              {!readOnly && <button onClick={() => onAnular(x.id)}
                style={{ marginLeft: "auto", background: "transparent", border: "none", color: C.muted,
                  cursor: "pointer", fontSize: 9, textDecoration: "underline" }}>anular</button>}
            </div>
          ))}
        </div>
      )}
      {anuladas.length > 0 && (
        <details style={{ marginTop: 3 }}>
          <summary style={{ fontSize: 9, color: C.muted2, cursor: "pointer" }}>
            {anuladas.length} movimiento(s) anulado(s)
          </summary>
          {anuladas.map(x => (
            <div key={x.id} style={{ fontSize: 9, color: C.muted2, textDecoration: "line-through" }}>
              {x.fecha} · {$$(x.usd)} · {x.motivoAnulacion || "sin motivo"}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

function Campo({ lbl, C, children }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: C.muted, marginBottom: 2 }}>{lbl}</div>
      {children}
    </div>
  );
}

// ── Registros antiguos sin fecha: decisión explícita ───────────────
// Mientras no decidas, el flujo conserva el tratamiento de siempre.
function AvisoCompatibilidad({ avisos, decisiones, onDecision, esCli, C, $$, readOnly, usuario }) {
  if (!avisos.length) return null;
  const total = avisos.reduce((s, a) => s + (Number(a.usd) || 0), 0);
  const decidir = (a, trato) => {
    const texto = trato === "acordado_sin_fecha"
      ? `Dejarlo como anticipo acordado sin fecha.\n\n` +
        `Sus ${$$(a.usd)} salen de la liquidación y quedan pendientes de calendarizar: ` +
        `la caja proyectada del mes de liquidación baja en ese monto.`
      : `Trasladarlo a la liquidación.\n\n` +
        `Es el tratamiento que la app viene dando hoy: la cifra no cambia.`;
    if (!window.confirm(`${texto}\n\n¿Confirmas?`)) return;
    onDecision(registrarDecisionSinFecha(decisiones, a.id, trato, { usuario }));
  };
  return (
    <div style={{ background: `${C.warning}14`, border: `1px solid ${C.warning}55`, borderRadius: 8,
      padding: "7px 9px", marginBottom: 8, fontSize: 9, color: C.text, lineHeight: 1.6 }}>
      <strong style={{ color: C.warning }}>
        {avisos.length} registro(s) antiguo(s) sin fecha por {$$(total)}.
      </strong>{" "}
      Hoy sus montos están dentro de la liquidación, que es el tratamiento que la app venía dando.
      Nada se migra solo: decide uno por uno.
      {!readOnly && avisos.map(a => (
        <div key={a.id} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 3 }}>
          <span style={{ color: C.muted }}>{a.contraparte || "estimación sin contraparte"}</span>
          <strong>{$$(a.usd)}</strong>
          <button onClick={() => decidir(a, "acordado_sin_fecha")}
            style={{ padding: "1px 7px", background: "transparent", border: `1px solid ${C.border}`,
              borderRadius: 5, color: C.muted, cursor: "pointer", fontSize: 9 }}>sigue acordado sin fecha</button>
          <button onClick={() => decidir(a, "trasladar_liquidacion")}
            style={{ padding: "1px 7px", background: "transparent", border: `1px solid ${C.border}`,
              borderRadius: 5, color: C.muted, cursor: "pointer", fontSize: 9 }}>trasladar a liquidación</button>
        </div>
      ))}
    </div>
  );
}

// ── Saldos a favor ─────────────────────────────────────────────────
// Sin prompts del navegador: formularios con campos identificados, validación
// y vista previa del efecto antes de guardar. El saldo del destino de una
// compensación sale del mismo cuadre que alimenta el flujo, nunca a mano.
function SaldosFavorBloque({ saldos, onSaldos, esCli, C, $$, meses, readOnly, usuario, resumen }) {
  const [form, setForm] = useState(null);     // {modo, saldoId?, aplicacionId?, ...}
  const lista = (saldos || []).map(normalizarSaldo);
  const accionNombre = esCli ? "Devolver al cliente" : "Recuperar del productor";
  const tipoMov = esCli ? "devolucion" : "recuperacion";
  const posiciones = resumen?.posiciones || [];
  const inconsistencias = inconsistenciasSaldos(posiciones, lista);

  const reemplazar = (id, nuevo) => onSaldos(lista.map(x => (x.id === id ? nuevo : x)));
  const cerrar = () => setForm(null);
  const campo = { padding: "3px 6px", background: C.card2, border: `1px solid ${C.border}`,
                  borderRadius: 6, color: C.text, fontSize: 10, outline: "none" };

  // ── Reconocer ────────────────────────────────────────────────────
  const candidatas = posiciones
    .map(q => ({ ...q, ...excedentePorReconocer(q, lista) }))
    .filter(q => q.porReconocer > 0.005);

  const guardarReconocimiento = () => {
    try {
      if (form.fuente === "posicion") {
        const q = candidatas.find(x => x.programaId === form.programaId);
        if (!q) { window.alert("Elige la operación con excedente."); return; }
        // Revalida contra el estado actual: el excedente pudo cambiar.
        onSaldos([...lista, reconocerDesdePosicion(q, lista,
          { usd: Number(form.usd) || q.porReconocer, usuario, nota: form.nota })]);
      } else {
        if (!form.contraparte.trim()) { window.alert("Identifica la contraparte."); return; }
        if (!(Number(form.usd) > 0)) { window.alert("Ingresa el monto del saldo."); return; }
        if (!form.referencia.trim() || !form.fecha) {
          window.alert("Un reconocimiento por documento necesita referencia y fecha.\n\n" +
            "Sin eso queda provisional, no reconocido."); 
        }
        const conRespaldo = !!(form.referencia.trim() && form.fecha);
        onSaldos([...lista, normalizarSaldo({
          lado: esCli ? "cliente" : "productor", contraparte: form.contraparte.trim(),
          usd: Number(form.usd), estado: conRespaldo ? "reconocido" : "provisional",
          origen: conRespaldo
            ? { tipo: "documento", referencia: form.referencia.trim(), fecha: form.fecha }
            : { tipo: "sin_respaldo" },
          respaldo: conRespaldo ? { tipo: "documento", referencia: form.referencia.trim(), fecha: form.fecha } : null,
          nota: form.nota, usuario, ts: new Date().toISOString(), aplicaciones: [],
        })]);
      }
      cerrar();
    } catch (e) { window.alert(e.message); }
  };

  // ── Programar recuperación / devolución ──────────────────────────
  const guardarProgramacion = () => {
    const s = lista.find(x => x.id === form.saldoId);
    try {
      reemplazar(s.id, agregarAplicacion(s, { tipo: tipoMov, usd: Number(form.usd) || 0,
        mes: form.mes, motivo: form.nota, usuario }));
      cerrar();
    } catch (e) { window.alert(e.message); }
  };

  // ── Compensar ────────────────────────────────────────────────────
  const destinos = form?.saldoId
    ? destinosCompensacion(resumen, { excluirProgramaId: lista.find(x => x.id === form.saldoId)?.programaId })
    : [];
  const destinoSel = destinos.find(d => String(d.programaId) === String(form?.destinoId));
  const previa = form?.modo === "compensar" && form.saldoId
    ? previaCompensacion({ saldo: lista.find(x => x.id === form.saldoId), destino: destinoSel,
                           usd: Number(form.usd) || 0 })
    : null;
  const guardarCompensacion = () => {
    const s = lista.find(x => x.id === form.saldoId);
    if (!destinoSel) {
      // Sin destino identificado: reserva pendiente de aplicación, sin tocar el flujo.
      if (!window.confirm("Sin operación destino identificada queda como RESERVA pendiente de aplicación:\n\n" +
        "ocupa saldo disponible y no reduce ningún flujo hasta que la apliques.\n\n¿Confirmas?")) return;
      try {
        reemplazar(s.id, agregarAplicacion(s, { tipo: "compensacion", usd: Number(form.usd) || 0,
          destino: { nota: form.nota || "sin destino identificado" }, motivo: form.nota, usuario }));
        cerrar();
      } catch (e) { window.alert(e.message); }
      return;
    }
    if (!previa?.valido) { window.alert(previa?.motivo || "Revisa el monto."); return; }
    try {
      reemplazar(s.id, agregarAplicacion(s, { tipo: "compensacion", usd: Number(form.usd) || 0,
        destino: { programaId: destinoSel.programaId, etiqueta: destinoSel.etiqueta, mes: destinoSel.mes },
        motivo: form.nota, usuario }));
      cerrar();
    } catch (e) { window.alert(e.message); }
  };

  // ── Aplicar una reserva ──────────────────────────────────────────
  const aplicarReserva = (s, a) => {
    const d = destinosCompensacion(resumen, { excluirProgramaId: s.programaId })
      .find(x => String(x.programaId) === String(a.destino?.programaId));
    if (!a.destino?.programaId && !d) {
      window.alert("Esta reserva no tiene operación destino identificada.\n\n" +
        "Para aplicarla, primero anúlala y vuelve a reservarla eligiendo el destino.");
      return;
    }
    if (!d) {
      window.alert("La operación destino ya no tiene saldo que absorber.\n\n" +
        "Puede haber cambiado por un cobro, un pago u otra compensación. Revisa antes de aplicar.");
      return;
    }
    const pv = previaCompensacion({ saldo: s, destino: d, usd: a.usd });
    if (!window.confirm(
      `Aplicar la compensación.\n\n` +
      `Origen: ${s.contraparte} · disponible ${$$(pv.origen.disponible)}\n` +
      `Destino: ${d.etiqueta} · puede absorber ${$$(d.absorbe)}${d.mes ? ` (${d.mes})` : ""}\n` +
      `Monto a aplicar: ${$$(pv.aplicado)}\n\n` +
      `Queda en el saldo: ${$$(pv.remanenteSaldo)}\n` +
      `Queda en el destino: ${$$(pv.remanenteDestino)}\n` +
      `Flujo: ${d.mes || "sin mes"} baja ${$$(pv.aplicado)}\n\n¿Confirmas?`)) return;
    try {
      // Revalida con el saldo del destino tomado del cuadre actual.
      const res = aplicarCompensacion(s, a.id, { saldoDestino: d.absorbe, usuario });
      reemplazar(s.id, res.saldo);
    } catch (e) { window.alert(e.message); }
  };

  return (
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px dashed ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: C.muted, fontWeight: 700 }}>
          Saldos a favor {esCli ? "del cliente" : "por recuperar del productor"}
        </span>
        {!readOnly && (
          <button onClick={() => setForm({ modo: "reconocer", fuente: candidatas.length ? "posicion" : "documento",
            programaId: candidatas[0]?.programaId || "", usd: "", contraparte: "", referencia: "", fecha: hoyISO(), nota: "" })}
            style={{ marginLeft: "auto", padding: "2px 8px", background: "transparent",
              border: `1px dashed ${C.border}`, borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 9 }}>
            + Reconocer saldo
          </button>
        )}
      </div>

      {inconsistencias.map(x => (
        <div key={x.programaId} style={{ background: `${C.danger}14`, border: `1px solid ${C.danger}55`,
          borderRadius: 7, padding: "6px 8px", marginTop: 4, fontSize: 9, color: C.text }}>
          <strong style={{ color: C.danger }}>Inconsistencia en {x.contraparte}.</strong> {x.mensaje}
          {" "}Resuélvelo corrigiendo la liquidación, anulando lo que no corresponda o devolviendo lo movido de más.
          No se borra ninguna aplicación ya realizada.
        </div>
      ))}

      {lista.length === 0 && !form && (
        <div style={{ fontSize: 9, color: C.muted2, fontStyle: "italic" }}>Ninguno.</div>
      )}

      {lista.map(s => {
        const r = resumenSaldo(s);
        // El respaldo quedó grabado en el origen al reconocerlo. Si nació de
        // una liquidación individual, no hay que volver a buscarlo.
        const p = s.origen?.tipo === "liquidacion_individual"
          ? { puede: true, motivo: "liquidación individual" }
          : puedeReconocer({
              importeDefinitivo: posiciones.find(q => q.programaId === s.programaId)?.importeDefinitivo ?? null,
              respaldo: s.respaldo,
            });
        return (
          <div key={s.id} style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 7px", marginTop: 4, background: C.card }}>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", fontSize: 9, alignItems: "center" }}>
              <strong style={{ color: C.text }}>{s.contraparte || "sin contraparte"}</strong>
              <span style={{ color: C.muted }}>reconocido {$$(r.reconocido)}</span>
              <span style={{ color: C.muted }}>resuelto <strong style={{ color: r.resuelto > 0 ? C.success : C.muted2 }}>{$$(r.resuelto)}</strong></span>
              <span style={{ color: C.muted }}>programado <strong style={{ color: C.warning }}>{$$(r.programado)}</strong></span>
              <span style={{ color: C.muted }}>pendiente <strong style={{ color: C.text }}>{$$(r.pendienteReal)}</strong></span>
              <span style={{ color: C.muted }}>disponible <strong>{$$(r.disponible)}</strong></span>
              <span style={{ fontSize: 8, color: s.estado === "reconocido" ? C.success : C.warning,
                border: `1px solid ${C.border}`, borderRadius: 8, padding: "0 6px" }}>{s.estado.replace("_", " ")}</span>
            </div>
            <div style={{ fontSize: 9, color: C.muted2, marginTop: 1 }}>
              Origen: {s.origen?.tipo === "liquidacion_individual"
                ? `liquidación individual · base ${$$(s.origen.base)} · ${esCli ? "cobrado" : "pagado"} ${$$(s.origen.realizado)}`
                : s.origen?.tipo === "documento"
                  ? `documento ${s.origen.referencia} del ${s.origen.fecha}`
                  : "sin respaldo"}
            </div>
            {!p.puede && (
              <div style={{ fontSize: 9, color: C.warning, marginTop: 2 }}>
                Provisional: {p.motivo}. No se puede afirmar que sea una deuda exigible.
              </div>
            )}
            {!readOnly && (
              <div style={{ display: "flex", gap: 5, marginTop: 3, flexWrap: "wrap" }}>
                <button onClick={() => setForm({ modo: "programar", saldoId: s.id, usd: "", mes: meses[0] || "", nota: "" })}
                  style={btnMini(C)}>{accionNombre}</button>
                <button onClick={() => setForm({ modo: "compensar", saldoId: s.id, usd: "", destinoId: "", nota: "" })}
                  style={btnMini(C)}>Compensar</button>
              </div>
            )}
            {r.aplicaciones.map(a => (
              <div key={a.id} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 9, marginTop: 2 }}>
                <span style={{ color: C.muted }}>
                  {a.tipo === "compensacion" ? "compensación" : a.tipo}{a.mes ? ` · ${a.mes}` : ""} · {a.estado}
                  {a.destino?.etiqueta ? ` → ${a.destino.etiqueta}` : ""}
                </span>
                <strong>{$$(a.usd)}</strong>
                {a.estado === "programada" && !readOnly && (
                  <>
                    <button onClick={() => setForm({ modo: "ejecutar", saldoId: s.id, aplicacionId: a.id, fecha: hoyISO(), nota: "" })}
                      style={btnMini(C)}>registrar movimiento</button>
                    <button onClick={() => setForm({ modo: "aplazar", saldoId: s.id, aplicacionId: a.id, mes: a.mes || meses[0] || "", nota: "" })}
                      style={btnMini(C)}>aplazar</button>
                    <button onClick={() => setForm({ modo: "anular", saldoId: s.id, aplicacionId: a.id, nota: "" })}
                      style={btnMini(C)}>anular</button>
                  </>
                )}
                {a.estado === "reservada" && !readOnly && (
                  <>
                    <button onClick={() => aplicarReserva(s, a)} style={btnMini(C)}>aplicar al destino</button>
                    <button onClick={() => setForm({ modo: "anular", saldoId: s.id, aplicacionId: a.id, nota: "" })}
                      style={btnMini(C)}>anular reserva</button>
                  </>
                )}
                {a.estado === "reservada" && (
                  <span style={{ color: C.muted2 }}>reservada: todavía no afecta la proyección</span>
                )}
                {a.estado === "ejecutada" && <span style={{ color: C.success }}>ya es caja</span>}
                {a.estado === "aplicada" && <span style={{ color: C.success }}>reduce el destino, sin movimiento bancario</span>}
              </div>
            ))}
          </div>
        );
      })}

      {/* ── Formularios ─────────────────────────────────────────── */}
      {form && !readOnly && (
        <div style={{ marginTop: 6, padding: "7px 8px", background: C.cardAlt, border: `1px solid ${C.border}`,
          borderRadius: 7, fontSize: 9 }}>
          {form.modo === "reconocer" && (
            <>
              <div style={{ fontWeight: 700, color: C.text, marginBottom: 4 }}>Reconocer un saldo a favor</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                <select value={form.fuente} onChange={e => setForm({ ...form, fuente: e.target.value })} style={campo}>
                  <option value="posicion">desde una liquidación individual con excedente</option>
                  <option value="documento">desde un documento que lo reconoce</option>
                </select>
                {form.fuente === "posicion" ? (
                  <>
                    <select value={form.programaId} onChange={e => setForm({ ...form, programaId: e.target.value })} style={campo}>
                      <option value="">— operación —</option>
                      {candidatas.map(q => (
                        <option key={q.programaId} value={q.programaId}>
                          {q.contraparte} · excedente {Math.round(q.excedenteReal).toLocaleString("es-CL")} · por reconocer {Math.round(q.porReconocer).toLocaleString("es-CL")}
                        </option>
                      ))}
                    </select>
                    {candidatas.length === 0 && (
                      <span style={{ color: C.warning }}>
                        Ninguna operación tiene excedente real por reconocer. Carga su liquidación definitiva primero.
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <input type="text" placeholder="contraparte" value={form.contraparte}
                      onChange={e => setForm({ ...form, contraparte: e.target.value })} style={campo} />
                    <input type="text" placeholder="referencia del documento" value={form.referencia}
                      onChange={e => setForm({ ...form, referencia: e.target.value })} style={{ ...campo, minWidth: 140 }} />
                    <input type="date" value={form.fecha}
                      onChange={e => setForm({ ...form, fecha: e.target.value })} style={campo} />
                  </>
                )}
                <InputNumero formato="monto" value={form.usd} placeholder="US$"
                  onChange={n => setForm({ ...form, usd: n })} style={{ ...campo, width: 100, textAlign: "right" }} />
              </div>
              {form.fuente === "posicion" && form.programaId && (() => {
                const q = candidatas.find(x => x.programaId === form.programaId);
                if (!q) return null;
                return (
                  <div style={{ color: C.muted2, marginTop: 3 }}>
                    {q.contraparte}: base {$$(q.base)} · {esCli ? "cobrado" : "pagado"} {$$(q.realizado)} ·
                    {" "}excedente real <strong style={{ color: C.danger }}>{$$(q.excedenteReal)}</strong> ·
                    {" "}ya reconocido {$$(q.yaReconocido)} · <strong>por reconocer {$$(q.porReconocer)}</strong>.
                    {" "}Dejar el monto vacío reconoce todo lo que queda.
                  </div>
                );
              })()}
            </>
          )}

          {form.modo === "programar" && (() => {
            const s = lista.find(x => x.id === form.saldoId); const r = resumenSaldo(s);
            const usd = Number(form.usd) || 0;
            return (
              <>
                <div style={{ fontWeight: 700, color: C.text, marginBottom: 4 }}>
                  {accionNombre} · {s.contraparte}
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                  <InputNumero formato="monto" value={form.usd} placeholder="US$"
                    onChange={n => setForm({ ...form, usd: n })} style={{ ...campo, width: 100, textAlign: "right" }} />
                  <select value={form.mes} onChange={e => setForm({ ...form, mes: e.target.value })} style={campo}>
                    {meses.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <input type="text" placeholder="nota" value={form.nota}
                    onChange={e => setForm({ ...form, nota: e.target.value })} style={{ ...campo, minWidth: 120 }} />
                </div>
                <div style={{ color: usd > r.disponible ? C.danger : C.muted2, marginTop: 3 }}>
                  Disponible {$$(r.disponible)}. {usd > 0 && usd <= r.disponible
                    ? `El flujo sumará ${$$(usd)} en ${form.mes}, como ${esCli ? "egreso" : "ingreso"}. ` +
                      `El saldo pendiente sigue en ${$$(r.pendienteReal)}: programar no lo extingue.`
                    : usd > r.disponible ? "El monto supera lo disponible." : ""}
                </div>
              </>
            );
          })()}

          {form.modo === "compensar" && (() => {
            const s = lista.find(x => x.id === form.saldoId); const r = resumenSaldo(s);
            return (
              <>
                <div style={{ fontWeight: 700, color: C.text, marginBottom: 4 }}>Compensar · {s.contraparte}</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                  <InputNumero formato="monto" value={form.usd} placeholder="US$"
                    onChange={n => setForm({ ...form, usd: n })} style={{ ...campo, width: 100, textAlign: "right" }} />
                  <select value={form.destinoId} onChange={e => setForm({ ...form, destinoId: e.target.value })} style={campo}>
                    <option value="">— sin destino identificado (solo reserva) —</option>
                    {destinos.map(d => (
                      <option key={String(d.programaId)} value={String(d.programaId)}>
                        {d.etiqueta} · puede absorber {Math.round(d.absorbe).toLocaleString("es-CL")}{d.mes ? ` (${d.mes})` : ""}
                      </option>
                    ))}
                  </select>
                  <input type="text" placeholder="respaldo del acuerdo" value={form.nota}
                    onChange={e => setForm({ ...form, nota: e.target.value })} style={{ ...campo, minWidth: 130 }} />
                </div>
                <div style={{ color: C.muted2, marginTop: 3, lineHeight: 1.6 }}>
                  Origen {s.contraparte}: disponible {$$(r.disponible)} · pendiente {$$(r.pendienteReal)}.<br />
                  {previa && destinoSel ? (
                    <>
                      Destino {previa.destino.etiqueta}: puede absorber {$$(previa.destino.absorbe)}
                      {previa.destino.mes ? ` en ${previa.destino.mes}` : ""}.<br />
                      Se aplicarían <strong>{$$(previa.aplicado)}</strong> · queda en el saldo {$$(previa.remanenteSaldo)} ·
                      {" "}queda en el destino {$$(previa.remanenteDestino)}.<br />
                      {previa.cambioFlujo.map(c => (
                        <span key={c.mes}>Flujo: {c.mes} baja {$$(-c.delta)}.</span>
                      ))}
                      {!previa.valido && <span style={{ color: C.danger }}> {previa.motivo}</span>}
                    </>
                  ) : (
                    <span style={{ color: C.warning }}>
                      Sin destino identificado queda como reserva: ocupa disponible y no reduce ningún flujo.
                    </span>
                  )}
                </div>
              </>
            );
          })()}

          {form.modo === "ejecutar" && (
            <>
              <div style={{ fontWeight: 700, color: C.text, marginBottom: 4 }}>Registrar el movimiento real</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} style={campo} />
                <input type="text" placeholder="referencia / cartola" value={form.nota}
                  onChange={e => setForm({ ...form, nota: e.target.value })} style={{ ...campo, minWidth: 140 }} />
              </div>
              <div style={{ color: C.muted2, marginTop: 3 }}>
                Al registrarlo deja de proyectarse en el flujo y pasa a resuelto. El saldo pendiente baja por el mismo monto.
              </div>
            </>
          )}

          {form.modo === "aplazar" && (
            <>
              <div style={{ fontWeight: 700, color: C.text, marginBottom: 4 }}>Aplazar la cuota</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                <select value={form.mes} onChange={e => setForm({ ...form, mes: e.target.value })} style={campo}>
                  {meses.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <input type="text" placeholder="motivo (obligatorio)" value={form.nota}
                  onChange={e => setForm({ ...form, nota: e.target.value })} style={{ ...campo, minWidth: 160 }} />
              </div>
              <div style={{ color: C.muted2, marginTop: 3 }}>
                Cambia el mes de esta cuota, con su motivo en el historial. No la duplica ni toca lo ya ejecutado.
              </div>
            </>
          )}

          {form.modo === "anular" && (
            <>
              <div style={{ fontWeight: 700, color: C.text, marginBottom: 4 }}>Anular la programación</div>
              <input type="text" placeholder="motivo (obligatorio)" value={form.nota}
                onChange={e => setForm({ ...form, nota: e.target.value })} style={{ ...campo, minWidth: 200 }} />
              <div style={{ color: C.muted2, marginTop: 3 }}>
                Libera la reserva y deja el saldo disponible otra vez. No revierte ningún movimiento ya realizado.
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: 5, marginTop: 5 }}>
            <button onClick={() => {
              const s = lista.find(x => x.id === form.saldoId);
              try {
                if (form.modo === "reconocer") return guardarReconocimiento();
                if (form.modo === "programar") return guardarProgramacion();
                if (form.modo === "compensar") return guardarCompensacion();
                if (form.modo === "ejecutar") {
                  reemplazar(s.id, ejecutarAplicacion(s, form.aplicacionId, { fecha: form.fecha, usuario }));
                  return cerrar();
                }
                if (form.modo === "aplazar") {
                  reemplazar(s.id, aplazarAplicacion(s, form.aplicacionId, { mes: form.mes, motivo: form.nota, usuario }));
                  return cerrar();
                }
                if (form.modo === "anular") {
                  reemplazar(s.id, anularAplicacion(s, form.aplicacionId, { motivo: form.nota, usuario }));
                  return cerrar();
                }
              } catch (e) { window.alert(e.message); }
            }} style={{ padding: "3px 10px", background: C.success, border: "none", borderRadius: 6,
              color: "#fff", cursor: "pointer", fontSize: 9, fontWeight: 700 }}>Guardar</button>
            <button onClick={cerrar} style={btnMini(C)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

const btnMini = (C) => ({ padding: "1px 7px", background: "transparent", border: `1px solid ${C.border}`,
  borderRadius: 5, color: C.muted, cursor: "pointer", fontSize: 9 });
const inMini = (C) => ({ padding: "3px 6px", background: C.card2, border: `1px solid ${C.border}`,
  borderRadius: 6, color: C.text, fontSize: 10, outline: "none" });
