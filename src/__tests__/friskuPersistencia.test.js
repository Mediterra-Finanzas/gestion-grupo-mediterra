/* eslint-disable */
// Fusión por ítem del guardado compartido de Frisku.
// Lo que se prueba es una sola cosa: que nadie pierda trabajo sin enterarse.

import { fusionarPorId, esListaFusionable } from "../friskuPersistencia";

const emb = (id, extra) => ({ id, nave: "N" + id, cajas: 100, ...(extra || {}) });

describe("esListaFusionable", () => {
  test("acepta arreglos de objetos con id único", () => {
    expect(esListaFusionable([emb(1), emb(2)])).toBe(true);
  });
  test("rechaza lo que no se puede fusionar por id", () => {
    expect(esListaFusionable(null)).toBe(false);
    expect(esListaFusionable([])).toBe(true);              // vacío es fusionable
    expect(esListaFusionable([{ nave: "sin id" }])).toBe(false);
    expect(esListaFusionable([emb(1), emb(1)])).toBe(false); // id duplicado
    expect(esListaFusionable(["texto"])).toBe(false);
    expect(esListaFusionable({ a: 1 })).toBe(false);
    expect(esListaFusionable([[1, 2]])).toBe(false);
  });
});

describe("el caso real: María y Pedro", () => {
  // María cargó 2 embarques. Pedro agregó el 3 y guardó. María edita el 1.
  const base = [emb(1), emb(2)];
  const mio = [emb(1, { cajas: 999 }), emb(2)];
  const servidor = [emb(1), emb(2), emb(3)];

  test("la edición de María y el embarque de Pedro conviven", () => {
    const r = fusionarPorId(base, mio, servidor);
    expect(r.ok).toBe(true);
    expect(r.conflictos).toEqual([]);
    expect(r.valor.map((x) => x.id).sort()).toEqual([1, 2, 3]);
    expect(r.valor.find((x) => x.id === 1).cajas).toBe(999);   // lo de María
    expect(r.valor.find((x) => x.id === 3)).toBeDefined();      // lo de Pedro, preservado
  });

  test("informa que preservó un ítem ajeno", () => {
    expect(fusionarPorId(base, mio, servidor).cambios.ajenosPreservados).toBe(1);
  });

  test("sin la fusión, guardar 'lo mío' habría borrado el embarque de Pedro", () => {
    // Esto documenta el comportamiento anterior, que es el defecto.
    expect(mio.map((x) => x.id)).not.toContain(3);
  });
});

describe("cambios propios", () => {
  test("un ítem que agregué yo se conserva", () => {
    const r = fusionarPorId([emb(1)], [emb(1), emb(2)], [emb(1)]);
    expect(r.valor.map((x) => x.id)).toEqual([1, 2]);
    expect(r.cambios.agregados).toBe(1);
  });

  test("un ítem que borré yo se borra, si nadie más lo tocó", () => {
    const r = fusionarPorId([emb(1), emb(2)], [emb(1)], [emb(1), emb(2)]);
    expect(r.valor.map((x) => x.id)).toEqual([1]);
    expect(r.cambios.eliminados).toBe(1);
    expect(r.conflictos).toEqual([]);
  });

  test("los ítems que NO toqué quedan como los dejó el otro", () => {
    const base = [emb(1), emb(2)];
    const mio = [emb(1, { cajas: 5 }), emb(2)];             // solo toqué el 1
    const servidor = [emb(1), emb(2, { cajas: 777 })];      // el otro tocó el 2
    const r = fusionarPorId(base, mio, servidor);
    expect(r.conflictos).toEqual([]);
    expect(r.valor.find((x) => x.id === 1).cajas).toBe(5);
    expect(r.valor.find((x) => x.id === 2).cajas).toBe(777); // NO se pisa con mi copia vieja
  });
});

describe("conflictos reales: NO se inventa una resolución", () => {
  test("los dos editamos el mismo ítem", () => {
    const r = fusionarPorId([emb(1)], [emb(1, { cajas: 5 })], [emb(1, { cajas: 9 })]);
    expect(r.ok).toBe(true);
    expect(r.conflictos).toEqual(["1"]);
    expect(r.valor.find((x) => x.id === 1).cajas).toBe(9);   // gana el servidor
  });

  test("yo edito un ítem que el otro borró", () => {
    const r = fusionarPorId([emb(1), emb(2)], [emb(1), emb(2, { cajas: 5 })], [emb(1)]);
    expect(r.conflictos).toEqual(["2"]);
    expect(r.valor.map((x) => x.id)).toEqual([1]);          // no lo resucito
  });

  test("yo borro un ítem que el otro editó: no lo borro", () => {
    const r = fusionarPorId([emb(1), emb(2)], [emb(1)], [emb(1), emb(2, { cajas: 42 })]);
    expect(r.conflictos).toEqual(["2"]);
    expect(r.valor.find((x) => x.id === 2).cajas).toBe(42);
  });

  test("dos personas crean el mismo id con contenido distinto", () => {
    const r = fusionarPorId([], [emb(9, { cajas: 1 })], [emb(9, { cajas: 2 })]);
    expect(r.conflictos).toEqual(["9"]);
  });

  test("crear el mismo id con contenido idéntico NO es conflicto", () => {
    const r = fusionarPorId([], [emb(9)], [emb(9)]);
    expect(r.conflictos).toEqual([]);
  });
});

describe("no fusionable: se rechaza antes de arriesgar datos", () => {
  test("si alguna de las tres partes no es lista con id, no se fusiona", () => {
    expect(fusionarPorId(null, [emb(1)], [emb(1)]).ok).toBe(false);
    expect(fusionarPorId([emb(1)], { a: 1 }, [emb(1)]).ok).toBe(false);
    expect(fusionarPorId([emb(1)], [emb(1)], "x").ok).toBe(false);
    expect(fusionarPorId([emb(1)], [emb(1)], [{ sinId: true }]).motivo).toBe("no_fusionable");
  });
});

describe("invariantes", () => {
  test("no muta ninguna de las tres entradas", () => {
    const base = [emb(1)], mio = [emb(1, { cajas: 5 }), emb(2)], servidor = [emb(1), emb(3)];
    const cb = JSON.stringify(base), cm = JSON.stringify(mio), cs = JSON.stringify(servidor);
    fusionarPorId(base, mio, servidor);
    expect(JSON.stringify(base)).toBe(cb);
    expect(JSON.stringify(mio)).toBe(cm);
    expect(JSON.stringify(servidor)).toBe(cs);
  });

  test("nunca se pierde un ítem del servidor que yo no toqué", () => {
    const base = [emb(1)];
    const mio = [emb(1, { cajas: 5 })];
    const servidor = [emb(1), emb(7), emb(8), emb(9)];
    const r = fusionarPorId(base, mio, servidor);
    for (const id of [7, 8, 9]) expect(r.valor.find((x) => x.id === id)).toBeDefined();
  });

  test("sin cambios míos, el resultado es exactamente el del servidor", () => {
    const base = [emb(1), emb(2)];
    const servidor = [emb(1, { cajas: 3 }), emb(2), emb(5)];
    const r = fusionarPorId(base, base, servidor);
    expect(r.conflictos).toEqual([]);
    expect(r.valor.map((x) => x.id).sort()).toEqual([1, 2, 5]);
    expect(r.valor.find((x) => x.id === 1).cajas).toBe(3);
  });

  test("el resultado no tiene ids repetidos", () => {
    const r = fusionarPorId([emb(1)], [emb(1, { cajas: 2 }), emb(4)], [emb(1), emb(4), emb(5)]);
    const ids = r.valor.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("respeta mi orden y deja al final lo que sumó el otro", () => {
    const r = fusionarPorId([emb(1), emb(2)], [emb(2), emb(1)], [emb(1), emb(2), emb(3)]);
    expect(r.valor.map((x) => x.id)).toEqual([2, 1, 3]);
  });

  test("ids numéricos y de texto no se confunden entre sí", () => {
    const r = fusionarPorId([{ id: "1", v: "texto" }], [{ id: "1", v: "editado" }], [{ id: "1", v: "texto" }]);
    expect(r.conflictos).toEqual([]);
    expect(r.valor[0].v).toBe("editado");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Clave de identidad: los maestros usan `codigo`, no `id`.
// ─────────────────────────────────────────────────────────────────────────────
import { detectarClave, CLAVES_CANDIDATAS } from "../friskuPersistencia";

const pais = (codigo, nombreEs) => ({ codigo, nombreEs, region: "Sudamérica" });

describe("detección de la clave de identidad", () => {
  test("detecta id cuando existe", () => {
    expect(detectarClave([{ id: 1 }, { id: 2 }])).toBe("id");
  });
  test("detecta codigo en los maestros", () => {
    expect(detectarClave([pais("CL", "Chile"), pais("PE", "Perú")])).toBe("codigo");
  });
  test("prefiere id si están los dos", () => {
    expect(detectarClave([{ id: 1, codigo: "A" }, { id: 2, codigo: "B" }])).toBe("id");
  });
  test("sin clave utilizable devuelve null", () => {
    expect(detectarClave([{ nombre: "x" }, { nombre: "y" }])).toBeNull();
    expect(detectarClave([pais("CL", "a"), pais("CL", "b")])).toBeNull();   // codigo repetido
    expect(detectarClave("no es lista")).toBeNull();
  });
  test("una lista vacía es fusionable", () => {
    expect(CLAVES_CANDIDATAS).toContain(detectarClave([]));
  });
});

describe("fusión de maestros por codigo", () => {
  test("dos personas agregando países distintos: quedan los dos", () => {
    const base = [pais("CL", "Chile")];
    const mio = [pais("CL", "Chile"), pais("AR", "Argentina")];
    const servidor = [pais("CL", "Chile"), pais("PE", "Perú")];
    const r = fusionarPorId(base, mio, servidor);
    expect(r.ok).toBe(true);
    expect(r.clave).toBe("codigo");
    expect(r.conflictos).toEqual([]);
    expect(r.valor.map((x) => x.codigo).sort()).toEqual(["AR", "CL", "PE"]);
  });

  test("los dos editan el mismo país: conflicto, gana el servidor", () => {
    const r = fusionarPorId([pais("CL", "Chile")], [pais("CL", "Chile mío")], [pais("CL", "Chile suyo")]);
    expect(r.conflictos).toEqual(["CL"]);
    expect(r.valor[0].nombreEs).toBe("Chile suyo");
  });

  test("si las tres partes no comparten clave, no se fusiona", () => {
    const r = fusionarPorId([{ id: 1 }], [{ id: 1 }], [pais("CL", "Chile")]);
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("no_fusionable");
  });

  test("un objeto que no es lista (maestro_tc, rendiciones_config) nunca se fusiona", () => {
    const r = fusionarPorId({ "USD-CLP": [] }, { "USD-CLP": [1] }, { "USD-CLP": [2] });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("no_fusionable");
  });
});
