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
const general = () => ({ id: "nom1", empresa: "Allegria Foods", semana: 30, año: 2026, estado: "aprobada", historial: [],
  seccionesExtra: [{ id: "extra_1", label: "Bonos cosecha" }],
  items: [
    { id: "a", seccion: "proveedores", proveedor: "Ferretería Sur", concepto: "Materiales", montoCLP: 100 },
    { id: "b", seccion: "anticipos", proveedor: "Juan Pérez", concepto: "Anticipo quincena", montoCLP: 200000, documentos: [{ id: "d", path: "nominas/x/y.pdf" }] },
    { id: "c", seccion: "proveedores", tipoDoc: "Remuneraciones", proveedor: "María Soto", montoCLP: 900000 },
    { id: "d", seccion: "proveedores", tipoDoc: "Boleta de Honorarios", proveedor: "Asesor Legal", montoCLP: 300000 },
    { id: "e", seccion: "proveedores", proveedor: "Pedro", concepto: "Finiquito", montoCLP: 1500000 },
    { id: "f", seccion: "extra_1", proveedor: "Cuadrilla", montoCLP: 50000 },
    { id: "g", seccion: "proveedores", proveedor: "Nuevo", concepto: "bono", montoCLP: 10, creadaV: 2 },
  ] });

describe("registros existentes: listado, sin reclasificar solos", () => {
  test("candidatos: sección de anticipos, tipo Remuneraciones, palabras y sección libre; honorarios no", () => {
    const c = R.candidatosRemuneracion([general()]);
    expect(c.map(x => x.itemId)).toEqual(["b", "c", "e", "f"]);
    expect(c.find(x => x.itemId === "b").motivos.join()).toMatch(/Anticipos de Sueldo/);
    expect(c.find(x => x.itemId === "f").motivos.join()).toMatch(/Bonos cosecha/);
  });
  test("vista sin facultad: las candidatas no llegan a la pantalla ni a los totales", () => {
    const v = R.vistaNominas([general()], false)[0];
    expect(v.items.map(i => i.id)).toEqual(["a", "d", "g"]);
    expect(v._restringidasPendientes).toBe(4);
    expect(JSON.stringify(v)).not.toMatch(/Juan Pérez|María Soto|Finiquito|200000|900000|1500000/);
    expect(R.vistaNominas([general()], true)[0].items.length).toBe(7);
  });
  test("guardar desde la vista NO pierde las líneas ocultas (y respeta lo editado)", () => {
    const orig = general();
    const vista = R.vistaNominas([orig], false)[0];
    const editada = { ...vista, items: [...vista.items.map(i => i.id === "a" ? { ...i, montoCLP: 150 } : i), { id: "h", seccion: "proveedores", montoCLP: 5 }] };
    const r = R.reinsertarRestringidas(orig, editada);
    expect(r.items.map(i => i.id)).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(r.items.find(i => i.id === "a").montoCLP).toBe(150);
    expect(r._restringidasPendientes).toBeUndefined();
  });
  test("quien ve todo puede editar/quitar una candidata (no se repone a la fuerza)", () => {
    const orig = general();
    const r = R.reinsertarRestringidas(orig, { ...orig, items: orig.items.filter(i => i.id !== "a").map(i => i.id === "b" ? { ...i, concepto: "x" } : i) });
    expect(r.items.find(i => i.id === "b").concepto).toBe("x");
  });
  test("no es remuneración: queda registrada y vuelve a la vista general; solo quien prepara", () => {
    expect(() => R.marcarNoRemuneracion(general(), "e", LUCIA)).toThrow();
    const n = R.marcarNoRemuneracion(general(), "e", ANGELO);
    expect(n.items.find(i => i.id === "e").clasificacionRem).toMatchObject({ valor: "no_remuneracion", por: "Angelo Huerta" });
    expect(R.vistaNominas([n], false)[0].items.map(i => i.id)).toContain("e");
  });
  test("traslado: copia completa en la fila propia, idempotente, y el stub no lleva montos ni documentos", () => {
    const g = general();
    expect(() => R.trasladarAFilaRem(R.filaRemVacia(), g, "b", "", ANGELO)).toThrow(/clasificación/);
    expect(() => R.trasladarAFilaRem(R.filaRemVacia(), g, "b", "anticipo", CAROL)).toThrow();
    const r1 = R.trasladarAFilaRem(R.filaRemVacia(), g, "b", "anticipo", ANGELO);
    const copia = r1.fila.nominas[0].items[0];
    expect(copia).toMatchObject({ clase: "anticipo", trabajador: "Juan Pérez", montoCLP: 200000, origen: { nominaId: "nom1", itemId: "b" } });
    expect(copia.documentos.length).toBe(1);
    expect(r1.fila.nominas[0].estado).toBe("historica");
    const r2 = R.trasladarAFilaRem(r1.fila, g, "b", "anticipo", ANGELO);
    expect(r2.yaEstaba).toBe(true);
    expect(r2.fila.nominas[0].items.length).toBe(1);
    const stub = R.stubTrasladada(g, "b", r1, ANGELO);
    const it = stub.items.find(i => i.id === "b");
    expect(JSON.stringify(it)).not.toMatch(/Juan|200000|nominas\/x/);
    expect(it.estadoLinea).toBe("trasladada");
    expect(R.candidatosRemuneracion([stub]).map(c => c.itemId)).not.toContain("b");
    expect(stub.historial.at(-1).accion).toBe("linea_trasladada_remuneraciones");
  });
  test("CSV del listado con motivos e identificadores", () => {
    const csv = R.candidatosCSV(R.candidatosRemuneracion([general()]));
    expect(csv.split("\n").length).toBe(5);
    expect(csv).toMatch(/Anticipos de Sueldo/);
  });
});
