/* eslint-disable */
// src/proceso/ui/pages/PesajeRecepcion.jsx — MG-003
// Registrar una PESADA con 1..N BINS para una recepción. INVARIANTE: PESADA ≠ BIN ≠ LOTE.
// · Una pesada agrupa varios bins; el kg individual del bin es OPCIONAL (puede quedar
//   sin peso). NO hay reparto automático: el reparto es una acción explícita del operador.
// · Conciliación de masa en vivo (preview UX); la DB (vistas + triggers) es la autoridad.
import React, { useEffect, useMemo, useState } from "react";
import { useService } from "../hooks/useServiceContext";
import { cargarRecepcionPorId } from "../../core/procesoF7DB";
import {
  cargarPesajesDeRecepcion, cargarBinsDeRecepcion, registrarPesaje,
} from "../../core/procesoMg003DB";
import {
  netoPesada, validarPesada, validarBins, conciliarPesadaBins, repartirBins,
  massBalanceRecepcion, resumenBins, METODOS_REPARTO, kg3,
} from "../../core/procesoMg003Domain";
import {
  ProcPageHeader, ProcCard, ProcButton, ProcField, inputStyle, ProcStatusBadge,
  ProcEmptyState, ProcDataTable,
} from "../components/base";
import { C, sp } from "../estilos";
import { formatNum } from "../format";

const BIN0 = () => ({ codigo: "", envase_codigo: "", envase_propiedad: "propio", n_envases: 1, tara_envase: "", peso_bruto: "", peso_neto: "", condicion: "ok" });
const PESAJE0 = () => ({ folio_pesaje: "", balanza: "", captura: "bruto_tara", peso_documental: "", peso_bruto: "", tara: "", peso_neto: "", n_bins_declarado: "", metodo_reparto: "sin_reparto", destino_frio: "" });

function Metrica({ titulo, valor, tono }) {
  return (
    <div style={{ padding: "8px 12px", background: C.cardAlt, borderRadius: 8 }}>
      <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: .3 }}>{titulo}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: tono || C.text }}>{valor}</div>
    </div>
  );
}

export default function PesajeRecepcion() {
  const { empresa, ir, vista, notificar, usuario, puedeEditar } = useService();
  const recepcionId = vista?.params?.recepcion_id || vista?.params?.id || null;
  const editable = puedeEditar("recepciones") || puedeEditar("centro");

  const [rec, setRec] = useState(null);
  const [pesadas, setPesadas] = useState([]);
  const [binsRec, setBinsRec] = useState([]);
  const [p, setP] = useState(PESAJE0);
  const [bins, setBins] = useState([BIN0()]);
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    if (!empresa || !recepcionId) return;
    try {
      const [r, ps, bs] = await Promise.all([
        cargarRecepcionPorId(empresa, recepcionId),
        cargarPesajesDeRecepcion(empresa, recepcionId),
        cargarBinsDeRecepcion(empresa, recepcionId),
      ]);
      setRec(Array.isArray(r) ? r[0] : r);
      setPesadas(ps || []);
      setBinsRec(bs || []);
    } catch (e) { notificar && notificar("No se pudieron cargar las pesadas", "error"); }
  };
  useEffect(() => { cargar(); }, [empresa, recepcionId]); // eslint-disable-line

  const setPf = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const setBin = (i, k, v) => setBins((arr) => arr.map((b, j) => (j === i ? { ...b, [k]: v } : b)));
  const addBin = () => setBins((arr) => [...arr, BIN0()]);
  const delBin = (i) => setBins((arr) => (arr.length > 1 ? arr.filter((_, j) => j !== i) : arr));

  // neto de la pesada (derivado si captura bruto_tara y hay neto vacío)
  const netoP = p.peso_neto !== "" ? kg3(Number(p.peso_neto)) : netoPesada(p);
  const vp = validarPesada({ ...p, peso_neto: p.peso_neto === "" ? undefined : p.peso_neto });
  const vb = validarBins(bins.map((b) => ({ ...b, peso_neto: b.peso_neto === "" ? undefined : b.peso_neto })));
  const concil = useMemo(() => conciliarPesadaBins(
    { ...p, peso_neto: netoP },
    bins.map((b) => ({ ...b, peso_neto: b.peso_neto === "" ? undefined : Number(b.peso_neto) })),
  ), [p, bins, netoP]);
  const resumen = resumenBins(bins.map((b) => ({ ...b, peso_neto: b.peso_neto === "" ? undefined : Number(b.peso_neto) })));

  // Reparto EXPLÍCITO (decisión del operador). Con 'sin_reparto' no hace nada.
  const aplicarReparto = () => {
    if (p.metodo_reparto === "sin_reparto") return notificar && notificar("Método 'sin reparto': los bins mantienen su kg (o quedan sin peso).", "info");
    if (!(netoP > 0)) return notificar && notificar("Cargá primero el neto de la pesada.", "error");
    const out = repartirBins({ ...p, peso_neto: netoP }, bins.map((b) => ({ ...b, tara_envase: Number(b.tara_envase) || 0, n_envases: Number(b.n_envases) || 1 })), p.metodo_reparto);
    setBins((arr) => arr.map((b, i) => ({ ...b, peso_neto: out[i] && out[i].peso_neto != null ? out[i].peso_neto : b.peso_neto })));
    notificar && notificar(`Kilos repartidos por ${p.metodo_reparto} (editable antes de guardar).`);
  };

  const guardar = async () => {
    if (!vp.ok) return notificar && notificar(vp.errores[0], "error");
    if (!vb.ok) return notificar && notificar(vb.errores[0], "error");
    setGuardando(true);
    try {
      const pesajePayload = {
        folio_pesaje: p.folio_pesaje || null, balanza: p.balanza || null, captura: p.captura,
        peso_documental: p.peso_documental === "" ? null : Number(p.peso_documental),
        peso_bruto: p.peso_bruto === "" ? null : Number(p.peso_bruto),
        tara: p.tara === "" ? null : Number(p.tara),
        peso_neto: p.peso_neto === "" ? null : Number(p.peso_neto),
        n_bins_declarado: p.n_bins_declarado === "" ? null : Number(p.n_bins_declarado),
        metodo_reparto: p.metodo_reparto, destino_frio: p.destino_frio || null,
      };
      const binsPayload = bins.map((b) => ({
        codigo: b.codigo || null, envase_codigo: b.envase_codigo || null,
        envase_propiedad: b.envase_propiedad, n_envases: Number(b.n_envases) || 1,
        tara_envase: b.tara_envase === "" ? null : Number(b.tara_envase),
        peso_bruto: b.peso_bruto === "" ? null : Number(b.peso_bruto),
        peso_neto: b.peso_neto === "" ? null : Number(b.peso_neto),   // null = sin peso (NO auto-split)
        condicion: b.condicion,
      }));
      await registrarPesaje({ empresaId: empresa, recepcionId, pesaje: pesajePayload, bins: binsPayload, actor: usuario?.id || null });
      notificar && notificar(`Pesada registrada con ${bins.length} bin(s).`);
      setP(PESAJE0()); setBins([BIN0()]);
      cargar();
    } catch (e) { notificar && notificar(String(e && e.message || e), "error"); }
    finally { setGuardando(false); }
  };

  if (!empresa) return <div><ProcPageHeader titulo="Pesajes" /><ProcCard style={{ padding: sp.lg }}><ProcEmptyState icono="⚖️" titulo="Seleccioná un tenant" /></ProcCard></div>;
  if (!recepcionId) return <div><ProcPageHeader titulo="Pesajes" /><ProcCard style={{ padding: sp.lg }}><ProcEmptyState icono="⚖️" titulo="Falta la recepción" detalle="Abrí los pesajes desde una recepción." /></ProcCard></div>;

  const tonoConcil = concil.estado === "cuadra" ? C.success : concil.estado === "descuadra" ? C.danger : C.warning;
  const mbRec = massBalanceRecepcion(rec?.kg_neto || 0, pesadas);

  return (
    <div>
      <ProcPageHeader titulo={`Pesajes · Recepción ${rec?.folio || ""}`}
        subtitulo="Una pesada agrupa 1..N bins. El kg del bin es opcional; no hay reparto automático."
        acciones={<ProcButton kind="ghost" onClick={() => ir("recepcion_detalle", { id: recepcionId })}>← Recepción</ProcButton>} />

      {/* Balance de la recepción (Σ pesadas vs neto de cabecera) */}
      <ProcCard style={{ padding: sp.lg, marginBottom: sp.md }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: sp.sm }}>Balance de la recepción</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: sp.sm }}>
          <Metrica titulo="Kg neto cabecera" valor={`${formatNum(rec?.kg_neto || 0, 1)} kg`} />
          <Metrica titulo="Σ neto pesadas" valor={`${formatNum(mbRec.sumNetoPesadas, 1)} kg`} />
          <Metrica titulo="Diferencia" valor={`${mbRec.diferencia > 0 ? "+" : ""}${formatNum(mbRec.diferencia, 1)} kg`} tono={mbRec.ok ? C.success : C.danger} />
          <Metrica titulo="Pesadas" valor={pesadas.length} />
          <Metrica titulo="Bins totales" valor={binsRec.length} />
        </div>
      </ProcCard>

      {/* Pesadas ya registradas */}
      <ProcCard style={{ padding: sp.lg, marginBottom: sp.md }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: sp.sm }}>Pesadas registradas ({pesadas.length})</div>
        <ProcDataTable
          columnas={[
            { titulo: "#", render: (x) => x.secuencia },
            { titulo: "Folio romana", render: (x) => x.folio_pesaje || "—" },
            { titulo: "Captura", render: (x) => x.captura },
            { titulo: "Bruto", align: "right", render: (x) => formatNum(x.peso_bruto, 1) },
            { titulo: "Tara", align: "right", render: (x) => formatNum(x.tara, 1) },
            { titulo: "Neto", align: "right", render: (x) => <b>{formatNum(x.peso_neto, 1)}</b> },
            { titulo: "Bins", align: "right", render: (x) => binsRec.filter((b) => b.pesaje_id === x.id).length },
            { titulo: "Reparto", render: (x) => x.metodo_reparto },
            { titulo: "Estado", render: (x) => <ProcStatusBadge estado={x.estado} /> },
          ]}
          filas={pesadas} rowKey="id"
          vacio={<ProcEmptyState icono="⚖️" titulo="Sin pesadas" detalle="Registrá la primera pesada abajo." />} />
      </ProcCard>

      {!editable ? (
        <ProcCard style={{ padding: sp.lg }}><ProcEmptyState titulo="Solo lectura" detalle="No tenés permiso para registrar pesadas." /></ProcCard>
      ) : (
        <ProcCard style={{ padding: sp.lg }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: sp.md }}>Nueva pesada</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: sp.sm, marginBottom: sp.md }}>
            <ProcField label="Folio romana"><input style={inputStyle} value={p.folio_pesaje} onChange={(e) => setPf("folio_pesaje", e.target.value)} /></ProcField>
            <ProcField label="Balanza"><input style={inputStyle} value={p.balanza} onChange={(e) => setPf("balanza", e.target.value)} /></ProcField>
            <ProcField label="Captura">
              <select style={inputStyle} value={p.captura} onChange={(e) => setPf("captura", e.target.value)}>
                <option value="bruto_tara">bruto − tara</option>
                <option value="neto_directo">neto directo</option>
                <option value="documental">documental</option>
              </select>
            </ProcField>
            <ProcField label="Peso documental"><input style={inputStyle} type="number" value={p.peso_documental} onChange={(e) => setPf("peso_documental", e.target.value)} /></ProcField>
            <ProcField label="Peso bruto (físico)"><input style={inputStyle} type="number" value={p.peso_bruto} onChange={(e) => setPf("peso_bruto", e.target.value)} /></ProcField>
            <ProcField label="Tara total"><input style={inputStyle} type="number" value={p.tara} onChange={(e) => setPf("tara", e.target.value)} /></ProcField>
            <ProcField label="Peso neto" hint={p.captura === "bruto_tara" ? `derivado: ${formatNum(netoPesada(p), 1)}` : undefined}>
              <input style={inputStyle} type="number" value={p.peso_neto} placeholder={p.captura === "bruto_tara" ? String(netoPesada(p)) : ""} onChange={(e) => setPf("peso_neto", e.target.value)} />
            </ProcField>
            <ProcField label="N° bins declarado" hint="concilia con los bins reales"><input style={inputStyle} type="number" value={p.n_bins_declarado} onChange={(e) => setPf("n_bins_declarado", e.target.value)} /></ProcField>
            <ProcField label="Destino frío" hint="Frigorífico (semántica pendiente)"><input style={inputStyle} value={p.destino_frio} onChange={(e) => setPf("destino_frio", e.target.value)} /></ProcField>
          </div>
          {!vp.ok && <div style={{ color: C.danger, fontSize: 12.5, marginBottom: sp.sm }}>{vp.errores.join(" ")}</div>}

          {/* BINS (1..N) */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: sp.sm }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>Bins de la pesada ({bins.length})</div>
            <div style={{ display: "flex", gap: sp.sm, alignItems: "center", flexWrap: "wrap" }}>
              <select style={{ ...inputStyle, width: "auto" }} value={p.metodo_reparto} onChange={(e) => setPf("metodo_reparto", e.target.value)}>
                {METODOS_REPARTO.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <ProcButton kind="ghost" small onClick={aplicarReparto}>Repartir kg</ProcButton>
              <ProcButton small onClick={addBin}>+ Bin</ProcButton>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, marginBottom: sp.sm }}>
            El kg del bin es opcional. Con "sin_reparto" los bins pueden quedar sin peso individual (la pesada mantiene su neto). No hay reparto automático.
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: C.muted, textAlign: "left" }}>
                  <th style={{ padding: 4 }}>Código</th><th style={{ padding: 4 }}>Envase</th><th style={{ padding: 4 }}>Propiedad</th>
                  <th style={{ padding: 4 }}>N° env.</th><th style={{ padding: 4 }}>Tara env.</th><th style={{ padding: 4 }}>Bruto</th>
                  <th style={{ padding: 4 }}>Neto</th><th style={{ padding: 4 }}>Condición</th><th></th>
                </tr>
              </thead>
              <tbody>
                {bins.map((b, i) => (
                  <tr key={i}>
                    <td style={{ padding: 3 }}><input style={{ ...inputStyle, minWidth: 80 }} value={b.codigo} onChange={(e) => setBin(i, "codigo", e.target.value)} /></td>
                    <td style={{ padding: 3 }}><input style={{ ...inputStyle, minWidth: 80 }} value={b.envase_codigo} onChange={(e) => setBin(i, "envase_codigo", e.target.value)} /></td>
                    <td style={{ padding: 3 }}>
                      <select style={{ ...inputStyle, minWidth: 90 }} value={b.envase_propiedad} onChange={(e) => setBin(i, "envase_propiedad", e.target.value)}>
                        <option value="propio">propio</option><option value="terceros">terceros</option><option value="cliente">cliente</option>
                      </select>
                    </td>
                    <td style={{ padding: 3 }}><input style={{ ...inputStyle, width: 60 }} type="number" value={b.n_envases} onChange={(e) => setBin(i, "n_envases", e.target.value)} /></td>
                    <td style={{ padding: 3 }}><input style={{ ...inputStyle, width: 80 }} type="number" value={b.tara_envase} onChange={(e) => setBin(i, "tara_envase", e.target.value)} /></td>
                    <td style={{ padding: 3 }}><input style={{ ...inputStyle, width: 90 }} type="number" value={b.peso_bruto} onChange={(e) => setBin(i, "peso_bruto", e.target.value)} /></td>
                    <td style={{ padding: 3 }}><input style={{ ...inputStyle, width: 90 }} type="number" value={b.peso_neto} placeholder="opcional" onChange={(e) => setBin(i, "peso_neto", e.target.value)} /></td>
                    <td style={{ padding: 3 }}>
                      <select style={{ ...inputStyle, minWidth: 80 }} value={b.condicion} onChange={(e) => setBin(i, "condicion", e.target.value)}>
                        <option value="ok">ok</option><option value="dañado">dañado</option>
                      </select>
                    </td>
                    <td style={{ padding: 3 }}><ProcButton kind="ghost" small onClick={() => delBin(i)} disabled={bins.length <= 1}>✕</ProcButton></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!vb.ok && <div style={{ color: C.danger, fontSize: 12.5, marginTop: sp.sm }}>{vb.errores.join(" ")}</div>}

          {/* Conciliación en vivo pesada ↔ bins */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: sp.sm, marginTop: sp.md, marginBottom: sp.md }}>
            <Metrica titulo="Neto pesada" valor={`${formatNum(concil.netoPesada, 1)} kg`} />
            <Metrica titulo="Σ bins medidos" valor={`${formatNum(concil.sumNetoBins, 1)} kg`} />
            <Metrica titulo="Bins sin peso" valor={concil.binsSinPeso} tono={concil.binsSinPeso > 0 ? C.warning : C.text} />
            <Metrica titulo="Diferencia" valor={`${concil.diferencia > 0 ? "+" : ""}${formatNum(concil.diferencia, 1)} kg`} tono={tonoConcil} />
            <Metrica titulo="Conteo" valor={concil.conteoOk ? "OK" : "no cuadra"} tono={concil.conteoOk ? C.success : C.danger} />
            <Metrica titulo="Estado" valor={concil.estado} tono={tonoConcil} />
          </div>
          {concil.estado === "parcial" && <div style={{ color: C.warning, fontSize: 12.5, marginBottom: sp.sm }}>Conciliación parcial: hay bins sin peso individual. Es válido guardar así; el neto de la pesada es la autoridad.</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: sp.sm }}>
            <ProcButton onClick={guardar} disabled={guardando || !vp.ok || !vb.ok}>{guardando ? "Guardando…" : "Registrar pesada"}</ProcButton>
          </div>
        </ProcCard>
      )}
    </div>
  );
}
