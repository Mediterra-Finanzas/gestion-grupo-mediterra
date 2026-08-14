/* eslint-disable */
// src/proceso/ui/pages/Despacho.jsx — mesa de despacho (preparación → reserva →
// carga → confirmación de salida física → reversa/cancelación). Backend autoridad:
// reserva = hold; salida = ledger; parcial preserva saldo; reversa restituye.
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import {
  cargarDespachoPorId, cargarDespachoRaw, cargarDespachoLineas, cargarDocsDespacho, cargarBodega,
  cargarVinculosPorRol, actualizarDespacho, cambiarEstadoDespacho, cancelarDespacho,
  reservarPallet, liberarReserva, confirmarDespacho, reversarDespacho, crearDocDespacho, cargarPalletHoldsFolio,
} from "../../core/procesoF7DB";
import { traducirError } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcCard, ProcButton, ProcStatusBadge, ProcDataTable, ProcModal, ProcField, inputStyle,
  ProcKpiCard, ProcAuditInfo, ProcLoadingState, ProcErrorState, ProcEmptyState, ProcConfirmAction,
} from "../components/base";
import { C, sp } from "../estilos";
import { formatKg, formatNum, formatFecha, formatFechaHora, normalizarNombre } from "../format";

const kg = (n) => formatKg(n);
function Dato({ l, v }) { return <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{l}</div><div style={{ fontSize: 14, color: C.text }}>{v ?? "—"}</div></div>; }
function Seccion({ titulo, extra, children }) {
  return <ProcCard style={{ padding: sp.lg, marginBottom: sp.md }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: sp.md, flexWrap: "wrap", gap: sp.sm }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{titulo}</div>{extra}</div>{children}</ProcCard>;
}

export default function Despacho() {
  const { empresa, planta, ir, vista, puedeEditar, notificar } = useService();
  const id = vista?.params?.id;
  const [d, setD] = useState(null); const [raw, setRaw] = useState(null);
  const [lineas, setLineas] = useState([]); const [docs, setDocs] = useState([]);
  const [carga, setCarga] = useState([]); // reservas planificadas {palletId, codigo, kg, cajas}
  const [estado, setEstado] = useState("loading"); const [error, setError] = useState(null);
  const [addPallet, setAddPallet] = useState(null); const [reversa, setReversa] = useState(false); const [cancelar, setCancelar] = useState(false);
  const [docForm, setDocForm] = useState(null);
  const editPerm = puedeEditar("despachos") || puedeEditar("centro");

  const cargar = useCallback(async () => {
    if (!empresa || !id) return;
    setEstado("loading"); setError(null);
    try {
      const [dd, rw, ln, dc] = await Promise.all([
        cargarDespachoPorId(empresa, id), cargarDespachoRaw(empresa, id), cargarDespachoLineas(empresa, id), cargarDocsDespacho(empresa, id),
      ]);
      const dsp = (dd && dd[0]) || null;
      setD(dsp); setRaw((rw && rw[0]) || null); setLineas(ln || []); setDocs(dc || []);
      setEstado("ok");
    } catch (e) { setError(traducirError(e)); setEstado("error"); }
  }, [empresa, id]);
  useEffect(() => { cargar(); }, [cargar]);

  if (estado === "loading") return <ProcLoadingState />;
  if (estado === "error") return <ProcErrorState error={error} onRetry={cargar} />;
  if (!d) return <ProcEmptyState titulo="Despacho no encontrado" />;

  const est = d.estado;
  const terminal = est === "despachado" || est === "cancelado";
  const editableCab = editPerm && ["borrador", "preparando", "listo"].includes(est);
  const puedeCargar = editPerm && ["preparando", "listo"].includes(est);
  const puedeConfirmar = editPerm && ["listo", "cargando"].includes(est);

  const trans = async (nuevo) => { try { await cambiarEstadoDespacho(empresa, id, nuevo); notificar("Estado: " + nuevo); cargar(); } catch (e) { notificar(traducirError(e), "error"); } };
  const guardarCampo = async (campo, valor) => { try { await actualizarDespacho(id, empresa, { [campo]: valor || null }); setRaw((x) => ({ ...x, [campo]: valor })); } catch (e) { notificar(traducirError(e), "error"); } };

  const agregarCarga = async (palletId, codigo, kgv, cajas) => {
    try { await reservarPallet({ empresaId: empresa, despachoId: id, palletId, kg: kgv }); // reserva = hold
      setCarga([...carga, { palletId, codigo, kg: kgv, cajas }]); setAddPallet(null); notificar("Pallet reservado para la carga");
    } catch (e) { notificar(traducirError(e), "error"); }
  };
  const quitarCarga = async (c) => { try { await liberarReserva({ empresaId: empresa, despachoId: id, palletId: c.palletId }); setCarga(carga.filter((x) => x !== c)); notificar("Reserva liberada"); } catch (e) { notificar(traducirError(e), "error"); } };

  const confirmar = async () => {
    if (carga.length === 0) return notificar("Agregá pallets a la carga", "error");
    try {
      const lns = carga.map((c) => ({ pallet_id: c.palletId, pt_id: null, cajas: Number(c.cajas) || 0, kg: Number(c.kg) }));
      await confirmarDespacho({ empresaId: empresa, despachoId: id, lineas: lns });
      notificar("Salida confirmada ✓"); setCarga([]); cargar();
    } catch (e) { notificar(traducirError(e), "error"); }
  };
  const doReversa = async (motivo) => { try { await reversarDespacho({ empresaId: empresa, despachoId: id, motivo }); notificar("Despacho reversado ✓"); setReversa(false); cargar(); } catch (e) { notificar(traducirError(e), "error"); } };
  const doCancelar = async () => { try { await cancelarDespacho({ empresaId: empresa, despachoId: id }); notificar("Despacho cancelado (reservas liberadas)"); setCancelar(false); cargar(); } catch (e) { notificar(traducirError(e), "error"); } };
  const agregarDoc = async () => { try { await crearDocDespacho({ empresa_id: empresa, despacho_id: id, tipo: docForm.tipo, folio: docForm.folio || null }); notificar("Documento agregado"); setDocForm(null); cargar(); } catch (e) { notificar(traducirError(e), "error"); } };

  const totalCargaKg = carga.reduce((a, c) => a + Number(c.kg || 0), 0);
  const totalLinKg = lineas.filter((l) => l.estado === "confirmada").reduce((a, l) => a + Number(l.kg || 0), 0);

  return (
    <div>
      <ProcPageHeader titulo={`Despacho ${d.folio}`} subtitulo="Preparación · carga · salida física"
        acciones={<>
          <ProcButton kind="ghost" onClick={() => ir("despachos")}>← Despachos</ProcButton>
          {editPerm && est === "borrador" && <ProcButton onClick={() => trans("preparando")}>Preparar</ProcButton>}
          {editPerm && est === "preparando" && <ProcButton onClick={() => trans("listo")}>Marcar listo</ProcButton>}
          {puedeConfirmar && <ProcButton kind="success" onClick={confirmar}>Confirmar salida</ProcButton>}
          {editPerm && !terminal && <ProcButton kind="danger" onClick={() => setCancelar(true)}>Cancelar</ProcButton>}
          {editPerm && est === "despachado" && <ProcButton kind="danger" onClick={() => setReversa(true)}>Reversar</ProcButton>}
        </>} />

      <Seccion titulo="Cabecera" extra={<ProcStatusBadge estado={est} />}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: sp.md }}>
          <Dato l="Folio" v={d.folio} /><Dato l="Cliente" v={normalizarNombre(d.cliente)} /><Dato l="Destinatario" v={normalizarNombre(d.destinatario)} />
          <Dato l="Pallets" v={d.pallets} /><Dato l="Kg despachado" v={kg(d.kg)} />
        </div>
        {terminal && <div style={{ marginTop: sp.sm, color: C.muted, fontSize: 12.5 }}>Despacho en estado terminal: solo lectura.</div>}
      </Seccion>

      <Seccion titulo="Transporte y destinatario">
        {editableCab ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: sp.md }}>
            <ProcField label="Patente"><input style={inputStyle} defaultValue={raw?.vehiculo_patente || ""} onBlur={(e) => guardarCampo("vehiculo_patente", e.target.value)} /></ProcField>
            <ProcField label="Conductor"><input style={inputStyle} defaultValue={raw?.conductor || ""} onBlur={(e) => guardarCampo("conductor", e.target.value)} /></ProcField>
            <ProcField label="Fecha prevista"><input style={inputStyle} type="date" defaultValue={raw?.fecha_prevista ? raw.fecha_prevista.slice(0, 10) : ""} onBlur={(e) => guardarCampo("fecha_prevista", e.target.value || null)} /></ProcField>
            <ProcField label="Destino (texto)"><input style={inputStyle} defaultValue={raw?.destino_texto || ""} onBlur={(e) => guardarCampo("destino_texto", e.target.value)} /></ProcField>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: sp.md }}>
            <Dato l="Transportista" v={d.transportista} /><Dato l="Patente" v={d.vehiculo_patente} /><Dato l="Conductor" v={d.conductor} />
            <Dato l="Fecha efectiva" v={d.fecha_efectiva ? formatFechaHora(d.fecha_efectiva) : "—"} />
          </div>
        )}
      </Seccion>

      {puedeCargar && (
        <Seccion titulo={`Carga (reservada: ${carga.length})`} extra={<ProcButton onClick={() => setAddPallet(true)}>+ Agregar pallet</ProcButton>}>
          <ProcDataTable
            columnas={[
              { titulo: "Pallet", render: (c) => <b>{c.codigo}</b> },
              { titulo: "Cajas", align: "right", render: (c) => c.cajas || 0 },
              { titulo: "Kg", align: "right", render: (c) => kg(c.kg) },
              { titulo: "", align: "right", render: (c) => <ProcButton kind="ghost" small onClick={() => quitarCarga(c)}>Quitar</ProcButton> },
            ]}
            filas={carga} rowKey="palletId"
            vacio={<ProcEmptyState icono="🧺" titulo="Carga vacía" detalle="Reservá pallets para esta salida (reserva = hold, no cambia stock físico)." />} />
          {carga.length > 0 && <div style={{ marginTop: sp.sm, fontSize: 13, color: C.muted }}>Total carga: <b>{kg(totalCargaKg)}</b> · confirmá para generar la salida física.</div>}
        </Seccion>
      )}

      <Seccion titulo={`Líneas confirmadas (${lineas.length}) · total ${kg(totalLinKg)}`}>
        <ProcDataTable
          columnas={[
            { titulo: "Pallet", render: (l) => <ProcButton kind="ghost" small onClick={() => ir("pallet_detalle", { id: l.pallet_id })}>{l.pallet_codigo} →</ProcButton> },
            { titulo: "Cajas", align: "right", campo: "cajas" }, { titulo: "Kg", align: "right", render: (l) => kg(l.kg) },
            { titulo: "Ubicación origen", campo: "ubicacion_origen" },
            { titulo: "Estado", render: (l) => <ProcStatusBadge texto={l.estado} tono={l.estado === "reversada" ? "danger" : "success"} /> },
          ]}
          filas={lineas} rowKey="id"
          vacio={<ProcEmptyState icono="📤" titulo="Sin salidas confirmadas" detalle="Al confirmar, cada línea queda ligada a un movimiento de salida (ledger)." />} />
      </Seccion>

      <Seccion titulo={`Documentos (${docs.length})`} extra={editableCab ? <ProcButton kind="ghost" small onClick={() => setDocForm({ tipo: "guia", folio: "" })}>+ Documento</ProcButton> : null}>
        <ProcDataTable columnas={[{ titulo: "Tipo", campo: "tipo" }, { titulo: "Folio", campo: "folio" }, { titulo: "Fecha", render: (x) => formatFecha(x.fecha || x.created_at) }]}
          filas={docs} rowKey="id" vacio={<ProcEmptyState titulo="Sin documentos" detalle="Guía de despacho / documento interno / referencia externa." />} />
      </Seccion>

      <Seccion titulo="Auditoría"><ProcAuditInfo registro={raw} /></Seccion>

      {addPallet && <SelectorPalletCarga empresa={empresa} planta={planta} onClose={() => setAddPallet(null)} onAdd={agregarCarga} />}
      {reversa && <ProcConfirmAction titulo="Reversar despacho" mensaje="Se restituye el stock (contramovimiento), la línea original queda 'reversada' y el despacho conserva su historia. Exige motivo." textoConfirm="Reversar"
        onConfirm={() => { const m = prompt("Motivo de la reversa:"); if (m) doReversa(m); }} onCancel={() => setReversa(false)} />}
      {cancelar && <ProcConfirmAction titulo="Cancelar despacho" mensaje="Se liberan las reservas activas y el despacho queda cancelado. No genera salida física." textoConfirm="Cancelar despacho"
        onConfirm={doCancelar} onCancel={() => setCancelar(false)} />}
      {docForm && (
        <ProcModal titulo="Agregar documento" onClose={() => setDocForm(null)}
          acciones={<><ProcButton kind="ghost" onClick={() => setDocForm(null)}>Cancelar</ProcButton><ProcButton onClick={agregarDoc}>Agregar</ProcButton></>}>
          <ProcField label="Tipo"><select style={inputStyle} value={docForm.tipo} onChange={(e) => setDocForm((x) => ({ ...x, tipo: e.target.value }))}><option value="guia">Guía de despacho</option><option value="interno">Documento interno</option><option value="referencia">Referencia externa</option></select></ProcField>
          <ProcField label="Folio / referencia"><input style={inputStyle} value={docForm.folio} onChange={(e) => setDocForm((x) => ({ ...x, folio: e.target.value }))} /></ProcField>
        </ProcModal>
      )}
    </div>
  );
}

// Selector de pallets despachables (disponible > 0). El bloqueado no se puede cargar.
function SelectorPalletCarga({ empresa, planta, onClose, onAdd }) {
  const [rows, setRows] = useState(null);
  const [sel, setSel] = useState(null); const [kgv, setKgv] = useState(""); const [cajas, setCajas] = useState("");
  useEffect(() => { cargarBodega(empresa, planta ? `&planta_id=eq.${planta}` : "").then((r) => setRows((r || []).filter((p) => Number(p.disponible) > 0))).catch(() => setRows([])); }, [empresa, planta]);
  return (
    <ProcModal titulo="Agregar pallet a la carga" onClose={onClose} ancho={640}
      acciones={<><ProcButton kind="ghost" onClick={onClose}>Cerrar</ProcButton>
        <ProcButton disabled={!sel || !(Number(kgv) > 0)} onClick={() => onAdd(sel.pallet_id, sel.codigo, Number(kgv), Number(cajas) || 0)}>Reservar y agregar</ProcButton></>}>
      {rows == null ? <ProcLoadingState /> : rows.length === 0 ? <ProcEmptyState icono="🏬" titulo="Sin pallets disponibles" detalle="No hay pallets con saldo libre en esta planta." /> : (
        <div>
          <div style={{ maxHeight: 300, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 8 }}>
            {rows.map((p) => (
              <div key={p.pallet_id} onClick={() => { setSel(p); setKgv(String(p.disponible)); }} style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", borderBottom: `1px solid ${C.border}`, cursor: "pointer", background: sel?.pallet_id === p.pallet_id ? C.infoBg : C.card }}>
                <span><b>{p.codigo}</b> <span style={{ color: C.muted, fontSize: 12 }}>· {p.especie_codigo} · {p.ubicacion || "—"} · libre {kg(p.disponible)}{Number(p.bloqueado) > 0 ? ` · bloq ${kg(p.bloqueado)}` : ""}</span></span>
                <ProcStatusBadge estado={p.estado} />
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: sp.sm, marginTop: sp.md }}>
            <ProcField label="Kg a despachar"><input style={inputStyle} type="number" value={kgv} onChange={(e) => setKgv(e.target.value)} /></ProcField>
            <ProcField label="Cajas"><input style={inputStyle} type="number" value={cajas} onChange={(e) => setCajas(e.target.value)} /></ProcField>
          </div>
          <div style={{ fontSize: 11.5, color: C.muted2, marginTop: 4 }}>Solo el saldo libre puede reservarse/despacharse; el backend rechaza el bloqueado y cualquier exceso.</div>
        </div>
      )}
    </ProcModal>
  );
}
