/* eslint-disable */
// Tests de _friskuSpGraph (S4.1). Datos ficticios, sin red real. Ejecutar: node api/_friskuSpGraph.test.mjs
import G from "./_friskuSpGraph.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const eq = (a, b, m) => ok(a === b, `${m} (esp ${JSON.stringify(b)}, obt ${JSON.stringify(a)})`);

const cfg = { driveId: "DRV_FRISKU", tenantId: "TEN", clientId: "CLI" };

// construirUrlGraph
const list = G.construirUrlGraph("list", {}, cfg);
ok(list.ok && list.url.includes("/drives/DRV_FRISKU/root/children") && list.url.includes("$top=50"), "url list root");
ok(G.construirUrlGraph("list", { carpetaId: "ABC123", top: 10 }, cfg).url.includes("/items/ABC123/children"), "url list carpeta");
ok(G.construirUrlGraph("list", { top: 9999 }, cfg).url.includes("$top=200"), "url list top clamp a 200");
const search = G.construirUrlGraph("search", { q: "HLBU9435288" }, cfg);
ok(search.ok && search.url.includes("search(q='HLBU9435288')"), "url search");
ok(G.construirUrlGraph("item", { itemId: "ID_1" }, cfg).url.endsWith("/items/ID_1"), "url item");
eq(G.construirUrlGraph("list", { carpetaId: "../etc" }, cfg).error, "param_invalido", "list carpeta inválida");
eq(G.construirUrlGraph("search", { q: "" }, cfg).error, "param_invalido", "search q vacío");
eq(G.construirUrlGraph("search", { q: "x".repeat(200) }, cfg).error, "param_invalido", "search q demasiado largo");
eq(G.construirUrlGraph("item", { itemId: "a/b" }, cfg).error, "param_invalido", "item id con / inválido");
eq(G.construirUrlGraph("otro", {}, cfg).error, "op_desconocida", "op desconocida");
eq(G.construirUrlGraph("list", {}, {}).error, "no_configurado", "sin driveId → no_configurado");

// validaciones puras
ok(G.validarItemId("A1!_-.x") && !G.validarItemId("a b") && !G.validarItemId("a/b"), "validarItemId");
eq(G.sanearQuery("  hola\tmundo  "), "hola mundo", "sanearQuery normaliza control chars");
ok(G.sanearQuery("x".repeat(129)) === null, "sanearQuery corta por longitud");
ok(G.drivePermitido("DRV_FRISKU", cfg) && !G.drivePermitido("OTRO", cfg), "drivePermitido allowlist");

// nextLink solo del mismo drive
ok(G.nextLinkPermitido("https://graph.microsoft.com/v1.0/drives/DRV_FRISKU/root/children?$skiptoken=x", cfg), "nextLink mismo drive ok");
ok(!G.nextLinkPermitido("https://graph.microsoft.com/v1.0/drives/OTRO/root/children", cfg), "nextLink otro drive → null");
ok(!G.nextLinkPermitido("https://evil.example/x", cfg), "nextLink otro origen → null");

// normalización driveItem (sin fugas de ruta local; parentPath relativo)
const it = { id: "IT1", name: "BL.pdf", webUrl: "https://sp/BL.pdf", size: 10, file: { mimeType: "application/pdf" }, lastModifiedDateTime: "2026-08-01T00:00:00Z", parentReference: { driveId: "DRV_FRISKU", path: "/drives/DRV_FRISKU/root:/COMEX/Agrokasa" } };
const n = G.normalizarDriveItem(it, cfg);
eq(n.itemId, "IT1", "normaliza itemId");
eq(n.parentPath, "/COMEX/Agrokasa", "parentPath relativo (sin prefijo root:)");
eq(n.esCarpeta, false, "archivo no es carpeta");
eq(n.mimeType, "application/pdf", "mimeType");
const carp = G.normalizarDriveItem({ id: "C1", name: "COMEX", folder: { childCount: 3 }, parentReference: { driveId: "DRV_FRISKU", path: "/drives/DRV_FRISKU/root:" } }, cfg);
ok(carp.esCarpeta && carp.mimeType === "folder", "carpeta → esCarpeta + mimeType folder");

// normalizarRespuesta: value[] + nextLink → truncated; cursor = $skiptoken opaco (NO la URL)
const resp = G.normalizarRespuesta({ value: [it], "@odata.nextLink": "https://graph.microsoft.com/v1.0/drives/DRV_FRISKU/root/children?$skiptoken=TOKEN123" }, cfg);
ok(resp.items.length === 1 && resp.truncated, "respuesta con nextLink → truncated");
eq(resp.nextCursor, "TOKEN123", "cursor = $skiptoken opaco");
ok(!String(resp.nextCursor).includes("graph.microsoft.com") && !String(resp.nextCursor).includes("/drives/"), "cursor no expone la URL de Graph");
// nextLink de otro drive → sin cursor
ok(!G.normalizarRespuesta({ value: [], "@odata.nextLink": "https://graph.microsoft.com/v1.0/drives/OTRO/root/children?$skiptoken=y" }, cfg).truncated, "nextLink de otro drive → sin cursor");
const respItem = G.normalizarRespuesta(it, cfg);
ok(respItem.items.length === 1 && !respItem.truncated, "respuesta item único → wrap sin truncado");

// obtenerTokenGraph (fetch mock)
async function run() {
  const okFetch = async () => ({ ok: true, json: async () => ({ access_token: "GRAPH_TOK" }) });
  const t1 = await G.obtenerTokenGraph({ oidcToken: "OIDC", tenantId: "T", clientId: "C", fetchImpl: okFetch });
  ok(t1.ok && t1.token === "GRAPH_TOK", "tokenGraph: intercambio ok");
  const badFetch = async () => ({ ok: false, json: async () => ({ error: "invalid" }) });
  eq((await G.obtenerTokenGraph({ oidcToken: "OIDC", tenantId: "T", clientId: "C", fetchImpl: badFetch })).error, "token_exchange", "tokenGraph: fallo → token_exchange");
  eq((await G.obtenerTokenGraph({ oidcToken: "", tenantId: "T", clientId: "C", fetchImpl: okFetch })).error, "no_configurado", "tokenGraph: sin oidc → no_configurado");

  // el body del intercambio usa client_assertion (federado, sin secreto)
  let capturado = null;
  const capFetch = async (url, opts) => { capturado = { url, opts }; return { ok: true, json: async () => ({ access_token: "T" }) }; };
  await G.obtenerTokenGraph({ oidcToken: "OIDC_X", tenantId: "TEN", clientId: "CLI", fetchImpl: capFetch });
  ok(capturado.url.includes("/TEN/oauth2/v2.0/token"), "tokenGraph: endpoint Entra correcto");
  ok(capturado.opts.body.includes("client_assertion=OIDC_X") && capturado.opts.body.includes("grant_type=client_credentials"), "tokenGraph: usa client_assertion federado");

  // graphGet: solo GET, mapea estados
  let metodo = null;
  const g200 = async (url, opts) => { metodo = opts.method; return { ok: true, status: 200, json: async () => ({ value: [] }) }; };
  const r200 = await G.graphGet("https://graph.microsoft.com/v1.0/drives/DRV_FRISKU/root/children", "TOK", g200);
  ok(r200.ok && metodo === "GET", "graphGet: usa GET y ok");
  const g404 = async () => ({ ok: false, status: 404, json: async () => ({}) });
  eq((await G.graphGet("u", "T", g404)).status, 404, "graphGet: 404 propagado");
  const gThrow = async () => { throw new Error("boom"); };
  eq((await G.graphGet("u", "T", gThrow, 5)).status, 504, "graphGet: excepción/timeout → 504");

  // resolverDriveFrisku: ruta fija allowlisted + validación estricta de identidad/forma.
  let resolverUrl = "", resolverMetodo = "";
  const driveOk = async (url, opts) => {
    resolverUrl = url; resolverMetodo = opts.method;
    return { ok: true, status: 200, json: async () => ({
      id: "b!Drive_Exacto", name: "Documentos",
      webUrl: "https://grupomediterra.sharepoint.com/sites/FriskuFoodsSpA/Documentos%20compartidos",
    }) };
  };
  const rd = await G.resolverDriveFrisku("TOK", driveOk);
  ok(rd.ok && rd.driveId === "b!Drive_Exacto", "resolverDrive: devuelve ID exacto de Graph");
  ok(resolverMetodo === "GET" && resolverUrl === G.FRISKU_DRIVE_META, "resolverDrive: solo GET a ruta fija");
  const driveNombreMalo = async () => ({ ok: true, status: 200, json: async () => ({ id: "D", name: "Otro", webUrl: "https://grupomediterra.sharepoint.com/sites/FriskuFoodsSpA/x" }) });
  eq((await G.resolverDriveFrisku("TOK", driveNombreMalo)).error, "drive_shape", "resolverDrive: nombre inesperado → cerrado");
  const driveHostMalo = async () => ({ ok: true, status: 200, json: async () => ({ id: "D", name: "Documentos", webUrl: "https://evil.example/x" }) });
  eq((await G.resolverDriveFrisku("TOK", driveHostMalo)).error, "drive_shape", "resolverDrive: webUrl fuera del sitio → cerrado");
  eq((await G.resolverDriveFrisku("TOK", g404)).status, 404, "resolverDrive: error Graph propagado");

  console.log(`\n_friskuSpGraph: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
run();
