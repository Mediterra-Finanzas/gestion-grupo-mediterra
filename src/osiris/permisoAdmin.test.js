/* eslint-disable */
import { esAdministrador } from "./permisoAdmin";

// La misma función que pasa App.jsx: (nombre) => getRol(nombre) === "admin".
const ROLES = { "Angelo Huerta": "admin", "Carol Machuca": "editor", "Socia Consulta": "consulta" };
const esAdminApp = (nombre) => ROLES[nombre] === "admin";

test("permitido: el administrador", () => {
  expect(esAdministrador({ nombre: "Angelo Huerta" }, esAdminApp)).toBe(true);
});
test("denegado: editor y consulta, aunque `esAdmin` sea una función (antes era siempre verdadero)", () => {
  expect(esAdministrador({ nombre: "Carol Machuca" }, esAdminApp)).toBe(false);
  expect(esAdministrador({ nombre: "Socia Consulta" }, esAdminApp)).toBe(false);
  expect(!!esAdminApp).toBe(true);                      // el defecto: como booleano, la función es verdadera
});
test("denegado sin sesión, con valores no booleanos o si la función falla", () => {
  expect(esAdministrador(null, esAdminApp)).toBe(false);
  expect(esAdministrador({ nombre: "Angelo Huerta" }, "si")).toBe(false);
  expect(esAdministrador({ nombre: "Angelo Huerta" }, undefined)).toBe(false);
  expect(esAdministrador({ nombre: "Angelo Huerta" }, () => { throw new Error("x"); })).toBe(false);
});
test("un booleano explícito se respeta", () => {
  expect(esAdministrador({ nombre: "X" }, true)).toBe(true);
  expect(esAdministrador({ nombre: "X" }, false)).toBe(false);
});
