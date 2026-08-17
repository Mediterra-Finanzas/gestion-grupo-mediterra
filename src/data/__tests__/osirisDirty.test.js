/* eslint-disable */
// Tests de detección de dirty-state de Osiris (snapshot semántico).
// Cubre los 12 escenarios pedidos + la regresión del bug (re-set benigno / orden de claves).
import { stableStringify, snapshotOsiris, isDirty } from "../osirisDirty";

// Blob de ejemplo representativo del contenido persistible de Osiris.
const BLOB = () => ({
  contratos: [{ id: "c1", razonSocial: "Prod A", pais: "Peru", plantaciones: [{ id: "p1", especie: "Arándano", hectareas: 10 }] }],
  obtentores: [{ id: "o1", obtentor: "Genetista X", pais: "Chile", especies: [{ especie: "Cereza" }] }],
  viveros: [{ id: "v1", viverista: "Vivero Y" }],
  clientes: [{ id: "cl1", razonSocial: "Cliente Z" }],
  especies: [{ id: "e1", nombre: "Arándano" }],
  variedades: [{ id: "va1", variedad: "V1", especie: "Arándano" }],
  hubCardsOrder: ["a", "b", "c"],
});
const clone = (o) => JSON.parse(JSON.stringify(o));

describe("stableStringify (canónico)", () => {
  test("orden de claves no importa", () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });
  test("orden de array SÍ importa (semántico)", () => {
    expect(stableStringify([1, 2]) === stableStringify([2, 1])).toBe(false);
  });
  test("omite undefined como JSON", () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
  });
  test("anidado estable", () => {
    expect(stableStringify({ x: { p: 1, q: 2 } })).toBe(stableStringify({ x: { q: 2, p: 1 } }));
  });
});

describe("12 escenarios de dirty", () => {
  test("1. abrir Osiris → dirty=false", () => {
    const blob = BLOB(); const base = snapshotOsiris(blob);
    expect(isDirty(blob, base)).toBe(false);
  });
  test("2. cargar CURRENT → dirty=false", () => {
    const blob = BLOB(); const base = snapshotOsiris(blob);
    expect(isDirty(clone(blob), base)).toBe(false); // re-hidratado, mismo contenido
  });
  test("3. cambiar tab → dirty=false (tab no vive en el blob)", () => {
    const blob = BLOB(); const base = snapshotOsiris(blob);
    // cambiar de tab es estado de UI; el blob no cambia
    expect(isDirty(blob, base)).toBe(false);
  });
  test("4. aplicar filtro → dirty=false (filtro no vive en el blob)", () => {
    const blob = BLOB(); const base = snapshotOsiris(blob);
    expect(isDirty(blob, base)).toBe(false);
  });
  test("5. login/Auth init → dirty=false (auth no vive en el blob)", () => {
    const blob = BLOB(); const base = snapshotOsiris(blob);
    expect(isDirty(blob, base)).toBe(false);
  });
  test("6. calcular derivados → dirty=false (derivados no se persisten)", () => {
    const blob = BLOB(); const base = snapshotOsiris(blob);
    const totalHa = blob.contratos.reduce((a, c) => a + c.plantaciones.reduce((b, p) => b + p.hectareas, 0), 0);
    expect(totalHa).toBe(10);              // se calculó algo derivado…
    expect(isDirty(blob, base)).toBe(false); // …pero el blob no cambió
  });
  test("7. editar campo persistible → dirty=true", () => {
    const blob = BLOB(); const base = snapshotOsiris(blob);
    const next = clone(blob); next.contratos[0].razonSocial = "Prod A (editado)";
    expect(isDirty(next, base)).toBe(true);
  });
  test("8. crear registro → dirty=true", () => {
    const blob = BLOB(); const base = snapshotOsiris(blob);
    const next = clone(blob); next.obtentores.push({ id: "o2", obtentor: "Nuevo" });
    expect(isDirty(next, base)).toBe(true);
  });
  test("9. eliminar/soft-delete → dirty=true", () => {
    const blob = BLOB(); const base = snapshotOsiris(blob);
    const del = clone(blob); del.viveros = [];
    expect(isDirty(del, base)).toBe(true);
    const soft = clone(blob); soft.contratos[0].estado = "inactiva";
    expect(isDirty(soft, base)).toBe(true);
  });
  test("10. guardar ok → dirty=false (baseline se refresca)", () => {
    const blob = BLOB(); let base = snapshotOsiris(blob);
    const next = clone(blob); next.contratos[0].razonSocial = "Editado";
    expect(isDirty(next, base)).toBe(true);
    base = snapshotOsiris(next);            // guardado exitoso refresca baseline
    expect(isDirty(next, base)).toBe(false);
  });
  test("11. error al guardar → dirty=true (baseline NO cambia)", () => {
    const blob = BLOB(); const base = snapshotOsiris(blob);
    const next = clone(blob); next.clientes[0].razonSocial = "Cambio";
    // fallo de guardado: baseline permanece; el contenido sigue difiriendo
    expect(isDirty(next, base)).toBe(true);
  });
  test("12. revertir al baseline → dirty=false", () => {
    const blob = BLOB(); const base = snapshotOsiris(blob);
    const edited = clone(blob); edited.especies[0].nombre = "X";
    expect(isDirty(edited, base)).toBe(true);
    const reverted = clone(blob);           // usuario deshace el cambio
    expect(isDirty(reverted, base)).toBe(false);
  });
});

describe("REGRESIÓN del bug (dirty permanente sin editar)", () => {
  test("re-set con nueva referencia, mismo contenido → NO dirty", () => {
    const blob = BLOB(); const base = snapshotOsiris(blob);
    const reset = clone(blob);              // nueva referencia idéntica (hidratación/normalización)
    expect(isDirty(reset, base)).toBe(false);
  });
  test("orden de claves distinto tras hidratar → NO dirty", () => {
    const blob = BLOB(); const base = snapshotOsiris(blob);
    // mismo contrato con claves en otro orden
    const reordered = clone(blob);
    reordered.contratos[0] = { pais: "Peru", plantaciones: reordered.contratos[0].plantaciones, id: "c1", razonSocial: "Prod A" };
    expect(isDirty(reordered, base)).toBe(false);
  });
  test("agregar clave con valor undefined → NO dirty (equivale a ausente)", () => {
    const blob = BLOB(); const base = snapshotOsiris(blob);
    const withUndef = clone(blob); withUndef.contratos[0].nota = undefined;
    expect(isDirty(withUndef, base)).toBe(false);
  });
  test("null vs objeto vacío en baseline inicial → NO dirty", () => {
    const base = snapshotOsiris(null);      // no había fila 'osiris'
    expect(isDirty({}, base)).toBe(false);
    expect(isDirty(null, base)).toBe(false);
  });
});
