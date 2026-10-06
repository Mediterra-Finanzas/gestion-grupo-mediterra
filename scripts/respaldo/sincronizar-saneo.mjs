/* Genera api/_saneo.js (CommonJS, para Vercel/Node) desde src/respaldo/saneo.js (ESM,
   para la app). La lógica vive en un solo lugar; este script solo cambia la línea de
   exportación. Correr tras editar src/respaldo/saneo.js:
     node scripts/respaldo/sincronizar-saneo.mjs
   src/__tests__/respaldoSaneo.test.js falla si la copia quedó desactualizada. */
import fs from "fs";
export function generarCopiaCJS(fuente) {
  const i = fuente.lastIndexOf("export {");
  if (i < 0) throw new Error("src/respaldo/saneo.js debe terminar con `export { … };`");
  return "// GENERADO desde src/respaldo/saneo.js por scripts/respaldo/sincronizar-saneo.mjs. NO EDITAR A MANO.\n"
    + fuente.slice(0, i) + "module.exports = {" + fuente.slice(i + "export {".length);
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const raiz = new URL("../../", import.meta.url);
  const fuente = fs.readFileSync(new URL("src/respaldo/saneo.js", raiz), "utf8");
  fs.writeFileSync(new URL("api/_saneo.js", raiz), generarCopiaCJS(fuente));
  console.log("api/_saneo.js actualizado");
}
