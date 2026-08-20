/* eslint-disable */
// src/proceso/ui/pages/ClienteFicha.jsx — Ficha Cliente Service completa.
// Identidad (Core vía proc_vinculo) + Relación Service (proc_cliente_ficha) +
// Contratos versionados (proc_cliente_contrato) + estado contractual (backend
// autoridad, T8) + trazabilidad comercial. Cliente = quien contrata; el contrato
// pertenece al CLIENTE, nunca al productor. Documentos en bucket privado (signed URL).
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import {
  cargarVinculoUno, cargarFichaCliente, crearFichaCliente, actualizarFichaCliente,
  cargarContratosCliente, crearContrato, actualizarContrato, cargarTiposDocContractual,
  estadoContractualCliente, cargarClienteProductores, cargarVinculosPorRol,
  cargarRecepcionesCliente, cargarOrdenesCliente, cargarServiciosCliente, cargarBasesCliente,
} from "../../core/procesoF7DB";
import { traducirError, alertaContractual, tonoNivelContractual, transicionesContrato, badgeDe, fechaCalendarioTz } from "../../core/procesoF7Domain";
import { subirDocumentoProc, urlFirmadaProc, slugPath } from "../../core/procStorage";
import {
  ProcPageHeader, ProcCard, ProcButton, ProcField, inputStyle, ProcStatusBadge,
  ProcDataTable, ProcModal, ProcAuditInfo, ProcLoadingState, ProcErrorState, ProcEmptyState,
} from "../components/base";
import { C, sp } from "../estilos";
import { normalizarNombre, formatFecha, formatFechaHora } from "../format";

// OBS-TZ-CLIENTE-01: fecha calendario en tz operacional (no UTC del navegador) para fecha_firma.
const hoyISO = () => fechaCalendarioTz();
function Dato({ l, v }) { return <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{l}</div><div style={{ fontSize: 14, color: C.text }}>{v ?? "—"}</div></div>; }
function Seccion({ titulo, children, extra }) {
  return <ProcCard style={{ padding: sp.lg, marginBottom: sp.md }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: sp.md, gap: sp.sm, flexWrap: "wrap" }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{titulo}</div>{extra}
    </div>{children}</ProcCard>;
}

export default function ClienteFicha() {
  const { empresa, vista, ir, notificar, puedeEditar } = useService();
  const cli = vista?.params?.id;
  const editable = puedeEditar ? (puedeEditar("clientes") || puedeEditar("config")) : true;

  const [vinc, setVinc] = useState(null);
  const [ficha, setFicha] = useState(null);
  const [contratos, setContratos] = useState([]);
  const [tiposDoc, setTiposDoc] = useState([]);
  const [ec, setEc] = useState(null);
  const [traz, setTraz] = useState({ productores: [], recepciones: [], ordenes: [], servicios: [], bases: [] });
  const [estado, setEstado] = useState("loading");
  const [error, setError] = useState(null);
  const [modalFicha, setModalFicha] = useState(false);
  const [modalContrato, setModalContrato] = useState(false);

  const cargar = useCallback(async () => {
    if (!empresa || !cli) return;
    setEstado("loading"); setError(null);
    try {
      const [v, f, cs, td, pros, prodVinc, recs, ords, svs, bss] = await Promise.all([
        cargarVinculoUno(empresa, cli), cargarFichaCliente(empresa, cli), cargarContratosCliente(empresa, cli),
        cargarTiposDocContractual(empresa), cargarClienteProductores(empresa, cli), cargarVinculosPorRol(empresa, "productor"),
        cargarRecepcionesCliente(empresa, cli), cargarOrdenesCliente(empresa, cli),
        cargarServiciosCliente(empresa, cli), cargarBasesCliente(empresa, cli),
      ]);
      const nombrePorId = Object.fromEntries((prodVinc || []).map((p) => [p.id, p.nombre_provisional]));
      const prodConNombre = (pros || []).map((p) => ({ ...p, productor_nombre: nombrePorId[p.productor_vinculo_id] || "" }));
      setVinc((v && v[0]) || null); setFicha((f && f[0]) || null); setContratos(cs || []); setTiposDoc(td || []);
      setTraz({ productores: prodConNombre, recepciones: recs || [], ordenes: ords || [], servicios: svs || [], bases: bss || [] });
      estadoContractualCliente({ empresaId: empresa, clienteId: cli }).then((r) => setEc(Array.isArray(r) ? r[0] : r)).catch(() => {});
      setEstado("ok");
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa, cli]);
  useEffect(() => { cargar(); }, [cargar]);

  if (estado === "loading") return <ProcLoadingState />;
  if (estado === "error") return <ProcErrorState error={error} onRetry={cargar} />;
  if (!vinc) return <ProcEmptyState titulo="Cliente no encontrado" />;

  const alerta = alertaContractual(ec);
  const nombre = normalizarNombre(vinc.nombre_provisional) || "—";

  const transicionar = async (c, nuevo) => {
    try {
      const patch = { estado: nuevo };
      if (nuevo === "vigente") { patch.fecha_firma = c.fecha_firma || hoyISO(); }
      await actualizarContrato(c.id, empresa, patch);
      notificar(`Contrato ${c.codigo}: ${badgeDe(nuevo).label}`);
      cargar();
    } catch (e) { notificar(traducirError(e), "error"); }
  };

  const verDocumento = async (path) => {
    const url = await urlFirmadaProc(path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else notificar("No se pudo generar el enlace del documento (verificá el bucket privado proc-docs).", "error");
  };

  return (
    <div>
      <ProcPageHeader titulo={`Ficha · ${nombre}`} subtitulo="Cliente del servicio (dimensión comercial) · el contrato pertenece al cliente, no al productor"
        acciones={<ProcButton kind="ghost" onClick={() => ir("clientes")}>← Clientes</ProcButton>} />

      {/* Alerta contractual principal: icono + badge + texto + acción (no solo color) */}
      {alerta.mostrar && (
        <ProcCard style={{ padding: sp.md, marginBottom: sp.md, borderLeft: `4px solid ${(C[alerta.tono] || C.warning)}` }}>
          <div style={{ display: "flex", gap: sp.md, alignItems: "flex-start", flexWrap: "wrap" }}>
            <span style={{ fontSize: 22 }}>{alerta.tono === "danger" ? "⛔" : alerta.tono === "warning" ? "⚠️" : "ℹ️"}</span>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: "flex", gap: sp.sm, alignItems: "center", flexWrap: "wrap" }}>
                <ProcStatusBadge texto={alerta.titulo} tono={alerta.tono} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{ec?.estado_display}</span>
              </div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>{alerta.texto}</div>
            </div>
            {editable && <ProcButton small onClick={() => setModalContrato(true)}>Agregar contrato</ProcButton>}
          </div>
        </ProcCard>
      )}

      {/* IDENTIDAD (Core) */}
      <Seccion titulo="Identidad" extra={<ProcStatusBadge estado={vinc.estado} />}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: sp.md }}>
          <Dato l="Razón social" v={nombre} />
          <Dato l="RUT / identificador" v={vinc.rut || "—"} />
          <Dato l="Nombre comercial" v={vinc.codigo_externo ? normalizarNombre(vinc.codigo_externo) : "—"} />
          <Dato l="Estado" v={vinc.estado === "activo" ? "Activo" : "Inactivo"} />
        </div>
      </Seccion>

      {/* RELACIÓN SERVICE (ficha) */}
      <Seccion titulo="Relación Service"
        extra={editable && <ProcButton kind="ghost" small onClick={() => setModalFicha(true)}>{ficha ? "Editar ficha" : "Crear ficha"}</ProcButton>}>
        {ficha ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: sp.md }}>
            <Dato l="Contacto principal" v={normalizarNombre(ficha.contacto_principal)} />
            <Dato l="Email" v={ficha.email} /><Dato l="Teléfono" v={ficha.telefono} />
            <Dato l="Responsable comercial" v={normalizarNombre(ficha.responsable_comercial)} />
            <Dato l="Política contractual" v={ficha.politica_contrato} />
            <Dato l="Estado ficha" v={ficha.estado} />
            <Dato l="Condiciones recepción/proceso" v={ficha.condiciones_recepcion_proceso} />
          </div>
        ) : <ProcEmptyState icono="📄" titulo="Sin ficha Service" detalle="Este cliente aún no tiene ficha de relación. Creala para definir contacto, responsable y política contractual." />}
      </Seccion>

      {/* CONTRATOS (versionados, historial completo) */}
      <Seccion titulo={`Contratos (${contratos.length})`}
        extra={editable && <ProcButton small onClick={() => setModalContrato(true)}>Agregar contrato</ProcButton>}>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: sp.sm }}>Cargar un documento no equivale a firmar: el estado avanza a “Vigente” solo con la acción de firma. El historial conserva todas las versiones.</div>
        <ProcDataTable
          columnas={[
            { titulo: "Código", render: (c) => <b>{c.codigo}</b> },
            { titulo: "Versión", align: "right", render: (c) => `v${c.version}` },
            { titulo: "Tipo doc", render: (c) => { const t = tiposDoc.find((x) => x.id === c.tipo_documento_id); return t ? normalizarNombre(t.nombre) : "—"; } },
            { titulo: "Estado", render: (c) => <ProcStatusBadge estado={c.estado} /> },
            { titulo: "Inicio", render: (c) => c.fecha_inicio ? formatFecha(c.fecha_inicio) : "—" },
            { titulo: "Término", render: (c) => c.fecha_termino ? formatFecha(c.fecha_termino) : "—" },
            { titulo: "Firma", render: (c) => c.fecha_firma ? formatFecha(c.fecha_firma) : (c.requiere_firma ? "pendiente" : "no requiere") },
            { titulo: "Documento", render: (c) => c.documento_path ? <ProcButton kind="ghost" small onClick={() => verDocumento(c.documento_path)}>Ver</ProcButton> : "—" },
            { titulo: "Acciones", align: "right", render: (c) => editable ? (
              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
                {transicionesContrato(c.estado).map((n) => (
                  <ProcButton key={n} kind="ghost" small onClick={() => transicionar(c, n)}>{n === "vigente" ? "Firmar → vigente" : badgeDe(n).label}</ProcButton>
                ))}
              </div>
            ) : null },
          ]}
          filas={contratos} rowKey="id"
          vacio={<ProcEmptyState icono="📑" titulo="Sin contratos" detalle="Agregá el primer contrato del cliente. Cargar el documento no lo marca vigente." />} />
      </Seccion>

      {/* TRAZABILIDAD COMERCIAL */}
      <Seccion titulo="Trazabilidad comercial">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: sp.sm }}>
          <TrazCard l="Productores relacionados" n={traz.productores.length} />
          <TrazCard l="Recepciones" n={traz.recepciones.length} onClick={() => ir("recepciones")} />
          <TrazCard l="Órdenes" n={traz.ordenes.length} onClick={() => ir("ordenes")} />
          <TrazCard l="Servicios facturables" n={traz.servicios.length} onClick={() => ir("servicios")} />
          <TrazCard l="Bases de cobro" n={traz.bases.length} onClick={() => ir("bases")} />
        </div>
        {traz.productores.length > 0 && (
          <div style={{ marginTop: sp.md, fontSize: 12.5, color: C.muted }}>
            <b>Productores:</b> {traz.productores.map((p) => normalizarNombre(p.productor_nombre || p.nombre_provisional || "")).filter(Boolean).join(" · ") || "—"}
            <div style={{ marginTop: 4, fontSize: 11.5 }}>El productor es el origen agrícola de la fruta; es una relación distinta del contrato comercial.</div>
          </div>
        )}
      </Seccion>

      <Seccion titulo="Auditoría"><ProcAuditInfo registro={ficha || vinc} /></Seccion>

      {modalFicha && <ModalFicha empresa={empresa} cli={cli} ficha={ficha} onClose={() => setModalFicha(false)}
        onSaved={() => { setModalFicha(false); cargar(); }} notificar={notificar} />}
      {modalContrato && <ModalContrato empresa={empresa} cli={cli} vinc={vinc} tiposDoc={tiposDoc} contratos={contratos}
        onClose={() => setModalContrato(false)} onSaved={() => { setModalContrato(false); cargar(); }} notificar={notificar} />}
    </div>
  );
}

function TrazCard({ l, n, onClick }) {
  return (
    <div onClick={onClick} style={{ padding: "10px 12px", background: C.cardAlt, borderRadius: 8, cursor: onClick ? "pointer" : "default" }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{n}</div>
      <div style={{ fontSize: 11.5, color: C.muted }}>{l}{onClick && <span style={{ color: C.primary }}> →</span>}</div>
    </div>
  );
}

// ── Modal: crear/editar Ficha Service ───────────────────────────────────────
function ModalFicha({ empresa, cli, ficha, onClose, onSaved, notificar }) {
  const [f, setF] = useState({
    contacto_principal: ficha?.contacto_principal || "", email: ficha?.email || "", telefono: ficha?.telefono || "",
    direccion: ficha?.direccion || "", responsable_comercial: ficha?.responsable_comercial || "",
    condiciones_recepcion_proceso: ficha?.condiciones_recepcion_proceso || "",
    politica_contrato: ficha?.politica_contrato || "no_requerido", estado: ficha?.estado || "activo",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const guardar = async () => {
    setSaving(true);
    try {
      const payload = { ...f, contacto_principal: normalizarNombre(f.contacto_principal) || null, responsable_comercial: normalizarNombre(f.responsable_comercial) || null };
      if (ficha) await actualizarFichaCliente(ficha.id, empresa, payload);
      else await crearFichaCliente({ empresa_id: empresa, cliente_vinculo_id: cli, ...payload });
      notificar("Ficha guardada"); onSaved();
    } catch (e) { notificar(traducirError(e), "error"); setSaving(false); }
  };
  return (
    <ProcModal titulo={ficha ? "Editar ficha Service" : "Crear ficha Service"} onClose={onClose}
      acciones={<><ProcButton kind="ghost" onClick={onClose}>Cancelar</ProcButton><ProcButton onClick={guardar} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</ProcButton></>}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: sp.md }}>
        <ProcField label="Contacto principal"><input style={inputStyle} value={f.contacto_principal} onChange={(e) => set("contacto_principal", e.target.value)} /></ProcField>
        <ProcField label="Responsable comercial"><input style={inputStyle} value={f.responsable_comercial} onChange={(e) => set("responsable_comercial", e.target.value)} /></ProcField>
        <ProcField label="Email"><input style={inputStyle} value={f.email} onChange={(e) => set("email", e.target.value)} /></ProcField>
        <ProcField label="Teléfono"><input style={inputStyle} value={f.telefono} onChange={(e) => set("telefono", e.target.value)} /></ProcField>
        <ProcField label="Política contractual" hint="Autoridad del gate de avance (backend)">
          <select style={inputStyle} value={f.politica_contrato} onChange={(e) => set("politica_contrato", e.target.value)}>
            {["no_requerido", "informativo", "advertencia", "bloqueante"].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </ProcField>
        <ProcField label="Estado ficha">
          <select style={inputStyle} value={f.estado} onChange={(e) => set("estado", e.target.value)}>
            <option value="activo">Activo</option><option value="inactivo">Inactivo</option>
          </select>
        </ProcField>
        <div style={{ gridColumn: "1 / -1" }}><ProcField label="Condiciones de recepción / proceso"><input style={inputStyle} value={f.condiciones_recepcion_proceso} onChange={(e) => set("condiciones_recepcion_proceso", e.target.value)} /></ProcField></div>
      </div>
    </ProcModal>
  );
}

// ── Modal: agregar contrato (cargar documento ≠ firmar) ─────────────────────
function ModalContrato({ empresa, cli, vinc, tiposDoc, contratos, onClose, onSaved, notificar }) {
  const [f, setF] = useState({
    codigo: "", tipo_documento_id: "", tipo_vigencia: "por_temporada", temporada_codigo: "",
    fecha_inicio: "", fecha_termino: "", estado: "borrador", requiere_firma: true, observaciones: "",
    reemplaza_contrato_id: "",
  });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const reemplazables = (contratos || []).filter((c) => c.estado === "vigente" || c.estado === "vencido");

  const guardar = async () => {
    if (!f.codigo.trim()) return notificar("Indicá el número/referencia del contrato", "error");
    setSaving(true);
    try {
      const prev = f.reemplaza_contrato_id ? (contratos || []).find((c) => c.id === f.reemplaza_contrato_id) : null;
      const version = prev ? (Number(prev.version) || 1) + 1 : 1;
      let documento_path = null;
      if (file) {
        const path = `contratos/${slugPath(empresa)}/${slugPath(vinc.nombre_provisional || cli)}/${slugPath(f.codigo)}-v${version}-${slugPath(file.name)}`;
        const up = await subirDocumentoProc(file, path);
        if (!up.ok) { notificar(`No se pudo subir el documento: ${up.error}. El contrato NO se guardó.`, "error"); setSaving(false); return; }
        documento_path = up.path;
      }
      const fila = {
        empresa_id: empresa, cliente_vinculo_id: cli, codigo: f.codigo.trim(),
        tipo_documento_id: f.tipo_documento_id || null, tipo_vigencia: f.tipo_vigencia,
        temporada_codigo: f.temporada_codigo || null, fecha_inicio: f.fecha_inicio || null, fecha_termino: f.fecha_termino || null,
        estado: f.estado, requiere_firma: f.requiere_firma, observaciones: f.observaciones || null,
        version, reemplaza_contrato_id: prev ? prev.id : null, documento_path,
      };
      await crearContrato(fila);
      if (prev) { try { await actualizarContrato(prev.id, empresa, { estado: "reemplazado" }); } catch (e) { /* el nuevo ya quedó; el reemplazo de estado se puede reintentar */ } }
      notificar(`Contrato ${f.codigo} agregado (${badgeDe(f.estado).label})`);
      onSaved();
    } catch (e) { notificar(traducirError(e), "error"); setSaving(false); }
  };

  return (
    <ProcModal titulo="Agregar contrato" ancho={640} onClose={onClose}
      acciones={<><ProcButton kind="ghost" onClick={onClose}>Cancelar</ProcButton><ProcButton onClick={guardar} disabled={saving}>{saving ? "Guardando…" : "Guardar contrato"}</ProcButton></>}>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: sp.md }}>Cargar el documento no marca el contrato como vigente. El estado inicial es Borrador o Pendiente de firma; la vigencia se activa con la firma.</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: sp.md }}>
        <ProcField label="Número / referencia" requerido><input style={inputStyle} value={f.codigo} onChange={(e) => set("codigo", e.target.value)} /></ProcField>
        <ProcField label="Tipo de documento">
          <select style={inputStyle} value={f.tipo_documento_id} onChange={(e) => set("tipo_documento_id", e.target.value)}>
            <option value="">—</option>{tiposDoc.map((t) => <option key={t.id} value={t.id}>{normalizarNombre(t.nombre)}</option>)}
          </select>
        </ProcField>
        <ProcField label="Tipo de vigencia">
          <select style={inputStyle} value={f.tipo_vigencia} onChange={(e) => set("tipo_vigencia", e.target.value)}>
            {["por_temporada", "multitemporada", "indefinido"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </ProcField>
        <ProcField label="Temporada"><input style={inputStyle} value={f.temporada_codigo} onChange={(e) => set("temporada_codigo", e.target.value)} placeholder="2025/2026" /></ProcField>
        <ProcField label="Fecha inicio"><input style={inputStyle} type="date" value={f.fecha_inicio} onChange={(e) => set("fecha_inicio", e.target.value)} /></ProcField>
        <ProcField label="Fecha término"><input style={inputStyle} type="date" value={f.fecha_termino} onChange={(e) => set("fecha_termino", e.target.value)} /></ProcField>
        <ProcField label="Estado inicial">
          <select style={inputStyle} value={f.estado} onChange={(e) => set("estado", e.target.value)}>
            <option value="borrador">Borrador</option><option value="pendiente_firma">Pendiente de firma</option>
          </select>
        </ProcField>
        <ProcField label="Requiere firma">
          <select style={inputStyle} value={f.requiere_firma ? "si" : "no"} onChange={(e) => set("requiere_firma", e.target.value === "si")}>
            <option value="si">Sí</option><option value="no">No</option>
          </select>
        </ProcField>
        {reemplazables.length > 0 && (
          <ProcField label="Reemplaza a" hint="Al guardar, el contrato anterior pasa a Reemplazado (se conserva)">
            <select style={inputStyle} value={f.reemplaza_contrato_id} onChange={(e) => set("reemplaza_contrato_id", e.target.value)}>
              <option value="">— (contrato nuevo)</option>
              {reemplazables.map((c) => <option key={c.id} value={c.id}>{c.codigo} v{c.version} ({badgeDe(c.estado).label})</option>)}
            </select>
          </ProcField>
        )}
        <ProcField label="Documento (bucket privado)"><input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} /></ProcField>
        <div style={{ gridColumn: "1 / -1" }}><ProcField label="Observaciones"><input style={inputStyle} value={f.observaciones} onChange={(e) => set("observaciones", e.target.value)} /></ProcField></div>
      </div>
    </ProcModal>
  );
}
