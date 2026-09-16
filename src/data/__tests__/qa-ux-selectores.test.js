/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// QA UX · SELECTORES
// ═══════════════════════════════════════════════════════════════════
//
// La aritmética de la pantalla ejecutiva, verificada sin montar interfaz.
// Es la parte que el CFO valida antes de aceptar el rediseño: si el número
// no cuadra, el diseño no importa.

import {
  kpisEjecutivos,
  alertasAccionables,
  resumenAlertas,
  ordenarPorSeveridad,
  construirIndice,
  buscar,
  normalizar,
  ficha360,
  filasContratos,
  ordenarFilas,
  formatearValor,
  aFecha,
  diasHasta,
  temporadaDe,
  contractFeePorCobrar,
  anexoActivo,
} from "../../ux/selectores";
import { econ4 } from "../osirisCanonical";
import { DATOS_EJEMPLO, HOY_EJEMPLO } from "../../ux/ejemploDatos";

const kpi = (id, blob = DATOS_EJEMPLO) =>
  kpisEjecutivos(blob, HOY_EJEMPLO).find((k) => k.id === id);

describe("KPIs · cada uno responde una pregunta y declara su fuente", () => {
  const todos = kpisEjecutivos(DATOS_EJEMPLO, HOY_EJEMPLO);

  test("hay seis KPIs y ninguno repite id", () => {
    expect(todos).toHaveLength(6);
    expect(new Set(todos.map((k) => k.id)).size).toBe(6);
  });

  test("todos traen pregunta redactada como pregunta", () => {
    for (const k of todos) {
      expect(k.pregunta).toMatch(/^¿.+\?$/);
    }
  });

  test("todos declaran de qué campo sale la cifra", () => {
    for (const k of todos) expect(k.fuente).toBeTruthy();
  });

  test("todos traen severidad conocida", () => {
    for (const k of todos) {
      expect(["critico", "alto", "info", "ok", "neutro"]).toContain(k.severidad);
    }
  });
});

describe("KPIs · el ingreso devengado NO se recalcula, se delega en el motor congelado", () => {
  test("coincide exactamente con RP + RC + FE de econ4()", () => {
    const e = econ4(DATOS_EJEMPLO);
    // Aritmética explícita para que quede escrita en la prueba:
    //   RP = 42.000 × 0,85 + 8.000 × 0,85 + 15.000 × 1,00 + 0 × 0 = 57.500
    //   RC = (10 ha × 3.000) + (4 ha × 3.000) + (3 ha × 3.000) = 51.000
    //        (la plantación "Prueba" de 2 ha NO paga royalty comercial)
    //   FE = 30.000 + 30.000 + 0 = 60.000   (ct3 es "Sin Contract Fee")
    expect(e.RP).toBe(57500);
    expect(e.RC).toBe(51000);
    expect(e.FE).toBe(60000);
    expect(kpi("ingreso_devengado").valor).toBe(57500 + 51000 + 60000);
    expect(kpi("ingreso_devengado").valor).toBe(168500);
  });

  test("si el motor cambia, el KPI cambia con él (no hay suma paralela)", () => {
    const alterado = JSON.parse(JSON.stringify(DATOS_EJEMPLO));
    alterado.contratos[0].valorRoyaltyPlanta = 1.85;
    const e = econ4(alterado);
    expect(kpi("ingreso_devengado", alterado).valor).toBe(e.RP + e.RC + e.FE);
  });

  test("el IQ del motor NO se publica como moneda: valor es un porcentaje", () => {
    // econ4 devuelve IQ = 70 + 50 = 120, que son porcentajes sumados. Ningún
    // KPI puede mostrar eso como plata.
    expect(econ4(DATOS_EJEMPLO).IQ).toBe(120);
    const conIQ = kpisEjecutivos(DATOS_EJEMPLO, HOY_EJEMPLO).filter(
      (k) => k.formato === "moneda" && k.valor === 120
    );
    expect(conIQ).toEqual([]);
  });
});

describe("KPIs · contract fee por cobrar sale de campos directos del contrato", () => {
  test("cuenta sólo el que tiene fee y no está pagado", () => {
    // ct1: 30.000 pero contractFeePagado = true  → no cuenta
    // ct2: 30.000 sin pagar                      → cuenta
    // ct3: "Sin Contract Fee"                    → no cuenta
    expect(contractFeePorCobrar(DATOS_EJEMPLO)).toBe(30000);
    expect(kpi("fee_por_cobrar").valor).toBe(30000);
  });

  test("marcarlo pagado lo baja a cero", () => {
    const b = JSON.parse(JSON.stringify(DATOS_EJEMPLO));
    b.contratos[1].contractFeePagado = true;
    expect(contractFeePorCobrar(b)).toBe(0);
    expect(kpi("fee_por_cobrar", b).severidad).toBe("ok");
  });
});

describe("KPIs · conteos de riesgo", () => {
  test("un contrato sin firma del licenciado cuenta como sin firma completa", () => {
    const k = kpi("contratos_sin_firma");
    expect(k.valor).toBe(1);
    expect(k.severidad).toBe("critico");
  });

  test("vencidos y por vencer se distinguen: ct2 vence en 45 d, ct3 venció hace 120", () => {
    const k = kpi("contratos_por_vencer");
    expect(k.valor).toBe(1);
    expect(k.detalle).toBe("1 ya vencidos");
    expect(k.severidad).toBe("critico");
  });

  test("un obtentor sin reglas de participación se cuenta y se marca alto", () => {
    const k = kpi("obtentores_sin_regla");
    expect(k.valor).toBe(1);
    expect(k.severidad).toBe("alto");
  });

  test("con datos vacíos ningún KPI revienta", () => {
    const todos = kpisEjecutivos({}, HOY_EJEMPLO);
    expect(todos).toHaveLength(6);
    for (const k of todos) expect(Number.isNaN(k.valor)).toBe(false);
  });

  test("con datos nulos tampoco", () => {
    expect(() => kpisEjecutivos(null, HOY_EJEMPLO)).not.toThrow();
    expect(() => kpisEjecutivos(undefined)).not.toThrow();
  });
});

describe("alertas · todas son accionables o no existen", () => {
  const alertas = alertasAccionables(DATOS_EJEMPLO, HOY_EJEMPLO);

  test("cada alerta trae qué pasa, por qué importa y el verbo de la acción", () => {
    expect(alertas.length).toBeGreaterThan(0);
    for (const a of alertas) {
      expect(a.titulo).toBeTruthy();
      expect(a.porQue).toBeTruthy();
      expect(a.accion).toBeTruthy();
      expect(a.entidad).toBeTruthy();
      expect(a.entidad.tipo).toBeTruthy();
      expect(a.entidad.id).toBeTruthy();
    }
  });

  test("el verbo de la acción es un verbo, no un sustantivo", () => {
    for (const a of alertas) {
      expect(a.accion).toMatch(
        /^(Solicitar|Renovar|Agendar|Cargar|Definir|Emitir|Completar|Adjuntar|Revisar)/
      );
    }
  });

  test("los identificadores son únicos: no se duplican filas al re-renderizar", () => {
    expect(new Set(alertas.map((a) => a.id)).size).toBe(alertas.length);
  });

  test("vienen ordenadas por severidad, crítico primero", () => {
    const orden = { critico: 0, alto: 1, info: 2, ok: 3 };
    const pesos = alertas.map((a) => orden[a.severidad]);
    expect(pesos).toEqual([...pesos].sort((a, b) => a - b));
  });

  test("el resumen cuadra con el total", () => {
    const r = resumenAlertas(alertas);
    expect(r.critico + r.alto + r.info + r.ok).toBe(r.total);
    expect(r.total).toBe(alertas.length);
  });
});

describe("alertas · casos concretos del blob de ejemplo", () => {
  const alertas = alertasAccionables(DATOS_EJEMPLO, HOY_EJEMPLO);
  const porId = (id) => alertas.find((a) => a.id === id);

  test("falta de firma es crítica y cifra el fee que queda en el aire", () => {
    const a = porId("firma:ct2");
    expect(a.severidad).toBe("critico");
    expect(a.porQue).toContain("30.000");
  });

  test("contrato vencido es crítico y dice hace cuántos días", () => {
    const a = porId("vencido:ct3");
    expect(a.severidad).toBe("critico");
    expect(a.titulo).toContain("120 días");
  });

  test("contrato por vencer es alto y dice cuántos días faltan", () => {
    const a = porId("porvencer:ct2");
    expect(a.severidad).toBe("alto");
    expect(a.titulo).toContain("45 días");
  });

  test("tarifa de royalty en cero con plantaciones se avisa", () => {
    expect(porId("tarifa_rp:ct3")).toBeTruthy();
  });

  test("royalty comercial sin mes de facturación se avisa", () => {
    expect(porId("mes_rc:ct2")).toBeTruthy();
  });

  test("contract fee sin cobrar se avisa sólo en el que corresponde", () => {
    expect(porId("fee:ct2")).toBeTruthy();
    expect(porId("fee:ct1")).toBeUndefined();
    expect(porId("fee:ct3")).toBeUndefined();
  });

  test("obtentor vencido y sin reglas dispara sus tres alertas", () => {
    expect(porId("obt_vencido:obt2")).toBeTruthy();
    expect(porId("participacion:obt2")).toBeTruthy();
    expect(porId("pbr:obt2")).toBeTruthy();
  });

  test("vivero por vencer en 30 días entra como informativo", () => {
    expect(porId("viv:viv1").severidad).toBe("info");
  });

  test("el anexo en formato objeto {activo:true} no se confunde con ausencia", () => {
    expect(anexoActivo({ activo: true })).toBe(true);
    expect(anexoActivo({ activo: false })).toBe(false);
    expect(anexoActivo(true)).toBe(true);
    expect(anexoActivo(false)).toBe(false);
    expect(anexoActivo(undefined)).toBe(false);
    // ct1 tiene anexo1 como objeto activo → no debe aparecer la alerta.
    expect(porId("anexo1:ct1")).toBeUndefined();
    // ct2 lo tiene en false → sí aparece.
    expect(porId("anexo1:ct2")).toBeTruthy();
  });

  test("un blob vacío no genera alertas ni revienta", () => {
    expect(alertasAccionables({}, HOY_EJEMPLO)).toEqual([]);
    expect(alertasAccionables(null)).toEqual([]);
  });

  test("el orden es estable ante empates de severidad y título", () => {
    const dup = [
      { id: "a", severidad: "alto", titulo: "X" },
      { id: "b", severidad: "alto", titulo: "X" },
      { id: "c", severidad: "critico", titulo: "Y" },
    ];
    expect(ordenarPorSeveridad(dup).map((x) => x.id)).toEqual(["c", "a", "b"]);
  });
});

describe("búsqueda transversal", () => {
  const indice = construirIndice(DATOS_EJEMPLO);

  test("indexa las seis familias de entidades", () => {
    const tipos = new Set(indice.map((i) => i.tipo));
    expect(tipos).toEqual(
      new Set(["contrato", "cliente", "obtentor", "variedad", "especie", "vivero"])
    );
  });

  test("encuentra un contrato por razón social", () => {
    const r = buscar(indice, "maitenes");
    expect(r.some((x) => x.tipo === "contrato" && x.id === "ct1")).toBe(true);
  });

  test("ignora tildes en los dos sentidos", () => {
    expect(normalizar("Genética")).toBe("genetica");
    expect(buscar(indice, "genetica").length).toBeGreaterThan(0);
    expect(buscar(indice, "Rocío").length).toBeGreaterThan(0);
    expect(buscar(indice, "rocio").length).toBeGreaterThan(0);
  });

  test("busca también en campos secundarios, como el tax ID", () => {
    const r = buscar(indice, "20501234567");
    expect(r.length).toBeGreaterThan(0);
  });

  test("exige todas las palabras, no cualquiera de ellas", () => {
    expect(buscar(indice, "valle norte").length).toBeGreaterThan(0);
    expect(buscar(indice, "valle maitenes")).toEqual([]);
  });

  test("prioriza el que empieza por la consulta sobre el que la contiene", () => {
    const idx = [
      { tipo: "contrato", id: "1", titulo: "Norte Valle", subtitulo: "", _busqueda: "norte valle" },
      { tipo: "contrato", id: "2", titulo: "Valle Norte", subtitulo: "", _busqueda: "valle norte" },
    ];
    expect(buscar(idx, "valle")[0].id).toBe("2");
  });

  test("consulta vacía o de espacios no devuelve todo el universo", () => {
    expect(buscar(indice, "")).toEqual([]);
    expect(buscar(indice, "   ")).toEqual([]);
    expect(buscar(indice, null)).toEqual([]);
  });

  test("respeta el límite pedido", () => {
    expect(buscar(indice, "a", 2).length).toBeLessThanOrEqual(2);
  });

  test("no hay fuzzy: una consulta parecida pero distinta no trae nada", () => {
    expect(buscar(indice, "maitenez")).toEqual([]);
  });
});

describe("ficha 360", () => {
  test("contrato: reúne identificación, vigencia, economía, base y documentos", () => {
    const f = ficha360(DATOS_EJEMPLO, "contrato", "ct1");
    expect(f.titulo).toBe("Agrícola Los Maitenes");
    expect(f.secciones.map((s) => s.titulo)).toEqual([
      "Identificación",
      "Vigencia",
      "Economía",
      "Base productiva",
      "Documentos",
    ]);
  });

  test("contrato: los totales de la base productiva suman las plantaciones", () => {
    const f = ficha360(DATOS_EJEMPLO, "contrato", "ct1");
    const base = f.secciones.find((s) => s.titulo === "Base productiva");
    const val = (e) => base.campos.find((c) => c.etiqueta === e).valor;
    // 42.000 + 8.000 = 50.000 plantas ; 10 + 2 = 12 ha
    expect(val("Plantaciones")).toBe(2);
    expect(val("Plantas")).toBe(50000);
    expect(val("Hectáreas")).toBe(12);
  });

  test("contrato sin firmar se marca crítico y lo dice con palabras", () => {
    expect(ficha360(DATOS_EJEMPLO, "contrato", "ct2").estado).toBe("critico");
    expect(ficha360(DATOS_EJEMPLO, "contrato", "ct2").estadoTexto).toBe("Firma pendiente");
    expect(ficha360(DATOS_EJEMPLO, "contrato", "ct1").estadoTexto).toBe("Firmado");
  });

  test("cliente: enlaza sus contratos aunque el contrato use clienteId o razón social", () => {
    const f = ficha360(DATOS_EJEMPLO, "cliente", "cli1");
    expect(f.relacionados.map((r) => r.id)).toContain("ct1");
    expect(f.estadoTexto).toBe("1 contratos");
  });

  test("obtentor: muestra las reglas de participación, no una suma de porcentajes", () => {
    const f = ficha360(DATOS_EJEMPLO, "obtentor", "obt1");
    const part = f.secciones.find((s) => s.titulo === "Participación");
    const etiquetas = part.campos.map((c) => c.etiqueta);
    expect(etiquetas).toContain("Reglas de participación");
    // Ningún campo pretende ser el monto total de la participación.
    expect(etiquetas).not.toContain("Participación acumulada");
    expect(f.relacionados).toHaveLength(2);
  });

  test("obtentor sin reglas se marca alto", () => {
    expect(ficha360(DATOS_EJEMPLO, "obtentor", "obt2").estado).toBe("alto");
  });

  test("variedad: cuenta en cuántos contratos está y cuántas plantas hay", () => {
    const f = ficha360(DATOS_EJEMPLO, "variedad", "var1");
    const desp = f.secciones.find((s) => s.titulo === "Despliegue");
    const val = (e) => desp.campos.find((c) => c.etiqueta === e).valor;
    // Ventura: 42.000 en ct1 + 15.000 en ct2
    expect(val("Contratos con la variedad")).toBe(2);
    expect(val("Plantas en tierra")).toBe(57000);
  });

  test("una entidad inexistente devuelve null en vez de una ficha en blanco", () => {
    expect(ficha360(DATOS_EJEMPLO, "contrato", "no-existe")).toBeNull();
    expect(ficha360(DATOS_EJEMPLO, "planeta", "ct1")).toBeNull();
    expect(ficha360({}, "contrato", "ct1")).toBeNull();
  });
});

describe("tabla de contratos", () => {
  const filas = filasContratos(DATOS_EJEMPLO, HOY_EJEMPLO);

  test("una fila por contrato, con los agregados ya resueltos", () => {
    expect(filas).toHaveLength(3);
    const ct1 = filas.find((f) => f.id === "ct1");
    expect(ct1.plantas).toBe(50000);
    expect(ct1.hectareas).toBe(12);
    expect(ct1.firmado).toBe(true);
  });

  test("la severidad de la fila resume firma y vencimiento", () => {
    expect(filas.find((f) => f.id === "ct1").severidad).toBe("ok");
    expect(filas.find((f) => f.id === "ct2").severidad).toBe("critico"); // sin firma
    expect(filas.find((f) => f.id === "ct3").severidad).toBe("critico"); // vencido
  });
});

describe("ordenamiento de tabla · los nulos nunca engañan", () => {
  const base = [
    { id: "a", n: 3, t: "beta" },
    { id: "b", n: null, t: "alfa" },
    { id: "c", n: 1, t: "gamma" },
    { id: "d", n: 10, t: "" },
  ];

  test("ascendente: nulos al final", () => {
    expect(ordenarFilas(base, "n", "asc").map((x) => x.id)).toEqual(["c", "a", "d", "b"]);
  });

  test("descendente: los nulos SIGUEN al final, no saltan al tope", () => {
    expect(ordenarFilas(base, "n", "desc").map((x) => x.id)).toEqual(["d", "a", "c", "b"]);
  });

  test("el vacío de texto se trata como nulo", () => {
    expect(ordenarFilas(base, "t", "asc").map((x) => x.id)).toEqual(["b", "a", "c", "d"]);
  });

  test("es estable: los empates conservan el orden de entrada", () => {
    const emp = [
      { id: "1", n: 5 },
      { id: "2", n: 5 },
      { id: "3", n: 5 },
    ];
    expect(ordenarFilas(emp, "n", "asc").map((x) => x.id)).toEqual(["1", "2", "3"]);
    expect(ordenarFilas(emp, "n", "desc").map((x) => x.id)).toEqual(["1", "2", "3"]);
  });

  test("no muta el arreglo original", () => {
    const copia = base.slice();
    ordenarFilas(base, "n", "desc");
    expect(base).toEqual(copia);
  });

  test("ordena texto con criterio español y numérico natural", () => {
    const t = [{ id: "1", t: "Fila 10" }, { id: "2", t: "Fila 2" }];
    expect(ordenarFilas(t, "t", "asc").map((x) => x.id)).toEqual(["2", "1"]);
  });

  test("booleanos ordenan falso antes que verdadero", () => {
    const b = [{ id: "1", v: true }, { id: "2", v: false }];
    expect(ordenarFilas(b, "v", "asc").map((x) => x.id)).toEqual(["2", "1"]);
  });
});

describe("formato y fechas", () => {
  test("moneda, conteo y número tienen formatos distintos y previsibles", () => {
    expect(formatearValor(1234.5, "moneda")).toBe("$1.234,5");
    expect(formatearValor(1234, "conteo")).toBe("1.234");
    expect(formatearValor(12.345, "numero")).toBe("12,35");
  });

  test("el vacío se muestra como raya, nunca como cero", () => {
    expect(formatearValor(null, "moneda")).toBe("—");
    expect(formatearValor("", "conteo")).toBe("—");
    expect(formatearValor(undefined)).toBe("—");
    // Un cero de verdad SÍ se muestra como cero.
    expect(formatearValor(0, "moneda")).toBe("$0");
  });

  test("diasHasta devuelve null si no hay fecha o si es inválida", () => {
    expect(diasHasta(null, HOY_EJEMPLO)).toBeNull();
    expect(diasHasta("", HOY_EJEMPLO)).toBeNull();
    expect(diasHasta("no es fecha", HOY_EJEMPLO)).toBeNull();
  });

  test("la temporada es Julio–Junio, como usa el grupo", () => {
    expect(temporadaDe("2026-08-28")).toBe("26-27");
    expect(temporadaDe("2026-06-30")).toBe("25-26");
    expect(temporadaDe("2026-07-01")).toBe("26-27");
    expect(temporadaDe("2026-01-15")).toBe("25-26");
  });

  // Regresión de un bug encontrado por esta misma prueba: una fecha de sólo
  // día ("2026-07-01") se parseaba como medianoche UTC y, leída con los
  // getters locales en Chile, se corría al 30 de junio. Eso cambiaba la
  // temporada del contrato y desfasaba en un día todos los vencimientos.
  test("una fecha de sólo día es ese día, no el anterior, en cualquier huso", () => {
    const d = aFecha("2026-07-01");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // julio
    expect(d.getDate()).toBe(1);
  });

  test("los días se cuentan de calendario a calendario, no por instantes", () => {
    // La hora del día en que se mira la pantalla no puede mover la cifra.
    const manana = new Date(2026, 7, 28, 8, 0, 0);
    const tarde = new Date(2026, 7, 28, 23, 30, 0);
    expect(diasHasta("2026-10-12", manana)).toBe(45);
    expect(diasHasta("2026-10-12", tarde)).toBe(45);
    expect(diasHasta("2026-08-28", manana)).toBe(0);
    expect(diasHasta("2026-08-27", tarde)).toBe(-1);
  });

  test("el blob de ejemplo da los mismos días corra donde corra", () => {
    // ct2 vence en 45 días y ct3 venció hace 120: son las cifras que citan
    // las pruebas de alertas y el documento de entrega.
    const filas = filasContratos(DATOS_EJEMPLO, HOY_EJEMPLO);
    expect(filas.find((f) => f.id === "ct2").diasParaVencer).toBe(45);
    expect(filas.find((f) => f.id === "ct3").diasParaVencer).toBe(-120);
  });
});
