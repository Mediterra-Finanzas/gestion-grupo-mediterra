/* eslint-disable */
// api/_reporteDiarioEmail.js — plantilla del Informe Diario de Operación (Allegria Service).
// Compartida por el cron (proc-reporting-daily-cron.js) y por «Enviar ahora» (acción
// reporte_diario de send-email.js): el mismo correo sale del mismo snapshot inmutable.
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const n1 = (v) => Number(v || 0).toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const alertaTxt = (a) => typeof a === "string" ? a : `${a.descripcion || a.tipo || ""}${a.cantidad != null ? ` — ${a.cantidad}` : ""}`;

// Email desde el snapshot CONGELADO (misma fuente de datos que el envío manual; nada se recalcula).
function emailDesdeSnapshot(ej) {
  const s = ej.snapshot || {};
  const cs = s.clientes || [];
  const asunto = ej.asunto || "Allegria Service · Informe Diario de Operación";
  const filas = cs.length
    ? cs.map((c) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(c.cliente_nombre)}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${n1(c.kg_recibido)}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${n1(c.kg_procesado)}</td></tr>`).join("")
    : `<tr><td colspan="3" style="padding:10px;color:#888">Sin movimiento operacional en la fecha.</td></tr>`;
  const alertas = Array.isArray(s.alertas) ? s.alertas : [];
  const alertasHtml = alertas.length
    ? `<div style="margin-top:16px"><b>Situaciones que requieren atención</b><ul>${alertas.map((a) => `<li>${esc(alertaTxt(a))}</li>`).join("")}</ul></div>` : "";
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:720px">
    <h2 style="margin:0 0 4px">Allegria Service · Informe Diario de Operación</h2>
    <div style="margin:14px 0;font-size:14px"><b>Total kg recibidos:</b> ${n1(s.total_kg_recibido)} &nbsp;·&nbsp; <b>Total kg procesados:</b> ${n1(s.total_kg_procesado)}</div>
    <table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="background:#f5f5f5">
      <th style="padding:6px 10px;text-align:left">Cliente</th><th style="padding:6px 10px;text-align:right">Kg recibidos</th><th style="padding:6px 10px;text-align:right">Kg procesados</th>
    </tr></thead><tbody>${filas}</tbody></table>${alertasHtml}
    <div style="margin-top:16px;color:#999;font-size:11px">Generado automáticamente · cifras desde el ledger operacional.</div></div>`;
  const texto = [`Allegria Service - Informe Diario de Operacion`,
    `Total kg recibidos: ${n1(s.total_kg_recibido)}`, `Total kg procesados: ${n1(s.total_kg_procesado)}`, ``,
    ...cs.map((c) => `${c.cliente_nombre}: recibidos ${n1(c.kg_recibido)} / procesados ${n1(c.kg_procesado)}`),
    ...(alertas.length ? ["", "Situaciones que requieren atencion:", ...alertas.map((a) => `- ${alertaTxt(a)}`)] : [])].join("\n");
  return { asunto, html, texto };
}

module.exports = { emailDesdeSnapshot };
