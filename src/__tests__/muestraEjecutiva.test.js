/* Muestra ejecutiva: circuito de aprobación, decisiones de nóminas y la regla de
   avance extraída (misma tabla de verdad que el botón del detalle). */
import { pasosRendicion, pasosNomina } from "../diseno/circuito";
import { resumenNominas, totalAccionable } from "../diseno/resumenInicio";
import { puedeAvanzarNomina } from "../FinanzasModule.jsx";

const CFO = { nombre: "Angelo Huerta", rol: "admin" };
const CAROL = { nombre: "Carol Machuca", rol: "editor" };
const MILAGROS = { nombre: "Milagros Becerra", rol: "editor" };

test("puedeAvanzarNomina: tabla de verdad del flujo (igual que antes)", () => {
  const casos = [
    ["borrador", MILAGROS, true, true], ["preparada", MILAGROS, true, true],
    ["revision", MILAGROS, true, false], ["revision", CAROL, true, true], ["revision", CFO, true, false],
    ["aprobada1", CAROL, true, false], ["aprobada1", CFO, true, true],
    ["aprobada", CFO, true, false], ["revision", CAROL, false, false], ["aprobada1", CFO, false, false],
  ];
  for (const [estado, u, canEdit, esperado] of casos) expect([estado, u.nombre, canEdit, puedeAvanzarNomina(estado, u, canEdit)]).toEqual([estado, u.nombre, canEdit, esperado]);
});

test("resumenNominas: cuenta solo lo que el perfil puede aprobar; lo demás es información", () => {
  const noms = [
    { empresa: "Osiris", semana: 40, numero: 2, estado: "aprobada1" },
    { empresa: "Mediterra", semana: 41, numero: 1, estado: "revision" },
    { empresa: "Frisku Foods", semana: 41, numero: 1, estado: "preparada" },
    { empresa: "Osiris", semana: 39, numero: 1, estado: "aprobada" },
    { empresa: "Osiris", semana: 38, numero: 3, estado: "revision", estadoNomina: "inactiva" },
  ];
  const cfo = resumenNominas(noms, CFO, true), carol = resumenNominas(noms, CAROL, true), carolVer = resumenNominas(noms, CAROL, false);
  expect(cfo.porAprobar).toBe(1);          // solo la con V°B°
  expect(carol.porAprobar).toBe(1);        // solo la en revisión
  expect(carolVer.porAprobar).toBe(0);     // con la pestaña en «ver» no ejecuta
  expect(cfo.enCurso).toBe(3);             // preparada + revisión + V°B° (la inactiva no cuenta)
  expect(resumenNominas(null, CFO, true)).toBeNull();   // sin leer: no disponible, nunca 0
});

test("distintivo: suma nóminas por aprobar y no muestra total parcial si una fuente falta", () => {
  const t = { vencidas: [1, 2], porVencer: [], porRevisar: [1] };
  expect(totalAccionable({ tareas: t, usaTareas: true, nominas: { porAprobar: 2 }, usaNominas: true })).toBe(5);
  expect(totalAccionable({ tareas: t, usaTareas: true, nominas: null, usaNominas: true })).toBeNull();
});

test("circuito de rendición: envío, aprobación en curso, pago pendiente y devolución", () => {
  const enviada = pasosRendicion({ estado: "enviada", trabajador: "Operario", enviadoEn: "2026-10-05T10:00:00Z", cadena: [{ nombre: "Carol Machuca" }], nivelActual: 0, aprobaciones: [] });
  expect(enviada.map(p => p.estado)).toEqual(["hecho", "hecho", "actual", "pendiente"]);
  const pagada = pasosRendicion({ estado: "pagada", aprobaciones: [{ nombre: "Carol", nivel: 0, fecha: "2026-10-06" }], cadena: [{ nombre: "Carol" }], pagadoPor: "Milagros" });
  expect(pagada.every(p => p.estado === "hecho")).toBe(true);
  const dev = pasosRendicion({ estado: "rechazada", devuelta: true, comentarioRevisor: "Falta boleta", revisadoPor: "Carol" });
  expect(dev.find(p => p.id === "envio")).toMatchObject({ estado: "devuelto", nota: "Falta boleta" });
});

test("circuito de nómina: V°B° dado, CFO en curso; devolución anotada en el paso en curso", () => {
  const p = pasosNomina({ estado: "aprobada1", preparadoPor: "Milagros", revisadoPor: "Carol", aprobado1Por: "Michelle" });
  expect(p.map(x => x.estado)).toEqual(["hecho", "hecho", "hecho", "actual"]);
  const d = pasosNomina({ estado: "revision", ultimaDevolucion: { por: "Angelo", motivo: "Falta respaldo", desdeEstado: "aprobada1" } });
  expect(d.find(x => x.estado === "actual")).toMatchObject({ id: "aprobada1", devolucion: true });
});
