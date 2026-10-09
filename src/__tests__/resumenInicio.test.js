/* Contadores del inicio y pestañas visibles de Finanzas (rama de diseño). */
import { resumenRendiciones, resumenTareas, totalAccionable, esSoloRendiciones } from "../diseno/resumenInicio";
import { pestanasVisiblesFinanzas } from "../FinanzasModule.jsx";
import { claseDeAncho } from "../diseno/useClaseVentana";

const SIN = "sin_acceso";
// Perfil tipo «analista de finanzas» acordado: Saldos y Nóminas editar, Rendiciones ver, el resto sin acceso.
const carol = { nombre: "Carol Machuca", email: "cmachuca@grupomediterra.cl", rol: "editor", rendVerTodas: true,
  modulos: ["tareas", "osiris", "finanzas", "contabilidad"],
  tab_permisos: { finanzas: { dashboard: SIN, flujo: SIN, bancos: "editar", creditos: SIN, nominas: "editar", reporte: SIN, params: SIN, auditoria: SIN, eeff: SIN, rendiciones: "ver" } } };
const soloRinde = { nombre: "Operario Ficticio", email: "op@x.cl", rol: "editor", modulos: ["finanzas"],
  tab_permisos: { finanzas: { dashboard: SIN, flujo: SIN, bancos: SIN, creditos: SIN, nominas: SIN, reporte: SIN, params: SIN, auditoria: SIN, eeff: SIN, rendiciones: "ver" } } };
const angelo = { nombre: "Angelo Huerta", email: "ahuerta@grupomediterra.cl", rol: "admin", esCFO: true, modulos: ["tareas", "finanzas"] };

describe("pestañas visibles de Finanzas", () => {
  test("analista: sin Dashboard, Flujo, Créditos, Reporte ni Auditoría", () => {
    const ids = pestanasVisiblesFinanzas(carol, carol.tab_permisos.finanzas).map(t => t.id);
    expect(ids).toEqual(["bancos", "nominas", "rendiciones"]);
  });
  test("admin ve todas, Auditoría incluida", () => {
    expect(pestanasVisiblesFinanzas(angelo, {}).map(t => t.id)).toEqual(
      ["dashboard", "flujo", "bancos", "creditos", "nominas", "reporte", "auditoria", "eeff", "rendiciones"]);
  });
  test("acceso parcial a empresas: sin Dashboard ni Reporte aunque el permiso diga editar", () => {
    const u = { nombre: "X", rol: "editor", empresas_permitidas: ["Frisku Foods"] };
    const ids = pestanasVisiblesFinanzas(u, { dashboard: "editar", reporte: "editar", bancos: "ver" }).map(t => t.id);
    expect(ids).not.toContain("dashboard"); expect(ids).not.toContain("reporte"); expect(ids).toContain("bancos");
  });
  test("solo rendiciones", () => {
    const p = pestanasVisiblesFinanzas(soloRinde, soloRinde.tab_permisos.finanzas);
    expect(p.map(t => t.id)).toEqual(["rendiciones"]);
    expect(esSoloRendiciones(soloRinde.modulos, p)).toBe(true);
    expect(esSoloRendiciones(carol.modulos, pestanasVisiblesFinanzas(carol, carol.tab_permisos.finanzas))).toBe(false);
  });
});

describe("rendiciones", () => {
  const rs = [
    { id: 1, estado: "borrador", trabajador: "Operario Ficticio" },
    { id: 2, estado: "rechazada", devuelta: true, trabajador: "Operario Ficticio" },
    { id: 3, estado: "rechazada", trabajador: "Operario Ficticio" },
    { id: 4, estado: "pagada", trabajador: "Operario Ficticio" },
    { id: 5, estado: "enviada", trabajador: "Otro", cadena: [{ email: "op@x.cl" }], nivelActual: 0 },
    { id: 6, estado: "enviada", trabajador: "Otro", cadena: [{ email: "jefe@x.cl" }], nivelActual: 0 },
    { id: 7, estado: "enviada", trabajador: "Otro" },                // sin aprobador → solo admin/CFO
    { id: 8, estado: "aprobada", trabajador: "Otro" },
  ];
  test("trabajador: sus estados; aprueba solo lo que le toca; por pagar no corresponde (null)", () => {
    const r = resumenRendiciones(rs, soloRinde);
    expect(r.mias).toEqual({ total: 4, borrador: 1, enviada: 0, devuelta: 1, rechazada: 1, aprobada: 0, pagada: 1 });
    expect(r.teTocaAprobar).toBe(1);
    expect(r.porPagar).toBeNull();
  });
  test("admin/CFO: aprueba todas las enviadas y ve por pagar", () => {
    const r = resumenRendiciones(rs, angelo);
    expect(r.teTocaAprobar).toBe(3);
    expect(r.porPagar).toBe(1);
  });
  test("ve todas (sin ser admin): por pagar visible; las sin aprobador no le tocan", () => {
    const r = resumenRendiciones(rs, carol);
    expect(r.porPagar).toBe(1);
    expect(r.teTocaAprobar).toBe(0);
  });
  test("sin datos → null (nunca cero)", () => {
    expect(resumenRendiciones(null, carol)).toBeNull();
  });
});

describe("tareas", () => {
  const inst = [
    { nombre: "F29", responsable: "Carol Machuca", supervisor: "Angelo Huerta", vencida: true, estadoResp: "gris" },
    { nombre: "Cierre", responsable: "Pablo Duran", coResponsables: ["Carol Machuca"], supervisor: "Angelo Huerta", proxima: true, estadoResp: "gris" },
    { nombre: "Conciliación", responsable: "Michelle Garcia", supervisor: "Carol Machuca", estadoResp: "verde", estadoSup: "gris" },
    { nombre: "Ya revisada", responsable: "Michelle Garcia", supervisor: "Carol Machuca", estadoResp: "verde", estadoSup: "verde" },
    { nombre: "No aplica", responsable: "Carol Machuca", supervisor: "X", vencida: true, estadoResp: "na" },
  ];
  test("vencidas, por vencer (incluye co-responsable) y por revisar", () => {
    const r = resumenTareas(inst, "Carol Machuca");
    expect(r.vencidas.map(i => i.nombre)).toEqual(["F29"]);
    expect(r.porVencer.map(i => i.nombre)).toEqual(["Cierre"]);
    expect(r.porRevisar.map(i => i.nombre)).toEqual(["Conciliación"]);
  });
  test("total accionable: null si una fuente del perfil no está disponible", () => {
    const t = resumenTareas(inst, "Carol Machuca");
    expect(totalAccionable({ tareas: t, rendiciones: null, usaTareas: true, usaRendiciones: true })).toBeNull();
    const r = resumenRendiciones([{ estado: "rechazada", devuelta: true, trabajador: "Carol Machuca" }, { estado: "aprobada", trabajador: "X" }], carol);
    expect(totalAccionable({ tareas: t, rendiciones: r, usaTareas: true, usaRendiciones: true })).toBe(1 + 1 + 1 + 1);
    expect(totalAccionable({ tareas: null, rendiciones: r, usaTareas: false, usaRendiciones: true })).toBe(2);
  });
});

test("clases de ventana", () => {
  expect([390, 599, 600, 834, 1023, 1024, 1366, 1920].map(claseDeAncho)).toEqual(
    ["compacta", "compacta", "media", "media", "media", "expandida", "expandida", "expandida"]);
});

describe("ver ≠ hacer: rendiciones por pagar (facultades)", () => {
  const { capacidadesRendiciones } = require("../diseno/capacidades");
  const michelle = { nombre: "Michelle Garcia", email: "mgarcia@grupomediterra.cl", rol: "editor", rendVerTodas: true };
  const milagros = { nombre: "Milagros Becerra", email: "mbecerra@grupomediterra.cl", rol: "editor", rendVerTodas: true };
  const rs = [{ estado: "aprobada", trabajador: "X" }];
  const matriz = { modo: "matriz", porCorreo: { "mbecerra@grupomediterra.cl": { rendPagar: true } } };
  test("sin fila (main): ve y paga quien ve todas", () => {
    expect(capacidadesRendiciones(michelle)).toEqual({ verPorPagar: true, puedePagar: true, fuentePago: "regla_main" });
  });
  test("matriz: Michelle ve pero no paga; Milagros paga", () => {
    expect(capacidadesRendiciones(michelle, matriz)).toMatchObject({ verPorPagar: true, puedePagar: false });
    expect(capacidadesRendiciones(milagros, matriz)).toMatchObject({ verPorPagar: true, puedePagar: true });
  });
  test("fila sin leer: nadie paga", () => {
    expect(capacidadesRendiciones(milagros, { estado: "error" }).puedePagar).toBe(false);
  });
  test("lo que solo se ve no suma al total accionable", () => {
    const r = resumenRendiciones(rs, michelle, matriz);
    expect(r.porPagar).toBe(1); expect(r.puedePagar).toBe(false);
    expect(totalAccionable({ tareas: null, rendiciones: r, usaTareas: false, usaRendiciones: true })).toBe(0);
    const r2 = resumenRendiciones(rs, milagros, matriz);
    expect(totalAccionable({ tareas: null, rendiciones: r2, usaTareas: false, usaRendiciones: true })).toBe(1);
  });
});
