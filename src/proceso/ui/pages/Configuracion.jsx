/* eslint-disable */
// src/proceso/ui/pages/Configuracion.jsx — configuración operacional de maestros proc_*.
// Data-driven (un descriptor por maestro) para NO ser un monolito de 15 pantallas.
// Los vínculos referencian identidad Core; NO se duplican empresas/terceros.
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import { cargarMaestro, crearMaestro, actualizarMaestro, desactivarMaestro } from "../../core/procesoF7DB";
import { traducirError } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcCard, ProcButton, ProcDataTable, ProcModal, ProcField, inputStyle,
  ProcLoadingState, ProcErrorState, ProcEmptyState, ProcConfirmAction, ProcStatusBadge,
} from "../components/base";
import { C, sp } from "../estilos";
import { normalizarNombre, claveNormalizada, sugerenciaCercana } from "../format";

// Campos de nombre libre que se normalizan al guardar (no códigos ni enums).
const CAMPOS_NOMBRE = new Set(["nombre", "nombre_provisional", "razon_social"]);

// ── Descriptores de maestros (tabla + campos) ───────────────────────────────
const T = { k: "text" }, N = { k: "number" }, B = { k: "bool" };
const sel = (op) => ({ k: "select", opciones: op });
const MAESTROS = [
  { key: "plantas", label: "Plantas", tabla: "proc_planta",
    campos: [{ c: "codigo", l: "Código", ...T, req: 1 }, { c: "nombre", l: "Nombre", ...T, req: 1 }],
    cols: ["codigo", "nombre"] },
  { key: "temporadas", label: "Temporadas", tabla: "proc_temporada",
    campos: [{ c: "codigo", l: "Código (ej. 2026/2027)", ...T, req: 1 }, { c: "nombre", l: "Nombre", ...T },
      { c: "fecha_inicio", l: "Inicio", k: "date" }, { c: "fecha_fin", l: "Fin", k: "date" },
      { c: "estado", l: "Estado", ...sel(["planificada", "activa", "cerrada", "anulada"]) }],
    cols: ["codigo", "nombre", "estado"] },
  { key: "ubicaciones", label: "Ubicaciones", tabla: "proc_ubicaciones",
    campos: [{ c: "codigo", l: "Código", ...T, req: 1 }, { c: "nombre", l: "Nombre", ...T, req: 1 },
      { c: "tipo", l: "Tipo", ...sel(["camara", "zona", "ubicacion", "patio"]), req: 1 }],
    cols: ["codigo", "nombre", "tipo"], nota: "El layout físico (cámaras/andenes) es dato real de la planta." },
  { key: "lineas", label: "Líneas de proceso", tabla: "proc_lineas_proceso",
    campos: [{ c: "codigo", l: "Código", ...T, req: 1 }, { c: "nombre", l: "Nombre", ...T, req: 1 }],
    cols: ["codigo", "nombre"] },
  { key: "calibres", label: "Calibres", tabla: "proc_calibre",
    campos: [{ c: "especie_codigo", l: "Especie", ...T, req: 1 }, { c: "codigo", l: "Código", ...T, req: 1 },
      { c: "nombre", l: "Nombre", ...T, req: 1 }, { c: "orden", l: "Orden", ...N }],
    cols: ["especie_codigo", "codigo", "nombre"] },
  { key: "colores", label: "Colores", tabla: "proc_color",
    campos: [{ c: "especie_codigo", l: "Especie", ...T, req: 1 }, { c: "codigo", l: "Código", ...T, req: 1 }, { c: "nombre", l: "Nombre", ...T, req: 1 }],
    cols: ["especie_codigo", "codigo", "nombre"] },
  { key: "categorias", label: "Categorías de calidad", tabla: "proc_categorias_calidad",
    campos: [{ c: "codigo", l: "Código", ...T, req: 1 }, { c: "nombre", l: "Nombre", ...T, req: 1 }, { c: "es_comercial", l: "¿Comercial?", ...B }],
    cols: ["codigo", "nombre", { titulo: "Comercial", render: (f) => (f.es_comercial ? "Sí" : "No") }] },
  { key: "condiciones", label: "Condiciones", tabla: "proc_condiciones",
    campos: [{ c: "codigo", l: "Código", ...T, req: 1 }, { c: "nombre", l: "Nombre", ...T, req: 1 }, { c: "ambito", l: "Ámbito", ...sel(["recepcion", "qc", "proceso"]) }],
    cols: ["codigo", "nombre", "ambito"] },
  { key: "motivos_descarte", label: "Motivos de descarte", tabla: "proc_motivos_descarte",
    campos: [{ c: "codigo", l: "Código", ...T, req: 1 }, { c: "nombre", l: "Nombre", ...T, req: 1 }], cols: ["codigo", "nombre"] },
  { key: "motivos_merma", label: "Motivos de merma", tabla: "proc_motivos_merma",
    campos: [{ c: "codigo", l: "Código", ...T, req: 1 }, { c: "nombre", l: "Nombre", ...T, req: 1 }], cols: ["codigo", "nombre"] },
  { key: "tipos_servicio", label: "Tipos de servicio", tabla: "proc_tipo_servicio",
    campos: [{ c: "codigo", l: "Código", ...T, req: 1 }, { c: "nombre", l: "Nombre", ...T, req: 1 },
      { c: "unidad_default", l: "Unidad", ...sel(["kg_procesado", "caja", "pallet", "evento", "dia", "pallet_dia", "kg_dia", "camara_dia", "hora", "unidad", "monto_fijo"]) }],
    cols: ["codigo", "nombre", "unidad_default"] },
  { key: "qc", label: "Parámetros QC", tabla: "proc_qc_parametro",
    campos: [{ c: "especie_codigo", l: "Especie", ...T, req: 1 }, { c: "codigo", l: "Código", ...T, req: 1 }, { c: "nombre", l: "Nombre", ...T, req: 1 },
      { c: "tipo_dato", l: "Tipo", ...sel(["numero", "texto", "booleano"]), req: 1 }, { c: "unidad", l: "Unidad", ...T },
      { c: "rango_min", l: "Rango mín", ...N }, { c: "rango_max", l: "Rango máx", ...N },
      { c: "severidad", l: "Severidad", ...sel(["informativo", "advertencia", "bloqueante"]), req: 1 }, { c: "obligatorio", l: "¿Obligatorio?", ...B }],
    cols: ["especie_codigo", "codigo", "nombre", { titulo: "Severidad", render: (f) => <ProcStatusBadge texto={f.severidad} tono={f.severidad === "bloqueante" ? "danger" : f.severidad === "advertencia" ? "warning" : "info"} /> }],
    nota: "La severidad define el gate: bloqueante rechaza, advertencia = condicional, informativo no bloquea." },
  { key: "vinculos", label: "Vínculos (contrapartes)", tabla: "proc_vinculo",
    campos: [{ c: "rol_operacional", l: "Rol", ...sel(["cliente_servicio", "productor", "dueno_fruta", "exportadora", "transportista", "otro"]), req: 1 },
      { c: "nombre_provisional", l: "Nombre", ...T, req: 1 }, { c: "codigo_externo", l: "Código externo", ...T }],
    cols: ["rol_operacional", "nombre_provisional"], extra: { pendiente_alta_corporativa: true },
    nota: "Universo comercial de Service = esta tabla (no Frisku). La identidad viene de Core; acá se crea la relación operacional. Foods puede ser cliente vía vínculo, sin comportamiento especial." },
];

function MaestroEditor({ d }) {
  const { empresa, puedeEditar, notificar } = useService();
  const editable = puedeEditar("config");
  const [rows, setRows] = useState([]);
  const [estado, setEstado] = useState("idle");
  const [error, setError] = useState(null);
  const [form, setForm] = useState(null);     // {modo, valores}
  const [borrar, setBorrar] = useState(null);

  const cargar = useCallback(async () => {
    if (!empresa) { setEstado("idle"); return; }
    setEstado("loading"); setError(null);
    try { setRows(await cargarMaestro(d.tabla, empresa)); setEstado("ok"); }
    catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa, d.tabla]);
  useEffect(() => { cargar(); }, [cargar]);

  const abrirNuevo = () => setForm({ modo: "nuevo", valores: {} });
  const abrirEditar = (row) => setForm({ modo: "editar", id: row.id, valores: { ...row } });
  const setCampo = (c, v) => setForm((f) => ({ ...f, valores: { ...f.valores, [c]: v } }));

  const guardar = async () => {
    for (const campo of d.campos) if (campo.req && !form.valores[campo.c]) { notificar(`Falta: ${campo.l}`, "error"); return; }
    try {
      const payload = {};
      d.campos.forEach((campo) => {
        let v = form.valores[campo.c]; if (v === "" || v === undefined) v = null;
        if (campo.k === "number" && v != null) v = Number(v);
        // Normalización canónica de nombres en el punto de escritura (idempotente).
        if (CAMPOS_NOMBRE.has(campo.c) && typeof v === "string") v = normalizarNombre(v);
        payload[campo.c] = v;
      });
      // Dedup + sugerencia por clave normalizada contra registros activos del maestro.
      const campoClave = d.campos.find((c) => CAMPOS_NOMBRE.has(c.c) && payload[c.c]);
      if (campoClave) {
        const clave = claveNormalizada(payload[campoClave.c]);
        const otros = rows.filter((r) => r.id !== form.id && r.activo !== false);
        if (otros.some((r) => claveNormalizada(r[campoClave.c]) === clave)) {
          notificar(`Ya existe un registro con el nombre «${payload[campoClave.c]}» en ${d.label}.`, "error");
          return;
        }
        const sug = sugerenciaCercana(payload[campoClave.c], otros.map((r) => ({ id: r.id, nombre: r[campoClave.c] })));
        if (sug && !window.confirm(`¿Quisiste decir «${sug.candidato.nombre}»? Se guardará «${payload[campoClave.c]}» como registro distinto.`)) return;
      }
      if (form.modo === "nuevo") {
        await crearMaestro(d.tabla, { empresa_id: empresa, ...(d.extra || {}), ...payload });
        notificar("Registro creado");
      } else {
        await actualizarMaestro(d.tabla, form.id, empresa, payload);
        notificar("Registro actualizado");
      }
      setForm(null); cargar();
    } catch (e) { notificar(traducirError(e), "error"); }
  };
  const confirmarBorrar = async () => {
    try { await desactivarMaestro(d.tabla, borrar.id, empresa); notificar("Registro desactivado"); setBorrar(null); cargar(); }
    catch (e) { notificar(traducirError(e), "error"); }
  };

  const columnas = [
    ...d.cols.map((c) => (typeof c === "string" ? { titulo: c.replace(/_/g, " "), campo: c } : c)),
    editable ? { titulo: "", align: "right", render: (f) => (
      <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <ProcButton kind="ghost" small onClick={() => abrirEditar(f)}>Editar</ProcButton>
        <ProcButton kind="ghost" small onClick={() => setBorrar(f)}>Desactivar</ProcButton>
      </span>) } : { titulo: "", render: () => null },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: sp.md }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{d.label}</div>
          {d.nota && <div style={{ fontSize: 12, color: C.muted, marginTop: 2, maxWidth: 620 }}>{d.nota}</div>}
        </div>
        {editable && <ProcButton onClick={abrirNuevo}>+ Nuevo</ProcButton>}
      </div>
      {estado === "loading" ? <ProcLoadingState /> :
       estado === "error" ? <ProcErrorState error={error} onRetry={cargar} /> :
       <ProcDataTable columnas={columnas} filas={rows} rowKey="id"
         vacio={<ProcEmptyState titulo="Sin registros" detalle={editable ? "Usá “+ Nuevo” para cargar el primero." : "Todavía no hay datos."} />} />}

      {form && (
        <ProcModal titulo={form.modo === "nuevo" ? `Nuevo · ${d.label}` : `Editar · ${d.label}`} onClose={() => setForm(null)}
          acciones={<><ProcButton kind="ghost" onClick={() => setForm(null)}>Cancelar</ProcButton><ProcButton onClick={guardar}>Guardar</ProcButton></>}>
          {d.campos.map((campo) => (
            <ProcField key={campo.c} label={campo.l} requerido={campo.req}>
              {campo.k === "bool" ? (
                <input type="checkbox" checked={!!form.valores[campo.c]} onChange={(e) => setCampo(campo.c, e.target.checked)} />
              ) : campo.k === "select" ? (
                <select style={inputStyle} value={form.valores[campo.c] || ""} onChange={(e) => setCampo(campo.c, e.target.value)}>
                  <option value="">—</option>
                  {campo.opciones.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input style={inputStyle} type={campo.k === "number" ? "number" : campo.k === "date" ? "date" : "text"}
                  value={form.valores[campo.c] ?? ""} onChange={(e) => setCampo(campo.c, e.target.value)} />
              )}
            </ProcField>
          ))}
        </ProcModal>
      )}
      {borrar && <ProcConfirmAction titulo="Desactivar registro" mensaje="El registro se marca como inactivo (no se borra físicamente). ¿Continuar?"
        textoConfirm="Desactivar" onConfirm={confirmarBorrar} onCancel={() => setBorrar(null)} />}
    </div>
  );
}

export default function Configuracion() {
  const { empresa } = useService();
  const [sel, setSel] = useState(MAESTROS[0].key);
  const d = MAESTROS.find((m) => m.key === sel);

  if (!empresa) {
    return (<div><ProcPageHeader titulo="Configuración" subtitulo="Maestros operacionales" />
      <ProcCard style={{ padding: sp.lg }}><ProcEmptyState icono="⚙️" titulo="Seleccioná un tenant"
        detalle="La configuración se scoped por empresa (tenant). Elegí empresa en la barra superior." /></ProcCard></div>);
  }
  return (
    <div>
      <ProcPageHeader titulo="Configuración" subtitulo="Maestros operacionales · datos reales de la planta" />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 220px) 1fr", gap: sp.lg, alignItems: "start" }}>
        <ProcCard style={{ padding: sp.sm }}>
          {MAESTROS.map((m) => (
            <div key={m.key} onClick={() => setSel(m.key)} style={{
              padding: "8px 10px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: sel === m.key ? 700 : 500,
              color: sel === m.key ? C.primary : C.text, background: sel === m.key ? C.infoBg : "transparent",
            }}>{m.label}</div>
          ))}
        </ProcCard>
        <ProcCard style={{ padding: sp.lg }}><MaestroEditor d={d} /></ProcCard>
      </div>
    </div>
  );
}
