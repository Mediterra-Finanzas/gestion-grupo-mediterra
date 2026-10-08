/* eslint-disable */
// Tiempo real por fila: qué se pide al servidor y qué se acepta.
import { topicFila, mensajeJoin, extraerRegistro, conectarFilas } from "../realtime/filas.js";

test("el join pide UNA fila: tópico con filtro y postgres_changes con el mismo filtro", () => {
  const m = mensajeJoin("main", 1);
  expect(m.topic).toBe("realtime:public:calendario_data:id=eq.main");
  expect(m.payload.config.postgres_changes).toEqual([{ event: "*", schema: "public", table: "calendario_data", filter: "id=eq.main" }]);
});
test("acepta el formato v1 (INSERT/UPDATE + payload.record) y el v2 (postgres_changes)", () => {
  const v1 = { topic: topicFila("main"), event: "UPDATE", payload: { record: { id: "main", value: '{"a":1}', updated_at: "t1" } } };
  expect(extraerRegistro(v1, ["main"])).toEqual({ id: "main", value: { a: 1 }, updated_at: "t1" });
  const v2 = { topic: topicFila("usuarios"), event: "postgres_changes", payload: { data: { type: "UPDATE", record: { id: "usuarios", value: [1], updated_at: "t2" } } } };
  expect(extraerRegistro(v2, ["usuarios"])).toEqual({ id: "usuarios", value: [1], updated_at: "t2" });
});
test("descarta filas no pedidas, mensajes de otro canal, DELETE y valores vacíos", () => {
  const rec = (id) => ({ topic: topicFila(id), event: "UPDATE", payload: { record: { id, value: "{}" } } });
  expect(extraerRegistro(rec("nominas_remuneraciones"), ["main", "usuarios"])).toBeNull();
  expect(extraerRegistro({ ...rec("main"), topic: "realtime:public:calendario_data" }, ["main"])).toBeNull();
  expect(extraerRegistro({ topic: topicFila("main"), event: "DELETE", payload: { record: { id: "main", value: "{}" } } }, ["main"])).toBeNull();
  expect(extraerRegistro({ topic: topicFila("main"), event: "UPDATE", payload: { record: { id: "main", value: null } } }, ["main"])).toBeNull();
});
test("conectarFilas se une solo a las filas pedidas y entrega solo esas", () => {
  const enviados = []; let inst;
  class WSFalso { constructor(u) { this.url = u; this.readyState = 1; inst = this; } send(x) { enviados.push(JSON.parse(x)); } close() { this.readyState = 3; } }
  const recibidos = [];
  const cerrar = conectarFilas({ wsUrl: "wss://x", ids: ["main", "usuarios"], onRegistro: r => recibidos.push(r.id), WebSocketImpl: WSFalso });
  inst.onopen();
  expect(enviados.map(m => m.topic)).toEqual([topicFila("main"), topicFila("usuarios")]);
  for (const id of ["main", "nominas", "nominas_remuneraciones", "usuarios", "frisku_liquidaciones"])
    inst.onmessage({ data: JSON.stringify({ topic: topicFila(id), event: "UPDATE", payload: { record: { id, value: "{}" } } }) });
  expect(recibidos).toEqual(["main", "usuarios"]);
  cerrar(); expect(inst.readyState).toBe(3);
});
