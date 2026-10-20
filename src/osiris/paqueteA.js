/* eslint-disable */
// ══════════════════════════════════════════════════════════════════
// Osiris · Paquete A — presentación y cálculo
//
// Funciones puras. No leen ni escriben en Supabase, no conocen React, no
// cambian ninguna regla económica y no tocan ningún estado histórico: sólo
// calculan el año sin corrimiento, exponen de qué universo sale cada cifra,
// distinguen estado declarado de documentación y de pago, y separan cobranza
// de proyección.
//
// A1 añoDeFechaTexto        · el año de una fecha, sin pasar por zona horaria
// A2 conciliarUniversos     · plantaciones vs tandas/despachos, fila por fila
// A3 nivelesCobroOC         · estado declarado / documento registrado / pago
// A4 puentePendiente        · cobranza registrada / calculado / proyección
// A5 haDeFila, fechaDeFila  · una sola fuente de hectáreas y fecha por fila
// ══════════════════════════════════════════════════════════════════

// H2: el factor de retención es el MISMO que usa la cabecera. No se
// reimplementa: `factorNetoFila` cae al país cuando la fila no trae estado de
// retención, y reescribir esa regla acá hacía que el panel pudiera imprimir un
// número distinto del de la cabecera afirmando que era el mismo.
import { factorNetoFila } from "./retencion";

const num = (v) => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

// ── A1 ────────────────────────────────────────────────────────────
// `new Date("2024-01-01").getFullYear()` interpreta la fecha como UTC y la
// devuelve en hora local: en Chile (UTC-3/-4) retrocede un día y entrega 2023.
// Las fechas del sistema son días calendario sin hora, así que el año es el
// que está escrito en el texto.
export function añoDeFechaTexto(f) {
  if (f === undefined || f === null || f === "") return null;
  const s = String(f).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return Number(m[1]);
  const d = new Date(s);
  const y = d.getFullYear();
  return isNaN(y) ? null : y;
}

// ── A5 ────────────────────────────────────────────────────────────
// Las filas derivadas de contrato traen `hectareas` y `fechaPlantacion`; las
// cargadas a mano traen `ha`, `fechaPedido` y `añoEntrega`. Cada fila aporta
// su propio valor UNA vez: no se suman las dos variantes ni se convierten
// plantas a hectáreas con ninguna densidad.
export function haDeFila(r) {
  if (r == null) return 0;
  if (r.ha !== undefined && r.ha !== null && r.ha !== "") return num(r.ha);
  if (r.hectareas !== undefined && r.hectareas !== null && r.hectareas !== "") return num(r.hectareas);
  return 0;
}
export function fechaDeFila(r) {
  if (r == null) return "";
  return r.fechaPedido || r.fechaPlantacion || "";
}
// De dónde salió la hectárea de esta fila, para poder auditarla.
export function origenHectareas(r) {
  if (r == null) return "sin dato";
  if (r.ha !== undefined && r.ha !== null && r.ha !== "") return "carga manual (ha)";
  if (r.hectareas !== undefined && r.hectareas !== null && r.hectareas !== "") return "plantación del contrato (hectareas)";
  return "sin dato";
}

// ── A2 ────────────────────────────────────────────────────────────
// Dos recuentos de hechos distintos sobre los mismos contratos:
//   universo A = una fila por PLANTACIÓN registrada (plantas declaradas)
//   universo B = una fila por TANDA o DESPACHO      (plantas facturables)
// Una planta puede estar en A y no en B (plantada, no facturada aún) o en B y
// no en A (facturada contra una OC cuya plantación no se registró). La
// diferencia no se resta de ningún total: se explica contrato por contrato.
export function conciliarUniversos(ctData, tpData, rpData) {
  // Si no se entrega la lista de contratos, se reconstruye desde las propias
  // filas: el nombre del cliente ya viaja en cada fila derivada.
  let contratos = ctData;
  if (!contratos || !contratos.length) {
    const vistos = {};
    [...(tpData || []), ...(rpData || [])].forEach((r) => {
      if (r && r.ctId && !vistos[r.ctId]) vistos[r.ctId] = { id: r.ctId, razonSocial: r.cliente || "" };
    });
    contratos = Object.values(vistos);
  }
  // Se cuentan FILAS, no sólo plantas: un contrato con filas que suman cero
  // igual existe y tiene que aparecer. Si se lo filtra por sumar cero, el aviso
  // de pantalla termina citando un número de plantaciones distinto del que
  // muestra el indicador, y un registro de prueba desaparece sin decirlo.
  const porCtA = {}, porCtB = {}, filasB = {}, nFilasA = {};
  (tpData || []).forEach((r) => {
    porCtA[r.ctId] = (porCtA[r.ctId] || 0) + num(r.nPlantas);
    nFilasA[r.ctId] = (nFilasA[r.ctId] || 0) + 1;
  });
  (rpData || []).forEach((r) => {
    porCtB[r.ctId] = (porCtB[r.ctId] || 0) + num(r.nPlantas);
    (filasB[r.ctId] = filasB[r.ctId] || []).push(r);
  });

  const filas = contratos.map((ct) => {
    const a = porCtA[ct.id] || 0;
    const b = porCtB[ct.id] || 0;
    const fb = filasB[ct.id] || [];
    return {
      ctId: ct.id,
      cliente: ct.razonSocial || "",
      universoA: a,
      universoB: b,
      diferencia: b - a,
      origenB: fb.length === 0 ? "—" : (fb.some((x) => x._fromOC) ? "OC/despachos" : "tandas del contrato"),
      filasB: fb.length,
      filasA: nFilasA[ct.id] || 0,
      // Un contrato con filas en los dos universos pero sin cantidades. No se
      // esconde: se muestra en cero, que es información y no ruido.
      sinCantidades: (porCtA[ct.id] || 0) === 0 && (porCtB[ct.id] || 0) === 0,
    };
  }).filter((f) => f.filasA > 0 || f.filasB > 0);

  const totalA = filas.reduce((s, f) => s + f.universoA, 0);
  const totalB = filas.reduce((s, f) => s + f.universoB, 0);
  const sumaDiferencias = filas.reduce((s, f) => s + f.diferencia, 0);

  // H3: una fila sin `ctId` no cae en ningún contrato y por lo tanto no entra
  // en la conciliación. Antes desaparecía en silencio mientras el aviso de
  // pantalla seguía citando el total de filas. Ahora se cuenta y se declara.
  const ids = {};
  filas.forEach((f) => { ids[f.ctId] = true; });
  const dentroA = (tpData || []).filter((r) => r && r.ctId && ids[r.ctId]);
  const dentroB = (rpData || []).filter((r) => r && r.ctId && ids[r.ctId]);
  const fueraA = (tpData || []).filter((r) => !r || !r.ctId || !ids[r.ctId]);
  const fueraB = (rpData || []).filter((r) => !r || !r.ctId || !ids[r.ctId]);
  const plantasFueraA = fueraA.reduce((s, r) => s + num(r && r.nPlantas), 0);
  const plantasFueraB = fueraB.reduce((s, r) => s + num(r && r.nPlantas), 0);
  // Totales de TODAS las filas, que son los que muestran los indicadores.
  const totalTodasA = (tpData || []).reduce((s, r) => s + num(r && r.nPlantas), 0);
  const totalTodasB = (rpData || []).reduce((s, r) => s + num(r && r.nPlantas), 0);

  return {
    filas,
    totalA,
    totalB,
    sumaDiferencias,
    // H4: `sumaDiferencias === totalB - totalA` es una identidad algebraica
    // sobre las mismas filas: no puede fallar, así que no era un control.
    // El control de verdad es que lo conciliado más lo excluido reconstruya el
    // total que muestran los indicadores. Eso sí puede fallar.
    cuadra: totalA + plantasFueraA === totalTodasA && totalB + plantasFueraB === totalTodasB,
    conDiferencia: filas.filter((f) => f.diferencia !== 0).length,
    soloB: filas.filter((f) => f.universoA === 0 && f.universoB > 0),
    sinCantidades: filas.filter((f) => f.sinCantidades),
    // Denominadores correctos para el aviso de pantalla
    filasA: dentroA.length,
    filasB: dentroB.length,
    excluidasA: fueraA.length,
    excluidasB: fueraB.length,
    plantasFueraA,
    plantasFueraB,
    totalTodasA,
    totalTodasB,
  };
}

// ── A3 ────────────────────────────────────────────────────────────
// Tres niveles distintos, que hoy la pantalla presenta como uno solo:
//   1 estadoDeclarado  — lo que afirma `estado_oc`. Es una etiqueta, no un cobro.
//   2 docRegistrada    — importe de las facturas registradas en la OC. Una
//                        factura acredita que se facturó, no que se cobró.
//   3 pagoVerificado   — cobro conciliado contra un comprobante externo. El
//                        sistema NO guarda esa conciliación, así que no hay un
//                        importe que mostrar: se devuelve `null` y el estado
//                        "sin conciliación registrada". Un cero se leería como
//                        "no se cobró nada", que es una afirmación distinta y
//                        que estos datos no sostienen.
//
// Lo que el sistema no tiene registrado no se declara inexistente: una factura
// que no está cargada puede existir en papel. Por eso los rotulos dicen "no
// registrado en el sistema" y nunca "no existe".
export function nivelesCobroOC(ordenesCompra) {
  const ocs = ordenesCompra || [];
  const cobradoDeOc = (o) => {
    if (o.estado_oc === "Anulada") return 0;
    const fee = num(o.fee_total_usd);
    const cuotasPag = (o.cuotas || []).filter((c) => c.pagado).reduce((s, c) => s + num(c.monto_usd), 0);
    if (o.estado_oc === "Pagada total") return Math.max(fee, cuotasPag);
    return cuotasPag;
  };

  let estadoDeclarado = 0, docRegistrada = 0, pagoDeclarado = 0, cuotasPagadas = 0, conCuotas = 0;
  const pagoDeclaradoDetalle = [], contradicciones = [], docsSinMonto = [];

  ocs.forEach((o) => {
    estadoDeclarado += cobradoDeOc(o);
    if ((o.cuotas || []).length > 0) conCuotas++;
    cuotasPagadas += (o.cuotas || []).filter((c) => c.pagado).length;
    if (o.estado_oc === "Anulada") return;
    (o.fvFacturas || []).forEach((f) => {
      const monto = num(f.monto);
      if (monto > 0) {
        docRegistrada += monto;
        if (f.fecha_pago) {
          pagoDeclarado += monto;
          pagoDeclaradoDetalle.push({ oc: o.n_oc, nFactura: f.n_factura || "", monto, fechaPago: f.fecha_pago, estado: f.estado || "" });
        }
      } else {
        docsSinMonto.push({ oc: o.n_oc, estadoFactura: f.estado || "", estadoOc: o.estado_oc || "" });
      }
      const dicePorCobrar = String(f.estado || "").toLowerCase().includes("por cobrar");
      if (dicePorCobrar && o.estado_oc === "Pagada total") {
        contradicciones.push({ oc: o.n_oc, estadoOc: o.estado_oc, estadoFactura: f.estado, motivo: "la OC se declara pagada y su factura dice Por cobrar" });
      }
    });
  });

  return {
    estadoDeclarado,
    docRegistrada,
    // No hay conciliación de pago en el sistema. `null` y no 0, para que la
    // pantalla muestre un estado y no un importe: cero se leería como prueba
    // de que no hubo cobro, y eso no está demostrado.
    pagoVerificado: null,
    pagoVerificadoEstado: "sin conciliación registrada",
    registrosDeConciliacion: 0,
    pagoDeclarado,              // importe con fecha de pago escrita en la propia factura
    pagoDeclaradoDetalle,
    contradicciones,
    docsSinMonto,
    ocsDeclaradasPagadas: ocs.filter((o) => o.estado_oc === "Pagada total").length,
    ocsConCuotas: conCuotas,
    cuotasPagadas,
    // Porción del importe declarado sin documento REGISTRADO en el sistema.
    // No afirma que el documento no exista: afirma que no está cargado.
    sinDocumentoRegistrado: estadoDeclarado - docRegistrada,
  };
}

// ── A4 ────────────────────────────────────────────────────────────
// El "Por cobrar" del hub suma royalty planta en NETO y contract fee en BRUTO,
// y no suma royalty comercial. Esta función no cambia ese total: lo descompone
// en tres cosas que no son lo mismo y declara el período y la fuente de fecha
// de cada una.
//
//   conFacturaRegistrada — pendiente que tiene un número de factura cargado en
//                          el sistema. Acredita que ALGUIEN REGISTRÓ UNA
//                          FACTURA, nada más: no acredita cobro, ni emisión
//                          verificada contra el documento, ni conciliación
//                          bancaria. Parte de este importe viene justamente de
//                          filas que se contradicen (traen fecha de pago y la
//                          marca de pagado en false), y esa porción se informa
//                          aparte en `contradictorio`.
//   calculadoPendiente   — pendiente que el sistema calcula y nadie facturó aún
//   proyeccionFutura     — temporadas que todavía no empiezan. NO es exigible.
//
// `temporadaActual` en formato "AAAA/AAAA+1". Si no se entrega, se deduce de
// la fecha dada (temporada agrícola julio–junio).
export function temporadaDeHoy(hoy) {
  const d = hoy instanceof Date ? hoy : new Date(hoy || Date.now());
  const a = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return `${a}/${a + 1}`;
}

export function puentePendiente({ rpData, feData, fvData, rcData, ctData, temporadaActual, hoy }) {
  const tAct = temporadaActual || temporadaDeHoy(hoy);
  const añoAct = Number(String(tAct).split("/")[0]);
  const ct = {};
  (ctData || []).forEach((c) => { ct[c.id] = c; });

  // ── Royalty planta: bruto y neto, para poder mostrar la retención ──
  const rpPend = (rpData || []).filter((r) => !r.pagado);
  const bruto = (r) => num(r.nPlantas) * num(r.usdPlanta);
  // El mismo factor que usa la cabecera, importado, no reescrito.
  const retF = factorNetoFila;
  const rpBruto = rpPend.reduce((s, r) => s + bruto(r), 0);
  const rpNeto = rpPend.reduce((s, r) => s + bruto(r) * retF(r), 0);
  const rpConFactura = rpPend.filter((r) => r.nFact);
  const rpRegistrado = rpConFactura.reduce((s, r) => s + bruto(r) * retF(r), 0);
  const rpCalculado = rpNeto - rpRegistrado;
  // Filas que se contradicen: factura y fecha de pago, con `pagado` en false.
  // Están dentro de `conFacturaRegistrada`, así que ese total no puede leerse
  // como cobro confirmado.
  const rpContradictorio = rpConFactura.filter((r) => r.fechaPago)
    .reduce((s, r) => s + bruto(r) * retF(r), 0);
  const rpContradictorias = rpConFactura.filter((r) => r.fechaPago).length;

  // ── Contract fee: el hub lo suma BRUTO y lee sólo la fila guardada ──
  const fePend = (feData || []).filter((r) => !r.pagado);
  const feBruto = fePend.reduce((s, r) => s + num(r.montoUSD), 0);
  const feConFactura = fePend.filter((r) => r.nFact);
  const feRegistrado = feConFactura.reduce((s, r) => s + num(r.montoUSD), 0);
  // El contrato puede declarar el fee pagado aunque la fila guardada no lo diga.
  const feContradictorio = fePend.filter((r) => ct[r.ctId] && ct[r.ctId].contractFeePagado);
  const feContradictorioMonto = feContradictorio.reduce((s, r) => s + num(r.montoUSD), 0);

  const fvPend = (fvData || []).filter((r) => !r.pagado);
  const fvMonto = fvPend.reduce((s, r) => s + num(r.montoFact), 0);

  // El total que el hub muestra hoy. No se modifica.
  const totalHub = rpNeto + feBruto + fvMonto;

  // ── Royalty comercial: lo que el hub NO suma, separado por período ──
  const rcPend = (rcData || []).filter((r) => !r.pagado);
  let rcRegistrado = 0, rcCalculado = 0, rcProyeccion = 0, rcProyeccionSupuesta = 0;
  let rcContradictorio = 0, rcContradictorias = 0;
  const temporadasProyectadas = new Set(), temporadasVencidas = new Set();
  const sinFechaTermino = new Set();
  rcPend.forEach((r) => {
    const monto = num(r.montoFact);
    const añoIni = Number(String(r.temporada || "").split("/")[0]);
    const futura = !isNaN(añoIni) && añoIni > añoAct;
    const contrato = ct[r.ctId];
    const horizonteSupuesto = !!contrato && !contrato.fechaTermino;
    if (futura) {
      rcProyeccion += monto;
      temporadasProyectadas.add(r.temporada);
      if (horizonteSupuesto) { rcProyeccionSupuesta += monto; sinFechaTermino.add(r.ctId); }
    } else if (r.nFact) {
      rcRegistrado += monto;
      if (r.fechaPago) { rcContradictorio += monto; rcContradictorias += 1; }
      temporadasVencidas.add(r.temporada);
    } else {
      rcCalculado += monto;
      temporadasVencidas.add(r.temporada);
    }
  });

  const temps = (rcData || []).map((r) => r.temporada).filter(Boolean).sort();
  const rcTodoPend = rcPend.reduce((s, r) => s + num(r.montoFact), 0);
  const cobranzaRegistradaT = rpRegistrado + feRegistrado + rcRegistrado;
  const calculadoPendienteT = rpCalculado + (feBruto - feRegistrado) + fvMonto + rcCalculado;

  return {
    temporadaActual: tAct,
    // Lo que el hub muestra, intacto
    totalHub,
    componentesHub: { rpNeto, feBruto, fvMonto },
    // Los tres conceptos, separados
    // Nombre nuevo: lo que acredita es una factura REGISTRADA, no un cobro.
    conFacturaRegistrada: cobranzaRegistradaT,
    // Porción de ese total que proviene de filas contradictorias, y por lo
    // tanto no puede presentarse como cobro ni como facturación firme.
    conFacturaContradictoria: rpContradictorio + rcContradictorio,
    filasContradictorias: rpContradictorias + rcContradictorias,
    // Alias retrocompatible; no usar en pantalla.
    cobranzaRegistrada: cobranzaRegistradaT,
    calculadoPendiente: calculadoPendienteT,
    proyeccionFutura: rcProyeccion,
    queAcredita: {
      conFacturaRegistrada: "un número de factura cargado en el sistema; no acredita cobro ni conciliación",
      calculadoPendiente: "un cálculo del sistema sin factura registrada",
      proyeccionFutura: "temporadas que no han empezado; no es deuda exigible",
    },
    proyeccionConHorizonteSupuesto: rcProyeccionSupuesta,
    detalle: {
      rp: { bruto: rpBruto, neto: rpNeto, retencion: rpBruto - rpNeto, registrado: rpRegistrado, calculado: rpCalculado, filas: rpPend.length, conFactura: rpConFactura.length, contradictorio: rpContradictorio, contradictorias: rpContradictorias },
      fe: { bruto: feBruto, registrado: feRegistrado, calculado: feBruto - feRegistrado, filas: fePend.length, conFactura: feConFactura.length, contradictorio: feContradictorioMonto, contradictorias: feContradictorio.length },
      fv: { monto: fvMonto, filas: fvPend.length },
      rc: { registrado: rcRegistrado, calculado: rcCalculado, proyeccion: rcProyeccion, proyeccionSupuesta: rcProyeccionSupuesta, filas: rcPend.length, contratosSinFechaTermino: sinFechaTermino.size, contradictorio: rcContradictorio, contradictorias: rcContradictorias },
    },
    // H1: la suma de los tres conceptos es un número propio, distinto del total
    // de cabecera y del bruto de las tres líneas. Si no se declara, quien sume
    // las tres tarjetas obtiene una cifra que no aparece en ninguna pantalla.
    sumaTresConceptos: cobranzaRegistradaT + calculadoPendienteT + rcProyeccion,
    baseDeclarada: "royalty planta en NETO de retención; contract fee, fee vivero y royalty comercial en BRUTO",
    // El puente, en dos tramos encadenados que sí cierran:
    //   total de cabecera  ->  suma de los tres  ->  bruto de las tres líneas
    puente: {
      desdeTotalHub: totalHub,
      masRoyaltyComercialOmitido: rcTodoPend,
      igualSumaTresConceptos: totalHub + rcTodoPend,
      masRetencionRoyaltyPlanta: rpBruto - rpNeto,
      igualBrutoTresLineas: totalHub + rcTodoPend + (rpBruto - rpNeto),
    },
    // Período y fuente de fecha efectivamente usados
    periodo: {
      royaltyPlanta: { fuenteFecha: "fechaPago / fechaEvento de la tanda", sinFecha: rpPend.filter((r) => !r.fechaPago && !r.fechaEvento).length },
      contractFee: { fuenteFecha: "fechaPago de la fila de fee entrada", sinFecha: fePend.filter((r) => !r.fechaPago).length },
      royaltyComercial: {
        fuenteFecha: "temporada del contrato (añoCobro/trimCobro)",
        desde: temps[0] || "—",
        hasta: temps[temps.length - 1] || "—",
        temporadasVencidas: temporadasVencidas.size,
        temporadasProyectadas: temporadasProyectadas.size,
        contratosSinFechaTermino: sinFechaTermino.size,
        nota: "los contratos sin fecha de término proyectan 11 temporadas por un tope del código, no por el contrato",
      },
    },
  };
}
