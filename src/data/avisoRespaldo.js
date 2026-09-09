/* Aviso de respaldo. No inventa un canal: usa el mismo que ya opera en
 * produccion para el informe diario de Allegria Service (api/send-email.js,
 * SMTP Microsoft 365), invocado por el mismo patron de Vercel Cron.
 *
 * Reglas:
 *  - solo se avisa cuando el veredicto NO es OK;
 *  - un mismo veredicto no se repite mas de una vez por ventana, para que la
 *    alarma no se vuelva ruido y se termine ignorando;
 *  - un veredicto que vuelve a OK cierra el aviso con un mensaje de vuelta a
 *    la normalidad, porque si no nadie sabe que se arreglo. */

export const VENTANA_REPETICION_H = 12;

export function debeAvisar({ veredicto, ultimoAviso, ahora = new Date() }) {
  const sano = veredicto === "OK";
  if (!ultimoAviso) return sano ? { avisar: false, clase: null } : { avisar: true, clase: "alerta" };
  const mismo = ultimoAviso.veredicto === veredicto;
  const horas = (ahora - new Date(ultimoAviso.enviado_at)) / 3600000;
  if (sano) return ultimoAviso.clase === "alerta" ? { avisar: true, clase: "recuperado" } : { avisar: false, clase: null };
  if (mismo && horas < VENTANA_REPETICION_H) return { avisar: false, clase: null, motivo: "repetido_en_ventana" };
  return { avisar: true, clase: "alerta" };
}

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function componer({ salud, clase, entorno, ahora = new Date() }) {
  const alerta = clase === "alerta";
  const asunto = (alerta ? "Respaldo Osiris · ATENCION · " : "Respaldo Osiris · normalizado · ") +
    esc(salud.veredicto) + " · " + entorno;
  const filas = [
    ["Veredicto", salud.veredicto],
    ["Ultimo respaldo verificado", salud.ultimo_verificado || "ninguno"],
    ["Horas desde el ultimo verificado", salud.horas_desde_verificado == null ? "-" : String(salud.horas_desde_verificado)],
    ["Lotes FAILED en 24 h", String(salud.fallidos_24h)],
    ["Lotes colgados", String(salud.colgados)],
    ["Corridas del programador fallidas en 24 h", String(salud.corridas_fallidas_24h)],
    ["Ultima corrida del programador", salud.ultima_corrida || "ninguna"],
    ["Entorno", entorno],
    ["Momento del aviso (UTC)", ahora.toISOString()],
  ];
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:640px">
    <h2 style="margin:0 0 8px">${alerta ? "El respaldo necesita atencion" : "El respaldo volvio a la normalidad"}</h2>
    <p style="font-size:14px;margin:0 0 14px">${esc(salud.veredicto)}</p>
    <table style="border-collapse:collapse;width:100%;font-size:13px">${filas.map(([k, v]) =>
      `<tr><td style="padding:5px 10px;border-bottom:1px solid #eee;color:#666">${esc(k)}</td>` +
      `<td style="padding:5px 10px;border-bottom:1px solid #eee"><b>${esc(v)}</b></td></tr>`).join("")}</table>
    <div style="margin-top:14px;color:#999;font-size:11px">Aviso automatico. No contiene claves, rutas completas ni contenido de los respaldos.</div></div>`;
  const texto = [alerta ? "El respaldo necesita atencion" : "El respaldo volvio a la normalidad", "",
    ...filas.map(([k, v]) => `${k}: ${v}`)].join("\n");
  return { asunto, html, texto };
}

/* enviar: la MISMA funcion que ya usa el informe diario. No se reimplementa SMTP. */
export async function avisar({ salud, ultimoAviso, entorno, destinatarios, enviar, registrar, ahora = new Date() }) {
  const d = debeAvisar({ veredicto: salud.veredicto, ultimoAviso, ahora });
  if (!d.avisar) return { enviado: false, motivo: d.motivo || (salud.veredicto === "OK" ? "sano" : "sin_cambio") };
  if (!destinatarios || !destinatarios.length) return { enviado: false, motivo: "sin_destinatarios" };
  const msg = componer({ salud, clase: d.clase, entorno, ahora });
  await enviar({ to: destinatarios, subject: msg.asunto, message: msg.texto, html: msg.html, modulo: "osiris" });
  if (registrar) await registrar({ veredicto: salud.veredicto, clase: d.clase, enviado_at: ahora.toISOString() });
  return { enviado: true, clase: d.clase, asunto: msg.asunto, destinatarios: destinatarios.length };
}
