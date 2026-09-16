/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// UX EJECUTIVO · SELECTORES
// ═══════════════════════════════════════════════════════════════════
//
// Todo lo que la pantalla ejecutiva muestra se calcula ACÁ, en funciones
// puras, sin React y sin red. Dos razones:
//
//  1. Se puede validar el número sin montar la interfaz. Angelo valida
//     aritmética antes de aceptar un cambio; una cifra enterrada en JSX no
//     se deja auditar.
//  2. Los KPIs económicos NO se recalculan a mano: se delegan en `econ4()` de
//     `src/data/osirisCanonical.js`, que es el motor congelado de la Fase 0.
//     Si la pantalla inventara su propia suma habría dos verdades y ganaría
//     la que se mire primero.
//
// LÍMITE DELIBERADO — lo que este archivo NO hace:
// `econ4()` devuelve un cuarto valor, `IQ`, que suma `obtentor
// .participacionIngresos[].valor`. En el modelo real ese `valor` es un
// PORCENTAJE (`tipoCalculo:"porcentaje"`), no un monto, así que sumarlo no da
// plata: da una suma de porcentajes. Por eso acá NO se muestra `IQ` como
// moneda ni se deriva un "margen Osiris". El cálculo correcto vive en
// `calcularDeudaObtentor()` dentro de `OsirisModule.jsx`, que no es
// importable desde un prototipo. Queda anotado como decisión para el CFO.
//
// Entrada: el blob de Osiris tal cual vive en `calendario_data` id="osiris".
// Claves de negocio: clientes, especies, variedades, obtentores, viveros,
// contratos. Cada contrato lleva `plantaciones[]` y `ordenesCompra[]`.

import { econ4, blobCounts } from "../data/osirisCanonical";

const arr = (x) => (Array.isArray(x) ? x : []);
const txt = (x) => (x == null ? "" : String(x));
const num = (x) => (x == null || x === "" || isNaN(x) ? 0 : Number(x));

const DIA_MS = 86400000;

// Los anexos fueron booleanos y hoy son objetos `{activo,...}`. El módulo
// convive con ambos formatos; acá se replica ese criterio y no se "arregla"
// el dato, que es de otro carril.
export function anexoActivo(a) {
  if (a && typeof a === "object") return !!a.activo;
  return !!a;
}

// Las fechas del blob son días de calendario ("2026-07-01"), no instantes.
// `new Date("2026-07-01")` las interpreta como medianoche UTC, y en Chile
// (UTC-3/-4) eso las corre al día ANTERIOR en cuanto se leen con los getters
// locales. Efecto real: un contrato que vence el 1 de julio se contaba como
// del 30 de junio, lo que mueve la temporada agrícola y desfasa en un día
// todos los "vence en N días". Por eso una cadena de sólo fecha se arma como
// medianoche LOCAL, componente a componente.
const SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

export function aFecha(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = txt(v).trim();
  const m = SOLO_FECHA.exec(s);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Medianoche local del día al que pertenece una fecha. Comparar días y no
// instantes es lo que hace que "vence en 45 días" siga diciendo 45 a las
// nueve de la mañana y a las seis de la tarde. Antes, con el instante crudo,
// la cifra cambiaba sola durante la jornada.
function aDiaLocal(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function diasHasta(fecha, hoy) {
  const f = aFecha(fecha);
  const h = aFecha(hoy) || new Date();
  if (!f) return null;
  // `Math.round` absorbe la hora que sobra o falta en los cambios de horario
  // de verano, que en Chile caen dentro de las ventanas que se miden acá.
  return Math.round((aDiaLocal(f).getTime() - aDiaLocal(h).getTime()) / DIA_MS);
}

// Temporada agrícola Julio–Junio, la que usa el grupo.
export function temporadaDe(fecha) {
  const d = aFecha(fecha) || new Date();
  const y = d.getFullYear();
  const inicio = d.getMonth() >= 6 ? y : y - 1;
  return `${String(inicio).slice(2)}-${String(inicio + 1).slice(2)}`;
}

// Contract fee todavía no cobrado. Lectura DIRECTA de campos del contrato
// (`montoContractFee`, `contractFeePagado`); no re-deriva nada.
export function contractFeePorCobrar(blob) {
  return arr((blob || {}).contratos).reduce((a, ct) => {
    const tiene = txt(ct.tipoContractFee) && ct.tipoContractFee !== "Sin Contract Fee";
    return tiene && !ct.contractFeePagado ? a + num(ct.montoContractFee) : a;
  }, 0);
}

// ── KPIs ───────────────────────────────────────────────────────────
// Cada KPI responde UNA pregunta, y la pregunta viaja con el dato para que
// la tarjeta no tenga que inventarse un subtítulo de relleno.
export function kpisEjecutivos(blob, hoy = new Date()) {
  const b = blob || {};
  const e = econ4(b);
  const c = blobCounts(b);
  const contratos = arr(b.contratos);
  const obtentores = arr(b.obtentores);

  const sinFirma = contratos.filter(
    (ct) => !ct.firmadoLicenciado || !ct.firmadoOsiris
  ).length;

  const porVencer = contratos.filter((ct) => {
    const d = diasHasta(ct.fechaTermino, hoy);
    return d != null && d >= 0 && d <= 90;
  }).length;

  const vencidos = contratos.filter((ct) => {
    const d = diasHasta(ct.fechaTermino, hoy);
    return d != null && d < 0;
  }).length;

  const sinReglaObtentor = obtentores.filter(
    (ob) => arr(ob.participacionIngresos).length === 0
  ).length;

  const devengado = e.RP + e.RC + e.FE;
  const porCobrarFee = contractFeePorCobrar(b);

  return [
    {
      id: "ingreso_devengado",
      pregunta: "¿Cuánto ingreso tengo comprometido por contrato?",
      etiqueta: "Ingreso devengado",
      valor: devengado,
      formato: "moneda",
      detalle: `Royalty planta ${formatearValor(e.RP, "moneda")} · comercial ${formatearValor(e.RC, "moneda")} · fee entrada ${formatearValor(e.FE, "moneda")}`,
      severidad: "info",
      fuente: "econ4() · motor congelado Fase 0",
    },
    {
      id: "fee_por_cobrar",
      pregunta: "¿Cuánto fee de entrada tengo sin cobrar?",
      etiqueta: "Contract fee por cobrar",
      valor: porCobrarFee,
      formato: "moneda",
      detalle:
        devengado > 0
          ? `${((porCobrarFee / devengado) * 100).toFixed(1)} % del devengado`
          : "Sin devengo registrado",
      severidad: porCobrarFee > 0 ? "alto" : "ok",
      fuente: "contratos[].montoContractFee sin contractFeePagado",
    },
    {
      id: "contratos_sin_firma",
      pregunta: "¿Qué contrato no puedo cobrar todavía?",
      etiqueta: "Contratos sin firma completa",
      valor: sinFirma,
      formato: "conteo",
      detalle: `de ${contratos.length} contratos`,
      severidad: sinFirma > 0 ? "critico" : "ok",
      fuente: "firmadoLicenciado / firmadoOsiris",
    },
    {
      id: "contratos_por_vencer",
      pregunta: "¿Qué tengo que renegociar este trimestre?",
      etiqueta: "Vencen en 90 días",
      valor: porVencer,
      formato: "conteo",
      detalle: vencidos > 0 ? `${vencidos} ya vencidos` : "Ninguno vencido",
      severidad: vencidos > 0 ? "critico" : porVencer > 0 ? "alto" : "ok",
      fuente: "contratos[].fechaTermino",
    },
    {
      id: "obtentores_sin_regla",
      pregunta: "¿A qué obtentor le voy a pagar sin regla escrita?",
      etiqueta: "Obtentores sin participación definida",
      valor: sinReglaObtentor,
      formato: "conteo",
      detalle: `de ${obtentores.length} obtentores`,
      severidad: sinReglaObtentor > 0 ? "alto" : "ok",
      fuente: "obtentores[].participacionIngresos",
    },
    {
      id: "base_plantada",
      pregunta: "¿Sobre cuánta base productiva estoy cobrando?",
      etiqueta: "Plantaciones registradas",
      valor: c.plantaciones,
      formato: "conteo",
      detalle: `${c.clientes} clientes · ${c.variedades} variedades`,
      severidad: c.plantaciones === 0 ? "alto" : "info",
      fuente: "blobCounts()",
    },
  ];
}

// ── Alertas ────────────────────────────────────────────────────────
// Regla del carril: una alerta sin acción es decoración. Cada alerta lleva
// `accion` (el verbo), `entidad` (a dónde lleva) y `porQue` (el impacto en
// plata o en riesgo). Si no se puede escribir el `porQue`, la alerta no va.
export function alertasAccionables(blob, hoy = new Date()) {
  const b = blob || {};
  const out = [];

  for (const ct of arr(b.contratos)) {
    const nombre = txt(ct.razonSocial) || txt(ct.id);
    const ref = { tipo: "contrato", id: txt(ct.id), nombre };
    const moneda = txt(ct.moneda) || "USD";

    if (!ct.firmadoLicenciado || !ct.firmadoOsiris) {
      const falta = [
        !ct.firmadoLicenciado ? "el licenciado" : null,
        !ct.firmadoOsiris ? "Osiris" : null,
      ].filter(Boolean).join(" y ");
      out.push({
        id: `firma:${ct.id}`,
        severidad: "critico",
        titulo: `${nombre} · falta la firma de ${falta}`,
        porQue: `Deja en el aire ${formatearValor(ct.montoContractFee, "moneda")} ${moneda} de fee de entrada y todo el royalty asociado.`,
        accion: "Solicitar firma",
        entidad: ref,
      });
    }

    const d = diasHasta(ct.fechaTermino, hoy);
    if (d != null && d < 0) {
      out.push({
        id: `vencido:${ct.id}`,
        severidad: "critico",
        titulo: `${nombre} · contrato vencido hace ${Math.abs(d)} días`,
        porQue: "Se sigue devengando royalty sobre un contrato sin vigencia.",
        accion: "Renovar o dar de baja",
        entidad: ref,
      });
    } else if (d != null && d <= 90) {
      out.push({
        id: `porvencer:${ct.id}`,
        severidad: "alto",
        titulo: `${nombre} · vence en ${d} días`,
        porQue: "Renegociar antes del vencimiento evita quedar sin tarifa vigente.",
        accion: "Agendar renegociación",
        entidad: ref,
      });
    }

    const plant = arr(ct.plantaciones);
    if (num(ct.valorRoyaltyPlanta) === 0 && plant.length > 0) {
      out.push({
        id: `tarifa_rp:${ct.id}`,
        severidad: "alto",
        titulo: `${nombre} · royalty por planta en cero con ${plant.length} plantaciones`,
        porQue: "Con tarifa en cero no se factura nada aunque haya plantas en tierra.",
        accion: "Cargar tarifa",
        entidad: ref,
      });
    }

    if (!txt(ct.mesFacuracionRC) && num(ct.valorRoyaltyComercial) > 0) {
      out.push({
        id: `mes_rc:${ct.id}`,
        severidad: "alto",
        titulo: `${nombre} · sin mes de facturación del royalty comercial`,
        porQue: "Sin mes definido el cobro no entra a ningún trimestre y se pasa el año.",
        accion: "Definir mes",
        entidad: ref,
      });
    }

    const tieneFee = txt(ct.tipoContractFee) && ct.tipoContractFee !== "Sin Contract Fee";
    if (tieneFee && !ct.contractFeePagado && num(ct.montoContractFee) > 0) {
      out.push({
        id: `fee:${ct.id}`,
        severidad: "alto",
        titulo: `${nombre} · contract fee sin cobrar`,
        porQue: `${formatearValor(ct.montoContractFee, "moneda")} ${moneda} pendientes de cobro.`,
        accion: "Emitir cobro",
        entidad: ref,
      });
    }

    const sinPlantas = plant.filter((p) => num(p.nPlantas) === 0);
    if (sinPlantas.length > 0) {
      out.push({
        id: `plantas0:${ct.id}`,
        severidad: "info",
        titulo: `${nombre} · ${sinPlantas.length} plantaciones sin número de plantas`,
        porQue: "El royalty por planta se calcula sobre ese dato; en cero no aporta.",
        accion: "Completar plantaciones",
        entidad: ref,
      });
    }

    if (!anexoActivo(ct.anexo1)) {
      out.push({
        id: `anexo1:${ct.id}`,
        severidad: "info",
        titulo: `${nombre} · sin Anexo 1`,
        porQue: "El anexo es el que fija variedades y superficie licenciadas.",
        accion: "Adjuntar anexo",
        entidad: ref,
      });
    }
  }

  for (const ob of arr(b.obtentores)) {
    const nombre = txt(ob.obtentor) || txt(ob.id);
    const ref = { tipo: "obtentor", id: txt(ob.id), nombre };

    if (arr(ob.participacionIngresos).length === 0) {
      out.push({
        id: `participacion:${ob.id}`,
        severidad: "alto",
        titulo: `${nombre} · sin reglas de participación`,
        porQue: "Sin regla no hay forma de calcular cuánto le corresponde de cada ingreso.",
        accion: "Definir participación",
        entidad: ref,
      });
    }

    const d = diasHasta(ob.f_vencimiento, hoy);
    if (d != null && d < 0) {
      out.push({
        id: `obt_vencido:${ob.id}`,
        severidad: "critico",
        titulo: `${nombre} · contrato de obtentor vencido hace ${Math.abs(d)} días`,
        porQue: "Se están licenciando variedades sin respaldo contractual vigente.",
        accion: "Renovar contrato",
        entidad: ref,
      });
    } else if (d != null && d <= 90) {
      out.push({
        id: `obt_porvencer:${ob.id}`,
        severidad: "alto",
        titulo: `${nombre} · contrato de obtentor vence en ${d} días`,
        porQue: "Perder la representación corta el ingreso de todas sus variedades.",
        accion: "Agendar renovación",
        entidad: ref,
      });
    }

    if (arr(ob.pbr).length === 0) {
      out.push({
        id: `pbr:${ob.id}`,
        severidad: "info",
        titulo: `${nombre} · sin registros PBR cargados`,
        porQue: "Sin PBR no se puede acreditar la titularidad de la variedad.",
        accion: "Cargar PBR",
        entidad: ref,
      });
    }
  }

  for (const vi of arr(b.viveros)) {
    const nombre = txt(vi.viverista) || txt(vi.razonSocial) || txt(vi.id);
    const d = diasHasta(vi.f_vencimiento, hoy);
    if (d != null && d <= 90) {
      out.push({
        id: `viv:${vi.id}`,
        severidad: d < 0 ? "alto" : "info",
        titulo:
          d < 0
            ? `${nombre} · contrato de vivero vencido hace ${Math.abs(d)} días`
            : `${nombre} · contrato de vivero vence en ${d} días`,
        porQue: "Sin vivero habilitado no hay plantas que despachar la próxima temporada.",
        accion: "Revisar contrato",
        entidad: { tipo: "vivero", id: txt(vi.id), nombre },
      });
    }
  }

  return ordenarPorSeveridad(out);
}

const ORDEN = { critico: 0, alto: 1, info: 2, ok: 3 };

export function ordenarPorSeveridad(lista) {
  return arr(lista)
    .map((a, i) => ({ a, i }))
    .sort((x, y) => {
      const d = (ORDEN[x.a.severidad] ?? 9) - (ORDEN[y.a.severidad] ?? 9);
      if (d !== 0) return d;
      const t = txt(x.a.titulo).localeCompare(txt(y.a.titulo), "es");
      return t !== 0 ? t : x.i - y.i;
    })
    .map((x) => x.a);
}

export function resumenAlertas(lista) {
  const r = { critico: 0, alto: 0, info: 0, ok: 0, total: 0 };
  for (const a of arr(lista)) {
    if (r[a.severidad] != null) r[a.severidad] += 1;
    r.total += 1;
  }
  return r;
}

// ── Búsqueda transversal ───────────────────────────────────────────
// Un índice plano sobre todas las entidades. Reemplaza el tener que recordar
// en qué pestaña vive cada cosa.
export function construirIndice(blob) {
  const b = blob || {};
  const idx = [];
  const push = (tipo, id, titulo, subtitulo, terminos) =>
    idx.push({
      tipo,
      id: txt(id),
      titulo: txt(titulo) || txt(id),
      subtitulo: txt(subtitulo),
      _busqueda: normalizar([titulo, subtitulo, ...arr(terminos)].map(txt).join(" ")),
    });

  for (const ct of arr(b.contratos))
    push("contrato", ct.id, ct.razonSocial, `${txt(ct.tipoContrato) || "Contrato"} · ${txt(ct.pais)}`,
      [ct.taxID, ct.nombreComercial, ct.nombrePredio, ct.region, ct.moneda]);
  for (const cl of arr(b.clientes))
    push("cliente", cl.id, cl.razonSocial || cl.nombreComercial, `Cliente · ${txt(cl.pais)}`,
      [cl.taxID, cl.nombreComercial, cl.ciudad, cl.repLegal]);
  for (const ob of arr(b.obtentores))
    push("obtentor", ob.id, ob.obtentor, "Obtentor", [ob.pais, ob.contacto, ob.territorios]);
  for (const v of arr(b.variedades))
    push("variedad", v.id, v.variedad, `Variedad · ${txt(v.especie)}`, [v.obtentor, v.nRegistro]);
  for (const es of arr(b.especies))
    push("especie", es.id, es.nombre, "Especie", []);
  for (const vi of arr(b.viveros))
    push("vivero", vi.id, vi.viverista, `Vivero · ${txt(vi.pais)}`, [vi.forma_pago, vi.estado_contrato]);

  return idx;
}

// Marcas diacríticas combinantes (U+0300–U+036F). Se arma por código y no
// escribiendo el rango literal, para que el archivo quede en ASCII puro en
// esta línea y ninguna herramienta de la cadena lo recodifique al pasar.
const DIACRITICOS = new RegExp(
  "[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]",
  "g"
);

export function normalizar(s) {
  return txt(s).toLowerCase().normalize("NFD").replace(DIACRITICOS, "").trim();
}

// Búsqueda por subcadena, con todas las palabras exigidas. Sin fuzzy: en
// datos financieros un match aproximado que trae el contrato equivocado es
// peor que no traer nada.
export function buscar(indice, consulta, limite = 20) {
  const q = normalizar(consulta);
  if (!q) return [];
  const palabras = q.split(/\s+/).filter(Boolean);
  const res = [];
  for (const it of arr(indice)) {
    const campo = it._busqueda || "";
    if (!palabras.every((p) => campo.includes(p))) continue;
    const t = normalizar(it.titulo);
    // Empezar por la consulta gana sobre contenerla en el medio, y eso gana
    // sobre haber calzado sólo por un campo secundario.
    const puntaje = t.startsWith(q) ? 0 : t.includes(q) ? 1 : 2;
    res.push({ ...it, _puntaje: puntaje });
  }
  res.sort((a, b) => a._puntaje - b._puntaje || a.titulo.localeCompare(b.titulo, "es"));
  return res.slice(0, limite);
}

// ── Ficha 360° ─────────────────────────────────────────────────────
// Todo lo que se sabe de una entidad, reunido, sin obligar a recorrer
// pestañas. Devuelve secciones genéricas para que la vista no tenga que
// conocer el modelo de datos.
export function ficha360(blob, tipo, id) {
  const b = blob || {};
  if (tipo === "contrato") return fichaContrato(b, id);
  if (tipo === "cliente") return fichaCliente(b, id);
  if (tipo === "obtentor") return fichaObtentor(b, id);
  if (tipo === "variedad") return fichaVariedad(b, id);
  return null;
}

const campo = (etiqueta, valor, formato) => ({
  etiqueta,
  valor,
  formato: formato || "texto",
});

const siNo = (v) => (v ? "Sí" : "No");

function fichaContrato(b, id) {
  const ct = arr(b.contratos).find((x) => txt(x.id) === txt(id));
  if (!ct) return null;
  const plant = arr(ct.plantaciones);
  const firmado = !!ct.firmadoLicenciado && !!ct.firmadoOsiris;

  return {
    tipo: "contrato",
    id: txt(ct.id),
    titulo: txt(ct.razonSocial),
    subtitulo: `${txt(ct.tipoContrato) || "Licencia"} · ${txt(ct.pais)} · ${txt(ct.moneda) || "USD"}`,
    estado: firmado ? "ok" : "critico",
    estadoTexto: firmado ? "Firmado" : "Firma pendiente",
    secciones: [
      {
        titulo: "Identificación",
        campos: [
          campo("Razón social", txt(ct.razonSocial)),
          campo("Nombre comercial", txt(ct.nombreComercial)),
          campo("Tax ID", txt(ct.taxID)),
          campo("País", txt(ct.pais)),
          campo("Representante", txt(ct.nombreRep) || txt(ct.representanteLegal)),
        ],
      },
      {
        titulo: "Vigencia",
        campos: [
          campo("Fecha contrato", txt(ct.fechaContrato), "fecha"),
          campo("Fecha término", txt(ct.fechaTermino) || "sin término", "fecha"),
          campo("Renovable", siNo(ct.renovable)),
          campo("Firma licenciado", siNo(ct.firmadoLicenciado)),
          campo("Firma Osiris", siNo(ct.firmadoOsiris)),
        ],
      },
      {
        titulo: "Economía",
        campos: [
          campo("Tipo contract fee", txt(ct.tipoContractFee)),
          campo("Monto contract fee", num(ct.montoContractFee), "moneda"),
          campo("Contract fee pagado", siNo(ct.contractFeePagado)),
          campo("Royalty por planta", num(ct.valorRoyaltyPlanta), "moneda"),
          campo("Royalty comercial (por ha)", num(ct.valorRoyaltyComercial), "moneda"),
          campo("Mes facturación RC", txt(ct.mesFacuracionRC) || "sin definir"),
          campo("Reajuste por inflación", siNo(ct.royaltyInflacion)),
        ],
      },
      {
        titulo: "Base productiva",
        campos: [
          campo("Plantaciones", plant.length, "conteo"),
          campo("Plantas", plant.reduce((a, p) => a + num(p.nPlantas), 0), "conteo"),
          campo("Hectáreas", plant.reduce((a, p) => a + num(p.hectareas), 0), "numero"),
          campo("Órdenes de compra", arr(ct.ordenesCompra).length, "conteo"),
        ],
      },
      {
        titulo: "Documentos",
        campos: [
          campo("Anexo 1", siNo(anexoActivo(ct.anexo1))),
          campo("Anexo 2", siNo(anexoActivo(ct.anexo2))),
          campo("Anexo 3", siNo(anexoActivo(ct.anexo3))),
          campo("Anexos extra", arr(ct.anexosExtra).length, "conteo"),
          campo("Predio", txt(ct.nombrePredio)),
        ],
      },
    ],
    relacionados: plant.map((p, i) => ({
      tipo: "plantacion",
      id: txt(p.id) || `${ct.id}-p${i}`,
      titulo: `${txt(p.variedad) || "Sin variedad"} · ${txt(p.tipoPlantacion) || "Comercial"}`,
      subtitulo: `${num(p.nPlantas).toLocaleString("es-CL")} plantas · ${num(p.hectareas)} ha`,
    })),
  };
}

function fichaCliente(b, id) {
  const cl = arr(b.clientes).find((x) => txt(x.id) === txt(id));
  if (!cl) return null;
  // Enlace por id, con caída a razón social: el módulo hace lo mismo, porque
  // muchos contratos antiguos no tienen `clienteId`.
  const suyos = arr(b.contratos).filter(
    (ct) =>
      (txt(ct.clienteId) && txt(ct.clienteId) === txt(cl.id)) ||
      txt(ct.razonSocial) === txt(cl.razonSocial)
  );
  return {
    tipo: "cliente",
    id: txt(cl.id),
    titulo: txt(cl.razonSocial) || txt(cl.nombreComercial),
    subtitulo: `Cliente · ${txt(cl.pais)}`,
    estado: suyos.length ? "ok" : "info",
    estadoTexto: suyos.length ? `${suyos.length} contratos` : "Sin contratos",
    secciones: [
      {
        titulo: "Identificación",
        campos: [
          campo("Razón social", txt(cl.razonSocial)),
          campo("Nombre comercial", txt(cl.nombreComercial)),
          campo("Tax ID", txt(cl.taxID)),
          campo("País", txt(cl.pais)),
          campo("Ciudad", txt(cl.ciudad)),
        ],
      },
      {
        titulo: "Contacto",
        campos: [
          campo("Representante legal", txt(cl.repLegal)),
          campo("RUC representante", txt(cl.rucRep)),
          campo("Contacto cobranza", txt(cl.contactoCobranza)),
          campo("Dirección", txt(cl.direccion)),
        ],
      },
    ],
    relacionados: suyos.map((ct) => ({
      tipo: "contrato",
      id: txt(ct.id),
      titulo: txt(ct.razonSocial),
      subtitulo: `${txt(ct.tipoContrato) || "Licencia"} · ${txt(ct.fechaContrato)}`,
    })),
  };
}

function fichaObtentor(b, id) {
  const ob = arr(b.obtentores).find((x) => txt(x.id) === txt(id));
  if (!ob) return null;
  const reglas = arr(ob.participacionIngresos);
  const vars = arr(b.variedades).filter((v) => txt(v.obtentor) === txt(ob.obtentor));
  return {
    tipo: "obtentor",
    id: txt(ob.id),
    titulo: txt(ob.obtentor),
    subtitulo: `Obtentor · ${txt(ob.pais)}`,
    estado: reglas.length ? "ok" : "alto",
    estadoTexto: reglas.length ? `${reglas.length} reglas` : "Sin participación definida",
    secciones: [
      {
        titulo: "Identificación",
        campos: [
          campo("Obtentor", txt(ob.obtentor)),
          campo("País", txt(ob.pais)),
          campo("Contacto", txt(ob.contacto)),
          campo("Representante legal", txt(ob.representanteLegal)),
        ],
      },
      {
        titulo: "Vigencia",
        campos: [
          campo("Inicio", txt(ob.f_inicio), "fecha"),
          campo("Vencimiento", txt(ob.f_vencimiento) || "sin fecha", "fecha"),
          campo("Renovable", siNo(ob.renovable)),
          campo("Exclusividad", txt(ob.exclusividad)),
          campo("Estado contrato", txt(ob.estado_contrato)),
        ],
      },
      {
        titulo: "Participación",
        // Se muestran las reglas, no una suma: `valor` es un porcentaje y
        // sumarlo no da plata. Ver nota de cabecera del archivo.
        campos: [
          campo("Reglas de participación", reglas.length, "conteo"),
          campo("Mínimo garantizado", num(ob.minimoGarantizado), "moneda"),
          campo("Moneda mínimo", txt(ob.monedaMinimo) || "USD"),
          campo("Derecho de auditoría", siNo(ob.derechoAuditoria)),
        ],
      },
      {
        titulo: "Propiedad intelectual",
        campos: [
          campo("Registros PBR", arr(ob.pbr).length, "conteo"),
          campo("Especies representadas", arr(ob.especies).length, "conteo"),
          campo("Variedades en el maestro", vars.length, "conteo"),
        ],
      },
    ],
    relacionados: reglas.map((r, i) => ({
      tipo: "regla",
      id: txt(r.id) || `${ob.id}-r${i}`,
      titulo: `${txt(r.tipoIngreso) || "ingreso"} · ${txt(r.valor)} %`,
      subtitulo: `${txt(r.especie) || "todas las especies"} · WHT ${num(r.wht)} %`,
    })),
  };
}

function fichaVariedad(b, id) {
  const v = arr(b.variedades).find((x) => txt(x.id) === txt(id));
  if (!v) return null;
  const enContratos = arr(b.contratos).filter((ct) =>
    arr(ct.plantaciones).some((p) => txt(p.variedad) === txt(v.variedad))
  );
  const plantas = enContratos.reduce(
    (a, ct) =>
      a +
      arr(ct.plantaciones)
        .filter((p) => txt(p.variedad) === txt(v.variedad))
        .reduce((s, p) => s + num(p.nPlantas), 0),
    0
  );
  return {
    tipo: "variedad",
    id: txt(v.id),
    titulo: txt(v.variedad),
    subtitulo: `Variedad · ${txt(v.especie)}`,
    estado: enContratos.length ? "ok" : "info",
    estadoTexto: enContratos.length ? `${enContratos.length} contratos` : "Sin plantar",
    secciones: [
      {
        titulo: "Identificación",
        campos: [
          campo("Variedad", txt(v.variedad)),
          campo("Especie", txt(v.especie)),
          campo("Obtentor", txt(v.obtentor)),
          campo("N° registro", txt(v.nRegistro)),
        ],
      },
      {
        titulo: "Despliegue",
        campos: [
          campo("Contratos con la variedad", enContratos.length, "conteo"),
          campo("Plantas en tierra", plantas, "conteo"),
        ],
      },
    ],
    relacionados: enContratos.map((ct) => ({
      tipo: "contrato",
      id: txt(ct.id),
      titulo: txt(ct.razonSocial),
      subtitulo: txt(ct.pais),
    })),
  };
}

// ── Tabla densa de contratos ───────────────────────────────────────
export function filasContratos(blob, hoy = new Date()) {
  return arr((blob || {}).contratos).map((ct) => {
    const plant = arr(ct.plantaciones);
    const d = diasHasta(ct.fechaTermino, hoy);
    const firmado = !!ct.firmadoLicenciado && !!ct.firmadoOsiris;
    return {
      id: txt(ct.id),
      cliente: txt(ct.razonSocial),
      pais: txt(ct.pais),
      tipo: txt(ct.tipoContrato),
      moneda: txt(ct.moneda) || "USD",
      fechaContrato: txt(ct.fechaContrato),
      diasParaVencer: d,
      contractFee: num(ct.montoContractFee),
      royaltyPlanta: num(ct.valorRoyaltyPlanta),
      royaltyComercial: num(ct.valorRoyaltyComercial),
      plantaciones: plant.length,
      plantas: plant.reduce((a, p) => a + num(p.nPlantas), 0),
      hectareas: plant.reduce((a, p) => a + num(p.hectareas), 0),
      firmado,
      severidad: !firmado
        ? "critico"
        : d != null && d < 0
        ? "critico"
        : d != null && d <= 90
        ? "alto"
        : "ok",
    };
  });
}

// Ordenamiento estable y con criterio explícito para los nulos: en una tabla
// financiera, un `null` que se cuela arriba al ordenar por vencimiento hace
// tomar la decisión equivocada. Los nulos van SIEMPRE al final, en las dos
// direcciones, y los empates conservan el orden de entrada.
export function ordenarFilas(filas, columna, direccion = "asc") {
  const sig = direccion === "desc" ? -1 : 1;
  return arr(filas)
    .map((f, i) => ({ f, i }))
    .sort((a, b) => {
      const va = a.f[columna], vb = b.f[columna];
      const na = va == null || va === "", nb = vb == null || vb === "";
      if (na && nb) return a.i - b.i;
      if (na) return 1;
      if (nb) return -1;
      let d;
      if (typeof va === "number" && typeof vb === "number") d = va - vb;
      else if (typeof va === "boolean" && typeof vb === "boolean") d = (va ? 1 : 0) - (vb ? 1 : 0);
      else d = txt(va).localeCompare(txt(vb), "es", { numeric: true });
      return d !== 0 ? d * sig : a.i - b.i;
    })
    .map((x) => x.f);
}

export function formatearValor(valor, formato) {
  if (valor == null || valor === "") return "—";
  if (formato === "moneda") {
    return `$${num(valor).toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
  if (formato === "conteo") return num(valor).toLocaleString("es-CL");
  if (formato === "numero") return num(valor).toLocaleString("es-CL", { maximumFractionDigits: 2 });
  return txt(valor) || "—";
}
