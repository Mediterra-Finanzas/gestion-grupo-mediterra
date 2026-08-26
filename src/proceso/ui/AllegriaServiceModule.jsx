/* eslint-disable */
// src/proceso/ui/AllegriaServiceModule.jsx
// Entry del módulo operacional de Allegria Service (capability proc_*).
// UI DELGADA sobre el contrato F1–F6 (consume src/proceso/core). La seguridad
// efectiva es RLS/RPC; estas props solo REFLEJAN permisos. Bounded context
// separado: cero dependencia de Frisku/Foods/exp_*.
import React, { useState, useEffect } from "react";
import { ServiceProvider } from "./hooks/useServiceContext";
import ProcShell from "./layout/ProcShell";
import ProcLoginGate from "./layout/ProcLoginGate";
import { procAuthActivo, setOnProcAuthRequired } from "../core/procAuth";

export default function AllegriaServiceModule({
  usuarioActual, esAdmin, esSoloConsulta, tabPermisos, empresaId = null, onBack, onLogout,
}) {
  const admin = typeof esAdmin === "function" ? esAdmin(usuarioActual?.nombre) : !!esAdmin;
  // DEV/UAT (F7.8.1-D): prefill del tenant desde env local para la revisión visual.
  // En prod la env var no existe → empresaId sigue null → tenant manual (F7.1).
  const empInicial = empresaId || process.env.REACT_APP_PROC_DEV_EMPRESA || null;

  // Identity Bridge (Opción C): con el flag ON, resolver la sesión ANTES del shell. El usuario no
  // digita tenant: 1 membership entra directo, N muestra selector. Flag OFF = baseline (rollback).
  const authOn = procAuthActivo();
  const [empresaResuelta, setEmpresaResuelta] = useState(null);
  // F-2: si una request PROC detecta token ausente/expirado (fail-closed en procesoDB), volver al
  // gate para re-auth controlado. setEmpresaResuelta(null) es idempotente → sin loop (el gate no
  // hace requests proc_*). Se desregistra al desmontar.
  useEffect(() => {
    if (!authOn) return undefined;
    setOnProcAuthRequired(() => setEmpresaResuelta(null));
    return () => setOnProcAuthRequired(null);
  }, [authOn]);
  if (authOn && !empresaResuelta) {
    return <ProcLoginGate usuario={usuarioActual} onReady={setEmpresaResuelta} onBack={onBack} />;
  }
  const empEfectiva = authOn ? empresaResuelta : empInicial;

  return (
    <ServiceProvider empresaId={empEfectiva} tabPermisos={tabPermisos || {}} esAdmin={admin} usuario={usuarioActual}>
      <ProcShell onBack={onBack} onLogout={onLogout} usuario={usuarioActual} />
    </ServiceProvider>
  );
}
