/* eslint-disable */
// src/proceso/core/reportingEmail.js — armado del email del Informe Diario de Operación.
// Puro y testeable. Consume el SNAPSHOT de la ejecución (dataset congelado del backend);
// NUNCA recalcula cifras. Usa los formatters canónicos (format.js). Sobrio y ejecutivo.
import { formatNum, formatFecha } from "../ui/format.js";

export function totalesInformeDiario(snapshot) {
  const cs = (snapshot && snapshot.clientes) || [];
  return {
    kg_recibido: Number(snapshot?.total_kg_recibido ?? cs.reduce((a, c) => a + Number(c.kg_recibido || 0), 0)),
    kg_procesado: Number(snapshot?.total_kg_procesado ?? cs.reduce((a, c) => a + Number(c.kg_procesado || 0), 0)),
    cantidad_clientes: cs.length,
  };
}

export function filasInformeDiario(snapshot) {
  return ((snapshot && snapshot.clientes) || []).map((c) => ({
    cliente: c.cliente_nombre || "(sin cliente asignado)",
    kg_recibido: Number(c.kg_recibido || 0),
    kg_procesado: Number(c.kg_procesado || 0),
    recepciones: Number(c.cantidad_recepciones || 0),
    ordenes: Number(c.cantidad_ordenes || 0),
  }));
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Devuelve { asunto, html, texto, totales, filas } a partir de la ejecución (snapshot).
export function construirEmailInformeDiario(ejecucion, opts = {}) {
  const snap = (ejecucion && ejecucion.snapshot) || {};
  const filas = filasInformeDiario(snap);
  const tot = totalesInformeDiario(snap);
  const fecha = formatFecha(snap.fecha || ejecucion?.fecha_operacional);
  const asunto = ejecucion?.asunto || `Allegria Service · Informe Diario de Operación · ${fecha}`;
  const planta = opts.plantaNombre ? ` · ${esc(opts.plantaNombre)}` : "";
  const temporada = opts.temporada ? ` · Temporada ${esc(opts.temporada)}` : "";
  // Alertas: prioriza las CONGELADAS en el snapshot (proc_fn_informe_diario_alertas); opts.alertas es
  // override/compat. Cada alerta puede ser objeto {descripcion,cantidad} o string. Ref humana + conteo.
  const alertasArr = (opts.alertas && opts.alertas.length) ? opts.alertas : (Array.isArray(snap.alertas) ? snap.alertas : []);
  const alertaTexto = (a) => typeof a === "string" ? a : `${a.descripcion || a.tipo || ""}${a.cantidad != null ? ` — ${a.cantidad}` : ""}`;
  const alertasHtml = alertasArr.length
    ? `<div style="margin-top:16px"><b>Situaciones que requieren atención</b><ul>${alertasArr.map((a) => `<li>${esc(alertaTexto(a))}</li>`).join("")}</ul></div>` : "";

  const filasHtml = filas.length
    ? filas.map((f) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(f.cliente)}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${formatNum(f.kg_recibido, 1)}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${formatNum(f.kg_procesado, 1)}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${f.recepciones}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${f.ordenes}</td></tr>`).join("")
    : `<tr><td colspan="5" style="padding:10px;color:#888">Sin movimiento operacional en la fecha.</td></tr>`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:720px">
    <h2 style="margin:0 0 4px">Allegria Service · Informe Diario de Operación</h2>
    <div style="color:#666;font-size:13px">${fecha}${planta}${temporada}</div>
    <div style="margin:14px 0;font-size:14px">
      <b>Total kg recibidos:</b> ${formatNum(tot.kg_recibido, 1)} &nbsp;·&nbsp;
      <b>Total kg procesados:</b> ${formatNum(tot.kg_procesado, 1)}
    </div>
    <table style="border-collapse:collapse;width:100%;font-size:13px">
      <thead><tr style="background:#f5f5f5">
        <th style="padding:6px 10px;text-align:left">Cliente</th>
        <th style="padding:6px 10px;text-align:right">Kg recibidos</th>
        <th style="padding:6px 10px;text-align:right">Kg procesados</th>
        <th style="padding:6px 10px;text-align:right">Recepciones</th>
        <th style="padding:6px 10px;text-align:right">Órdenes</th>
      </tr></thead>
      <tbody>${filasHtml}</tbody>
    </table>${alertasHtml}
    <div style="margin-top:16px;color:#999;font-size:11px">Generado por Allegria Service · cifras desde el ledger operacional.</div>
  </div>`;

  const texto = [
    `Allegria Service - Informe Diario de Operacion`,
    `Fecha: ${fecha}${opts.plantaNombre ? " - " + opts.plantaNombre : ""}`,
    `Total kg recibidos: ${formatNum(tot.kg_recibido, 1)}`,
    `Total kg procesados: ${formatNum(tot.kg_procesado, 1)}`,
    ``,
    ...filas.map((f) => `${f.cliente}: recibidos ${formatNum(f.kg_recibido, 1)} / procesados ${formatNum(f.kg_procesado, 1)} (${f.recepciones} rec, ${f.ordenes} ord)`),
    ...(alertasArr.length ? ["", "Situaciones que requieren atencion:", ...alertasArr.map((a) => `- ${alertaTexto(a)}`)] : []),
  ].join("\n");

  return { asunto, html, texto, totales: tot, filas };
}
