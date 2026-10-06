/* eslint-disable */
// Restaurar un respaldo descargado (botón "📤 Restaurar" del administrador).
//
// Antes: sobrescribía TODAS las filas del archivo (pins y main incluidas) con
// merge-duplicates, sin validar ni mostrar nada. Ahora:
//   1. valida formato y versión del archivo (v1, v2 o auto-v4);
//   2. sanea el contenido AUNQUE el archivo sea antiguo y traiga credenciales:
//      `pins` nunca se restaura y en `main`/`usuarios` se conservan las
//      credenciales ACTUALES (se reinyectan en las rutas quitadas);
//   3. lee el estado actual y muestra, fila por fila, qué reemplazaría, qué
//      cambió después del respaldo y qué credenciales se conservan;
//   4. escribe solo las filas elegidas, cada una condicionada a la versión
//      leída (updated_at): si alguien la cambió entre medio, NO la pisa.
import React, { useState } from "react";
import { theme as C } from "../theme";
import { leerArchivoRespaldo, planRestaurar } from "./saneo";

const fmtFecha = (s) => { if (!s) return "—"; const d = new Date(s); return isNaN(d) ? String(s) : d.toLocaleString("es-CL"); };
const kb = (n) => `${Math.max(1, Math.round((n || 0) / 1024))} KB`;

// Lectura y escritura con control de versión. `fetchImpl` inyectable (tests).
export async function leerActuales({ supaUrl, supaKey, ids, fetchImpl = fetch }) {
  if (!ids.length) return [];
  const filtro = `id=in.(${ids.map((x) => `"${String(x).replace(/"/g, '\\"')}"`).map(encodeURIComponent).join(",")})`;
  const r = await fetchImpl(`${supaUrl}/rest/v1/calendario_data?select=id,value,updated_at&${filtro}`, {
    headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, "Cache-Control": "no-cache" },
  });
  if (!r.ok) throw new Error(`no se pudo leer el estado actual (HTTP ${r.status})`);
  const d = await r.json();
  if (!Array.isArray(d)) throw new Error("el servidor no devolvió una lista");
  return d;
}
export async function escribirPlan({ supaUrl, supaKey, plan, elegidas, fetchImpl = fetch }) {
  const h = { apikey: supaKey, Authorization: `Bearer ${supaKey}`, "Content-Type": "application/json", Prefer: "return=representation" };
  const out = [];
  for (const p of plan) {
    if (p.accion !== "restaurar" || !elegidas.includes(p.id)) continue;
    const ts = new Date().toISOString();
    let r;
    if (p.existeActual) {
      r = await fetchImpl(`${supaUrl}/rest/v1/calendario_data?id=eq.${encodeURIComponent(p.id)}&updated_at=eq.${encodeURIComponent(p.updatedAtActual)}`,
        { method: "PATCH", headers: h, body: JSON.stringify({ value: p.valorFinal, updated_at: ts }) });
    } else {
      // Fila que hoy no existe: se crea SIN merge-duplicates (si apareció entre medio, 409 = conflicto).
      r = await fetchImpl(`${supaUrl}/rest/v1/calendario_data`, { method: "POST", headers: h, body: JSON.stringify({ id: p.id, value: p.valorFinal, updated_at: ts }) });
    }
    if (r.status === 409) { out.push({ id: p.id, resultado: "conflicto" }); continue; }
    if (!r.ok) { out.push({ id: p.id, resultado: `error HTTP ${r.status}` }); continue; }
    const filas = await r.json().catch(() => []);
    out.push({ id: p.id, resultado: Array.isArray(filas) && filas.length ? "restaurada" : "conflicto" });
  }
  return out;
}

export default function RestaurarRespaldo({ supaUrl, supaKey, usuario, onCerrar }) {
  const [paso, setPaso] = useState("elegir");          // elegir · revisar · resultado
  const [error, setError] = useState("");
  const [archivo, setArchivo] = useState(null);
  const [info, setInfo] = useState(null);              // resultado de leerArchivoRespaldo
  const [plan, setPlan] = useState([]);
  const [elegidas, setElegidas] = useState([]);
  const [confirmacion, setConfirmacion] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [resultados, setResultados] = useState([]);

  async function alElegir(file) {
    setError(""); if (!file) return;
    setArchivo(file); setTrabajando(true);
    try {
      let obj;
      try { obj = JSON.parse(await file.text()); } catch (e) { throw new Error("el archivo no es un JSON válido"); }
      const r = leerArchivoRespaldo(obj);
      if (!r.ok) throw new Error(r.errores.join(" · "));
      const ids = Object.keys(r.respaldo);
      const actuales = await leerActuales({ supaUrl, supaKey, ids });
      const p = planRestaurar({ respaldo: r.respaldo, actuales, ids: [...ids, ...r.excluidas], fechaRespaldo: r.fecha });
      setInfo(r); setPlan(p);
      setElegidas(p.filter((x) => x.accion === "restaurar" && !x.modificadaDespuesDelRespaldo).map((x) => x.id));
      setPaso("revisar");
    } catch (e) { setError(String(e.message || e)); }
    setTrabajando(false);
  }

  async function aplicar() {
    setTrabajando(true); setError("");
    try {
      // Antes de escribir se vuelve a leer: el plan se rehace contra el estado de AHORA.
      const ids = Object.keys(info.respaldo);
      const actuales = await leerActuales({ supaUrl, supaKey, ids });
      const p2 = planRestaurar({ respaldo: info.respaldo, actuales, ids, fechaRespaldo: info.fecha });
      const cambiaron = p2.filter((x) => elegidas.includes(x.id) && x.updatedAtActual !== (plan.find((y) => y.id === x.id) || {}).updatedAtActual);
      if (cambiaron.length) { setPlan([...p2, ...plan.filter((x) => x.accion === "excluida")]); throw new Error(`cambiaron mientras revisabas: ${cambiaron.map((x) => x.id).join(", ")}. Revisa de nuevo.`); }
      const res = await escribirPlan({ supaUrl, supaKey, plan: p2, elegidas });
      if (window.auditLog) window.auditLog("restaurar_respaldo", { modulo: "sistema", seccion: "respaldo",
        descripcion: `${usuario || "?"} restauró ${res.filter((x) => x.resultado === "restaurada").length} filas desde ${archivo?.name || "archivo"} (${info.version}, ${info.fecha})` });
      setResultados(res); setPaso("resultado");
    } catch (e) { setError(String(e.message || e)); }
    setTrabajando(false);
  }

  const caja = { position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
  const panel = { background: C.card, color: C.text, borderRadius: 12, width: "min(920px,100%)", maxHeight: "90vh", overflow: "auto", padding: 22, fontSize: 13, boxShadow: C.shadow };
  const btn = (prim, dis) => ({ padding: "8px 16px", borderRadius: 8, border: `1px solid ${prim ? C.primary : C.border2}`, background: prim ? C.primary : C.card, color: prim ? C.primaryText : C.text, cursor: dis ? "not-allowed" : "pointer", opacity: dis ? 0.5 : 1, fontWeight: 600 });
  const restaurables = plan.filter((x) => x.accion === "restaurar");

  return (
    <div style={caja} role="dialog" aria-modal="true" aria-labelledby="rr-titulo">
      <div style={panel}>
        <h2 id="rr-titulo" style={{ margin: "0 0 6px", fontSize: 18 }}>Restaurar un respaldo</h2>
        <p style={{ margin: "0 0 12px", color: C.muted }}>Nada se escribe hasta que confirmes. Las credenciales (PIN) nunca se restauran: se conservan las actuales.</p>
        {error && <div role="alert" style={{ background: C.dangerBg, color: C.danger, padding: "8px 12px", borderRadius: 8, marginBottom: 12 }}>{error}</div>}

        {paso === "elegir" && (
          <div>
            <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }} htmlFor="rr-archivo">Archivo de respaldo (.json)</label>
            <input id="rr-archivo" type="file" accept=".json,application/json" disabled={trabajando} onChange={(e) => alElegir(e.target.files[0])} />
            {trabajando && <p>Validando y leyendo el estado actual…</p>}
          </div>
        )}

        {paso === "revisar" && info && (
          <div>
            <p style={{ margin: "0 0 10px" }}>
              <b>{archivo?.name}</b> · {info.version} · respaldo del <b>{fmtFecha(info.fecha)}</b>.
              {info.traiaCredenciales.length > 0 && <> El archivo traía credenciales en {info.traiaCredenciales.join(", ")}: se descartan.</>}
              {info.excluidas.length > 0 && <> No se restauran: {info.excluidas.join(", ")}.</>}
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ textAlign: "left", background: C.bg2 }}>
                <th style={{ padding: 6 }}></th><th style={{ padding: 6 }}>Fila</th><th style={{ padding: 6 }}>Qué pasa</th>
                <th style={{ padding: 6 }}>Hoy (última modificación)</th><th style={{ padding: 6 }}>Cambia</th><th style={{ padding: 6 }}>Credenciales</th>
              </tr></thead>
              <tbody>
                {plan.map((p) => (
                  <tr key={p.id} style={{ borderTop: `1px solid ${C.border}`, background: p.modificadaDespuesDelRespaldo ? C.warningBg : "transparent" }}>
                    <td style={{ padding: 6 }}>
                      {p.accion === "restaurar" && <input type="checkbox" aria-label={`Restaurar ${p.id}`} checked={elegidas.includes(p.id)}
                        onChange={(e) => setElegidas(e.target.checked ? [...elegidas, p.id] : elegidas.filter((x) => x !== p.id))} />}
                    </td>
                    <td style={{ padding: 6, fontFamily: "monospace" }}>{p.id}</td>
                    <td style={{ padding: 6 }}>
                      {p.accion === "excluida" ? "No se restaura (credenciales)" : p.accion === "sin_cambios" ? "Igual al respaldo: nada que hacer"
                        : p.existeActual ? `Reemplaza (${kb(p.bytesActual)} → ${kb(p.bytesRespaldo)})` : `Crea la fila (${kb(p.bytesRespaldo)})`}
                      {p.modificadaDespuesDelRespaldo && <div style={{ color: C.warning, fontWeight: 600 }}>Modificada después del respaldo: esos cambios se perderían</div>}
                    </td>
                    <td style={{ padding: 6 }}>{fmtFecha(p.updatedAtActual)}</td>
                    <td style={{ padding: 6 }}>{(p.clavesCambiadas || []).slice(0, 6).join(", ")}{(p.clavesCambiadas || []).length > 6 ? " …" : ""}</td>
                    <td style={{ padding: 6 }}>{(p.credencialesConservadas || []).length ? `${p.credencialesConservadas.length} actuales se conservan` : ""}{(p.credencialesSinValorActual || []).length ? ` · ${p.credencialesSinValorActual.length} sin valor actual (quedan vacías)` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ color: C.muted, margin: "10px 0" }}>Las filas modificadas después del respaldo quedan sin marcar: márcalas solo si quieres perder esos cambios.</p>
            <label htmlFor="rr-conf" style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>Para confirmar, escribe RESTAURAR</label>
            <input id="rr-conf" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} style={{ padding: 6, borderRadius: 6, border: `1px solid ${C.border2}`, marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" style={btn(true, !elegidas.length || confirmacion !== "RESTAURAR" || trabajando)}
                disabled={!elegidas.length || confirmacion !== "RESTAURAR" || trabajando} onClick={aplicar}>
                Restaurar {elegidas.length} de {restaurables.length} filas
              </button>
              <button type="button" style={btn(false)} onClick={onCerrar}>Cancelar</button>
            </div>
          </div>
        )}

        {paso === "resultado" && (
          <div>
            <ul>{resultados.map((r) => <li key={r.id}><span style={{ fontFamily: "monospace" }}>{r.id}</span>: {r.resultado === "conflicto" ? "conflicto — cambió en el servidor, NO se escribió" : r.resultado}</li>)}</ul>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" style={btn(true)} onClick={() => window.location.reload()}>Recargar la página</button>
              <button type="button" style={btn(false)} onClick={onCerrar}>Cerrar</button>
            </div>
          </div>
        )}
        {paso !== "resultado" && paso !== "revisar" && <div style={{ marginTop: 14 }}><button type="button" style={btn(false)} onClick={onCerrar}>Cancelar</button></div>}
      </div>
    </div>
  );
}
