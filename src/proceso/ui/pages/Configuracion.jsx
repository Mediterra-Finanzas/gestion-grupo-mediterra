/* eslint-disable */
// src/proceso/ui/pages/Configuracion.jsx — configuración operacional de maestros proc_*.
// Data-driven (un descriptor por maestro) para NO ser un monolito de 15 pantallas.
// Los vínculos referencian identidad Core; NO se duplican empresas/terceros.
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import { cargarMaestro, crearMaestro, actualizarMaestro, desactivarMaestro } from "../../core/procesoF7DB";
import { traducirError, opcionesRef, limpiarDependencias, labelRef, filtrosActivos } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcCard, ProcButton, ProcDataTable, ProcModal, ProcField, inputStyle,
  ProcLoadingState, ProcErrorState, ProcEmptyState, ProcConfirmAction, ProcStatusBadge, ProcFilters,
} from "../components/base";
import { C, sp } from "../estilos";
import { normalizarNombre, claveNormalizada, sugerenciaCercana } from "../format";

// Campos de nombre libre que se normalizan al guardar (no códigos ni enums).
const CAMPOS_NOMBRE = new Set(["nombre", "nombre_provisional", "razon_social"]);

// ── Descriptores de maestros (tabla + campos) ───────────────────────────────
const T = { k: "text" }, N = { k: "number" }, B = { k: "bool" };
const sel = (op) => ({ k: "select", opciones: op });
// Configs de campo "ref" reusables (selects dinámicos / cascada). value/label desde
// el maestro fuente; filter acota (rol); dep/depMatch encadenan. Nombres normalizados.
const refEspecie  = { tabla: "proc_especie",  value: "codigo", label: "nombre" };
const refVariedad = { tabla: "proc_variedad", value: "codigo", label: "nombre", dep: "especie_codigo", depMatch: "especie_codigo" };
const refProductor = { tabla: "proc_vinculo", value: "id", filter: (r) => r.rol_operacional === "productor",
  label: (r) => normalizarNombre(r.nombre_provisional) + (r.csg_sag ? ` · CSG ${r.csg_sag}` : "") };
const refCliente = { tabla: "proc_vinculo", value: "id", filter: (r) => r.rol_operacional === "cliente_servicio",
  label: (r) => normalizarNombre(r.nombre_provisional) };
const refPredioDe = (dep) => ({ tabla: "proc_predios", value: "id", dep, depMatch: "productor_vinculo_id",
  label: (r) => normalizarNombre(r.nombre) + (r.csg_sag ? ` · CSG ${r.csg_sag}` : "") + (r.comuna ? ` · ${r.comuna}` : "") });
const R = (ref) => ({ k: "ref", ref });          // helper de campo ref
const RV = (ref) => ({ k: "ref", ref, virtual: 1 }); // ref sólo-UI (no se guarda)
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

  // ── T1-T3 · Trazabilidad agrícola ─────────────────────────────────────────
  { key: "especies", label: "Especies", tabla: "proc_especie",
    campos: [{ c: "codigo", l: "Código", ...T, req: 1 }, { c: "nombre", l: "Nombre", ...T, req: 1 }, { c: "activo", l: "Activo", ...B, def: true }],
    cols: ["codigo", "nombre"], filtros: ["busqueda"],
    nota: "Catálogo canónico de especies del bounded context Service (no Frisku). El código no se normaliza; el nombre sí." },
  { key: "variedades", label: "Variedades", tabla: "proc_variedad",
    campos: [{ c: "especie_codigo", l: "Especie", ...R(refEspecie), req: 1 }, { c: "codigo", l: "Código", ...T, req: 1 },
      { c: "nombre", l: "Nombre", ...T, req: 1 }, { c: "activo", l: "Activo", ...B, def: true }],
    cols: [{ titulo: "Especie", refCampo: "especie_codigo" }, "codigo", "nombre"], filtros: ["busqueda", { campo: "especie_codigo", ref: refEspecie, label: "Especie" }],
    nota: "La variedad exige especie válida (integridad backend). La UI filtra variedades por especie." },
  { key: "predios", label: "Predios / Huertos", tabla: "proc_predios",
    campos: [{ c: "productor_vinculo_id", l: "Productor", ...R(refProductor), req: 1 }, { c: "codigo", l: "Código", ...T, req: 1 },
      { c: "nombre", l: "Nombre", ...T, req: 1 }, { c: "csg_sag", l: "CSG SAG", ...T }, { c: "comuna", l: "Comuna", ...T },
      { c: "region", l: "Región", ...T }, { c: "pais_codigo", l: "País", ...T }, { c: "superficie_ha", l: "Superficie (ha)", ...N }, { c: "activo", l: "Activo", ...B, def: true }],
    cols: [{ titulo: "Productor", refCampo: "productor_vinculo_id" }, "codigo", "nombre", "comuna"], filtros: ["busqueda", { campo: "productor_vinculo_id", ref: refProductor, label: "Productor" }],
    nota: "Predio ligado a Productor. El CSG/RUT/código no se normalizan; el nombre sí." },
  { key: "cuarteles", label: "Cuarteles", tabla: "proc_cuartel",
    campos: [{ c: "_productor", l: "Productor", ...RV(refProductor), req: 1 }, { c: "predio_id", l: "Predio", ...R(refPredioDe("_productor")), req: 1 },
      { c: "codigo", l: "Código", ...T, req: 1 }, { c: "nombre", l: "Nombre", ...T }, { c: "superficie_ha", l: "Superficie (ha)", ...N },
      { c: "especie_codigo", l: "Especie", ...R(refEspecie) }, { c: "variedad_codigo", l: "Variedad", ...R(refVariedad) }, { c: "activo", l: "Activo", ...B, def: true }],
    cols: [{ titulo: "Predio", refCampo: "predio_id" }, "codigo", { titulo: "Especie", refCampo: "especie_codigo" }, { titulo: "Variedad", refCampo: "variedad_codigo" }],
    filtros: ["busqueda", { campo: "predio_id", ref: { tabla: "proc_predios", value: "id", label: (r) => normalizarNombre(r.nombre) }, label: "Predio" }, { campo: "especie_codigo", ref: refEspecie, label: "Especie" }],
    nota: "Cascada: Productor → Predio; Especie → Variedad. El Productor es sólo para filtrar predios (no se guarda en el cuartel)." },
  { key: "cliente_productor", label: "Cliente ↔ Productor", tabla: "proc_cliente_productor",
    campos: [{ c: "cliente_vinculo_id", l: "Cliente", ...R(refCliente), req: 1 }, { c: "productor_vinculo_id", l: "Productor", ...R(refProductor), req: 1 },
      { c: "temporada_codigo", l: "Temporada", ...T }, { c: "vigencia_desde", l: "Vigencia desde", k: "date" }, { c: "vigencia_hasta", l: "Vigencia hasta", k: "date" }, { c: "activo", l: "Activo", ...B, def: true }],
    cols: [{ titulo: "Cliente", refCampo: "cliente_vinculo_id" }, { titulo: "Productor", refCampo: "productor_vinculo_id" }, "temporada_codigo"],
    filtros: ["busqueda", { campo: "cliente_vinculo_id", ref: refCliente, label: "Cliente" }, { campo: "productor_vinculo_id", ref: refProductor, label: "Productor" }],
    nota: "Relación N:M (no ownership). Un productor puede trabajar con varios clientes; se referencia, no se duplica." },
  { key: "tipos_doc_contractual", label: "Tipos de Documento Contractual", tabla: "proc_tipo_documento_contractual",
    campos: [
      { c: "codigo", l: "Código", ...T, req: 1 },
      { c: "nombre", l: "Nombre (ej. Contrato, Anexo, Tarifario)", ...T, req: 1 },
      { c: "satisface_requisito_contractual", l: "¿Satisface el requisito contractual? (habilita al cliente para operar)", ...B, def: false },
      { c: "activo", l: "Activo", ...B, def: true },
    ],
    cols: ["codigo", "nombre",
      { titulo: "Satisface requisito", render: (r) => r.satisface_requisito_contractual
          ? <ProcStatusBadge texto="Sí · habilita" tono="success" />
          : <ProcStatusBadge texto="No · solo respaldo" tono="neutral" /> },
      { titulo: "Estado", render: (r) => <ProcStatusBadge texto={r.activo ? "Activo" : "Inactivo"} tono={r.activo ? "success" : "neutral"} /> },
    ],
    filtros: ["busqueda", { campo: "activo", label: "Estado", opciones: [{ v: "true", l: "Activo" }, { v: "false", l: "Inactivo" }] }],
    nota: "Catálogo de tipos de documento contractual (configurable). El flag «Satisface requisito» distingue un Contrato (habilita al cliente para operar) de un Anexo/Tarifario/Carta (solo respaldo — NO levanta el bloqueo contractual); la semántica la decide el flag, no el nombre. Nota: el documento «Tarifario» es un antecedente comercial adjunto y NO reemplaza el motor de tarifas (proc_tarifa), que es la fuente de verdad del cálculo de servicios facturables." },
];

function MaestroEditor({ d }) {
  const { empresa, puedeEditar, notificar } = useService();
  const editable = puedeEditar("config");
  const [rows, setRows] = useState([]);
  const [refData, setRefData] = useState({});   // { tabla: filas } para campos ref
  const [estado, setEstado] = useState("idle");
  const [error, setError] = useState(null);
  const [form, setForm] = useState(null);       // {modo, valores}
  const [borrar, setBorrar] = useState(null);
  const [fTexto, setFTexto] = useState("");
  const [fVals, setFVals] = useState({});        // filtros ref por campo

  const refDeCampo = (c) => (d.campos.find((x) => x.c === c && x.ref) || {}).ref;
  // tablas ref únicas usadas por campos (+ filtros): se cargan una vez.
  const refTablas = [...new Set([
    ...d.campos.filter((c) => c.ref).map((c) => c.ref.tabla),
    ...(d.filtros || []).filter((f) => f && f.ref).map((f) => f.ref.tabla),
  ])];

  const cargar = useCallback(async () => {
    if (!empresa) { setEstado("idle"); return; }
    setEstado("loading"); setError(null); setFTexto(""); setFVals({});
    try {
      setRows(await cargarMaestro(d.tabla, empresa));
      const rd = {};
      await Promise.all(refTablas.map(async (t) => { rd[t] = await cargarMaestro(t, empresa).catch(() => []); }));
      setRefData(rd); setEstado("ok");
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa, d.tabla]);
  useEffect(() => { cargar(); }, [cargar]);

  const abrirNuevo = () => setForm({ modo: "nuevo", valores: { ...Object.fromEntries(d.campos.filter((c) => c.def != null).map((c) => [c.c, c.def])) } });
  const abrirEditar = (row) => setForm({ modo: "editar", id: row.id, valores: { ...row } });
  // set de campo: si es padre de una cascada, limpia los hijos incompatibles.
  const setCampo = (c, v) => setForm((f) => {
    let valores = { ...f.valores, [c]: v };
    valores = limpiarDependencias(d.campos, valores, c);
    return { ...f, valores };
  });

  const guardar = async () => {
    for (const campo of d.campos) if (campo.req && !form.valores[campo.c]) { notificar(`Falta: ${campo.l}`, "error"); return; }
    try {
      const payload = {};
      d.campos.forEach((campo) => {
        if (campo.virtual) return;   // campos sólo-UI (ej. _productor) no se guardan
        let v = form.valores[campo.c]; if (v === "" || v === undefined) v = null;
        if (campo.k === "number" && v != null) v = Number(v);
        if (CAMPOS_NOMBRE.has(campo.c) && typeof v === "string") v = normalizarNombre(v);
        payload[campo.c] = v;
      });
      const campoClave = d.campos.find((c) => CAMPOS_NOMBRE.has(c.c) && payload[c.c]);
      if (campoClave) {
        const clave = claveNormalizada(payload[campoClave.c]);
        const otros = rows.filter((r) => r.id !== form.id && r.activo !== false);
        if (otros.some((r) => claveNormalizada(r[campoClave.c]) === clave)) {
          notificar(`Ya existe un registro con el nombre «${payload[campoClave.c]}» en ${d.label}.`, "error"); return;
        }
        const sug = sugerenciaCercana(payload[campoClave.c], otros.map((r) => ({ id: r.id, nombre: r[campoClave.c] })));
        if (sug && !window.confirm(`¿Quisiste decir «${sug.candidato.nombre}»? Se guardará «${payload[campoClave.c]}» como registro distinto.`)) return;
      }
      if (form.modo === "nuevo") { await crearMaestro(d.tabla, { empresa_id: empresa, ...(d.extra || {}), ...payload }); notificar("Registro creado"); }
      else { await actualizarMaestro(d.tabla, form.id, empresa, payload); notificar("Registro actualizado"); }
      setForm(null); cargar();
    } catch (e) { notificar(traducirError(e), "error"); }
  };
  const confirmarBorrar = async () => {
    try { await desactivarMaestro(d.tabla, borrar.id, empresa); notificar("Registro desactivado"); setBorrar(null); cargar(); }
    catch (e) { notificar(traducirError(e), "error"); }
  };

  // valor de celda: resuelve columnas ref a su label (nunca UUID crudo).
  const celda = (c, row) => {
    if (typeof c === "object" && c.refCampo) { const rf = refDeCampo(c.refCampo); return labelRef(refData[rf?.tabla] || [], rf, row[c.refCampo]); }
    if (typeof c === "object") return c;   // columna custom (render)
    const rf = refDeCampo(c);
    return rf ? labelRef(refData[rf.tabla] || [], rf, row[c]) : row[c];
  };
  const columnas = [
    ...d.cols.map((c) => (typeof c === "object" && c.render) ? c
      : { titulo: typeof c === "string" ? c.replace(/_/g, " ") : c.titulo, render: (row) => celda(c, row) }),
    editable ? { titulo: "", align: "right", render: (f) => (
      <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <ProcButton kind="ghost" small onClick={() => abrirEditar(f)}>Editar</ProcButton>
        <ProcButton kind="ghost" small onClick={() => setBorrar(f)}>Desactivar</ProcButton>
      </span>) } : { titulo: "", render: () => null },
  ];

  // filtros (client-side; los maestros son acotados)
  const refFiltros = (d.filtros || []).filter((f) => f && f.ref);
  const optFiltros = (d.filtros || []).filter((f) => f && f.opciones && !f.ref);   // opciones estáticas (ej. Activo/Inactivo)
  const hayBusqueda = (d.filtros || []).includes("busqueda");
  const filtradas = rows.filter((r) => {
    for (const f of [...refFiltros, ...optFiltros]) if (fVals[f.campo] && String(r[f.campo]) !== String(fVals[f.campo])) return false;
    if (hayBusqueda && fTexto) {
      const txt = d.cols.map((c) => celda(c, r)).filter((x) => typeof x === "string").join(" ").toLowerCase();
      if (!txt.includes(fTexto.toLowerCase())) return false;
    }
    return true;
  });
  const procFiltros = [
    ...refFiltros.map((f) => ({
      key: f.campo, label: f.label, valor: fVals[f.campo] || "", onChange: (v) => setFVals((x) => ({ ...x, [f.campo]: v })),
      opciones: [{ v: "", l: `Toda ${f.label.toLowerCase()}` }, ...opcionesRef(refData[f.ref.tabla] || [], f.ref, {}).map((o) => ({ v: o.value, l: o.label }))],
    })),
    ...optFiltros.map((f) => ({
      key: f.campo, label: f.label, valor: fVals[f.campo] || "", onChange: (v) => setFVals((x) => ({ ...x, [f.campo]: v })),
      opciones: [{ v: "", l: `Todo ${f.label.toLowerCase()}` }, ...f.opciones],
    })),
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
      {(hayBusqueda || procFiltros.length > 0) && estado === "ok" && (
        <ProcFilters busqueda={hayBusqueda ? fTexto : undefined} onBusqueda={hayBusqueda ? setFTexto : undefined} placeholder="Buscar…"
          filtros={procFiltros} onReset={() => { setFTexto(""); setFVals({}); }} />
      )}
      {estado === "loading" ? <ProcLoadingState /> :
       estado === "error" ? <ProcErrorState error={error} onRetry={cargar} /> :
       <ProcDataTable columnas={columnas} filas={filtradas} rowKey="id"
         vacio={<ProcEmptyState titulo="Sin registros" detalle={editable ? "Usá “+ Nuevo” para cargar el primero." : "Todavía no hay datos."} />} />}

      {form && (
        <ProcModal titulo={form.modo === "nuevo" ? `Nuevo · ${d.label}` : `Editar · ${d.label}`} onClose={() => setForm(null)} ancho={620}
          acciones={<><ProcButton kind="ghost" onClick={() => setForm(null)}>Cancelar</ProcButton><ProcButton onClick={guardar}>Guardar</ProcButton></>}>
          {d.campos.map((campo) => {
            const depOk = !campo.ref || !campo.ref.dep || !!form.valores[campo.ref.dep];
            return (
              <ProcField key={campo.c} label={campo.l} requerido={campo.req}
                hint={campo.ref && campo.ref.dep && !depOk ? `Elegí primero ${(d.campos.find((x) => x.c === campo.ref.dep) || {}).l || "el campo anterior"}` : undefined}>
                {campo.k === "bool" ? (
                  <input type="checkbox" checked={!!form.valores[campo.c]} onChange={(e) => setCampo(campo.c, e.target.checked)} />
                ) : campo.k === "ref" ? (
                  <select style={inputStyle} value={form.valores[campo.c] || ""} disabled={!depOk} onChange={(e) => setCampo(campo.c, e.target.value)}>
                    <option value="">—</option>
                    {opcionesRef(refData[campo.ref.tabla] || [], campo.ref, form.valores).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : campo.k === "select" ? (
                  <select style={inputStyle} value={form.valores[campo.c] || ""} onChange={(e) => setCampo(campo.c, e.target.value)}>
                    <option value="">—</option>{campo.opciones.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input style={inputStyle} type={campo.k === "number" ? "number" : campo.k === "date" ? "date" : "text"}
                    value={form.valores[campo.c] ?? ""} onChange={(e) => setCampo(campo.c, e.target.value)} />
                )}
              </ProcField>
            );
          })}
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
