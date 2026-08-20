// api/_reportingScheduler.js — helpers PUROS del scheduler de PROC-REPORTING-DAILY-001.
// Sin lógica de negocio (el motor vive en proc_fn_*); solo autenticación del cron, due-check por
// timezone/hora, y agregación del resumen. Determinístico (se inyecta el instante) → testeable.
// CommonJS: lo consume el endpoint Vercel (require) y el test .mjs (import default).

// Autenticación del cron: fail-closed. Sin CRON_SECRET, nadie pasa; header debe ser "Bearer <secret>".
function cronAutorizado(authHeader, secret) {
  if (!secret) return false;
  return typeof authHeader === "string" && authHeader === `Bearer ${secret}`;
}

// Hora "HH:MM" (h23) de un instante en la timezone dada. Intl (IANA), no reloj del navegador.
function horaEnTz(instant, tz) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(instant).reduce((a, x) => (a[x.type] = x.value, a), {});
  return `${p.hour}:${p.minute}`;
}

// Fecha operacional (YYYY-MM-DD) del instante en la timezone dada (autoridad del período).
function fechaOpTz(instant, tz) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

// ¿La config debe ejecutarse ahora? Activa + ya pasó su hora_envio en su timezone. La idempotencia
// backend (índice único empresa+config+fecha) evita el duplicado si el cron corre varias veces tras la hora.
function configDue(config, nowInstant) {
  if (!config || !config.activo) return false;
  const tz = config.timezone || "America/Santiago";
  const hEnvio = String(config.hora_envio || "").slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(hEnvio)) return false;
  return horaEnTz(nowInstant, tz) >= hEnvio;
}

// Resumen técnico del job (sanitizado, sin datos sensibles).
function resumenJob(resultados) {
  const r = { procesadas: 0, enviadas: 0, errores: 0, omitidas: 0 };
  for (const x of resultados || []) {
    r.procesadas++;
    if (x && x.estado === "enviado") r.enviadas++;
    else if (x && x.estado === "error") r.errores++;
    else if (x && x.estado === "omitido") r.omitidas++;
  }
  return r;
}

module.exports = { cronAutorizado, horaEnTz, fechaOpTz, configDue, resumenJob };
