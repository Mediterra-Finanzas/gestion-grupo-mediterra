/* eslint-disable */
import { esAdministrador } from "./esAdministrador";
const ROLES = { "Angelo Huerta": "admin", "Editor Allegria": "editor", "Socia Consulta": "consulta" };
const esAdminApp = (nombre) => ROLES[nombre] === "admin";
test("permitido: el administrador", () => { expect(esAdministrador({ nombre: "Angelo Huerta" }, esAdminApp)).toBe(true); });
test("denegado: editor y consulta aunque `esAdmin` sea una función", () => {
  expect(esAdministrador({ nombre: "Editor Allegria" }, esAdminApp)).toBe(false);
  expect(esAdministrador({ nombre: "Socia Consulta" }, esAdminApp)).toBe(false);
  expect(!!esAdminApp).toBe(true);   // el defecto: como booleano la función es verdadera
});
test("denegado sin sesión o con valores no booleanos", () => {
  expect(esAdministrador(null, esAdminApp)).toBe(false);
  expect(esAdministrador({ nombre: "Angelo Huerta" }, "si")).toBe(false);
  expect(esAdministrador({ nombre: "Angelo Huerta" }, () => { throw new Error("x"); })).toBe(false);
});
