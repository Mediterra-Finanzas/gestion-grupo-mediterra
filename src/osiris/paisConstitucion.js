/* eslint-disable */
// País de constitución del cliente.
//
// Es un dato NUEVO y SEPARADO. No es el campo "país" que ya existe, no lo
// reemplaza y no entra en ningún cálculo.
//
//   · "País del cliente" (campo `pais`, ya existente) — identificación operativa.
//     Hoy el motor deduce de ahí la retención, así que tocarlo mueve importes.
//     Este módulo NO lo lee, NO lo escribe y NO lo propone.
//
//   · "País de constitución" (campo `paisConstitucion`, nuevo) — dónde está
//     constituida la sociedad, según su documentación. Es un antecedente: se
//     declara, se respalda y se registra. No cambia ninguna tasa ni ningún neto.
//
// La fuente canónica es el CLIENTE, no el contrato. Un contrato lo resuelve
// mirando a su cliente (`clienteId`); nunca guarda una copia propia, para que
// no existan dos respuestas distintas para la misma sociedad.
//
// Reglas que el modelo sostiene:
//   · Sin declarar NO significa "no existe": significa que nadie lo cargó.
//   · No se completa solo. Ni desde el país, ni desde la dirección, ni desde
//     la ciudad. Un indicio documental es un indicio: hay que declararlo a mano.
//   · Declararlo no valida nada tributario ni habilita ningún cálculo.

export const PENDIENTE = "pendiente";
export const DECLARADO = "declarado";
export const SIN_CLIENTE = "sinCliente";

// Catálogo propio. NO es la lista del campo "país" (PAISES en OsirisModule),
// que se deja exactamente como está. Acá sí está Reino Unido.
export const PAISES_CONSTITUCION = [
  "Alemania", "Argentina", "Australia", "Brasil", "Canadá", "Chile", "China",
  "Colombia", "Corea del Sur", "España", "Estados Unidos", "Francia", "Israel",
  "Italia", "México", "Nueva Zelanda", "Países Bajos", "Perú", "Reino Unido",
  "Sudáfrica",
];

// Variantes de escritura que aparecen en los datos y en los documentos. Solo se
// usan para RECONOCER texto, nunca para declarar nada por su cuenta.
const ALIAS = {
  "Reino Unido": ["reino unido", "united kingdom", "uk", "u.k.", "england", "inglaterra", "gran bretaña"],
  "Estados Unidos": ["estados unidos", "united states", "usa", "u.s.a.", "ee.uu."],
  "Países Bajos": ["países bajos", "paises bajos", "netherlands", "holanda"],
  "Perú": ["perú", "peru"],
  "México": ["méxico", "mexico"],
  "Corea del Sur": ["corea del sur", "corea", "south korea"],
  "España": ["españa", "espana", "spain"],
  "Chile": ["chile"],
  "Sudáfrica": ["sudáfrica", "sudafrica", "south africa"],
  "Canadá": ["canadá", "canada"],
  "Nueva Zelanda": ["nueva zelanda", "new zealand"],
};

const norm = (s) => String(s == null ? "" : s).trim();

// ── Lectura ───────────────────────────────────────────────────────────────

// Lo declarado para un cliente. NUNCA cae al campo `pais`.
export function paisConstitucionDe(cliente) {
  if (!cliente) {
    return {
      estado: SIN_CLIENTE, valor: null, declarado: false,
      etiqueta: "sin cliente asociado",
      detalle: "No hay un cliente del que leerlo. Eso no dice nada sobre dónde está constituida la sociedad.",
      respaldo: "", usuario: "", fecha: "",
    };
  }
  const pc = cliente.paisConstitucion;
  const valor = pc && typeof pc === "object" ? norm(pc.valor) : norm(pc);
  if (!valor) {
    return {
      estado: PENDIENTE, valor: null, declarado: false,
      etiqueta: "sin declarar",
      detalle: '"Sin declarar" no significa "no existe": significa que nadie lo cargó todavía.',
      respaldo: "", usuario: "", fecha: "",
    };
  }
  return {
    estado: DECLARADO, valor, declarado: true,
    etiqueta: valor,
    detalle: "Declarado como antecedente. No valida ninguna tasa ni cambia ningún importe.",
    respaldo: pc && typeof pc === "object" ? norm(pc.respaldo) : "",
    usuario: pc && typeof pc === "object" ? norm(pc.usuario) : "",
    fecha: pc && typeof pc === "object" ? norm(pc.fecha) : "",
  };
}

// Para un contrato: se resuelve por su cliente. No hay copia por contrato.
export function paisConstitucionDeContrato(contrato, clientes) {
  const id = contrato && norm(contrato.clienteId);
  if (!id) return paisConstitucionDe(null);
  const cli = (clientes || []).find((c) => c && c.id === id);
  if (!cli) return paisConstitucionDe(null);
  return Object.assign(paisConstitucionDe(cli), { clienteId: id, cliente: cli.razonSocial || "" });
}

// Qué le falta a un cliente para tener el antecedente completo.
export function faltantesPaisConstitucion(cliente) {
  const e = paisConstitucionDe(cliente);
  const faltan = [];
  if (e.estado === SIN_CLIENTE) return ["el cliente"];
  if (!e.declarado) faltan.push("país de constitución");
  if (e.declarado && !e.respaldo) faltan.push("respaldo documental");
  return faltan;
}

// ── Indicio documental (mira, no declara) ─────────────────────────────────

// Reconoce países nombrados en la dirección o la ciudad del cliente. Sirve para
// decir "revisá este caso", no para completar el campo. Si la sociedad dice
// Perú pero su domicilio está en Londres, alguien tiene que mirarlo.
export function indicioDesdeDocumentos(cliente) {
  if (!cliente) return { hay: false, paises: [], texto: "" };
  const txt = (norm(cliente.direccion) + " " + norm(cliente.ciudad)).toLowerCase();
  if (!txt.trim()) return { hay: false, paises: [], texto: "" };
  const encontrados = [];
  PAISES_CONSTITUCION.forEach((p) => {
    const formas = ALIAS[p] || [p.toLowerCase()];
    const pega = formas.some((f) => new RegExp("(^|[^a-záéíóúñ])" + f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-záéíóúñ]|$)", "i").test(txt));
    if (pega) encontrados.push(p);
  });
  return {
    hay: encontrados.length > 0,
    paises: encontrados,
    texto: encontrados.length
      ? "La dirección menciona " + encontrados.join(" / ") + ". Es un indicio documental, no una declaración: hay que confirmarlo y cargarlo a mano."
      : "",
  };
}

// Casos donde conviene mirar: el indicio no coincide con nada declarado.
export function clientesPorRevisar(clientes) {
  return (clientes || []).filter((c) => {
    const e = paisConstitucionDe(c);
    if (e.declarado) return false;              // ya está resuelto
    const ind = indicioDesdeDocumentos(c);
    if (!ind.hay) return false;
    const paisActual = norm(c.pais).toLowerCase();
    // Solo molesta cuando el indicio apunta a otro lado que el país cargado.
    return !ind.paises.some((p) => {
      const formas = ALIAS[p] || [p.toLowerCase()];
      return formas.indexOf(paisActual) >= 0 || p.toLowerCase() === paisActual;
    });
  });
}

// Informativo: lo declarado no coincide con el campo de identificación. No es
// un error ni dispara nada; son dos datos distintos y pueden diferir.
export function divergenciaConPaisIdentificacion(cliente) {
  const e = paisConstitucionDe(cliente);
  const pais = norm(cliente && cliente.pais);
  if (!e.declarado || !pais) return { hay: false, nota: "" };
  const formas = ALIAS[e.valor] || [e.valor.toLowerCase()];
  const igual = formas.indexOf(pais.toLowerCase()) >= 0 || e.valor.toLowerCase() === pais.toLowerCase();
  if (igual) return { hay: false, nota: "" };
  return {
    hay: true,
    pais,
    paisConstitucion: e.valor,
    nota: 'El campo "país del cliente" dice ' + pais + " y la sociedad se declara constituida en " +
      e.valor + ". Son dos datos distintos y pueden diferir legítimamente. " +
      "Esto no cambia ningún importe: el motor sigue calculando por el campo de identificación, como hasta hoy.",
  };
}

// ── Escritura (pura: devuelve un cliente nuevo) ───────────────────────────

export function declararPaisConstitucion(cliente, valor, extra) {
  if (!cliente) return cliente;
  const v = norm(valor);
  const o = extra || {};
  if (!v) {
    const copia = Object.assign({}, cliente);
    delete copia.paisConstitucion;              // retirar la declaración
    return copia;
  }
  return Object.assign({}, cliente, {
    paisConstitucion: {
      valor: v,
      respaldo: norm(o.respaldo),
      usuario: norm(o.usuario),
      fecha: norm(o.fecha) || new Date().toISOString().slice(0, 10),
    },
  });
}

// ── Garantía explícita ────────────────────────────────────────────────────

// Lo que este paquete NO hace. Está acá para que una prueba pueda afirmarlo y
// para que quede escrito en el código, no solo en un acta.
export const NO_HACE = Object.freeze({
  tocaElCampoPais: false,
  tocaElTerritorio: false,
  entraEnAlgunCalculo: false,
  completaClientesExistentes: false,
  guardaCopiaPorContrato: false,
  agregaPaisesAlCampoPais: false,
});
