/* eslint-disable */
// Respaldo y restauración desde el navegador: sin credenciales, con validación,
// plan previo y conservación de las credenciales actuales.
import { armarRespaldoDescargable, leerArchivoRespaldo, planRestaurar, buscarFugas, sanear } from "../respaldo/saneo";
import { escribirPlan } from "../respaldo/RestaurarRespaldo.jsx";

const CRED = JSON.stringify({ v: 1, iter: 100000, salt: "aa11bb22cc33dd44", hash: "e05f0f63955d08250a19abb1d83649416ee7" });
const FILAS = [
  { id: "main", value: JSON.stringify({ usuarios: [{ nombre: "Angelo", email: "a@x.cl", pin: "482913" }, { nombre: "Carol", email: "c@x.cl", pin_temporal: "771100" }], estados: { m14: "ok" } }), updated_at: "2026-10-01T10:00:00Z" },
  { id: "pins", value: { "Angelo_h": CRED }, updated_at: "2026-10-01T10:00:00Z" },
  { id: "finanzas", value: { creditos_data: [{ n: 1, cuota: 120000 }], nominas: [{ id: "n1", docs: [{ hash: "abc123docsha" }] }] }, updated_at: "2026-10-01T10:00:00Z" },
];

test("el respaldo descargable no trae credenciales y conserva los datos de negocio", () => {
  const b = armarRespaldoDescargable(FILAS, { usuario: "Angelo", ahora: new Date("2026-10-06T12:00:00Z") });
  const txt = JSON.stringify(b);
  expect(b.version).toBe("Mediterra Hub Backup v2");
  expect(b.excluidas).toEqual(["pins"]);
  expect(buscarFugas(txt, ["482913", "771100", "aa11bb22cc33dd44"])).toEqual([]);
  expect(txt).toContain("abc123docsha");                    // hash de documento ≠ credencial
  expect(b.tablas.main.rutasQuitadas).toEqual(["usuarios[email=a@x.cl].pin", "usuarios[email=c@x.cl].pin_temporal"]);
});

test("validación: versión desconocida, sin fecha o sin tablas se rechaza", () => {
  expect(leerArchivoRespaldo({ version: "otra", fecha: "2026-10-01", tablas: { a: { data: 1 } } }).ok).toBe(false);
  expect(leerArchivoRespaldo({ version: "Mediterra Hub Backup v1", tablas: { a: { data: 1 } } }).ok).toBe(false);
  expect(leerArchivoRespaldo({ version: "Mediterra Hub Backup v1", fecha: "2026-10-01T00:00:00Z", tablas: {} }).ok).toBe(false);
  expect(leerArchivoRespaldo(null).ok).toBe(false);
});

test("un respaldo ANTIGUO (v1, con credenciales) se lee saneado y sin pins", () => {
  const v1 = { version: "Mediterra Hub Backup v1", fecha: "2026-09-01T00:00:00Z", tablas: Object.fromEntries(FILAS.map((f) => [f.id, { data: typeof f.value === "string" ? JSON.parse(f.value) : f.value, updated_at: f.updated_at }])) };
  const r = leerArchivoRespaldo(v1);
  expect(r.ok).toBe(true);
  expect(r.excluidas).toEqual(["pins"]);
  expect(r.traiaCredenciales).toEqual(["main"]);
  expect(buscarFugas(JSON.stringify(r.respaldo), ["482913", "771100"])).toEqual([]);
});

test("el plan conserva las credenciales ACTUALES, avisa lo modificado después y no toca pins", () => {
  const r = leerArchivoRespaldo(armarRespaldoDescargable(FILAS, { ahora: new Date("2026-10-02T00:00:00Z") }));
  const actuales = [
    { id: "main", value: JSON.stringify({ usuarios: [{ nombre: "Angelo", email: "a@x.cl", pin: "999000" }, { nombre: "Carol", email: "c@x.cl", pin_temporal: "771100" }], estados: {} }), updated_at: "2026-10-05T09:00:00Z" },
    { id: "finanzas", value: { creditos_data: [{ n: 1, cuota: 120000 }], nominas: [{ id: "n1", docs: [{ hash: "abc123docsha" }] }] }, updated_at: "2026-10-01T10:00:00Z" },
  ];
  const plan = planRestaurar({ respaldo: r.respaldo, actuales, ids: [...Object.keys(r.respaldo), "pins"], fechaRespaldo: r.fecha });
  const main = plan.find((p) => p.id === "main"), fin = plan.find((p) => p.id === "finanzas"), pins = plan.find((p) => p.id === "pins");
  expect(pins.accion).toBe("excluida");
  expect(fin.accion).toBe("sin_cambios");
  expect(main.accion).toBe("restaurar");
  expect(main.modificadaDespuesDelRespaldo).toBe(true);
  expect(main.clavesCambiadas).toEqual(["estados"]);
  const final = JSON.parse(main.valorFinal);                              // la fila actual es string → se mantiene string
  expect(final.usuarios[0].pin).toBe("999000");                          // el PIN actual, no el del respaldo
  expect(final.estados).toEqual({ m14: "ok" });                          // el dato de negocio sí vuelve
});

test("escribirPlan usa updated_at=eq y reporta conflicto si la fila cambió", async () => {
  const llamadas = [];
  const fetchImpl = async (url, opts) => { llamadas.push(`${opts.method} ${url}`); return { ok: true, status: 200, json: async () => [] }; };   // [] = 0 filas actualizadas
  const res = await escribirPlan({ supaUrl: "https://x", supaKey: "k", fetchImpl, elegidas: ["main"],
    plan: [{ id: "main", accion: "restaurar", existeActual: true, updatedAtActual: "2026-10-05T09:00:00Z", valorFinal: "{}" }, { id: "finanzas", accion: "restaurar", existeActual: true, updatedAtActual: "t", valorFinal: "{}" }] });
  expect(llamadas).toHaveLength(1);                                      // solo la elegida
  expect(llamadas[0]).toMatch(/PATCH .*id=eq\.main&updated_at=eq\.2026-10-05T09%3A00%3A00Z/);
  expect(res).toEqual([{ id: "main", resultado: "conflicto" }]);
});

test("la copia del servidor (api/_saneo.js) está sincronizada con src/respaldo/saneo.js", () => {
  const fs = require("fs"), path = require("path");
  const fuente = fs.readFileSync(path.join(__dirname, "../respaldo/saneo.js"), "utf8");
  const copia = fs.readFileSync(path.join(__dirname, "../../api/_saneo.js"), "utf8");
  const i = fuente.lastIndexOf("export {");
  const esperada = "// GENERADO desde src/respaldo/saneo.js por scripts/respaldo/sincronizar-saneo.mjs. NO EDITAR A MANO.\n"
    + fuente.slice(0, i) + "module.exports = {" + fuente.slice(i + "export {".length);
  // Si falla: node scripts/respaldo/sincronizar-saneo.mjs
  expect(copia).toBe(esperada);
  const api = require("../../api/_respaldo.js");
  const muestra = JSON.parse(FILAS[0].value);
  expect(api.sanear(muestra)).toEqual(sanear(muestra));
});
