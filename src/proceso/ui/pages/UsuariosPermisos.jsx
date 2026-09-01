/* eslint-disable */
// src/proceso/ui/pages/UsuariosPermisos.jsx — Administración → Usuarios y permisos (AUTHZ).
// Asigna/revoca roles y muestra capabilities efectivas por usuario EN LA EMPRESA ACTUAL.
// La UI es SOLO reflejo: la autoridad es server-side (iam_fn_* verifican usuarios.administrar,
// impiden self-escalation y cross-tenant, y auditan). Requiere la capa AUTHZ desplegada.
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import { procRpc } from "../../core/procesoDB";
import {
  ProcPageHeader, ProcCard, ProcButton, ProcDataTable, ProcModal, ProcField, inputStyle,
  ProcStatusBadge, ProcLoadingState, ProcEmptyState, ProcErrorState,
} from "../components/base";
import { C, sp } from "../estilos";

export default function UsuariosPermisos() {
  const { empresa, hasCap, notificar } = useService();
  const [estado, setEstado] = useState("loading");   // loading | ok | error | denied
  const [error, setError] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [sel, setSel] = useState(null);               // usuario en modal
  const [hist, setHist] = useState(null);
  const [nuevoRol, setNuevoRol] = useState("");
  const [motivo, setMotivo] = useState("");

  const esDenegado = (msg) => /42501|no_autorizado|HTTP 40[13]/.test(msg || "");

  const cargar = useCallback(async () => {
    setEstado("loading"); setError(null);
    try {
      const [us, rs] = await Promise.all([
        procRpc("iam_fn_listar_usuarios_roles", {}),
        procRpc("iam_fn_catalogo_roles", {}),
      ]);
      setUsuarios(Array.isArray(us) ? us : []);
      setRoles(Array.isArray(rs) ? rs : []);
      setEstado("ok");
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (esDenegado(msg)) setEstado("denied");
      else { setError(msg); setEstado("error"); }
    }
  }, []);
  useEffect(() => { if (empresa) cargar(); }, [empresa, cargar]);

  const abrir = async (u) => {
    setSel(u); setNuevoRol(""); setMotivo(""); setHist(null);
    try { setHist(await procRpc("iam_fn_historial_roles", { p_usuario: u.usuario_id })); }
    catch { setHist([]); }
  };
  const asignar = async () => {
    if (!nuevoRol) return;
    try {
      await procRpc("iam_fn_asignar_rol", { p_usuario: sel.usuario_id, p_empresa: empresa, p_rol: nuevoRol, p_motivo: motivo || null });
      notificar(`Rol ${nuevoRol} asignado a ${sel.nombre}`);
      setSel(null); cargar();
    } catch (e) { notificar("No se pudo asignar (autorización/servidor): " + String((e && e.message) || e).slice(0, 90), "error"); }
  };
  const revocar = async (rol) => {
    try {
      await procRpc("iam_fn_revocar_rol", { p_usuario: sel.usuario_id, p_empresa: empresa, p_rol: rol, p_motivo: motivo || null });
      notificar(`Rol ${rol} revocado a ${sel.nombre}`);
      setSel(null); cargar();
    } catch (e) { notificar("No se pudo revocar (autorización/servidor): " + String((e && e.message) || e).slice(0, 90), "error"); }
  };

  const Header = <ProcPageHeader titulo="Usuarios y permisos"
    subtitulo="Roles y capabilities por usuario en esta empresa · la autoridad es server-side"
    acciones={estado === "ok" ? <ProcButton small kind="ghost" onClick={cargar}>Refrescar</ProcButton> : null} />;

  if (!hasCap("usuarios.administrar"))
    return <>{Header}<ProcEmptyState icono="🔒" titulo="Sin acceso" detalle="Requiere la capability usuarios.administrar." /></>;
  if (estado === "loading") return <>{Header}<ProcLoadingState /></>;
  if (estado === "denied")
    return <>{Header}<ProcEmptyState icono="🔒" titulo="Sin acceso" detalle="El servidor rechazó la operación (usuarios.administrar)." /></>;
  if (estado === "error") return <>{Header}<ProcErrorState error={error} onRetry={cargar} /></>;

  const columnas = [
    { titulo: "Nombre", render: (u) => <b>{u.nombre || "—"}</b> },
    { titulo: "Email", campo: "email" },
    { titulo: "Membership", render: (u) => <ProcStatusBadge texto={u.membership_activa ? "activa" : "inactiva"} tono={u.membership_activa ? "success" : "neutral"} /> },
    { titulo: "Roles", render: (u) => (u.roles && u.roles.length) ? u.roles.join(", ") : <span style={{ color: C.muted2 }}>sin rol</span> },
    { titulo: "Caps", align: "right", render: (u) => (u.capabilities ? u.capabilities.length : 0) },
    { titulo: "", align: "right", render: (u) => <ProcButton small kind="ghost" onClick={() => abrir(u)}>Gestionar</ProcButton> },
  ];

  return (
    <>
      {Header}
      <ProcCard style={{ padding: sp.md }}>
        <ProcDataTable columnas={columnas} filas={usuarios} rowKey="usuario_id"
          vacio={<ProcEmptyState titulo="Sin usuarios" detalle="No hay miembros en esta empresa." />} />
      </ProcCard>

      {sel && (
        <ProcModal titulo={`Permisos · ${sel.nombre}`} onClose={() => setSel(null)} ancho={560}>
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: sp.md }}>{sel.email}</div>

          <div style={{ marginBottom: sp.md }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Roles actuales</div>
            {(sel.roles && sel.roles.length) ? sel.roles.map((r) => (
              <span key={r} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 999, padding: "3px 10px", marginRight: 6, marginBottom: 6, fontSize: 12 }}>
                {r} <span onClick={() => revocar(r)} title="Revocar rol" style={{ cursor: "pointer", color: C.danger, fontWeight: 800 }}>×</span>
              </span>
            )) : <span style={{ color: C.muted2, fontSize: 12.5 }}>sin roles</span>}
          </div>

          <ProcField label="Asignar rol">
            <select value={nuevoRol} onChange={(e) => setNuevoRol(e.target.value)} style={inputStyle}>
              <option value="">— seleccionar —</option>
              {roles.map((r) => <option key={r.codigo} value={r.codigo}>{r.codigo} · {r.nombre}</option>)}
            </select>
          </ProcField>
          <ProcField label="Motivo (opcional)">
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} style={inputStyle} placeholder="ej. cambio de función" />
          </ProcField>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: sp.sm, marginTop: sp.sm }}>
            <ProcButton kind="ghost" onClick={() => setSel(null)}>Cerrar</ProcButton>
            <ProcButton kind="primary" disabled={!nuevoRol} onClick={asignar}>Asignar rol</ProcButton>
          </div>

          <div style={{ marginTop: sp.lg }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Historial</div>
            {hist == null ? <div style={{ fontSize: 12, color: C.muted }}>Cargando…</div>
              : hist.length === 0 ? <div style={{ fontSize: 12, color: C.muted2 }}>Sin cambios registrados.</div>
              : <div style={{ maxHeight: 180, overflowY: "auto", fontSize: 12 }}>
                  {hist.map((h, i) => (
                    <div key={i} style={{ padding: "5px 0", borderBottom: `1px solid ${C.border}`, color: C.text }}>
                      <b>{h.accion}</b> {h.rol}{h.activo_despues === "false" ? " (revocado)" : ""} · <span style={{ color: C.muted }}>{h.actor_nombre || "—"}</span>{h.motivo ? ` · ${h.motivo}` : ""}
                    </div>
                  ))}
                </div>}
          </div>
        </ProcModal>
      )}
    </>
  );
}
