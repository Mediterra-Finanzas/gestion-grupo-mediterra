// api/proc-reporting-daily-cron.js — Vercel Cron de PROC-REPORTING-DAILY-001 (server-side).
// Despierta el motor Reporting Daily: busca configs activas "due", genera la ejecución IDEMPOTENTE
// (proc_fn_reporte_generar_ejecucion), envía el email y marca enviado/error. Una config que falla
// NO frena las demás. NO contiene lógica de negocio (kg/alertas viven en proc_fn_*). Fail-closed.
// Acceso a Supabase con service_role (solo servidor, nunca frontend). Timezone/fecha las decide el
// backend por config; el cron solo dispara. Idempotencia backend evita duplicados si corre varias veces.
const { supaFetch } = require("./_auth.js");
const { cronAutorizado, configDue, fechaOpTz, resumenJob } = require("./_reportingScheduler.js");
const { enviarCorreo } = require("./send-email.js");

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

async function rpc(fn, args) {
  const r = await supaFetch(`rpc/${fn}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`${fn} → ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

module.exports = async function handler(req, res) {
  // Fail-closed: sin Bearer <CRON_SECRET> válido, 401. Nunca imprime el secreto.
  if (!cronAutorizado(req.headers && req.headers.authorization, process.env.CRON_SECRET)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const now = new Date();
  let configs;
  try {
    const r = await supaFetch(`proc_reporte_config?activo=eq.true&tipo_reporte=eq.diario_operacion&deleted_at=is.null&select=*`);
    if (!r.ok) throw new Error(`config ${r.status}`);
    configs = await r.json();
  } catch (e) {
    return res.status(500).json({ error: "no se pudieron leer las configuraciones" });
  }

  const resultados = [];
  for (const cfg of configs || []) {
    if (!configDue(cfg, now)) continue;
    const tz = cfg.timezone || "America/Santiago";
    const fechaOp = fechaOpTz(now, tz);
    const t0 = Date.now();
    try {
      const ejRaw = await rpc("proc_fn_reporte_generar_ejecucion", { p_empresa: cfg.empresa_id, p_config: cfg.id, p_fecha: fechaOp });
      const ej = Array.isArray(ejRaw) ? ejRaw[0] : ejRaw;
      if (!ej) { resultados.push({ estado: "error" }); continue; }
      if (ej.estado === "omitido") { resultados.push({ estado: "omitido" }); continue; }
      // Ya enviado/error de una corrida previa → no se reenvía automáticamente (retry manual). Idempotencia.
      if (ej.estado !== "pendiente") { resultados.push({ estado: "skip" }); continue; }
      const dest = (ej.destinatarios_snapshot || []).map((d) => d.email).filter(Boolean).join(",");
      if (!dest) {
        await rpc("proc_fn_reporte_marcar_error", { p_empresa: cfg.empresa_id, p_ejecucion: ej.id, p_error: "configuración sin destinatarios activos" });
        resultados.push({ estado: "error" }); continue;
      }
      const { asunto, html, texto } = emailDesdeSnapshot(ej);
      const envio = await enviarCorreo({ to: dest, subject: asunto, html, message: texto, modulo: "allegria" });
      if (envio && envio.success) {
        await rpc("proc_fn_reporte_marcar_enviado", { p_empresa: cfg.empresa_id, p_ejecucion: ej.id, p_proveedor: envio.method || "smtp", p_message_id: envio.messageId || "ok" });
        resultados.push({ estado: "enviado" });
      } else {
        await rpc("proc_fn_reporte_marcar_error", { p_empresa: cfg.empresa_id, p_ejecucion: ej.id, p_error: (envio && envio.error) || "proveedor de correo no disponible" });
        resultados.push({ estado: "error" });
      }
      // Log técnico sanitizado (sin secretos ni cuerpo del email).
      console.log(`[reporting-cron] config=${String(cfg.id).slice(0, 8)} fecha=${fechaOp} estado=${resultados[resultados.length - 1].estado} ms=${Date.now() - t0}`);
    } catch (err) {
      // Una config que falla NO frena las demás.
      console.error(`[reporting-cron] config=${String(cfg.id).slice(0, 8)} error=${err.message}`);
      resultados.push({ estado: "error" });
    }
  }
  return res.status(200).json({ ok: true, ...resumenJob(resultados) });
};
