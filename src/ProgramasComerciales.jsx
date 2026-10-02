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
  normalizarPrograma, normalizarCuota, nuevoIdPrograma, nuevoIdCuota,
  cuotaAcordado, cuotaRealizado, cuotaPendiente, cuotaSustituye,
  estAcordado, estPendiente, estDisponible, estSobreSustituida,
  efectoImputacion, imputarMovimiento, moverRealizacion,
  archivarPrograma, tieneHistorial, nuevoMovimientoSinAsignar, esDato,
} from "./programas.js";
import { realizacionesVigentes, anularRealizacion, normalizarAnticipo } from "./anticipos.js";

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
  const L = ({ t, v, c, s }) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
      <span style={{ color: C.muted }}>{t}</span>
      <strong style={{ color: c || C.text }}>{s ? `${v}` : $$(v)}</strong>
    </div>
  );
  return (
    <div style={{ fontSize: 10, color: C.muted, marginTop: 8, lineHeight: 1.75 }}>
      <L t={`${esCli ? "Venta" : "Retorno al productor"} ${r.definitiva !== null ? "definitiva" : "estimada"}`} v={r.base} />
      {r.definitiva !== null && (
        <L t="Variación contra presupuesto" v={`${r.variacionBase >= 0 ? "+" : ""}${$$(r.variacionBase)}`}
           c={Math.abs(r.variacionBase) < 0.5 ? C.muted2 : C.warning} s />
      )}
      <L t={esCli ? "Anticipos ya cobrados" : "Anticipos ya pagados"} v={r.realizado} c={r.realizado > 0 ? C.success : C.muted2} />
      <L t={esCli ? "Saldo total por cobrar" : "Saldo total por pagar"} v={r.saldoTotal} />
      <div style={{ paddingLeft: 10, borderLeft: `2px solid ${C.border}`, marginTop: 2 }}>
        <L t="Anticipos pendientes programados" v={r.pendientes} c={r.pendientes > 0 ? C.warning : C.muted2} />
        {r.pendienteVencido > 0 && (
          <L t="· de ellos, vencidos (fuera del acumulado)" v={r.pendienteVencido} c={C.danger} />
        )}
        <L t={`Liquidación final proyectada${mesLiq ? ` (${mesLiq})` : ""}`} v={r.liquidacion} />
      </div>
      {r.pendienteSinMes > 0 && (
        <div style={{ color: C.warning, marginTop: 3 }}>
          {$$(r.pendienteSinMes)} de anticipos sin mes: no se proyectan y se {esCli ? "cobran" : "pagan"} en la liquidación.
        </div>
      )}
      {r.excedente > 0 && (
        <div style={{ color: C.danger, fontWeight: 700, marginTop: 3 }}>
          Excedente de anticipos: {$$(r.excedente)} por sobre el {esCli ? "total de venta" : "retorno al productor"}.
          <span style={{ color: C.muted2, fontWeight: 400 }}> La liquidación queda en $0 y el exceso no se compensa solo: decide si se devuelve, se imputa a otra temporada o si hay que corregir kilos o precio.</span>
        </div>
      )}
      {r.sobreSustitucion > 0 && (
        <div style={{ color: C.danger, marginTop: 3 }}>
          Sobre-sustitución de {$$(r.sobreSustitucion)}: hay cuotas vigentes que reemplazan más estimación de la disponible. Hay que resolverlo a mano.
        </div>
      )}
      {r.sinAsignarUsd > 0 && (
        <div style={{ color: C.warning, marginTop: 3 }}>
          {$$(r.sinAsignarUsd)} en movimientos pendientes de conciliación: no descuentan de esta liquidación hasta asignarlos.
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
    </div>
  );
}

// ── Panel completo ────────────────────────────────────────────────
export default function ProgramasPanel({
  programas = [], onChange, estimaciones = {}, onEstimaciones, resumenes = {},
  definitivas = {}, onDefinitiva, sinAsignar = [], onSinAsignar,
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
  sinAsignar, onSinAsignar, kgFruta, meses, readOnly, usuario, C, $$, setLista,
}) {
  const esCli = lado === "cliente";
  const col = esCli ? C.green : C.red;
  const [verArchivados, setVerArchivados] = useState(false);
  const [draftMov, setDraftMov] = useState(null);
  const vivos = programas.filter(p => !p.archivado);
  const archivados = programas.filter(p => p.archivado);

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
    const motivo = window.prompt("Motivo del archivo (queda registrado):", "");
    if (motivo === null) return;
    try {
      const arch = archivarPrograma(p, { motivo, usuario });
      const r = resumen || {};
      if (!window.confirm(
        `Archivar «${p.contraparte}».\n\n` +
        `Sus cuotas dejan de proyectar y de sustituir estimación, así que la estimación recupera pendiente.\n` +
        `Los ${$$(p.cuotas.reduce((s, c) => s + cuotaRealizado(c), 0))} ya ${esCli ? "cobrados" : "pagados"} NO se mueven y siguen descontando.\n\n` +
        `¿Confirmas?`)) return;
      reemplazar(p.id, arch);
    } catch (e) { window.alert(e.message); }
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

      <LiquidacionDefinitiva definitiva={definitiva} onDefinitiva={onDefinitiva} resumen={resumen}
        esCli={esCli} C={C} $$={$$} readOnly={readOnly} usuario={usuario} />

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {vivos.length === 0 && (
          <div style={{ fontSize: 10, color: C.muted2, fontStyle: "italic" }}>
            Sin {esCli ? "clientes" : "productores"} cargados. La estimación de arriba sigue proyectando sola.
          </div>
        )}
        {vivos.map(p => (
          <Tarjeta key={p.id} p={p} esCli={esCli} col={col} C={C} $$={$$} meses={meses}
            readOnly={readOnly} usuario={usuario} kgFruta={kgFruta}
            estimaciones={estimaciones} onEstimaciones={onEstimaciones}
            todos={todos} setLista={setLista}
            onReemplazar={nuevo => reemplazar(p.id, nuevo)}
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

      {/* Bandeja de conciliación */}
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px dashed ${C.border}` }}>
        <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 3 }}>
          Movimientos pendientes de conciliación
        </div>
        {sinAsignar.length === 0 && (
          <div style={{ fontSize: 9, color: C.muted2, fontStyle: "italic" }}>Ninguno.</div>
        )}
        {sinAsignar.map(m => (
          <div key={m.id} style={{ display: "flex", gap: 7, fontSize: 9, alignItems: "center", flexWrap: "wrap", marginTop: 2 }}>
            <span style={{ color: C.muted }}>{m.fecha}</span>
            <strong style={{ color: C.warning }}>{$$(m.usd)}</strong>
            {m.referencia && <span style={{ color: C.muted2, fontStyle: "italic" }}>{m.referencia}</span>}
            <span style={{ color: C.muted2 }}>sin operación: no descuenta</span>
            {!readOnly && (
              <button onClick={() => { if (window.confirm("Quitar este movimiento de la bandeja?")) onSinAsignar(sinAsignar.filter(x => x.id !== m.id)); }}
                style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 9, textDecoration: "underline" }}>quitar</button>
            )}
          </div>
        ))}
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
  p, esCli, col, C, $$, meses, readOnly, usuario, kgFruta,
  estimaciones, onEstimaciones, todos, setLista, onReemplazar, onBorrar, onArchivar,
}) {
  const [abierto, setAbierto] = useState(true);
  const [form, setForm] = useState(null);       // registrar movimiento
  const [asociar, setAsociar] = useState(null); // mover un movimiento existente
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
  const updCuota = (id, patch) => onReemplazar({ ...p, cuotas: p.cuotas.map(c => c.id === id ? normalizarCuota({ ...c, ...patch }) : c) });
  const addCuota = () => onReemplazar({ ...p, cuotas: [...p.cuotas, normalizarCuota({
    id: nuevoIdCuota(), estado: "borrador", modalidad: "por_confirmar" })] });
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

  const anular = (cuotaId, reaId) => {
    const motivo = window.prompt("Motivo de la anulación (queda registrado en el historial):", "");
    if (motivo === null) return;
    if (!motivo.trim()) { window.alert("La anulación necesita un motivo para conservar la trazabilidad."); return; }
    onReemplazar({ ...p, cuotas: p.cuotas.map(c => c.id === cuotaId
      ? normalizarCuota(anularRealizacion(c, reaId, { motivo: motivo.trim(), usuario })) : c) });
  };

  // Asociar un movimiento que ya está registrado en una estimación.
  const movimientosDeEstimaciones = (estimaciones || []).flatMap(e =>
    realizacionesVigentes(normalizarAnticipo(e)).map(r => ({ ...r, estimacionId: e.id })));
  const confirmarAsociar = () => {
    const { reaId, estimacionId, cuotaId } = asociar;
    const res = moverRealizacion({ estimaciones, programas: todos, reaId,
      desde: { tipo: "estimacion", id: estimacionId }, hacia: { tipo: "cuota", id: cuotaId }, usuario });
    if (!res.movida) { window.alert("No encontré ese movimiento."); return; }
    const cuota = p.cuotas.find(c => c.id === cuotaId);
    const ef = efectoImputacion({ cuota, kilosPrograma: p.kilos, usd: res.movida.usd, incluido: true });
    if (!window.confirm(
      `Mover ${$$(res.movida.usd)} del ${res.movida.fecha} a la cuota.\n\n` +
      `El movimiento conserva su identidad y su historial: no se vuelve a registrar.\n` +
      `La estimación de origen NO reabre ese monto.\n\n` +
      `Pendiente de la cuota: ${$$(ef.pendienteAntes)} → ${$$(ef.pendienteDespues)}\n\n` +
      `Si este movimiento era adicional al acuerdo, después sube el total acordado de la cuota.\n\n¿Confirmas?`)) return;
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
                estimaciones={estimaciones} todos={todos}
                onUpd={patch => updCuota(c.id, patch)} onDel={() => delCuota(c)}
                onRegistrar={() => setForm({ cuotaId: c.id, fecha: hoyISO(), usd: "", nota: "" })}
                onAsociar={() => setAsociar({ cuotaId: c.id, reaId: "", estimacionId: "" })}
                onAnular={reaId => anular(c.id, reaId)} />
            ))}
            {!readOnly && (
              <button onClick={addCuota}
                style={{ alignSelf: "flex-start", padding: "3px 9px", background: "transparent", border: `1px dashed ${C.border}`,
                  borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 10 }}>
                + Agregar cuota al calendario
              </button>
            )}
          </div>

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
              <span style={{ fontSize: 10, color: C.muted, fontWeight: 700 }}>Asociar movimiento ya registrado:</span>
              <select value={asociar.reaId} onChange={e => {
                const m = movimientosDeEstimaciones.find(x => x.id === e.target.value);
                setAsociar({ ...asociar, reaId: e.target.value, estimacionId: m ? m.estimacionId : "" });
              }} style={selSt}>
                <option value="">— elegir —</option>
                {movimientosDeEstimaciones.map(m => (
                  <option key={m.id} value={m.id}>{m.fecha} · {$$(m.usd)}{m.nota ? ` · ${m.nota}` : ""}</option>
                ))}
              </select>
              <button onClick={() => { if (!asociar.reaId) { window.alert("Elige el movimiento."); return; } confirmarAsociar(); }}
                style={{ padding: "4px 11px", background: C.success, border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 10, fontWeight: 700 }}>
                Ver efecto y mover
              </button>
              <button onClick={() => setAsociar(null)}
                style={{ padding: "4px 9px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 10 }}>Cancelar</button>
              <div style={{ flexBasis: "100%", fontSize: 9, color: C.muted2, marginTop: 3 }}>
                Mueve el movimiento, no lo vuelve a registrar. La estimación de origen no reabre ese monto.
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
  estimaciones, todos, onUpd, onDel, onRegistrar, onAsociar, onAnular,
}) {
  const ac = cuotaAcordado(c, p.kilos);
  const re = cuotaRealizado(c);
  const pend = cuotaPendiente(c, p.kilos);
  const reas = realizacionesVigentes(c);
  const anuladas = (c.realizaciones || []).filter(x => x && x.anulada);
  const sustTotal = (c.sustituye || []).reduce((s, x) => s + (Number(x.usd) || 0), 0);
  const vigente = c.estado === "vigente";

  const setSust = (estimacionId, usd) => {
    const otras = (c.sustituye || []).filter(s => s.estimacionId !== estimacionId);
    onUpd({ sustituye: usd > 0 ? [...otras, { estimacionId, usd }] : otras });
  };

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
        {!readOnly && (
          <button onClick={onRegistrar}
            style={{ padding: "2px 8px", background: `${C.primary}14`, border: `1px solid ${C.primary}55`,
              borderRadius: 6, color: C.primary, cursor: "pointer", fontSize: 9, fontWeight: 700 }}>
            + Registrar {esCli ? "cobro recibido" : "pago efectuado"}
          </button>
        )}
        {!readOnly && (
          <button onClick={onAsociar}
            style={{ padding: "2px 8px", background: "transparent", border: `1px solid ${C.border}`,
              borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 9 }}>
            Asociar movimiento existente
          </button>
        )}
        {!readOnly && <button onClick={onDel}
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
