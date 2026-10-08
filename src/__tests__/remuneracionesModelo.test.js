/* eslint-disable */
// Nómina de remuneraciones separada: circuito, clasificación explícita, registros existentes.
import * as R from "../remuneraciones/modelo.js";

const fac = (u, f) => ({ ...u, _facultadesOk: true, _modoPermisos: "transicion", rendPagar: false, contabEditar: false,
  remPreparar: !!f.prep, remAprobar: !!f.apr });
const ANGELO = fac({ nombre: "Angelo Huerta", email: "ahuerta@x.cl", rol: "admin" }, { prep: true });
const LUCIA = fac({ nombre: "Lucía Corbetto", email: "lucia@x.cl", rol: "consulta" }, { apr: true });
const CRISTOBAL = fac({ nombre: "Cristobal Ortiz", email: "cris@x.cl", rol: "consulta" }, { apr: true });
const CAROL = fac({ nombre: "Carol Machuca", email: "carol@x.cl", rol: "editor" }, {});
const ADMIN_SIN = fac({ nombre: "Otro Admin", email: "otro@x.cl", rol: "admin" }, {});

const linea = (clase, monto, trab = "Juan Pérez") => ({ ...R.lineaRemVacia(clase), trabajador: trab, montoCLP: monto });
function borradorListo() {
  const n = R.nominaRemVacia({ empresa: "Allegria Foods", periodo: "2026-10" }, ANGELO);
  return R.editarLineas(n, ANGELO, [linea("sueldo", 1000000), linea("bono", 50000), linea("descuento", 30000)]);
}

describe("acceso", () => {
  test("ven solo quienes preparan o aprueban; el rol admin no basta", () => {
    expect(R.puedeVerRem(ANGELO)).toBe(true);
    expect(R.puedeVerRem(LUCIA)).toBe(true);
    expect(R.puedeVerRem(CRISTOBAL)).toBe(true);
    expect(R.puedeVerRem(CAROL)).toBe(false);
    expect(R.puedeVerRem(ADMIN_SIN)).toBe(false);
    expect(R.puedeVerRem({ ...ANGELO, _facultadesOk: false })).toBe(false);
  });
});

describe("circuito: Angelo prepara, Lucía o Cristobal aprueban (basta uno), sin V°B°", () => {
  test("totales: los descuentos restan", () => {
    expect(R.totalesRem(borradorListo())).toEqual({ porClase: { sueldo: 1000000, anticipo: 0, descuento: 30000, bono: 50000, finiquito: 0 }, total: 1020000 });
  });
  test("enviar exige clasificación explícita, trabajador y monto", () => {
    const n = R.editarLineas(R.nominaRemVacia({ empresa: "E", periodo: "2026-10" }, ANGELO), ANGELO, [{ ...R.lineaRemVacia(""), trabajador: "X", montoCLP: 10 }]);
    expect(() => R.enviarAAprobacion(n, ANGELO)).toThrow(/clasificación/);
    const sinMonto = R.editarLineas(n, ANGELO, [linea("sueldo", 0)]);
    expect(() => R.enviarAAprobacion(sinMonto, ANGELO)).toThrow(/monto/);
  });
  test("solo quien prepara envía; Lucía aprueba", () => {
    expect(() => R.enviarAAprobacion(borradorListo(), LUCIA)).toThrow();
    const p = R.enviarAAprobacion(borradorListo(), ANGELO);
    expect(p.estado).toBe("preparada");
    expect(R.puedeAprobarRem(CAROL, p)).toBe(false);
    expect(R.puedeAprobarRem(ADMIN_SIN, p)).toBe(false);
    expect(R.puedeAprobarRem(ANGELO, p)).toBe(false);      // quien prepara no aprueba
    const a = R.aprobarRem(p, LUCIA);
    expect(a).toMatchObject({ estado: "aprobada", aprobadoPor: "Lucía Corbetto", aprobadoPorCorreo: "lucia@x.cl" });
    expect(R.puedeAprobarRem(CRISTOBAL, a)).toBe(false);   // ya aprobada: no se pide una segunda
  });
  test("Cristobal también aprueba solo (basta uno)", () => {
    const a = R.aprobarRem(R.enviarAAprobacion(borradorListo(), ANGELO), CRISTOBAL);
    expect(a.estado).toBe("aprobada");
  });
  test("intento directo: aprobar un borrador o como Carol se rechaza", () => {
    expect(() => R.aprobarRem(borradorListo(), LUCIA)).toThrow();
    expect(() => R.aprobarRem(R.enviarAAprobacion(borradorListo(), ANGELO), CAROL)).toThrow();
  });
  test("un aprobador que editó la nómina no la aprueba (autor)", () => {
    const n = { ...R.enviarAAprobacion(borradorListo(), ANGELO), autores: ["ahuerta@x.cl", "lucia@x.cl"] };
    expect(R.puedeAprobarRem(LUCIA, n)).toBe(false);
    expect(R.puedeAprobarRem(CRISTOBAL, n)).toBe(true);
  });
  test("devolver exige motivo y vuelve a borrador; editar solo en borrador", () => {
    const p = R.enviarAAprobacion(borradorListo(), ANGELO);
    expect(() => R.editarLineas(p, ANGELO, [])).toThrow();
    expect(() => R.devolverRem(p, LUCIA, "")).toThrow(/motivo/);
    const d = R.devolverRem(p, LUCIA, "falta bono de Pedro");
    expect(d.estado).toBe("borrador");
    expect(d.historial.at(-1)).toMatchObject({ accion: "devuelta", motivo: "falta bono de Pedro", usuario: "Lucía Corbetto" });
  });
  test("anular: solo quien prepara, con motivo; nada se borra", () => {
    expect(() => R.anularRem(borradorListo(), LUCIA, "x")).toThrow();
    const a = R.anularRem(borradorListo(), ANGELO, "duplicada");
    expect(a.estado).toBe("anulada");
    expect(a.items.length).toBe(3);
  });
});

// Nómina general ficticia con registros antiguos.
const general = (estado = "aprobada") => ({ id: "nom1", empresa: "Allegria Foods", semana: 30, año: 2026, estado, aprobadoPor: "Angelo Huerta", historial: [],
  seccionesExtra: [{ id: "extra_1", label: "Bonos cosecha" }],
  items: [
    { id: "a", seccion: "proveedores", proveedor: "Ferretería Sur", concepto: "Materiales", montoCLP: 100 },
    { id: "b", seccion: "anticipos", proveedor: "Juan Pérez", concepto: "Anticipo quincena", montoCLP: 200000, pagado: true, documentos: [{ id: "d", path: "nominas/x/y.pdf" }] },
    { id: "c", seccion: "proveedores", tipoDoc: "Remuneraciones", proveedor: "María Soto", montoCLP: 900000, pagado: true },
    { id: "d", seccion: "proveedores", tipoDoc: "Boleta de Honorarios", proveedor: "Asesor Legal", montoCLP: 300000 },
    { id: "e", seccion: "proveedores", proveedor: "Agrícola Norte", concepto: "Anticipo a proveedor", montoCLP: 1500000 },
    { id: "f", seccion: "proveedores", proveedor: "Retail SA", concepto: "Descuento comercial", montoCLP: 50000 },
    { id: "g", seccion: "extra_1", proveedor: "Cuadrilla", montoCLP: 7000 },
    { id: "h", seccion: "proveedores", proveedor: "Nuevo", concepto: "bono", montoCLP: 10, creadaV: 2 },
  ] });
const totalCLP = (n) => n.items.filter(i => (i.estadoLinea || "activa") === "activa").reduce((s, i) => s + (Number(i.montoCLP) || 0), 0);

describe("clasificación explícita vs sugerencia por palabras", () => {
  test("explícitas: sección Anticipos de Sueldo y tipo Remuneraciones; honorarios no", () => {
    const c = R.candidatosRemuneracion([general()]);
    expect(c.filter(x => x.tipo === "explicita").map(x => x.itemId)).toEqual(["b", "c"]);
    expect(c.find(x => x.itemId === "b").claseSugerida).toBe("anticipo");
    expect(c.find(x => x.itemId === "c").claseSugerida).toBeNull();
    expect(c.some(x => x.itemId === "d")).toBe(false);
  });
  test("«anticipo a proveedor», «descuento comercial» y una sección con nombre salarial son solo sugerencias", () => {
    const c = R.candidatosRemuneracion([general()]);
    expect(c.filter(x => x.tipo === "sugerencia").map(x => x.itemId)).toEqual(["e", "f", "g"]);
    expect(R.esRestringidaPendiente(general().items.find(i => i.id === "e"))).toBe(false);
    expect(c.some(x => x.itemId === "h")).toBe(false);   // línea nueva: no se sugiere
  });
});

describe("vista sin facultad: detalle restringido, totales intactos", () => {
  test("las explícitas se ven como UN agregado por nómina; las sugerencias siguen visibles", () => {
    const g = general();
    const v = R.vistaNominas([g], false)[0];
    expect(v.items.map(i => i.id)).toEqual(["a", "d", "e", "f", "g", "h", "_agrvista_nom1"]);
    const agr = v.items.at(-1);
    expect(agr).toMatchObject({ seccion: R.SECCION_AGREGADO, montoCLP: 1100000, lineas: 2, documentos: [] });
    expect(totalCLP(v)).toBe(totalCLP(g));                      // el total NO cambia
    expect(JSON.stringify(v)).not.toMatch(/Juan Pérez|María Soto|nominas\/x/);
    expect(v._restringidasPendientes).toBe(2);
  });
  test("guardar desde la vista: el agregado no se guarda y las líneas vuelven a su lugar", () => {
    const g = general();
    const v = R.vistaNominas([g], false)[0];
    const ed = { ...v, items: [...v.items.map(i => i.id === "a" ? { ...i, montoCLP: 150 } : i), { id: "z", seccion: "proveedores", montoCLP: 5 }] };
    const r = R.reinsertarRestringidas(g, ed);
    expect(r.items.map(i => i.id)).toEqual(["a", "b", "c", "d", "e", "f", "g", "h", "z"]);
    expect(r.items.find(i => i.id === "a").montoCLP).toBe(150);
  });
});

describe("traslado de una nómina YA TRAMITADA: conserva versión aprobada y total", () => {
  const ANT = R.huella(general());
  test("paso 1: copia completa + versión aprobada congelada con huella; no se vuelve a pagar", () => {
    const r = R.trasladarAFilaRem(R.filaRemVacia(), general(), "b", "anticipo", ANGELO);
    expect(r.modo).toBe("historica");
    expect(r.fila.versionesAprobadas[0]).toMatchObject({ nominaId: "nom1", huella: ANT, aprobadoPor: "Angelo Huerta" });
    expect(r.fila.versionesAprobadas[0].copia.items.length).toBe(8);
    expect(r.fila.nominas[0].estado).toBe("historica");
    expect(r.fila.nominas[0].items[0]).toMatchObject({ clase: "anticipo", montoCLP: 200000, origen: { itemId: "b", modo: "historica", huellaVersionAprobada: ANT } });
    expect(r.fila.nominas[0].items[0].documentos.length).toBe(1);
  });
  test("paso 2: rastro sin montos + agregado → el total aprobado es el mismo", () => {
    const g = general();
    let f = R.trasladarAFilaRem(R.filaRemVacia(), g, "b", "anticipo", ANGELO);
    let g2 = R.stubTrasladada(g, "b", f, ANGELO);
    f = R.trasladarAFilaRem(f.fila, g2, "c", "sueldo", ANGELO);
    g2 = R.stubTrasladada(g2, "c", f, ANGELO);
    expect(totalCLP(g2)).toBe(totalCLP(g));
    expect(g2.estado).toBe("aprobada"); expect(g2.aprobadoPor).toBe("Angelo Huerta");
    const agr = g2.items.find(i => i.agregadoRem);
    expect(agr).toMatchObject({ montoCLP: 1100000, lineas: 2, seccion: R.SECCION_AGREGADO, pagado: true });
    expect(JSON.stringify(g2.items)).not.toMatch(/Juan Pérez|María Soto|nominas\/x/);
    expect(g2.rectificaciones.map(r => [r.tipo, r.modo, r.huellaVersionAprobada])).toEqual([["traslado_remuneraciones", "historica", ANT], ["traslado_remuneraciones", "historica", ANT]]);
    expect(JSON.stringify(g2.rectificaciones)).not.toMatch(/200000|900000/);
    expect(f.fila.versionesAprobadas.length).toBe(1);   // la versión aprobada es la ORIGINAL, no la rectificada
  });
  test("sin pagos duplicados: lo histórico no entra a una nómina por pagar", () => {
    const f = R.trasladarAFilaRem(R.filaRemVacia(), general(), "b", "anticipo", ANGELO).fila;
    expect(f.nominas.filter(n => ["borrador", "preparada", "aprobada"].includes(n.estado))).toEqual([]);
  });
  test("idempotente: el mismo traslado no duplica", () => {
    const r1 = R.trasladarAFilaRem(R.filaRemVacia(), general(), "b", "anticipo", ANGELO);
    const r2 = R.trasladarAFilaRem(r1.fila, general(), "b", "anticipo", ANGELO);
    expect(r2.yaEstaba).toBe(true); expect(r2.fila.nominas[0].items.length).toBe(1);
  });
});

describe("traslado desde una nómina en BORRADOR: pasa al circuito de remuneraciones", () => {
  test("va a una nómina de remuneraciones en borrador, sale de la general con rectificación, y se aprueba en su circuito", () => {
    const g = general("borrador");
    const r = R.trasladarAFilaRem(R.filaRemVacia(), g, "b", "anticipo", ANGELO);
    expect(r.modo).toBe("circuito");
    expect(r.fila.versionesAprobadas).toEqual([]);
    const nomRem = r.fila.nominas[0];
    expect(nomRem.estado).toBe("borrador");
    const g2 = R.stubTrasladada(g, "b", r, ANGELO);
    expect(totalCLP(g2)).toBe(totalCLP(g) - 200000);            // sale explícitamente…
    expect(g2.items.some(i => i.agregadoRem)).toBe(false);
    expect(R.totalesRem(nomRem).total).toBe(200000);             // …y entra a remuneraciones: no se omite ni se duplica
    expect(g2.rectificaciones[0]).toMatchObject({ modo: "circuito" });
    const aprobada = R.aprobarRem(R.enviarAAprobacion(nomRem, ANGELO), LUCIA);
    expect(aprobada.estado).toBe("aprobada");
    expect(aprobada.items[0].documentos.length).toBe(1);
  });
});

describe("reclasificar y revertir", () => {
  test("una explícita como no remuneración exige motivo y queda como rectificación", () => {
    expect(() => R.marcarNoRemuneracion(general(), "b", ANGELO, "")).toThrow(/motivo/);
    const n = R.marcarNoRemuneracion(general(), "b", ANGELO, "era anticipo a contratista");
    expect(n.rectificaciones[0]).toMatchObject({ tipo: "reclasificacion_no_remuneracion", motivo: "era anticipo a contratista" });
    expect(R.esRestringidaPendiente(n.items.find(i => i.id === "b"))).toBe(false);
  });
  test("una sugerencia se confirma sin motivo y no cambia totales", () => {
    const n = R.marcarNoRemuneracion(general(), "e", ANGELO);
    expect(totalCLP(n)).toBe(totalCLP(general()));
    expect(R.candidatosRemuneracion([n]).some(c => c.itemId === "e")).toBe(false);
  });
  test("reversión de datos: la línea vuelve exactamente, el agregado se descuenta, la copia queda marcada", () => {
    const g = general();
    const r = R.trasladarAFilaRem(R.filaRemVacia(), g, "b", "anticipo", ANGELO);
    const g2 = R.stubTrasladada(g, "b", r, ANGELO);
    expect(() => R.revertirEnFilaRem(r.fila, "b", ANGELO, "")).toThrow(/motivo/);
    expect(() => R.revertirEnFilaRem(r.fila, "b", LUCIA, "x")).toThrow();
    const rv = R.revertirEnFilaRem(r.fila, "b", ANGELO, "error de clasificación");
    expect(rv.fila.nominas[0].items[0].revertida).toMatchObject({ motivo: "error de clasificación" });
    expect(R.totalesRem(rv.fila.nominas[0]).total).toBe(0);
    const g3 = R.restaurarEnGeneral(g2, rv.copia, ANGELO, "error de clasificación");
    const b = g3.items.find(i => i.id === "b");
    expect(b).toMatchObject({ proveedor: "Juan Pérez", montoCLP: 200000, seccion: "anticipos", estadoLinea: "activa" });
    expect(b.documentos.length).toBe(1);
    expect(g3.items.some(i => i.agregadoRem)).toBe(false);
    expect(totalCLP(g3)).toBe(totalCLP(g));
    expect(g3.rectificaciones.at(-1).tipo).toBe("reversion_traslado");
    expect(R.restaurarEnGeneral(g3, rv.copia, ANGELO, "x")).toBe(g3);   // idempotente
  });
  test("no se revierte lo que ya está en aprobación o aprobado en remuneraciones", () => {
    const r = R.trasladarAFilaRem(R.filaRemVacia(), general("borrador"), "b", "anticipo", ANGELO);
    const f = { ...r.fila, nominas: [R.enviarAAprobacion(r.fila.nominas[0], ANGELO)] };
    expect(() => R.revertirEnFilaRem(f, "b", ANGELO, "x")).toThrow(/aprobación/);
  });
  test("CSV distingue explícita de sugerencia", () => {
    const csv = R.candidatosCSV(R.candidatosRemuneracion([general()]));
    expect(csv).toMatch(/clasificación explícita/); expect(csv).toMatch(/sugerencia por palabras/);
  });
});
