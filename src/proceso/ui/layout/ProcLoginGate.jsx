/* eslint-disable */
// src/proceso/ui/layout/ProcLoginGate.jsx — Gate de identidad PROC (Opción C).
// Solo se monta si REACT_APP_PROC_AUTH === "true". Resuelve la sesión antes de renderizar el shell:
//   valida email+PIN → membership 0/1/N → token Supabase Auth (in-memory) → onReady(empresa_id).
// EL USUARIO NUNCA DIGITA TENANT/UUID. 1 membership = entra directo; N = selector amigable
// (código/nombre) solo con empresas autorizadas; el backend re-valida cada selección. 0 = acceso
// denegado con UX clara. Aislado a src/proceso/**: NO toca login global ni SUPA_KEY.
import React, { useState } from "react";
import { C } from "../estilos";
import { ProcButton, ProcModal, ProcField, ProcLoadingState, ProcErrorState, inputStyle } from "../components/base";
import { fetchProcToken } from "../../core/procAuth";

const MSG = {
  sin_membership: "No tenés acceso autorizado a Allegria Service. Pedí al administrador que te asigne una empresa.",
  identidad_no_provisionada: "Tu identidad todavía no está habilitada para Allegria Service.",
  credenciales: "Email o PIN incorrectos.",
  demasiados_intentos: "Demasiados intentos. Esperá unos minutos e intentá de nuevo.",
};
const msgDe = (e) => MSG[e && e.code] || (e && e.message) || "No se pudo iniciar sesión.";

export default function ProcLoginGate({ usuario, onReady, onBack }) {
  const [email, setEmail] = useState((usuario && usuario.email) || "");
  const [pin, setPin] = useState("");
  const [fase, setFase] = useState("form");      // form | auth | select | error
  const [error, setError] = useState(null);
  const [memberships, setMemberships] = useState([]);

  async function pedir(empresaId) {
    setFase("auth"); setError(null);
    try {
      const r = await fetchProcToken({ email: email.trim(), pin, empresaId });
      if (r.needsSelection) {
        setMemberships(r.memberships || []);
        setFase("select");
        return;
      }
      setPin("");                                 // no retener el PIN tras el éxito
      onReady(r.empresa_id);
    } catch (e) {
      setError(msgDe(e)); setFase("error");
    }
  }

  if (fase === "auth") return <ProcLoadingState texto="Autenticando…" />;

  if (fase === "error")
    return <ProcErrorState error={error} onRetry={() => { setFase("form"); setError(null); }} />;

  if (fase === "select")
    return (
      <ProcModal titulo="Elegí la empresa" onClose={onBack} ancho={420}
        acciones={<ProcButton kind="ghost" onClick={onBack}>Cancelar</ProcButton>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>
            Tenés acceso a varias empresas. Seleccioná con cuál trabajar:
          </div>
          {memberships.map((m) => (
            <ProcButton key={m.id} kind="primary" onClick={() => pedir(m.id)}>
              {m.codigo} — {m.nombre}
            </ProcButton>
          ))}
        </div>
      </ProcModal>
    );

  // fase "form"
  const puede = email.trim() && pin;
  return (
    <ProcModal titulo="Allegria Service — Iniciar sesión" onClose={onBack} ancho={400}
      acciones={<>
        <ProcButton kind="ghost" onClick={onBack}>Volver</ProcButton>
        <ProcButton kind="primary" disabled={!puede} onClick={() => pedir()}>Entrar</ProcButton>
      </>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <ProcField label="Email">
          <input style={inputStyle} type="email" value={email} autoComplete="username"
            onChange={(e) => setEmail(e.target.value)} />
        </ProcField>
        <ProcField label="PIN">
          <input style={inputStyle} type="password" value={pin} autoComplete="current-password"
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && puede) pedir(); }} />
        </ProcField>
      </div>
    </ProcModal>
  );
}
