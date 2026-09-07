/* eslint-disable */
/* HOTFIX A · el generador de respaldos queda DETENIDO.
 *
 * Estas pruebas miran el CÓDIGO FUENTE, no el comportamiento en runtime, y es a
 * propósito: lo que hay que garantizar es que no exista un camino que escriba una fila
 * `backup_*`. Un test de runtime demuestra que no pasó mientras mirábamos; éste
 * demuestra que no está escrito.
 */
const fs = require("fs");
const path = require("path");

const APP = path.resolve(__dirname, "..", "..", "App.jsx");
const src = fs.readFileSync(APP, "utf8");

/** Quita comentarios de línea y de bloque, para no confundir prosa con código. */
function soloCodigo(texto) {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
const codigo = soloCodigo(src);

describe("HOTFIX A · generador de respaldos detenido", () => {
  test("el interruptor existe y está en suspendido", () => {
    expect(/const\s+BACKUP_AUTOMATICO_SUSPENDIDO\s*=\s*true\s*;/.test(codigo)).toBe(true);
  });

  test("el bloque del generador no emite ninguna petición", () => {
    const i = codigo.indexOf("BACKUP_AUTOMATICO_SUSPENDIDO) {");
    expect(i).toBeGreaterThan(-1);
    const bloque = codigo.slice(i, i + 800);
    expect(bloque.includes("fetch(")).toBe(false);
    expect(bloque.includes("SUPA_URL")).toBe(false);
  });

  test("ningún camino del código crea una fila `backup_`", () => {
    // Un POST/PATCH a calendario_data cuyo cuerpo arme un id `backup_`.
    const sospechosas = codigo.split("\n")
      .map((l, n) => ({ l, n: n + 1 }))
      .filter(({ l }) => /id\s*:\s*`?backup_/.test(l) || /backupId/.test(l));
    expect(sospechosas.map((x) => x.n + ": " + x.l.trim().slice(0, 70))).toEqual([]);
  });

  // La comparación línea a línea NO servía: en el original el `method:"DELETE"` va en la
  // línea SIGUIENTE al `calendario_data`, así que el test pasaba contra la base sin
  // modificar. Lo detectó la contraprueba. Ahora se mira la llamada entera.
  // Dos intentos fallidos antes de éste, ambos descubiertos por la contraprueba:
  //   1. comparar línea a línea — el `method:"DELETE"` va en la línea SIGUIENTE;
   //   2. `fetch([sS]{0,400}?)` — la no-codiciosa corta en el primer `)`, que
  //      está dentro de `${SUPA_URL}`, y nunca llega al método.
  // Lo que sí mide: una ventana alrededor de cada aparición de `calendario_data`.
  test("ningún camino borra filas de calendario_data", () => {
    const borran = [];
    let i = codigo.indexOf("calendario_data");
    while (i !== -1) {
      const ventana = codigo.slice(i, i + 220);
      if (/DELETE/.test(ventana)) borran.push(ventana.replace(/s+/g, " ").slice(0, 70));
      i = codigo.indexOf("calendario_data", i + 1);
    }
    expect(borran).toEqual([]);
  });

  test("no se activa `auto-v4` en este hotfix", () => {
    expect(codigo.includes('version:"auto-v4"')).toBe(false);
    expect(codigo.includes("backupGenerador")).toBe(false);
  });

  // La version anterior de esta prueba solo pedia que `esAdmin(` apareciera cerca del
  // aviso, y PASO con el banner puesto en la vista de Tareas — otro `return` del mismo
  // archivo, donde `esAdmin` tambien esta en alcance. En el Preview el aviso no aparecia.
  // Lo encontro el gate, no la lectura del diff. Ahora se exige que este DENTRO de
  // `HubScreen`, que es la pantalla que el administrador ve al entrar.
  test("el aviso vive dentro de HubScreen", () => {
    const iniHub = codigo.indexOf("function HubScreen(");
    expect(iniHub).toBeGreaterThan(-1);
    // El componente termina donde empieza el siguiente de nivel superior.
    const sig = codigo.indexOf(String.fromCharCode(10) + "function ", iniHub + 10);
    const cuerpoHub = codigo.slice(iniHub, sig === -1 ? codigo.length : sig);
    expect(cuerpoHub.includes("temporalmente suspendido")).toBe(true);
  });

  test("el aviso exige rol admin, no solo el interruptor", () => {
    const i = codigo.indexOf("temporalmente suspendido");
    const antes = codigo.slice(Math.max(0, i - 500), i);
    const exigeRol = antes.includes(String.fromCharCode(34)+"admin"+String.fromCharCode(34)) || antes.includes("esAdmin(");
    expect(exigeRol).toBe(true);
    expect(antes.includes("BACKUP_AUTOMATICO_SUSPENDIDO")).toBe(true);
  });

  // La version anterior de este caso miraba una ventana de 1.200 caracteres antes de la
  // vista de Tareas, y PASABA contra el commit roto: el banner estaba mas lejos. Una
  // ventana arbitraria no es una medicion. Esto si lo es: el aviso aparece UNA vez en
  // todo el archivo, y el caso de arriba prueba que esa unica vez esta en HubScreen.
  test("el aviso aparece exactamente una vez en todo el archivo", () => {
    const veces = codigo.split("temporalmente suspendido").length - 1;
    expect(veces).toBe(1);
  });

  test("el registro local no lleva datos sensibles", () => {
    const i = codigo.indexOf("BACKUP_AUTOMATICO_SUSPENDIDO) {");
    const bloque = codigo.slice(i, i + 800);
    for (const prohibido of ["pin", "PIN", "hash", "sal", "token", "email", "usuarios"]) {
      expect(bloque.includes(prohibido)).toBe(false);
    }
  });
});
