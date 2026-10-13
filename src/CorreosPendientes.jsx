/* eslint-disable */
// CorreosPendientes — correos que NO salieron, a la vista y con reintento (oct-2026).
// Antes un envío fallido solo dejaba una línea en la consola (o se iba por EmailJS sin
// autorización). Ahora queda aquí hasta que sale o la persona lo descarta. Reintentar no
// duplica: cada envío conserva su identidad (ver emailHelper.js y api/_correo.js).
// Si la sesión de correo venció o se revocó (12 h, PIN cambiado, código provisorio,
// persona desactivada), se renueva con el PIN sin salir de la app.
import React, { useEffect, useState } from "react";
import { suscribirCorreos, reintentarCorreo, reintentarTodos, descartarCorreo, abrirSesionCorreo, emailSesionCorreo, REINTENTABLE } from "./emailHelper";

const TEXTO = {
  red: "Sin conexión con el servidor de correo. Si llegó a salir, el reintento no lo repite.",
  servidor: "El servidor de correo falló y este envío no salió.",
  no_configurado: "El correo no está configurado en el servidor.",
  sin_sesion: "Tu sesión de correo venció o se cerró (12 h, cambio de PIN o código provisorio).",
  limite: "Demasiados envíos seguidos. Espera unos minutos y reintenta.",
  rechazado: "El servidor rechazó este envío; reintentarlo no cambia el resultado.",
};

export default function CorreosPendientes({ email: emailProp }) {
  const [lista, setLista] = useState([]);
  const [abierto, setAbierto] = useState(true);
  const [pin, setPin] = useState("");
  const [msgPin, setMsgPin] = useState("");
  useEffect(() => suscribirCorreos(setLista), []);
  if (!lista.length) return null;
  const email = emailProp || emailSesionCorreo();
  const sinSesion = !!email && lista.some((e) => e.estado === "sin_sesion");
  const enCurso = lista.some((e) => e.enCurso);

  async function renovar(ev) {
    ev.preventDefault();
    setMsgPin("");
    const r = await abrirSesionCorreo(email, pin);
    setPin("");
    if (!r.ok) { setMsgPin(r.status === 401 ? "PIN incorrecto, o tu acceso tiene un código provisorio pendiente." : r.status === 429 ? "Demasiados intentos. Espera 15 minutos." : "No se pudo abrir la sesión de correo."); return; }
    await reintentarTodos();
  }

  const caja = { position: "fixed", left: 16, bottom: 16, zIndex: 1200, maxWidth: 420, width: "calc(100% - 32px)", background: "#fff",
    border: "1px solid #f59e0b", borderRadius: 10, boxShadow: "0 6px 24px rgba(16,24,40,.18)", fontSize: 12, color: "#1f2937" };
  const btn = { border: "1px solid #d1d5db", background: "#fff", borderRadius: 6, padding: "3px 9px", fontSize: 11, cursor: "pointer" };
  return (
    <div role="status" aria-live="polite" data-testid="correos-pendientes" style={caja}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#fffbeb", borderRadius: "10px 10px 0 0" }}>
        <strong style={{ flex: 1 }}>⚠ {lista.length} correo{lista.length > 1 ? "s" : ""} sin enviar</strong>
        {lista.some((e) => REINTENTABLE[e.estado] && e.estado !== "sin_sesion") &&
          <button style={btn} disabled={enCurso} onClick={() => reintentarTodos()} data-testid="correos-reintentar-todos">Reintentar todos</button>}
        <button style={btn} aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>{abierto ? "Ocultar" : "Ver"}</button>
      </div>
      {abierto && <div style={{ padding: "6px 12px 10px", maxHeight: 260, overflowY: "auto" }}>
        {lista.map((e) => (
          <div key={e.id} data-testid="correo-pendiente" style={{ borderTop: "1px solid #f3f4f6", padding: "6px 0" }}>
            <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.descripcion}>{e.descripcion}</div>
            <div style={{ color: "#6b7280", margin: "2px 0 4px" }}>{e.enCurso ? "Enviando…" : TEXTO[e.estado] || e.error}</div>
            <div style={{ display: "flex", gap: 6 }}>
              {REINTENTABLE[e.estado] && e.estado !== "sin_sesion" &&
                <button style={btn} disabled={e.enCurso} onClick={() => reintentarCorreo(e.id)}>Reintentar</button>}
              <button style={btn} disabled={e.enCurso} onClick={() => descartarCorreo(e.id)}>Descartar</button>
            </div>
          </div>
        ))}
        {sinSesion && <form onSubmit={renovar} style={{ borderTop: "1px solid #f3f4f6", paddingTop: 8, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <label htmlFor="correo-pin" style={{ flex: "1 0 100%" }}>Ingresa tu PIN para renovar la sesión de correo y reintentar:</label>
          <input id="correo-pin" type="password" inputMode="numeric" autoComplete="current-password" value={pin}
            onChange={(ev) => setPin(ev.target.value.replace(/\D/g, "").slice(0, 6))} style={{ width: 110, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6 }}/>
          <button type="submit" style={btn} disabled={pin.length !== 6 || enCurso} data-testid="correos-renovar">Renovar y reintentar</button>
          {msgPin && <span role="alert" style={{ color: "#b91c1c", flex: "1 0 100%" }}>{msgPin}</span>}
        </form>}
      </div>}
    </div>
  );
}
