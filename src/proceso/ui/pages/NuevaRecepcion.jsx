/* eslint-disable */
// src/proceso/ui/pages/NuevaRecepcion.jsx — recepción MULTI-LOTE (T10c).
// Dos bloques: A) Recepción (evento físico/logístico + cliente + pesos + alerta
// contractual) · B) Lotes / origen agrícola por LOTE (cascada Productor→Predio→
// Cuartel; Especie→Variedad). La recepción física SIEMPRE es registrable (aunque
// el contrato falte/bloquee); el gate contractual afecta el AVANCE, no el registro.
// Secuencia: crear recepción (correlativo backend) → agregar cada lote por RPC
// atómica (ingresar_lote_ubicado: lote + origen_snapshot + movimiento + ubicación).
import React, { useEffect, useState } from "react";
import { useService } from "../hooks/useServiceContext";
import {
  siguienteCorrelativo, crearRecepcion, cargarVinculosPorRol, cargarUbicacionesActivas,
  cargarEspecies, cargarVariedades, cargarPredios, cargarCuarteles, cargarClienteProductores,
  estadoContractualCliente, conciliacionRecepcion, cerrarRecepcion,
} from "../../core/procesoF7DB";
import { ingresarLoteUbicado } from "../../core/procesoF2DB";
import {
  validarPesos, calcularNeto, traducirError, opcionesRef, limpiarDependencias, labelRef,
  resumenKgLotes, resumenOrigenes, tonoContractual, copiarOrigen,
} from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcCard, ProcButton, ProcField, inputStyle, ProcStatusBadge,
  ProcEmptyState, ProcDataTable,
} from "../components/base";
import QcPanel from "../components/QcPanel";
import { C, sp } from "../estilos";
import { normalizarNombre, formatNum } from "../format";

// refs de cascada del lote (para labelRef + opcionesRef)
const refProductor = { value: "id", label: (r) => normalizarNombre(r.nombre_provisional) + (r.csg_sag ? ` · CSG ${r.csg_sag}` : "") };
const refPredio = { value: "id", label: (r) => normalizarNombre(r.nombre) + (r.comuna ? ` · ${r.comuna}` : ""), dep: "productorId", depMatch: "productor_vinculo_id" };
const refCuartel = { value: "id", label: (r) => r.codigo + (r.variedad_codigo ? ` · ${r.variedad_codigo}` : "") + (r.superficie_ha ? ` · ${r.superficie_ha} ha` : ""), dep: "predioId", depMatch: "predio_id" };
const refEspecie = { value: "codigo", label: "nombre" };
const refVariedad = { value: "codigo", label: "nombre", dep: "especie_codigo", depMatch: "especie_codigo" };
const LOTE_CAMPOS = [{ c: "predioId", ref: { dep: "productorId" } }, { c: "cuartelId", ref: { dep: "predioId" } }, { c: "variedad_codigo", ref: { dep: "especie_codigo" } }];

function Grupo({ titulo, children }) {
  return (
    <div style={{ marginBottom: sp.lg }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .4, marginBottom: sp.sm }}>{titulo}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: sp.md }}>{children}</div>
    </div>
  );
}

function Metrica({ titulo, valor, tono }) {
  return (
    <div style={{ padding: "8px 12px", background: C.cardAlt, borderRadius: 8 }}>
      <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: .3 }}>{titulo}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: tono || C.text }}>{valor}</div>
    </div>
  );
}

export default function NuevaRecepcion() {
  const { empresa, planta, temporada, ir, notificar } = useService();
  const [vinc, setVinc] = useState({ cliente_servicio: [], productor: [], transportista: [] });
  const [mae, setMae] = useState({ especies: [], variedades: [], predios: [], cuarteles: [] });
  const [ubicaciones, setUbicaciones] = useState([]);
  const [clientePros, setClientePros] = useState([]);   // proc_cliente_productor del cliente
  const [contract, setContract] = useState(null);        // estado contractual del cliente
  const [f, setF] = useState({ cliente_servicio: "", especie_qc: "", kg_bruto: "", tara: "", guia_despacho: "", patente: "", transportista: "" });
  const [rec, setRec] = useState(null);                  // {id, folio} tras crear (en borrador)
  const [agregados, setAgregados] = useState([]);        // lotes ingresados (local)
  const [concil, setConcil] = useState(null);            // read-model de conciliación (ledger)
  const [cerrando, setCerrando] = useState(false);
  const [nl, setNl] = useState({ productorId: "", predioId: "", cuartelId: "", especie_codigo: "", variedad_codigo: "", kg: "", ubicacion: "" });

  useEffect(() => {
    if (!empresa) return;
    ["cliente_servicio", "productor", "transportista"].forEach((rol) =>
      cargarVinculosPorRol(empresa, rol).then((v) => setVinc((x) => ({ ...x, [rol]: v || [] }))).catch(() => {}));
    Promise.all([cargarEspecies(empresa), cargarVariedades(empresa), cargarPredios(empresa), cargarCuarteles(empresa)])
      .then(([e, v, p, c]) => setMae({ especies: e || [], variedades: v || [], predios: p || [], cuarteles: c || [] })).catch(() => {});
    cargarUbicacionesActivas(empresa, planta).then(setUbicaciones).catch(() => setUbicaciones([]));
  }, [empresa, planta]);

  // al elegir cliente: estado contractual + productores relacionados
  useEffect(() => {
    if (!empresa || !f.cliente_servicio) { setContract(null); setClientePros([]); return; }
    estadoContractualCliente({ empresaId: empresa, clienteId: f.cliente_servicio })
      .then((r) => setContract(Array.isArray(r) ? r[0] : r)).catch(() => setContract(null));
    cargarClienteProductores(empresa, f.cliente_servicio).then((r) => setClientePros(r || [])).catch(() => setClientePros([]));
  }, [empresa, f.cliente_servicio]);

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const pes = validarPesos({ bruto: f.kg_bruto, tara: f.tara });

  // productores: relacionados al cliente primero, luego el resto (no se pierde flexibilidad)
  const relacionadosSet = new Set(clientePros.map((r) => r.productor_vinculo_id));
  const productoresOrden = [...vinc.productor].sort((a, b) => (relacionadosSet.has(b.id) ? 1 : 0) - (relacionadosSet.has(a.id) ? 1 : 0));
  const prodOpts = productoresOrden.map((r) => ({ value: r.id, label: refProductor.label(r) + (relacionadosSet.has(r.id) ? " · relacionado" : "") }));
  const predioOpts = opcionesRef(mae.predios, refPredio, nl);
  const cuartelOpts = opcionesRef(mae.cuarteles, refCuartel, nl);
  const especieOpts = opcionesRef(mae.especies, refEspecie, {});
  const variedadOpts = opcionesRef(mae.variedades, refVariedad, nl);

  const setLote = (c, v) => setNl((prev) => {
    let vals = limpiarDependencias(LOTE_CAMPOS, { ...prev, [c]: v }, c);
    // autofill especie/variedad desde el cuartel (ayuda, no historia mutable)
    if (c === "cuartelId" && v) {
      const cu = mae.cuarteles.find((x) => x.id === v);
      if (cu && cu.especie_codigo) { vals.especie_codigo = cu.especie_codigo; vals.variedad_codigo = cu.variedad_codigo || ""; }
    }
    return vals;
  });
  const duplicarAnterior = () => { if (agregados.length) setNl((p) => ({ ...copiarOrigen(agregados[agregados.length - 1]) })); };

  const km = resumenKgLotes(pes.neto, agregados);
  const especieQC = f.especie_qc || (agregados[0] && agregados[0].especie_codigo) || "";

  const crear = async () => {
    if (!empresa) return notificar("Falta tenant", "error");
    if (!f.cliente_servicio) return notificar("Falta el cliente del servicio", "error");
    if (!pes.ok) return notificar(pes.errores[0], "error");
    try {
      const folio = await siguienteCorrelativo({ empresaId: empresa, temporada: temporada || "s-t", tipo: "REC" });
      const r = await crearRecepcion({
        empresa_id: empresa, folio, planta_id: planta || null, cliente_servicio_vinculo_id: f.cliente_servicio,
        transportista_vinculo_id: f.transportista || null, especie_codigo: f.especie_qc || null,
        kg_bruto: Number(f.kg_bruto) || null, tara: Number(f.tara) || null, kg_neto: pes.neto || null,
        guia_despacho: f.guia_despacho || null, patente: f.patente || null, estado: "borrador",
      });
      setRec({ id: r.id, folio: r.folio });
      refrescarConcil(r.id);
      notificar(`Recepción ${r.folio} creada en borrador — registrá los lotes y finalizá`);
    } catch (e) { notificar(traducirError(e), "error"); }
  };

  // conciliación autoritativa (kg desde ledger + tolerancia de la empresa)
  const refrescarConcil = async (recId) => {
    try { const rows = await conciliacionRecepcion(empresa, recId || rec?.id); setConcil((rows && rows[0]) || null); }
    catch { setConcil(null); }
  };

  const finalizar = async () => {
    if (!rec) return;
    setCerrando(true);
    try {
      const res = await cerrarRecepcion({ empresaId: empresa, recepcionId: rec.id });
      notificar(`Recepción ${rec.folio} finalizada (${formatNum(res.kg_lotes, 1)} kg conciliados)`);
      ir("recepcion_detalle", { id: rec.id });
    } catch (e) { notificar(traducirError(e), "error"); refrescarConcil(); }
    finally { setCerrando(false); }
  };

  const agregarLote = async () => {
    if (!nl.especie_codigo) return notificar("Elegí especie del lote", "error");
    if (!nl.kg || Number(nl.kg) <= 0) return notificar("Kg del lote debe ser > 0", "error");
    if (!nl.ubicacion) return notificar("Seleccioná ubicación inicial", "error");
    try {
      const codigo = await siguienteCorrelativo({ empresaId: empresa, temporada: temporada || "s-t", tipo: "LOT" });
      await ingresarLoteUbicado({
        empresaId: empresa, recepcionId: rec.id, codigo, especie: nl.especie_codigo, variedad: nl.variedad_codigo || null,
        kg: Number(nl.kg), plantaId: planta, temporada: temporada || "s-t", ubicacionId: nl.ubicacion,
        productorId: nl.productorId || null, predioId: nl.predioId || null, cuartelId: nl.cuartelId || null,
      });
      setAgregados((a) => [...a, { codigo, kg: Number(nl.kg), ...nl }]);
      setNl({ productorId: "", predioId: "", cuartelId: "", especie_codigo: "", variedad_codigo: "", kg: "", ubicacion: "" });
      refrescarConcil();
      notificar(`Lote ${codigo} ingresado`);
    } catch (e) { notificar(traducirError(e), "error"); }
  };

  if (!empresa) return <div><ProcPageHeader titulo="Nueva recepción" /><ProcCard style={{ padding: sp.lg }}><ProcEmptyState icono="🚛" titulo="Seleccioná un tenant" /></ProcCard></div>;

  // tarjeta de alerta contractual (badge + texto + acción)
  const alertaContractual = contract && (
    <div style={{ display: "flex", alignItems: "center", gap: sp.md, flexWrap: "wrap", padding: "10px 14px", borderRadius: 10, marginTop: sp.sm,
      background: contract.nivel === "bloqueante" ? C.dangerBg : contract.nivel === "advertencia" ? C.warningBg : contract.nivel === "informativo" ? C.infoBg : C.successBg,
      border: `1px solid ${(contract.nivel === "bloqueante" ? C.danger : contract.nivel === "advertencia" ? C.warning : contract.nivel === "informativo" ? C.info : C.success)}33` }}>
      <ProcStatusBadge texto={contract.estado_display || "—"} tono={tonoContractual(contract.nivel)} />
      <span style={{ fontSize: 12.5, color: C.text, flex: 1 }}>
        {contract.nivel === "bloqueante" ? "Cliente sin contrato firmado vigente. La recepción física puede registrarse por trazabilidad, pero el avance a proceso quedará condicionado por la política contractual."
          : contract.nivel === "advertencia" ? "Contrato pendiente/observado. Se puede recibir; regularizá el contrato para operar sin restricciones."
          : contract.tiene_contrato_vigente ? "Contrato vigente." : "Sin requisito contractual para este cliente."}
      </span>
    </div>
  );

  return (
    <div>
      <ProcPageHeader titulo={rec ? `Recepción ${rec.folio}` : "Nueva recepción"}
        subtitulo={rec ? "Registrá QC y los lotes con su origen agrícola y ubicación" : "Llegada de fruta a planta (evento físico)"}
        acciones={<ProcButton kind="ghost" onClick={() => ir("recepciones")}>← Recepciones</ProcButton>} />

      {/* ── BLOQUE A: RECEPCIÓN ── */}
      {!rec ? (
        <ProcCard style={{ padding: sp.lg }}>
          <Grupo titulo="Recepción · comercial / logística">
            <ProcField label="Cliente del servicio" requerido>
              <select style={inputStyle} value={f.cliente_servicio} onChange={(e) => set("cliente_servicio", e.target.value)}>
                <option value="">—</option>
                {vinc.cliente_servicio.map((v) => <option key={v.id} value={v.id}>{normalizarNombre(v.nombre_provisional)}</option>)}
              </select>
            </ProcField>
            <ProcField label="Transportista">
              <select style={inputStyle} value={f.transportista} onChange={(e) => set("transportista", e.target.value)}>
                <option value="">—</option>{vinc.transportista.map((v) => <option key={v.id} value={v.id}>{normalizarNombre(v.nombre_provisional)}</option>)}
              </select>
            </ProcField>
            <ProcField label="Patente"><input style={inputStyle} value={f.patente} onChange={(e) => set("patente", e.target.value)} /></ProcField>
            <ProcField label="Guía / documento"><input style={inputStyle} value={f.guia_despacho} onChange={(e) => set("guia_despacho", e.target.value)} /></ProcField>
            <ProcField label="Especie principal (para QC)" hint="Opcional; QC usa esta especie o la del primer lote">
              <select style={inputStyle} value={f.especie_qc} onChange={(e) => set("especie_qc", e.target.value)}>
                <option value="">—</option>{especieOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </ProcField>
          </Grupo>
          {f.cliente_servicio && alertaContractual}
          <Grupo titulo="Pesos (kg neto = bruto − tara; DB es autoridad)">
            <ProcField label="Kg bruto"><input style={inputStyle} type="number" value={f.kg_bruto} onChange={(e) => set("kg_bruto", e.target.value)} /></ProcField>
            <ProcField label="Tara"><input style={inputStyle} type="number" value={f.tara} onChange={(e) => set("tara", e.target.value)} /></ProcField>
            <ProcField label="Kg neto (calculado)"><input style={{ ...inputStyle, background: C.cardAlt }} value={calcularNeto(f.kg_bruto, f.tara)} readOnly /></ProcField>
          </Grupo>
          {!pes.ok && <div style={{ color: C.danger, fontSize: 12.5, marginBottom: sp.md }}>{pes.errores.join(" ")}</div>}
          {/* Regla CFO: registrar SIEMPRE habilitado, aunque el contrato sea bloqueante */}
          <ProcButton onClick={crear}>Registrar recepción</ProcButton>
        </ProcCard>
      ) : (
        <>
          {alertaContractual && <ProcCard style={{ padding: sp.md, marginBottom: sp.md }}>{alertaContractual}</ProcCard>}
          <ProcCard style={{ padding: sp.lg, marginBottom: sp.md }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: sp.md }}>Control de Calidad {especieQC && <span style={{ fontSize: 12, color: C.muted }}>· {especieQC}</span>}</div>
            {especieQC ? <QcPanel especie={especieQC} recepcionId={rec.id} editable onGuardado={() => {}} />
              : <div style={{ fontSize: 13, color: C.muted }}>El QC se habilita al fijar la especie principal o agregar el primer lote.</div>}
          </ProcCard>

          {/* ── BLOQUE B: LOTES / ORIGEN ── */}
          <ProcCard style={{ padding: sp.lg }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: sp.md, flexWrap: "wrap", gap: sp.sm }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Lotes de la recepción · origen agrícola</div>
              {agregados.length > 0 && <ProcButton kind="ghost" small onClick={duplicarAnterior}>⧉ Duplicar origen anterior</ProcButton>}
            </div>
            {ubicaciones.length === 0 && <div style={{ color: C.warning, fontSize: 12.5, marginBottom: sp.sm }}>No hay ubicaciones activas para esta planta. Configuralas antes de ingresar fruta.</div>}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: sp.sm, marginBottom: sp.sm }}>
              <ProcField label="Productor">
                <select style={inputStyle} value={nl.productorId} onChange={(e) => setLote("productorId", e.target.value)}>
                  <option value="">—</option>{prodOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </ProcField>
              <ProcField label="Predio" hint={!nl.productorId ? "Elegí productor" : undefined}>
                <select style={inputStyle} value={nl.predioId} disabled={!nl.productorId} onChange={(e) => setLote("predioId", e.target.value)}>
                  <option value="">—</option>{predioOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </ProcField>
              <ProcField label="Cuartel" hint={!nl.predioId ? "Elegí predio" : undefined}>
                <select style={inputStyle} value={nl.cuartelId} disabled={!nl.predioId} onChange={(e) => setLote("cuartelId", e.target.value)}>
                  <option value="">—</option>{cuartelOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </ProcField>
              <ProcField label="Especie" requerido>
                <select style={inputStyle} value={nl.especie_codigo} onChange={(e) => setLote("especie_codigo", e.target.value)}>
                  <option value="">—</option>{especieOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </ProcField>
              <ProcField label="Variedad" hint={!nl.especie_codigo ? "Elegí especie" : undefined}>
                <select style={inputStyle} value={nl.variedad_codigo} disabled={!nl.especie_codigo} onChange={(e) => setLote("variedad_codigo", e.target.value)}>
                  <option value="">—</option>{variedadOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </ProcField>
              <ProcField label="Kg" requerido><input style={inputStyle} type="number" value={nl.kg} onChange={(e) => setLote("kg", e.target.value)} /></ProcField>
              <ProcField label="Ubicación inicial" requerido>
                <select style={inputStyle} value={nl.ubicacion} onChange={(e) => setLote("ubicacion", e.target.value)}>
                  <option value="">—</option>{ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre || u.codigo}</option>)}
                </select>
              </ProcField>
              <div style={{ display: "flex", alignItems: "end" }}><ProcButton onClick={agregarLote}>+ Agregar lote</ProcButton></div>
            </div>

            {/* preview de masas: neto vs Σ lotes */}
            <div style={{ display: "flex", gap: sp.lg, flexWrap: "wrap", padding: "8px 12px", background: C.cardAlt, borderRadius: 8, fontSize: 12.5, marginBottom: sp.md }}>
              <span>Peso neto recepción: <b>{formatNum(km.neto, 1)} kg</b></span>
              <span>Asignado a lotes: <b>{formatNum(km.asignado, 1)} kg</b></span>
              {km.pendiente > 0 && <span style={{ color: C.warning }}>Pendiente por asignar: <b>{formatNum(km.pendiente, 1)} kg</b></span>}
              {km.exceso > 0 && <span style={{ color: C.danger }}>Exceso asignado: <b>{formatNum(km.exceso, 1)} kg</b></span>}
            </div>

            <ProcDataTable
              columnas={[
                { titulo: "Código", render: (l) => <b>{l.codigo}</b> },
                { titulo: "Productor", render: (l) => labelRef(vinc.productor, refProductor, l.productorId) },
                { titulo: "Predio", render: (l) => labelRef(mae.predios, { value: "id", label: (r) => normalizarNombre(r.nombre) }, l.predioId) },
                { titulo: "Cuartel", render: (l) => labelRef(mae.cuarteles, { value: "id", label: "codigo" }, l.cuartelId) },
                { titulo: "Especie", render: (l) => l.especie_codigo || "—" },
                { titulo: "Variedad", render: (l) => l.variedad_codigo || "—" },
                { titulo: "Kg", align: "right", render: (l) => formatNum(l.kg, 1) },
                { titulo: "Ubicación", render: (l) => labelRef(ubicaciones, { value: "id", label: (r) => r.nombre || r.codigo }, l.ubicacion) },
              ]}
              filas={agregados} rowKey="codigo"
              vacio={<ProcEmptyState icono="📦" titulo="Aún sin lotes" detalle="Cargá el origen y kg del primer lote. Una recepción puede tener varios orígenes." />} />

            {agregados.length > 0 && (() => { const ro = resumenOrigenes(agregados); return (
              <div style={{ display: "flex", gap: sp.lg, flexWrap: "wrap", marginTop: sp.sm, fontSize: 12.5, color: C.muted }}>
                <span><b>{ro.lotes}</b> lotes</span><span><b>{ro.productores}</b> productores</span><span><b>{ro.predios}</b> predios</span><span><b>{ro.cuarteles}</b> cuarteles</span><span><b>{formatNum(ro.kg, 1)}</b> kg</span>
              </div>); })()}

          </ProcCard>

          {/* ── CONCILIACIÓN DE MASA + CIERRE FORMAL (T10c-MASA) ── */}
          {(() => {
            const cc = concil;
            const neto = cc ? Number(cc.kg_neto) : km.neto;
            const lotes = cc ? Number(cc.kg_lotes) : km.asignado;
            const dif = cc ? Number(cc.diferencia) : (neto - lotes);
            const tolPct = cc ? Number(cc.tolerancia_pct) : null;
            const tolAbs = cc ? Number(cc.tolerancia_abs) : null;
            const dentro = cc ? cc.dentro_tolerancia : (Math.abs(dif) <= 0.0001);
            const sinLotes = lotes <= 0;
            return (
              <ProcCard style={{ padding: sp.lg, marginTop: sp.md }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: sp.sm }}>Conciliación de masa</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginBottom: sp.md }}>
                  La recepción está en <b>borrador</b>. Finalizala cuando los kilos de los lotes cuadren con el peso neto (dentro de la tolerancia de la empresa). El backend es la autoridad del cierre.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: sp.sm, marginBottom: sp.md }}>
                  <Metrica titulo="Peso neto" valor={`${formatNum(neto, 1)} kg`} />
                  <Metrica titulo="Kg en lotes (ledger)" valor={`${formatNum(lotes, 1)} kg`} />
                  <Metrica titulo="Diferencia" valor={`${dif > 0 ? "+" : ""}${formatNum(dif, 1)} kg`} tono={dentro ? C.success : C.danger} />
                  <Metrica titulo="Tolerancia" valor={tolAbs != null ? `${formatNum(tolAbs, 1)} kg (${formatNum(tolPct, 2)}%)` : "—"} />
                  <Metrica titulo="Estado" valor={dentro ? "Cuadra" : "Descuadre"} tono={dentro ? C.success : C.danger} />
                </div>
                {!dentro && !sinLotes && (
                  <div style={{ color: C.danger, fontSize: 12.5, marginBottom: sp.sm }}>
                    Los kilos de los lotes no cuadran con el peso neto. Corregí o ajustá los lotes antes de finalizar.
                  </div>
                )}
                {sinLotes && <div style={{ color: C.warning, fontSize: 12.5, marginBottom: sp.sm }}>Aún no hay lotes: agregá al menos uno para poder finalizar.</div>}
                <div style={{ display: "flex", gap: sp.sm, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
                  <ProcButton kind="ghost" onClick={() => ir("recepcion_detalle", { id: rec.id })}>Ir al detalle →</ProcButton>
                  <ProcButton onClick={finalizar} disabled={cerrando || sinLotes}>
                    {cerrando ? "Finalizando…" : "Finalizar recepción"}
                  </ProcButton>
                </div>
              </ProcCard>
            );
          })()}
        </>
      )}
    </div>
  );
}
