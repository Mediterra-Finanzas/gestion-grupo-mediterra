/* eslint-disable */
// Paquete A — evidencia antes/después sobre el corte de PRODUCCIÓN.
//
// Sólo lectura: abre el archivo del corte, no toca red ni Supabase. Si el
// archivo no está en la máquina, la prueba se salta en vez de fallar, porque
// el corte contiene datos de clientes y NO se sube al repositorio.
//
// Corte: 2026-10-20 11:58 UTC · sha256 48085f5b… · 250.420 bytes
// Código base: 1bc5c447748e97adda3c37ee9ca38029e7695a69 (lo que sirve Production)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// La ruta por omision es la del equipo donde se tomo el corte. Para correr
// esta evidencia en otra maquina: CORTE_OSIRIS=/ruta/al/osiris_prod.json
// El archivo NO se versiona: tiene datos de clientes.
const CORTE = process.env.CORTE_OSIRIS ||
  "C:/Users/angel/AppData/Local/Temp/claude/" +
  "C--Users-angel-Documents-Proyectos-gestion-grupo-mediterra/" +
  "ae9c81ee-b041-4709-afca-6c18f7e42435/scratchpad/osiris-dx/osiris_prod.json";
const SHA_ESPERADO = "48085f5bedffa6cb02f694b00d05d144c2cc9cb7efab611e465c6303e1d597c7";

const hay = fs.existsSync(CORTE);
const D = hay ? describe : describe.skip;

const N = (x) => Number(x) || 0;
const d2 = (x) => x.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const d0 = (x) => Math.round(x).toLocaleString("es-CL");

D("Paquete A · evidencia contra el corte de producción", () => {
  let v, ctData, ocsByCt, todasOCs, tp, rp, rc, feData, fvData;
  let añoDeFechaTexto, haDeFila, conciliarUniversos, nivelesCobroOC, puentePendiente;
  let retFactorFila;   // el de produccion, no una copia
  const L = [];
  const di = (s) => L.push(s);

  beforeAll(() => {
    const pa = require("./paqueteA");
    añoDeFechaTexto = pa.añoDeFechaTexto;
    haDeFila = pa.haDeFila;
    conciliarUniversos = pa.conciliarUniversos;
    nivelesCobroOC = pa.nivelesCobroOC;
    puentePendiente = pa.puentePendiente;

    const os = require("../OsirisModule.jsx");
    const { resolverAtribucionOC } = require("./preservacion");
    // El factor de retencion con el que la pantalla calcula `totPend`. Se
    // importa en vez de reescribirse: si se reescribe, la comparacion
    // antes/despues se vuelve autorreferencial justo donde importa.
    retFactorFila = require("./retencion").factorNetoFila;

    v = JSON.parse(fs.readFileSync(CORTE, "utf8"));
    ctData = v.contratos || [];
    todasOCs = [];
    (v.viveros || []).forEach((vi) => (vi.ordenesCompra || []).forEach((oc) => todasOCs.push({ ...oc, _viveroId: vi.id })));
    ocsByCt = {};
    ctData.forEach((ct) => {
      const o = todasOCs.filter((x) => resolverAtribucionOC(x, ctData).contratoId === ct.id);
      if (o.length) ocsByCt[ct.id] = o;
    });
    tp = os.derivarTotalPedidosDesdeContratos(ctData);
    rp = os.derivarRoyaltyPlantaDesdeContratos(ctData, ocsByCt);
    rc = os.derivarRoyaltyComercialDesdeContratos(ctData, ocsByCt);
    // feData tal como lo arma el módulo: una fila por contrato con contract fee,
    // leyendo sólo la fila guardada `feeEntrada` (nunca ct.contractFeePagado).
    const guardadas = {};
    (v.feeEntrada || []).forEach((r) => { if (r.ctId) guardadas[r.ctId] = r; guardadas[r.id] = r; });
    feData = ctData
      .filter((ct) => ct.tipoContractFee && ct.tipoContractFee !== "Sin Contract Fee")
      .map((ct) => {
        const s = guardadas[ct.id] || guardadas[`fe_${ct.id}`] || {};
        return {
          ctId: ct.id,
          montoUSD: s.montoUSD != null ? s.montoUSD : (ct.montoContractFee || 30000),
          nFact: s.nFact ?? "",
          pagado: s.pagado ?? false,
          fechaPago: s.fechaPago ?? "",
        };
      });
    fvData = [];
  });

  afterAll(() => {
    const salida = path.join(path.dirname(CORTE), "salida_paquete_a.txt");
    try { fs.writeFileSync(salida, L.join("\n"), "utf8"); } catch (e) {}
    console.log(L.join("\n"));
  });

  test("el corte es el que dice la procedencia", () => {
    const buf = fs.readFileSync(CORTE);
    const sha = crypto.createHash("sha256").update(buf).digest("hex");
    di("");
    di("corte  : " + CORTE);
    di("bytes  : " + buf.length.toLocaleString("es-CL"));
    di("sha256 : " + sha);
    expect(sha).toBe(SHA_ESPERADO);
    expect(buf.length).toBe(250420);
  });

  // ── A1 ──────────────────────────────────────────────────────────
  test("A1 · el año deja de correrse, y sólo cambian los años", () => {
    const antes = {}, despues = {};
    const movidas = [];
    tp.forEach((r) => {
      const aA = r.fechaPlantacion ? new Date(r.fechaPlantacion).getFullYear() : null;
      const aD = r.fechaPlantacion ? añoDeFechaTexto(r.fechaPlantacion) : null;
      const kA = aA || "?", kD = aD || "?";
      antes[kA] = (antes[kA] || 0) + N(r.nPlantas);
      despues[kD] = (despues[kD] || 0) + N(r.nPlantas);
      if (aA !== aD) movidas.push({ fecha: r.fechaPlantacion, plantas: N(r.nPlantas), de: aA, a: aD, cliente: r.cliente });
    });

    di("");
    di("=== A1 · plantas por año ===");
    di("");
    di("  año        ANTES        DESPUES    cambio");
    [...new Set([...Object.keys(antes), ...Object.keys(despues)])].sort().forEach((k) => {
      const a = antes[k] || 0, d = despues[k] || 0;
      di("  " + String(k).padEnd(6) + d0(a).padStart(12) + d0(d).padStart(14) +
         (a === d ? "         =" : ("  " + (d - a > 0 ? "+" : "") + d0(d - a)).padStart(12)));
    });
    di("");
    di("  filas que cambian de año: " + movidas.length);
    movidas.forEach((m) => di("    " + m.fecha + "  " + d0(m.plantas).padStart(10) + " plantas  " + m.de + " -> " + m.a + "  " + (m.cliente || "")));
    di("");
    di("  total de plantas: ANTES " + d0(Object.values(antes).reduce((s, x) => s + x, 0)) +
       "   DESPUES " + d0(Object.values(despues).reduce((s, x) => s + x, 0)) + "   (no debe cambiar)");

    // el total no se mueve: sólo cambia a qué año se imputa
    expect(Object.values(despues).reduce((s, x) => s + x, 0))
      .toBe(Object.values(antes).reduce((s, x) => s + x, 0));
    // y las únicas fechas que se mueven son las de 1 de enero
    movidas.forEach((m) => expect(m.fecha.slice(5)).toBe("01-01"));
  });

  // ── A2 ──────────────────────────────────────────────────────────
  test("A2 · la conciliación entrega todas las filas y la suma es reproducible", () => {
    const c = conciliarUniversos(ctData, tp, rp);

    di("");
    di("=== A2 · conciliación de universos, TODAS las filas ===");
    di("");
    di("  universo A = 1 fila por PLANTACION registrada      -> " + tp.length + " filas");
    di("  universo B = 1 fila por TANDA o DESPACHO facturable -> " + rp.length + " filas");
    di("");
    di("  contrato                      universo A    universo B    diferencia   origen de B");
    [...c.filas].sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia)).forEach((f) => {
      di("  " + String(f.cliente || f.ctId).slice(0, 28).padEnd(29) +
         d0(f.universoA).padStart(11) + d0(f.universoB).padStart(14) +
         (f.diferencia === 0 ? "            —" : ((f.diferencia > 0 ? "+" : "") + d0(f.diferencia)).padStart(13)) +
         "   " + f.origenB);
    });
    di("  " + "".padEnd(29) + "-".repeat(38));
    di("  " + "TOTAL".padEnd(29) + d0(c.totalA).padStart(11) + d0(c.totalB).padStart(14) +
       ((c.sumaDiferencias > 0 ? "+" : "") + d0(c.sumaDiferencias)).padStart(13));
    di("");
    di("  filas entregadas            : " + c.filas.length);
    di("  filas con diferencia        : " + c.conDiferencia);
    di("  filas con diferencia cero   : " + (c.filas.length - c.conDiferencia));
    di("  suma de filas == totalB-totalA : " + (c.cuadra ? "SI" : "NO"));
    di("  contratos que facturan sin plantación registrada: " + c.soloB.length +
       " (" + c.soloB.map((f) => f.cliente).join(", ") + ")");

    // el control real: lo conciliado mas lo excluido reconstruye el total que
    // muestran los indicadores de la pantalla
    expect(c.cuadra).toBe(true);
    expect(c.totalTodasA).toBe(tp.reduce((s, r) => s + N(r.nPlantas), 0));
    expect(c.totalTodasB).toBe(rp.reduce((s, r) => s + N(r.nPlantas), 0));
    expect(c.totalA + c.plantasFueraA).toBe(c.totalTodasA);
    expect(c.totalB + c.plantasFueraB).toBe(c.totalTodasB);
    // y los denominadores del aviso son las filas efectivamente conciliadas
    expect(c.filasA + c.excluidasA).toBe(tp.length);
    expect(c.filasB + c.excluidasB).toBe(rp.length);
    // la suma de la columna, recalculada aparte desde los contratos
    const sumaIndep = c.filas.reduce((s, f) => s + (f.universoB - f.universoA), 0);
    expect(sumaIndep).toBe(c.sumaDiferencias);
  });

  // ── A3 ──────────────────────────────────────────────────────────
  test("A3 · estado declarado, documento registrado y pago verificado", () => {
    const biot = (v.viveros || []).find((x) => /BIOTECNOS/i.test(x.viverista || "")) || (v.viveros || [])[0];
    const ocs = biot.ordenesCompra || [];
    const n = nivelesCobroOC(ocs);

    // "antes": un solo número, rotulado Cobrado
    const cobradoAntes = ocs.reduce((s, o) => {
      if (o.estado_oc === "Anulada") return s;
      const fee = N(o.fee_total_usd);
      const cp = (o.cuotas || []).filter((c) => c.pagado).reduce((ss, c) => ss + N(c.monto_usd), 0);
      return s + (o.estado_oc === "Pagada total" ? Math.max(fee, cp) : cp);
    }, 0);

    di("");
    di("=== A3 · de dónde sale el cobro de las OC (" + biot.viverista + ", " + ocs.length + " OC) ===");
    di("");
    di("  ANTES    Cobrado                        " + d2(cobradoAntes).padStart(16));
    di("");
    di("  DESPUES  Declarado por estado           " + d2(n.estadoDeclarado).padStart(16) + "   " + n.ocsDeclaradasPagadas + " OC en 'Pagada total'");
    di("           Documento registrado           " + d2(n.docRegistrada).padStart(16) + "   facturas con importe");
    di("           Pago verificado                " + d2(n.pagoVerificado).padStart(16) + "   el sistema no guarda conciliación");
    di("");
    di("  respaldo real del importe declarado:");
    di("    cuotas de pago cargadas en todo el sistema : " + n.cuotasPagadas + " (en " + n.ocsConCuotas + " OC)");
    di("    importe sin ningún documento detrás        : " + d2(n.sinDocumento));
    di("    con fecha de pago escrita en la factura    : " + d2(n.pagoDeclarado) + "  <- declaración, pendiente de conciliar");
    n.pagoDeclaradoDetalle.forEach((x) => di("      OC " + x.oc + "  factura " + x.nFactura + "  " + d2(x.monto) + "  fecha " + x.fechaPago + "  estado " + x.estado));
    di("    registros de factura sin importe           : " + n.docsSinMonto.length);
    di("    OC declaradas pagadas con factura 'Por cobrar': " + n.contradicciones.length +
       (n.contradicciones.length ? " (" + n.contradicciones.map((x) => x.oc).join(", ") + ")" : ""));

    // el importe declarado no cambia: sólo cambia su rótulo
    expect(n.estadoDeclarado).toBeCloseTo(cobradoAntes, 6);
    // y el pago verificado no se infiere de una factura
    expect(n.pagoVerificado).toBe(0);
    expect(n.docRegistrada).toBeLessThan(n.estadoDeclarado);
  });

  // ── A4 ──────────────────────────────────────────────────────────
  test("A4 · cobranza registrada, calculado pendiente y proyección futura", () => {
    // Copia literal de la expresion de `totPend` (OsirisModule.jsx), con la
    // MISMA funcion de retencion que usa la pantalla.
    const totPendAntes =
      rp.map((r) => N(r.nPlantas) * N(r.usdPlanta) * retFactorFila(r) * (r.pagado ? 0 : 1)).reduce((a, b) => a + b, 0) +
      feData.filter((r) => !r.pagado).reduce((s, r) => s + N(r.montoUSD), 0) +
      fvData.filter((r) => !r.pagado).reduce((s, r) => s + N(r.montoFact), 0);

    const p = puentePendiente({ rpData: rp, feData, fvData, rcData: rc, ctData });

    di("");
    di("=== A4 · el pendiente, separado ===");
    di("");
    di("  ANTES    'Por cobrar'                   " + d2(totPendAntes).padStart(16) + "   un solo número, sin decir qué suma");
    di("");
    di("  DESPUES  Cobranza registrada            " + d2(p.cobranzaRegistrada).padStart(16) + "   con factura emitida");
    di("           Calculado pendiente            " + d2(p.calculadoPendiente).padStart(16) + "   lo calcula el sistema, nadie lo facturó");
    di("           Proyección futura              " + d2(p.proyeccionFutura).padStart(16) + "   temporadas que no empiezan aún · NO exigible");
    di("              de ella, horizonte supuesto " + d2(p.proyeccionConHorizonteSupuesto).padStart(16) + "   tope de 11 temporadas del código");
    di("");
    di("  el total de cabecera no cambia          " + d2(p.totalHub).padStart(16));
    di("    royalty planta NETO                  " + d2(p.componentesHub.rpNeto).padStart(16));
    di("    contract fee BRUTO                   " + d2(p.componentesHub.feBruto).padStart(16));
    di("");
    di("  los tres suman                          " + d2(p.sumaTresConceptos).padStart(16) + "   <- numero PROPIO: ni la cabecera ni el bruto");
    di("  base de los tres: " + p.baseDeclarada);
    di("");
    di("  PUENTE, en dos tramos que cierran");
    di("    desde el total de cabecera           " + d2(p.puente.desdeTotalHub).padStart(16));
    di("    + royalty comercial omitido          " + d2(p.puente.masRoyaltyComercialOmitido).padStart(16) + "   (universo)");
    di("    = suma de los tres conceptos         " + d2(p.puente.igualSumaTresConceptos).padStart(16));
    di("    + retención de royalty planta        " + d2(p.puente.masRetencionRoyaltyPlanta).padStart(16) + "   (base)");
    di("    = pendiente bruto de las tres líneas " + d2(p.puente.igualBrutoTresLineas).padStart(16));
    di("    brecha                               " + d2(p.puente.igualBrutoTresLineas - p.puente.desdeTotalHub).padStart(16));
    di("");
    di("  PERIODO Y FUENTE DE FECHA");
    di("    royalty planta    : " + p.periodo.royaltyPlanta.fuenteFecha + "  ·  sin fecha: " + p.periodo.royaltyPlanta.sinFecha + " filas");
    di("    contract fee      : " + p.periodo.contractFee.fuenteFecha + "  ·  sin fecha: " + p.periodo.contractFee.sinFecha + " filas");
    di("    royalty comercial : " + p.periodo.royaltyComercial.fuenteFecha);
    di("                        de " + p.periodo.royaltyComercial.desde + " a " + p.periodo.royaltyComercial.hasta +
       "  ·  temporada actual " + p.temporadaActual);
    di("                        temporadas vencidas " + p.periodo.royaltyComercial.temporadasVencidas +
       "  ·  proyectadas " + p.periodo.royaltyComercial.temporadasProyectadas);
    const sinFTtodos = ctData.filter((c) => !c.fechaTermino).length;
    di("                        contratos sin fecha de término, en total: " + sinFTtodos + " de " + ctData.length);
    di("                        de ellos, con proyección futura pendiente: " + p.periodo.royaltyComercial.contratosSinFechaTermino);
    di("");
    di("  CONTRADICCION SEÑALADA, no corregida");
    di("    contratos que declaran el fee pagado y la pantalla cuenta pendientes: " +
       p.detalle.fe.contradictorias + "  ·  " + d2(p.detalle.fe.contradictorio));

    // 1. el total de cabecera es identico al que calcula la pantalla
    expect(p.totalHub).toBeCloseTo(totPendAntes, 6);

    // 2. los tres conceptos no se solapan NI dejan nada fuera: su suma tiene
    //    que reconstruir el universo pendiente, recalculado aqui por separado.
    const universo =
      rp.filter((r) => !r.pagado).reduce((s, r) => s + N(r.nPlantas) * N(r.usdPlanta) * retFactorFila(r), 0) +
      feData.filter((r) => !r.pagado).reduce((s, r) => s + N(r.montoUSD), 0) +
      fvData.filter((r) => !r.pagado).reduce((s, r) => s + N(r.montoFact), 0) +
      rc.filter((r) => !r.pagado).reduce((s, r) => s + N(r.montoFact), 0);
    expect(p.cobranzaRegistrada + p.calculadoPendiente + p.proyeccionFutura).toBeCloseTo(universo, 6);
    expect(p.sumaTresConceptos).toBeCloseTo(universo, 6);

    // 3. la proyeccion futura son SOLO temporadas que no empezaron
    const tActIni = Number(String(p.temporadaActual).split("/")[0]);
    const futuroAparte = rc.filter((r) => !r.pagado && Number(String(r.temporada).split("/")[0]) > tActIni)
      .reduce((s, r) => s + N(r.montoFact), 0);
    expect(p.proyeccionFutura).toBeCloseTo(futuroAparte, 6);
    expect(futuroAparte).toBeGreaterThan(0);
    // y la cobranza registrada es solo lo que tiene factura emitida
    const registradoAparte =
      rp.filter((r) => !r.pagado && r.nFact).reduce((s, r) => s + N(r.nPlantas) * N(r.usdPlanta) * retFactorFila(r), 0) +
      feData.filter((r) => !r.pagado && r.nFact).reduce((s, r) => s + N(r.montoUSD), 0) +
      rc.filter((r) => !r.pagado && r.nFact && Number(String(r.temporada).split("/")[0]) <= tActIni)
        .reduce((s, r) => s + N(r.montoFact), 0);
    expect(p.cobranzaRegistrada).toBeCloseTo(registradoAparte, 6);

    // 4. el puente, contra sumas calculadas aqui y no contra su definicion
    const rcPendAparte = rc.filter((r) => !r.pagado).reduce((s, r) => s + N(r.montoFact), 0);
    const retencionAparte =
      rp.filter((r) => !r.pagado).reduce((s, r) => s + N(r.nPlantas) * N(r.usdPlanta) * (1 - retFactorFila(r)), 0);
    expect(p.puente.masRoyaltyComercialOmitido).toBeCloseTo(rcPendAparte, 6);
    expect(p.puente.masRetencionRoyaltyPlanta).toBeCloseTo(retencionAparte, 6);
    expect(p.puente.igualSumaTresConceptos).toBeCloseTo(totPendAntes + rcPendAparte, 6);
    expect(p.puente.igualBrutoTresLineas).toBeCloseTo(totPendAntes + rcPendAparte + retencionAparte, 6);
  });

  // ── A5 ──────────────────────────────────────────────────────────
  test("A5 · las hectáreas se suman una sola vez y se sabe de dónde salen", () => {
    const antes = tp.reduce((s, r) => s + (Number(r.ha) || 0), 0);
    const despues = tp.reduce((s, r) => s + haDeFila(r), 0);
    const porOrigen = {};
    tp.forEach((r) => {
      const o = require("./paqueteA").origenHectareas(r);
      porOrigen[o] = (porOrigen[o] || 0) + haDeFila(r);
    });
    const dobles = tp.filter((r) => r.ha !== undefined && r.ha !== null && r.ha !== "" &&
                                     r.hectareas !== undefined && r.hectareas !== null && r.hectareas !== "");

    di("");
    di("=== A5 · hectáreas de Total Pedidos ===");
    di("");
    di("  ANTES    suma mostrada    " + d2(antes).padStart(12) + "   (leía r.ha, que la derivación no escribe)");
    di("  DESPUES  suma mostrada    " + d2(despues).padStart(12));
    di("");
    di("  de dónde salen:");
    Object.entries(porOrigen).forEach(([o, x]) => di("    " + o.padEnd(42) + d2(x).padStart(12)));
    di("");
    di("  filas con AMBOS campos cargados (riesgo de doble conteo): " + dobles.length);
    di("  suma directa de p.hectareas de las plantaciones         : " +
       d2(ctData.reduce((s, ct) => s + (ct.plantaciones || []).reduce((ss, p) => ss + N(p.hectareas), 0), 0)));
    di("  (no proviene de cabeceras de OC, ni de líneas, ni de despachos,");
    di("   y no se convierte ninguna planta a hectárea con densidad supuesta)");

    // una sola vez: la suma coincide con la suma directa de las plantaciones,
    // y NO con el doble, que es lo que daría si se contaran dos fuentes.
    const directa = ctData.reduce((s, ct) => s + (ct.plantaciones || []).reduce((ss, p) => ss + N(p.hectareas), 0), 0);
    expect(directa).toBeGreaterThan(0);                 // si fuera 0, lo de abajo no probaria nada
    expect(despues).toBeCloseTo(directa, 6);
    expect(tp.length).toBe(ctData.reduce((s, ct) => s + (ct.plantaciones || []).length, 0));
    // ninguna fila trae las dos variantes cargadas, asi que no hay nada que elegir mal
    expect(dobles).toHaveLength(0);
    // y TODA la hectarea viene de la plantacion del contrato: ninguna de
    // cabeceras de OC, lineas ni despachos, y ninguna derivada de plantas
    expect(Object.keys(porOrigen).filter((o) => porOrigen[o] > 0))
      .toEqual(["plantación del contrato (hectareas)"]);
    const haDeOc = (v.viveros || []).reduce((s, vi) => s + (vi.ordenesCompra || [])
      .reduce((t, o) => t + N(o.hectareas), 0), 0);
    expect(haDeOc).toBeGreaterThan(0);
    expect(despues).not.toBeCloseTo(haDeOc, 6);
    expect(despues).not.toBeCloseTo(despues + haDeOc, 6);
  });

  // ── INVARIANTES ─────────────────────────────────────────────────
  // Lo que este paquete NO debe mover. No se fija aquí ninguna cifra que el
  // paquete deba corregir (año, hectáreas, rótulos): sólo lo económico y los
  // estados históricos.
  test("INVARIANTES · lo económico y los estados no se mueven", () => {
    const retF = retFactorFila;   // el de produccion
    const inv = {
      "filas de plantaciones (tp)": tp.length,
      "filas de royalty planta (rp)": rp.length,
      "filas de royalty comercial (rc)": rc.length,
      "filas de contract fee (fe)": feData.length,
      "plantas registradas": tp.reduce((s, r) => s + N(r.nPlantas), 0),
      "plantas marcadas pagadas": rp.filter((r) => r.pagado).reduce((s, r) => s + N(r.nPlantas), 0),
      "plantas no marcadas pagadas": rp.filter((r) => !r.pagado).reduce((s, r) => s + N(r.nPlantas), 0),
      "royalty planta bruto pendiente": rp.filter((r) => !r.pagado).reduce((s, r) => s + N(r.nPlantas) * N(r.usdPlanta), 0),
      "royalty planta neto pendiente": Math.round(rp.filter((r) => !r.pagado).reduce((s, r) => s + N(r.nPlantas) * N(r.usdPlanta) * retF(r), 0) * 100) / 100,
      "contract fee bruto pendiente": feData.filter((r) => !r.pagado).reduce((s, r) => s + N(r.montoUSD), 0),
      "royalty comercial total": Math.round(rc.reduce((s, r) => s + N(r.montoFact), 0) * 100) / 100,
      "fee total de OC": Math.round(todasOCs.reduce((s, o) => s + N(o.fee_total_usd), 0) * 100) / 100,
      "tandas marcadas pagadas (estado)": rp.filter((r) => r.pagado).length,
      "OC en 'Pagada total' (estado)": todasOCs.filter((o) => o.estado_oc === "Pagada total").length,
      "OC anuladas (estado)": todasOCs.filter((o) => o.estado_oc === "Anulada").length,
    };

    di("");
    di("=== INVARIANTES · deben quedar idénticos ===");
    di("");
    Object.entries(inv).forEach(([k, x]) => di("  " + k.padEnd(36) + (typeof x === "number" && !Number.isInteger(x) ? d2(x) : d0(x)).padStart(18)));
    di("");
    di("  Cambian a propósito (y por eso NO se fijan acá):");
    di("    - la distribución de plantas por año        (A1)");
    di("    - la suma de hectáreas mostrada             (A5)");
    di("    - las opciones del filtro de año            (A5)");
    di("    - los rótulos de los indicadores            (A2, A3, A4)");

    // H6: antes esto imprimia 15 invariantes y solo afirmaba 6 conteos. Las
    // cifras monetarias y los estados quedaban sin guardia, justo lo que el
    // paquete promete no mover. Ahora se afirman TODOS.
    expect(inv).toEqual({
      "filas de plantaciones (tp)": 142,
      "filas de royalty planta (rp)": 51,
      "filas de royalty comercial (rc)": 57,
      "filas de contract fee (fe)": 23,
      "plantas registradas": 5524192,
      "plantas marcadas pagadas": 313320,
      "plantas no marcadas pagadas": 5436873,
      "royalty planta bruto pendiente": 5436873,
      "royalty planta neto pendiente": 4621342.05,
      "contract fee bruto pendiente": 690000,
      "royalty comercial total": 13504590,
      "fee total de OC": 2053297.95,
      "tandas marcadas pagadas (estado)": 5,
      "OC en 'Pagada total' (estado)": 63,
      "OC anuladas (estado)": 0,
    });
  });
});
