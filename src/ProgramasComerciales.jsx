/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// PROGRAMAS COMERCIALES POR CONTRAPARTE — Allegria Foods
//
// Pantalla de los acuerdos reales: un programa por cliente o productor,
// con sus propios kilos, su propio precio y su propio calendario de
// anticipos. El modelo está en src/programas.js; acá solo se edita.
//
// Dos cosas que la pantalla tiene que dejar obvias:
//   · REGISTRAR una contraparte no cambia ninguna proyección. Recién al
//     ACTIVARLA el flujo deja de usar la estimación de la fruta, y antes
//     de activar se muestra qué reemplaza y el cuadre antes/después.
//   · Un dato que falta se ve como "falta", nunca como 0.
// ═══════════════════════════════════════════════════════════════════
import React, { useState } from "react";
import InputNumero from "./InputNumero.jsx";
import {
  normalizarPrograma, nuevoIdPrograma, nuevoIdAntAcuerdo,
  acordadoAnticipo, realizadoAnticipo, pendienteAnticipo, referenciaAnticipo,
  resumenPrograma, resumenLado, proyeccionLado,
  validarActivacion, cuadreActivacion, agregarAntecedente, completarAntecedente,
  esDato,
} from "./programas.js";
import {
  agregarRealizacion, anularRealizacion, realizacionesVigentes,
  antRealizado, puedeBorrarAnticipo,
} from "./anticipos.js";

const MODAL_LBL = {
  usd_kg: "US$/kg × kilos del programa",
  monto: "Monto fijo en USD",
  por_confirmar: "Por confirmar",
};

const num = (x, d = 0) =>
  new Intl.NumberFormat("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: d }).format(Number(x) || 0);

export default function ProgramasPanel({
  programas = [], onChange, kgPresupuesto = 0, ventaPresupuesto = 0, costoPresupuesto = 0,
  meses = [], mesLiqCliente = "", mesLiqProductor = "", readOnly = false, usuario = "",
  movimientosEstimacion = { cliente: [], productor: [] },
  C, $$,
}) {
  const [abierto, setAbierto] = useState({});       // programaId → desplegado
  const [cuadreDe, setCuadreDe] = useState(null);   // "cliente" | "productor"
  const lista = (Array.isArray(programas) ? programas : []).map(normalizarPrograma);

  const setLista = (next) => { if (!readOnly && onChange) onChange(next); };
  const updPrograma = (id, patch) =>
    setLista(lista.map(p => (p.id === id ? normalizarPrograma({ ...p, ...patch }) : p)));
  const reemplazar = (id, nuevo) => setLista(lista.map(p => (p.id === id ? normalizarPrograma(nuevo) : p)));

  const agregarPrograma = (lado) => setLista([...lista, normalizarPrograma({
    id: nuevoIdPrograma(), lado, contraparte: "", kilos: null,
    precio_modo: "usd_kg", precio_usd_kg: null,
    mes_liquidacion: lado === "cliente" ? mesLiqCliente : mesLiqProductor,
    anticipos: [], antecedentes: [], activo: false,
  })]);

  const borrarPrograma = (p) => {
    const r = resumenPrograma(p);
    if (r.realizado > 0) {
      window.alert(`Este programa tiene ${$$(r.realizado)} en movimientos registrados.\n\n` +
        `No se puede borrar sin perder el respaldo. Anula cada movimiento (queda su motivo en el historial) ` +
        `o desactiva el programa si ya no corresponde.`);
      return;
    }
    if (!window.confirm(`Eliminar el programa de «${p.contraparte || "sin nombre"}»?`)) return;
    setLista(lista.filter(x => x.id !== p.id));
  };

  const ladoProps = (lado) => {
    const progs = lista.filter(p => p.lado === lado);
    const presup = lado === "cliente" ? ventaPresupuesto : costoPresupuesto;
    const mesLiqFruta = lado === "cliente" ? mesLiqCliente : mesLiqProductor;
    return {
      lado, progs, presup, mesLiqFruta,
      resumen: resumenLado(progs, { kgPresupuesto, totalPresupuesto: presup }),
      proy: proyeccionLado(progs, { totalPresupuesto: presup, mesLiquidacionFruta: mesLiqFruta }),
    };
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {["cliente", "productor"].map(lado => (
          <ColumnaLado key={lado} {...ladoProps(lado)}
            C={C} $$={$$} meses={meses} readOnly={readOnly} usuario={usuario}
            kgPresupuesto={kgPresupuesto}
            abierto={abierto} setAbierto={setAbierto}
            onAgregar={() => agregarPrograma(lado)}
            onUpd={updPrograma} onReemplazar={reemplazar} onBorrar={borrarPrograma}
            onVerCuadre={() => setCuadreDe(cuadreDe === lado ? null : lado)}
            verCuadre={cuadreDe === lado}
            movEstimacion={movimientosEstimacion?.[lado] || []}
            todosDelLado={lista.filter(p => p.lado === lado)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Una columna: clientes o productores ───────────────────────────
function ColumnaLado({
  lado, progs, presup, mesLiqFruta, resumen, proy, C, $$, meses, readOnly, usuario,
  kgPresupuesto, abierto, setAbierto, onAgregar, onUpd, onReemplazar, onBorrar,
  onVerCuadre, verCuadre, movEstimacion, todosDelLado,
}) {
  const esCli = lado === "cliente";
  const col = esCli ? C.green : C.red;
  const titulo = esCli ? "Programas de venta (clientes)" : "Programas de compra (productores)";
  const cuadre = cuadreActivacion({
    movimientosEstimacion: movEstimacion, programas: todosDelLado,
    totalPresupuesto: presup, mesLiquidacionFruta: mesLiqFruta,
  });

  return (
    <div style={{ background: `${col}0d`, border: `1px solid ${col}33`, borderRadius: 10, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: col }}>{titulo}</span>
        {!readOnly && (
          <button onClick={onAgregar}
            style={{ marginLeft: "auto", padding: "3px 9px", background: `${col}18`, border: `1px solid ${col}55`,
              borderRadius: 6, color: col, cursor: "pointer", fontSize: 10, fontWeight: 700 }}>
            + Agregar programa
          </button>
        )}
      </div>

      {/* Asignación de kilos de ESTE lado, independiente del otro */}
      <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.7, marginBottom: 8 }}>
        Kilos asignados a {esCli ? "clientes" : "productores"}:{" "}
        <strong style={{ color: C.text }}>{num(resumen.kilosAsignados)}</strong> de {num(kgPresupuesto)} de presupuesto
        {resumen.kilosLibres !== null && resumen.kilosLibres !== 0 && (
          <> · <span style={{ color: resumen.kilosLibres < 0 ? C.danger : C.muted2 }}>
            {resumen.kilosLibres > 0 ? `${num(resumen.kilosLibres)} sin asignar` : `${num(-resumen.kilosLibres)} por sobre el presupuesto`}
          </span></>
        )}
        {resumen.sinKilos > 0 && <> · <span style={{ color: C.warning }}>{resumen.sinKilos} programa(s) sin kilos definidos</span></>}
        <br />
        {esCli ? "Venta" : "Costo neto"} de presupuesto: <strong style={{ color: C.text }}>{$$(presup)}</strong>
        {" · "}programas: <strong style={{ color: C.text }}>{$$(resumen.totalProgramas)}</strong>
        {resumen.variacion !== null && (
          <> · variación: <strong style={{ color: Math.abs(resumen.variacion) < 0.5 ? C.muted2 : C.warning }}>
            {resumen.variacion >= 0 ? "+" : ""}{$$(resumen.variacion)}
          </strong></>
        )}
        {resumen.sinTotal > 0 && <> · <span style={{ color: C.warning }}>{resumen.sinTotal} sin total definido</span></>}
      </div>

      {/* Estado del cálculo: estimación vs programas */}
      <div style={{
        background: proy.hayActivos ? `${C.success}11` : C.infoBg,
        border: `1px solid ${proy.hayActivos ? `${C.success}44` : `${C.info}44`}`,
        borderRadius: 8, padding: "7px 10px", fontSize: 10, color: C.text, marginBottom: 10, lineHeight: 1.6,
      }}>
        {proy.hayActivos ? (
          <>
            <strong style={{ color: C.success }}>El flujo de este lado se calcula con {proy.activos.length} programa(s) activo(s).</strong>
            {" "}Las estimaciones de la fruta quedaron reemplazadas. Programas {$$(proy.totalProgramas)}
            {proy.resto > 0 && <> + presupuesto sin programa {$$(proy.resto)}</>} = {$$(proy.totalProyectado)}.
          </>
        ) : (
          <>
            <strong>El flujo sigue con la estimación de la fruta.</strong>{" "}
            {progs.length === 0
              ? "Todavía no hay programas cargados."
              : `Hay ${progs.length} programa(s) registrado(s) y ninguno activo: registrar una contraparte no cambia la proyección.`}
          </>
        )}
        {(movEstimacion.length > 0 || proy.hayActivos) && (
          <> <button onClick={onVerCuadre}
            style={{ padding: "1px 7px", background: "transparent", border: `1px solid ${C.border}`,
              borderRadius: 5, color: C.muted, cursor: "pointer", fontSize: 9, fontWeight: 700 }}>
            {verCuadre ? "ocultar cuadre" : "ver cuadre antes/después"}
          </button></>
        )}
      </div>

      {verCuadre && <Cuadre cuadre={cuadre} C={C} $$={$$} esCli={esCli} />}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {progs.length === 0 && (
          <div style={{ fontSize: 10, color: C.muted2, fontStyle: "italic" }}>
            Sin programas. Un programa puede existir sin anticipos: igual liquida su total.
          </div>
        )}
        {progs.map(p => (
          <TarjetaPrograma key={p.id} p={p} C={C} $$={$$} meses={meses} readOnly={readOnly} usuario={usuario}
            esCli={esCli} col={col} kgPresupuesto={kgPresupuesto} presup={presup}
            otrosActivos={todosDelLado.filter(x => x.id !== p.id && x.activo)}
            desplegado={!!abierto[p.id]}
            onToggle={() => setAbierto(a => ({ ...a, [p.id]: !a[p.id] }))}
            onUpd={patch => onUpd(p.id, patch)}
            onReemplazar={nuevo => onReemplazar(p.id, nuevo)}
            onBorrar={() => onBorrar(p)} />
        ))}
      </div>
    </div>
  );
}

// ── Cuadre antes/después de activar ───────────────────────────────
function Cuadre({ cuadre, C, $$, esCli }) {
  const filas = (movs) => {
    const porMes = {};
    movs.forEach(m => { porMes[m.mes || "sin mes"] = (porMes[m.mes || "sin mes"] || 0) + (Number(m.usd) || 0); });
    return Object.entries(porMes);
  };
  const a = filas(cuadre.antes.movimientos), d = filas(cuadre.despues.movimientos);
  const celda = { padding: "2px 6px", fontSize: 9, borderBottom: `1px solid ${C.border}` };
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.text, marginBottom: 6 }}>
        Cuadre del lado — qué estimación reemplazan los programas activos
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[["Antes (estimación de la fruta)", a, cuadre.antes.total],
          ["Después (programas activos)", d, cuadre.despues.total]].map(([t, rows, tot]) => (
          <div key={t}>
            <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, marginBottom: 3 }}>{t}</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {rows.length === 0 && <tr><td style={{ ...celda, color: C.muted2, fontStyle: "italic" }}>sin movimientos</td></tr>}
                {rows.map(([mes, usd]) => (
                  <tr key={mes}>
                    <td style={{ ...celda, color: C.muted }}>{mes}</td>
                    <td style={{ ...celda, textAlign: "right", color: C.text }}>{$$(usd)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...celda, fontWeight: 700, color: C.text }}>Total</td>
                  <td style={{ ...celda, textAlign: "right", fontWeight: 700, color: C.text }}>{$$(tot)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 9, color: C.muted, marginTop: 6, lineHeight: 1.6 }}>
        Presupuesto del lado {$$(cuadre.presupuesto)} · programas activos {$$(cuadre.totalProgramas)} ·
        {" "}presupuesto sin programa {$$(cuadre.resto)}.
        {" "}Diferencia de proyección: <strong style={{ color: Math.abs(cuadre.diferencia) < 0.5 ? C.muted2 : C.warning }}>
          {cuadre.diferencia >= 0 ? "+" : ""}{$$(cuadre.diferencia)}
        </strong>.
        {" "}Lo ya {esCli ? "cobrado" : "pagado"} sale del flujo futuro y sigue descontando de la liquidación,
        así que una diferencia negativa de ese monto es lo esperado.
      </div>
    </div>
  );
}

// ── Tarjeta de un programa ────────────────────────────────────────
function TarjetaPrograma({
  p, C, $$, meses, readOnly, usuario, esCli, col, kgPresupuesto, presup,
  otrosActivos, desplegado, onToggle, onUpd, onReemplazar, onBorrar,
}) {
  const [form, setForm] = useState(null);        // {anticipoId, fecha, usd, nota}
  const [anteDraft, setAnteDraft] = useState(null);
  const r = resumenPrograma(p);
  const val = validarActivacion(p, { kgPresupuesto, totalPresupuesto: presup, otrosActivos });
  const inSt = { padding: "4px 7px", background: C.card2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 11, outline: "none" };
  const selSt = { ...inSt, padding: "4px 6px" };
  const chip = (t, c) => <span style={{ fontSize: 9, color: c, background: `${c}18`, border: `1px solid ${c}44`, borderRadius: 10, padding: "1px 7px", fontWeight: 700 }}>{t}</span>;

  const updAnticipo = (id, patch) =>
    onReemplazar({ ...p, anticipos: p.anticipos.map(a => (a.id === id ? { ...a, ...patch } : a)) });
  const addAnticipo = () =>
    onReemplazar({ ...p, anticipos: [...p.anticipos, {
      id: nuevoIdAntAcuerdo(), fecha_prevista: "", mes: "", modalidad: "por_confirmar",
      usd_kg: null, monto: null, cerrado: false, realizaciones: [],
    }] });
  const delAnticipo = (a) => {
    if (!puedeBorrarAnticipo(a)) {
      window.alert(`Este anticipo tiene ${$$(antRealizado(a))} registrados. Anula los movimientos antes de borrarlo.`);
      return;
    }
    onReemplazar({ ...p, anticipos: p.anticipos.filter(x => x.id !== a.id) });
  };
  const guardarMov = () => {
    const usd = Number(form.usd) || 0;
    if (usd <= 0) { window.alert(`Ingresa el monto en US$ efectivamente ${esCli ? "cobrado" : "pagado"}.`); return; }
    if (!form.fecha) { window.alert("Ingresa la fecha real del movimiento, no el mes programado."); return; }
    onReemplazar({ ...p, anticipos: p.anticipos.map(a => a.id === form.anticipoId
      ? agregarRealizacion(a, { fecha: form.fecha, usd, nota: form.nota, usuario }) : a) });
    setForm(null);
  };
  const anular = (anticipoId, reaId) => {
    const motivo = window.prompt("Motivo de la anulación (queda registrado en el historial):", "");
    if (motivo === null) return;
    if (!motivo.trim()) { window.alert("La anulación necesita un motivo para conservar la trazabilidad."); return; }
    onReemplazar({ ...p, anticipos: p.anticipos.map(a => a.id === anticipoId
      ? anularRealizacion(a, reaId, { motivo: motivo.trim(), usuario }) : a) });
  };
  const toggleActivo = () => {
    if (p.activo) {
      if (!window.confirm(`Desactivar el programa de «${p.contraparte}».\n\n` +
        `El flujo de este lado vuelve a la estimación de la fruta si no queda ningún otro programa activo. ` +
        `Los datos y los movimientos registrados se conservan.`)) return;
      onUpd({ activo: false });
      return;
    }
    if (!val.puede) {
      window.alert(`No se puede activar todavía.\n\n` +
        (val.faltantes.length ? `Faltan datos:\n· ${val.faltantes.join("\n· ")}\n\n` : "") +
        (val.bloqueos.length ? `Bloqueos:\n· ${val.bloqueos.join("\n· ")}` : ""));
      return;
    }
    const res = resumenPrograma(p);
    if (!window.confirm(
      `Activar el programa de «${p.contraparte}» en el cálculo.\n\n` +
      `Total del programa: ${$$(res.total)}\n` +
      `Anticipos acordados: ${$$(res.acordado)} · ${esCli ? "cobrado" : "pagado"}: ${$$(res.realizado)} · pendiente: ${$$(res.pendiente)}\n` +
      `Liquidación: ${$$(res.liquidacion)}\n\n` +
      `Desde que haya un programa activo, este lado deja de usar las filas estimadas de la fruta. ` +
      `Revisa el cuadre antes/después arriba.\n\n¿Confirmas?`)) return;
    onUpd({ activo: true });
  };

  return (
    <div style={{ border: `1px solid ${p.activo ? `${col}66` : C.border}`, borderRadius: 9, background: C.card, padding: "8px 10px" }}>
      {/* Encabezado */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <button onClick={onToggle} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 11 }}>
          {desplegado ? "▾" : "▸"}
        </button>
        <input type="text" value={p.contraparte} disabled={readOnly} placeholder={esCli ? "cliente" : "productor"}
          onChange={e => onUpd({ contraparte: e.target.value })}
          style={{ ...inSt, width: 150, fontWeight: 700 }} />
        {p.activo ? chip("activo en el cálculo", C.success) : chip("registrado, fuera del cálculo", C.muted)}
        {!r.completo && chip(`faltan ${r.faltantes.length} dato(s)`, C.warning)}
        {r.excedente > 0 && chip(`excedente ${$$(r.excedente)}`, C.danger)}
        {!readOnly && (
          <button onClick={toggleActivo}
            title={p.activo ? "Sacar del cálculo" : "Meter en el cálculo del flujo"}
            style={{ marginLeft: "auto", padding: "3px 9px", borderRadius: 6, cursor: "pointer", fontSize: 10, fontWeight: 700,
              background: p.activo ? "transparent" : `${C.success}18`,
              border: `1px solid ${p.activo ? C.border : `${C.success}55`}`,
              color: p.activo ? C.muted : C.success }}>
            {p.activo ? "Desactivar" : "Activar en el cálculo"}
          </button>
        )}
        {!readOnly && <button onClick={onBorrar} title="Eliminar programa"
          style={{ background: "transparent", border: "none", color: C.danger, cursor: "pointer", fontSize: 14 }}>×</button>}
      </div>

      {/* Resumen de una línea, siempre visible */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 10, color: C.muted, marginTop: 5 }}>
        <span>Kilos <strong style={{ color: esDato(p.kilos) ? C.text : C.warning }}>{esDato(p.kilos) ? num(p.kilos) : "falta"}</strong></span>
        <span>{esCli ? "Venta" : "Costo neto"} <strong style={{ color: r.total === null ? C.warning : C.text }}>{r.total === null ? "falta" : $$(r.total)}</strong></span>
        <span>Acordado <strong style={{ color: C.text }}>{$$(r.acordado)}</strong></span>
        <span>{esCli ? "Cobrado" : "Pagado"} <strong style={{ color: r.realizado > 0 ? C.success : C.muted2 }}>{$$(r.realizado)}</strong></span>
        <span>Pendiente <strong style={{ color: r.pendiente > 0 ? C.warning : C.muted2 }}>{$$(r.pendiente)}</strong></span>
        <span>Liquidación <strong style={{ color: r.liquidacion === null ? C.warning : C.text }}>{r.liquidacion === null ? "falta dato" : $$(r.liquidacion)}</strong></span>
        {r.antecedentes > 0 && <span style={{ color: C.warning }}>{r.antecedentes} antecedente(s) sin fecha: {$$(r.antecedentesUsd)}</span>}
      </div>

      {!r.completo && (
        <div style={{ fontSize: 9, color: C.warning, marginTop: 4 }}>
          Pendiente de completar: {r.faltantes.join(" · ")}. Mientras falte, el número no se calcula: no se asume cero.
        </div>
      )}

      {desplegado && (
        <div style={{ marginTop: 8, borderTop: `1px dashed ${C.border}`, paddingTop: 8 }}>
          {/* Parámetros del programa */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 8 }}>
            <Campo lbl="Kilos del programa" C={C}>
              <InputNumero formato="monto" value={esDato(p.kilos) ? p.kilos : ""} placeholder="falta"
                disabled={readOnly} onChange={n => onUpd({ kilos: n })} style={{ ...inSt, width: 95, textAlign: "right" }} />
            </Campo>
            <Campo lbl="Precio del programa" C={C}>
              <select value={p.precio_modo} disabled={readOnly} onChange={e => onUpd({ precio_modo: e.target.value })} style={selSt}>
                <option value="usd_kg">US$/kg</option>
                <option value="monto">Monto total USD</option>
              </select>
            </Campo>
            <Campo lbl={p.precio_modo === "monto" ? (esCli ? "Venta total USD" : "Costo neto total USD") : (esCli ? "US$/kg de venta" : "US$/kg neto al productor")} C={C}>
              {p.precio_modo === "monto"
                ? <InputNumero formato="monto" value={esDato(p.monto_total) ? p.monto_total : ""} placeholder="falta"
                    disabled={readOnly} onChange={n => onUpd({ monto_total: n })} style={{ ...inSt, width: 110, textAlign: "right" }} />
                : <InputNumero formato="tasa" value={esDato(p.precio_usd_kg) ? p.precio_usd_kg : ""} placeholder="falta"
                    disabled={readOnly} onChange={n => onUpd({ precio_usd_kg: n })} style={{ ...inSt, width: 80, textAlign: "right" }} />}
            </Campo>
            <Campo lbl={esCli ? "Mes liquidación" : "Mes saldo"} C={C}>
              <select value={p.mes_liquidacion || ""} disabled={readOnly}
                onChange={e => onUpd({ mes_liquidacion: e.target.value })} style={selSt}>
                <option value="">— mes —</option>
                {meses.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Campo>
          </div>

          {/* Calendario de anticipos */}
          <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 4 }}>
            Calendario de anticipos — fecha prevista y modalidad explícita
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {p.anticipos.length === 0 && (
              <div style={{ fontSize: 9, color: C.muted2, fontStyle: "italic" }}>
                Sin anticipos. El programa liquida su total completo en el mes de liquidación.
              </div>
            )}
            {p.anticipos.map((a, i) => {
              const ac = acordadoAnticipo(a, p.kilos);
              const re = realizadoAnticipo(a), pe = pendienteAnticipo(a, p.kilos);
              const ref = referenciaAnticipo(a, p.kilos);
              const reas = realizacionesVigentes(a);
              const anuladas = (a.realizaciones || []).filter(x => x && x.anulada);
              return (
                <div key={a.id} style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 8px", background: C.card2 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <input type="date" value={a.fecha_prevista || ""} disabled={readOnly}
                      title="Fecha prevista del acuerdo"
                      onChange={e => updAnticipo(a.id, { fecha_prevista: e.target.value })} style={{ ...inSt, fontSize: 10 }} />
                    <select value={a.mes || ""} disabled={readOnly} title="Mes en que se proyecta en el flujo"
                      onChange={e => updAnticipo(a.id, { mes: e.target.value })}
                      style={{ ...selSt, color: a.mes ? C.text : C.muted }}>
                      <option value="">— mes de flujo —</option>
                      {meses.map(m => <option key={m} value={m}>{m}</option>)}
                      {a.mes && !meses.includes(a.mes) && <option value={a.mes}>{a.mes} (fuera de temp.)</option>}
                    </select>
                    <select value={a.modalidad} disabled={readOnly}
                      onChange={e => updAnticipo(a.id, { modalidad: e.target.value })}
                      style={{ ...selSt, color: a.modalidad === "por_confirmar" ? C.warning : C.text }}>
                      {Object.entries(MODAL_LBL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    {a.modalidad === "usd_kg" && (
                      <>
                        <InputNumero formato="tasa" value={esDato(a.usd_kg) ? a.usd_kg : ""} placeholder="falta"
                          disabled={readOnly} onChange={n => updAnticipo(a.id, { usd_kg: n })}
                          style={{ ...inSt, width: 70, textAlign: "right" }} />
                        <span style={{ fontSize: 10, color: C.muted }}>US$/kg</span>
                      </>
                    )}
                    {a.modalidad !== "usd_kg" && (
                      <>
                        <InputNumero formato="monto" value={esDato(a.monto) ? a.monto : ""} placeholder="USD"
                          disabled={readOnly} onChange={n => updAnticipo(a.id, { monto: n })}
                          style={{ ...inSt, width: 95, textAlign: "right" }} />
                        <span style={{ fontSize: 10, color: C.muted }}>USD{a.modalidad === "por_confirmar" ? " (referencia)" : ""}</span>
                      </>
                    )}
                    {!readOnly && (
                      <button onClick={() => setForm({ anticipoId: a.id, fecha: hoyISO(), usd: "", nota: "" })}
                        title="Registra dinero que ya se movió: fecha e importe reales"
                        style={{ padding: "2px 8px", background: `${C.primary}14`, border: `1px solid ${C.primary}55`,
                          borderRadius: 6, color: C.primary, cursor: "pointer", fontSize: 9, fontWeight: 700 }}>
                        + Registrar {esCli ? "cobro recibido" : "pago efectuado"}
                      </button>
                    )}
                    {!readOnly && (
                      <label style={{ fontSize: 9, color: C.muted, display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}
                        title="El pendiente deja de proyectarse en su mes y se incorpora a la liquidación. No registra ningún movimiento.">
                        <input type="checkbox" checked={!!a.cerrado} onChange={() => updAnticipo(a.id, { cerrado: !a.cerrado })} />
                        Pasar el pendiente a liquidación
                      </label>
                    )}
                    {!readOnly && <button onClick={() => delAnticipo(a)}
                      style={{ marginLeft: "auto", background: "transparent", border: "none", color: C.danger, cursor: "pointer", fontSize: 13 }}>×</button>}
                  </div>

                  <div style={{ display: "flex", gap: 9, flexWrap: "wrap", fontSize: 9, color: C.muted, marginTop: 4 }}>
                    <span>Acordado <strong style={{ color: ac.valor === null ? C.warning : C.text }}>
                      {ac.valor === null ? "falta dato" : $$(ac.valor)}</strong></span>
                    <span>{esCli ? "Cobrado" : "Pagado"} <strong style={{ color: re > 0 ? C.success : C.muted2 }}>{$$(re)}</strong></span>
                    <span>Pendiente <strong style={{ color: pe === null ? C.warning : (pe > 0 ? C.warning : C.muted2) }}>
                      {pe === null ? "—" : $$(pe)}</strong></span>
                    {a.modalidad === "por_confirmar" && ref !== null && (
                      <span style={{ color: C.warning }}>Importe del calendario {$$(ref)}: no es tarifa ni monto contractual hasta definir la modalidad.</span>
                    )}
                    {!a.mes && !a.cerrado && <span style={{ color: C.warning }}>sin mes de flujo: se cobra/paga en la liquidación</span>}
                  </div>

                  {reas.length > 0 && (
                    <div style={{ marginTop: 5, paddingTop: 4, borderTop: `1px dashed ${C.border}`, display: "flex", flexDirection: "column", gap: 2 }}>
                      {reas.map(x => (
                        <div key={x.id} style={{ display: "flex", gap: 7, fontSize: 9, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ color: C.muted }}>{x.fecha || "sin fecha"}</span>
                          <strong style={{ color: C.success }}>{$$(x.usd)}</strong>
                          {x.nota && <span style={{ color: C.muted2, fontStyle: "italic" }}>{x.nota}</span>}
                          {!readOnly && <button onClick={() => anular(a.id, x.id)}
                            style={{ marginLeft: "auto", background: "transparent", border: "none", color: C.muted,
                              cursor: "pointer", fontSize: 9, textDecoration: "underline" }}>anular</button>}
                        </div>
                      ))}
                    </div>
                  )}
                  {anuladas.length > 0 && (
                    <details style={{ marginTop: 3 }}>
                      <summary style={{ fontSize: 9, color: C.muted2, cursor: "pointer" }}>
                        {anuladas.length} movimiento(s) anulado(s) (historial)
                      </summary>
                      {anuladas.map(x => (
                        <div key={x.id} style={{ fontSize: 9, color: C.muted2, textDecoration: "line-through" }}>
                          {x.fecha} · {$$(x.usd)} · {x.motivoAnulacion || "sin motivo"}
                        </div>
                      ))}
                    </details>
                  )}

                  {form && form.anticipoId === a.id && !readOnly && (
                    <div style={{ marginTop: 5, padding: "6px 7px", background: C.cardAlt, border: `1px solid ${C.border}`,
                      borderRadius: 6, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 9, color: C.muted, fontWeight: 700 }}>{esCli ? "Cobro recibido" : "Pago efectuado"}:</span>
                      <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} style={{ ...inSt, fontSize: 10 }} />
                      <InputNumero formato="monto" value={form.usd} placeholder="US$" onChange={n => setForm({ ...form, usd: n })}
                        style={{ ...inSt, width: 100, textAlign: "right" }} />
                      <input type="text" value={form.nota} placeholder="referencia / cartola"
                        onChange={e => setForm({ ...form, nota: e.target.value })} style={{ ...inSt, flex: 1, minWidth: 110 }} />
                      <button onClick={guardarMov}
                        style={{ padding: "3px 10px", background: C.success, border: "none", borderRadius: 6, color: "#fff",
                          cursor: "pointer", fontSize: 10, fontWeight: 700 }}>Guardar</button>
                      <button onClick={() => setForm(null)}
                        style={{ padding: "3px 8px", background: "transparent", border: `1px solid ${C.border}`,
                          borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 10 }}>Cancelar</button>
                      <div style={{ flexBasis: "100%", fontSize: 9, color: C.muted2, marginTop: 2 }}>
                        Monto fijo en USD y fecha real del movimiento. Cambiar kilos o tarifas después no lo mueve.
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {!readOnly && (
              <button onClick={addAnticipo}
                style={{ alignSelf: "flex-start", padding: "3px 9px", background: "transparent", border: `1px dashed ${C.border}`,
                  borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 10 }}>
                + Agregar anticipo al calendario
              </button>
            )}
          </div>

          {/* Antecedentes: informados sin fecha */}
          <Antecedentes p={p} C={C} $$={$$} readOnly={readOnly} usuario={usuario} esCli={esCli}
            draft={anteDraft} setDraft={setAnteDraft} onReemplazar={onReemplazar} />

          {/* Avisos de activación */}
          {(val.faltantes.length > 0 || val.bloqueos.length > 0 || val.avisos.length > 0) && (
            <div style={{ marginTop: 8, fontSize: 9, color: C.muted, lineHeight: 1.6 }}>
              {val.faltantes.length > 0 && <div style={{ color: C.warning }}>Para activar faltan: {val.faltantes.join(" · ")}.</div>}
              {val.bloqueos.map((b, i) => <div key={i} style={{ color: C.danger }}>{b}</div>)}
              {val.avisos.map((b, i) => <div key={i}>{b}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Antecedentes({ p, C, $$, readOnly, usuario, esCli, draft, setDraft, onReemplazar }) {
  const pendientes = (p.antecedentes || []).filter(x => x && !x.convertidoEn);
  const hechos = (p.antecedentes || []).filter(x => x && x.convertidoEn);
  const inSt = { padding: "3px 6px", background: C.card2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 10, outline: "none" };
  const [completar, setCompletar] = useState(null);   // {anteId, anticipoId, fecha}

  return (
    <div style={{ marginTop: 10, paddingTop: 7, borderTop: `1px dashed ${C.border}` }}>
      <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 3 }}>
        Antecedentes informados sin fecha — no cuentan como {esCli ? "cobrados" : "pagados"}
      </div>
      {pendientes.length === 0 && hechos.length === 0 && (
        <div style={{ fontSize: 9, color: C.muted2, fontStyle: "italic" }}>Ninguno.</div>
      )}
      {pendientes.map(x => (
        <div key={x.id} style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 9, flexWrap: "wrap", marginTop: 2 }}>
          <strong style={{ color: C.warning }}>{$$(x.usd)}</strong>
          {x.nota && <span style={{ color: C.muted2, fontStyle: "italic" }}>{x.nota}</span>}
          <span style={{ color: C.muted2 }}>sin fecha: no descuenta ni se proyecta</span>
          {!readOnly && p.anticipos.length > 0 && (
            <button onClick={() => setCompletar({ anteId: x.id, anticipoId: p.anticipos[0].id, fecha: "" })}
              style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 5, color: C.muted,
                cursor: "pointer", fontSize: 9, padding: "1px 6px" }}>completar con fecha</button>
          )}
        </div>
      ))}
      {completar && !readOnly && (
        <div style={{ marginTop: 4, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
          <input type="date" value={completar.fecha} onChange={e => setCompletar({ ...completar, fecha: e.target.value })} style={inSt} />
          <select value={completar.anticipoId} onChange={e => setCompletar({ ...completar, anticipoId: e.target.value })} style={inSt}>
            {p.anticipos.map((a, i) => <option key={a.id} value={a.id}>anticipo {i + 1}{a.mes ? ` · ${a.mes}` : ""}</option>)}
          </select>
          <button onClick={() => {
            if (!completar.fecha) { window.alert("Un antecedente necesita la fecha real para convertirse en movimiento."); return; }
            try { onReemplazar(completarAntecedente(p, completar.anteId, { ...completar, usuario })); setCompletar(null); }
            catch (e) { window.alert(e.message); }
          }} style={{ padding: "3px 9px", background: C.success, border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 9, fontWeight: 700 }}>
            Convertir en movimiento
          </button>
          <button onClick={() => setCompletar(null)}
            style={{ padding: "3px 7px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 9 }}>Cancelar</button>
        </div>
      )}
      {hechos.length > 0 && (
        <details style={{ marginTop: 3 }}>
          <summary style={{ fontSize: 9, color: C.muted2, cursor: "pointer" }}>{hechos.length} antecedente(s) ya completado(s)</summary>
          {hechos.map(x => (
            <div key={x.id} style={{ fontSize: 9, color: C.muted2 }}>
              {$$(x.usd)} → movimiento del {x.convertidoEn.fecha}
            </div>
          ))}
        </details>
      )}
      {!readOnly && (
        draft && draft.programaId === p.id ? (
          <div style={{ marginTop: 4, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
            <InputNumero formato="monto" value={draft.usd} placeholder="US$ informado"
              onChange={n => setDraft({ ...draft, usd: n })} style={{ ...inSt, width: 100, textAlign: "right" }} />
            <input type="text" value={draft.nota} placeholder="de dónde viene el dato"
              onChange={e => setDraft({ ...draft, nota: e.target.value })} style={{ ...inSt, minWidth: 140 }} />
            <button onClick={() => {
              if (!(Number(draft.usd) > 0)) { window.alert("Ingresa el monto informado."); return; }
              onReemplazar(agregarAntecedente(p, { usd: draft.usd, nota: draft.nota, usuario }));
              setDraft(null);
            }} style={{ padding: "3px 9px", background: `${C.warning}22`, border: `1px solid ${C.warning}66`, borderRadius: 6, color: C.warning, cursor: "pointer", fontSize: 9, fontWeight: 700 }}>
              Guardar antecedente
            </button>
            <button onClick={() => setDraft(null)}
              style={{ padding: "3px 7px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 9 }}>Cancelar</button>
          </div>
        ) : (
          <button onClick={() => setDraft({ programaId: p.id, usd: "", nota: "" })}
            style={{ marginTop: 4, padding: "2px 8px", background: "transparent", border: `1px dashed ${C.border}`,
              borderRadius: 6, color: C.muted, cursor: "pointer", fontSize: 9 }}>
            + Anotar monto informado sin fecha
          </button>
        )
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

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
