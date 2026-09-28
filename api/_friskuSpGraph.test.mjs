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
// search() a nivel de drive fue retirado: construirUrlGraph ya no arma esa URL.
eq(G.construirUrlGraph("search", { q: "HLBU9435288" }, cfg).error, "op_desconocida", "search() retirado (no se construye)");
ok(G.construirUrlGraph("item", { itemId: "ID_1" }, cfg).url.endsWith("/items/ID_1"), "url item");
eq(G.construirUrlGraph("list", { carpetaId: "../etc" }, cfg).error, "param_invalido", "list carpeta inválida");
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

  // ── resolverDriveFrisku: enumera /drives del sitio y elige "Documentos" exacto y único ──
  const SITE_ID = "grupomediterra.sharepoint.com,11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222";
  const DOCS = { id: "b!Docs_Exacto", name: "Documentos", webUrl: "https://grupomediterra.sharepoint.com/sites/FriskuFoodsSpA/Documentos%20compartidos" };
  const TEAMS = { id: "b!Teams", name: "Teams Wiki Data", webUrl: "https://grupomediterra.sharepoint.com/sites/FriskuFoodsSpA/Teams%20Wiki%20Data" };
  // fabrica un fetch de resolución: site() y drives() configurables; registra url+método.
  const mkResolver = (over = {}) => {
    const calls = [];
    const f = async (url, opts) => {
      calls.push({ url: String(url), method: (opts && opts.method) || "GET" });
      const u = String(url);
      if (u.includes(":/sites/FriskuFoodsSpA?")) return over.site ? over.site() : { ok: true, status: 200, json: async () => ({ id: SITE_ID }) };
      if (u.includes("/drives?$select=id,name,webUrl")) return over.drives ? over.drives() : { ok: true, status: 200, json: async () => ({ value: [TEAMS, DOCS] }) };
      return { ok: false, status: 404, json: async () => ({}) };
    };
    f.calls = calls;
    return f;
  };
  { const f = mkResolver();
    const rd = await G.resolverDriveFrisku("TOK", f);
    ok(rd.ok && rd.driveId === "b!Docs_Exacto", "resolverDrive: elige la biblioteca Documentos por nombre exacto");
    ok(f.calls.length === 2 && f.calls.every((c) => c.method === "GET"), "resolverDrive: solo GET (site + drives)");
    ok(f.calls[0].url === G.FRISKU_SITE_META, "resolverDrive: primer GET al sitio Frisku (ruta fija)");
    ok(f.calls[1].url.includes("/drives?$select=id,name,webUrl"), "resolverDrive: segundo GET enumera /drives"); }
  // ausencia de "Documentos" → cerrado
  eq((await G.resolverDriveFrisku("TOK", mkResolver({ drives: () => ({ ok: true, status: 200, json: async () => ({ value: [TEAMS] }) }) }))).error, "drive_ambiguo", "resolverDrive: ausencia → drive_ambiguo");
  // duplicado de "Documentos" → cerrado
  eq((await G.resolverDriveFrisku("TOK", mkResolver({ drives: () => ({ ok: true, status: 200, json: async () => ({ value: [DOCS, { ...DOCS, id: "b!Otro" }] }) }) }))).error, "drive_ambiguo", "resolverDrive: duplicado → drive_ambiguo");
  // webUrl fuera del sitio → no cuenta como Documentos → cerrado
  eq((await G.resolverDriveFrisku("TOK", mkResolver({ drives: () => ({ ok: true, status: 200, json: async () => ({ value: [{ id: "b!X", name: "Documentos", webUrl: "https://evil.example/x" }] }) }) }))).error, "drive_ambiguo", "resolverDrive: webUrl fuera del sitio → cerrado");
  // site 404 → propagado; drives 500 → propagado; site con id anómalo → cerrado
  eq((await G.resolverDriveFrisku("TOK", mkResolver({ site: () => ({ ok: false, status: 404, json: async () => ({}) }) }))).status, 404, "resolverDrive: site error propagado");
  { const r = await G.resolverDriveFrisku("TOK", mkResolver({ site: () => ({ ok: false, status: 404, json: async () => ({}) }) })); eq(r.error, "site_resolve", "resolverDrive: site error → site_resolve"); }
  eq((await G.resolverDriveFrisku("TOK", mkResolver({ drives: () => ({ ok: false, status: 500, json: async () => ({}) }) }))).status, 500, "resolverDrive: drives error propagado");
  eq((await G.resolverDriveFrisku("TOK", mkResolver({ site: () => ({ ok: true, status: 200, json: async () => ({ id: "no-es-un-site-id" }) }) }))).error, "site_shape", "resolverDrive: site id anómalo → site_shape");

  // ── listarBibliotecaBFS: recorrido acotado, subcarpetas, truncamiento, fail-closed, solo GET ──
  const item = (id, name, folder) => folder ? { id, name, folder: { childCount: 1 } } : { id, name, file: { mimeType: "application/pdf" } };
  // raíz con 1 archivo + 1 subcarpeta; la subcarpeta tiene 1 archivo → BFS baja y los junta.
  { const calls = [];
    const f = async (url, opts) => {
      calls.push({ url: String(url), method: (opts && opts.method) || "GET" });
      const u = String(url);
      if (u.includes("/root/children")) return { ok: true, status: 200, json: async () => ({ value: [item("F1", "raiz.pdf"), item("SUB", "COMEX", true)] }) };
      if (u.includes("/items/SUB/children")) return { ok: true, status: 200, json: async () => ({ value: [item("F2", "sub.pdf")] }) };
      return { ok: true, status: 200, json: async () => ({ value: [] }) };
    };
    const r = await G.listarBibliotecaBFS("b!Docs_Exacto", "TOK", f);
    ok(r.ok && r.items.length === 3 && !r.truncated, "BFS: raíz + subcarpeta → junta todos los ítems");
    ok(r.items.some((x) => x.id === "F2"), "BFS: baja a subcarpetas");
    ok(calls.every((c) => c.method === "GET") && !calls.some((c) => c.url.includes("search(")) && !calls.some((c) => c.url.includes("/search/query")), "BFS: solo GET y sin search()"); }
  // truncamiento por límite de ítems
  { const f = async () => ({ ok: true, status: 200, json: async () => ({ value: [item("A", "a.pdf"), item("B", "b.pdf"), item("C", "c.pdf")] }) });
    const r = await G.listarBibliotecaBFS("b!Docs_Exacto", "TOK", f, { items: 2 });
    ok(r.ok && r.items.length === 2 && r.truncated === true, "BFS: límite de ítems → truncated"); }
  // truncamiento por límite de carpetas (no baja a más subcarpetas)
  { const f = async (url) => {
      if (String(url).includes("/root/children")) return { ok: true, status: 200, json: async () => ({ value: [item("S1", "c1", true), item("S2", "c2", true)] }) };
      return { ok: true, status: 200, json: async () => ({ value: [] }) };
    };
    const r = await G.listarBibliotecaBFS("b!Docs_Exacto", "TOK", f, { carpetas: 1 });
    ok(r.ok && r.truncated === true, "BFS: límite de carpetas → truncated"); }
  // fail-closed ante 429 / timeout(504) / anómalo
  eq((await G.listarBibliotecaBFS("b!Docs_Exacto", "TOK", async () => ({ ok: false, status: 429, json: async () => ({}) }))).status, 429, "BFS: 429 → fail-closed");
  eq((await G.listarBibliotecaBFS("b!Docs_Exacto", "TOK", async () => { throw new Error("red"); })).status, 504, "BFS: timeout/red → fail-closed 504");
  eq((await G.listarBibliotecaBFS("b!Docs_Exacto", "TOK", async () => ({ ok: true, status: 200, json: async () => ({ noValue: 1 }) }))).status, 502, "BFS: respuesta anómala → fail-closed 502");
  ok((await G.listarBibliotecaBFS("id/invalido", "TOK", async () => ({ ok: true, status: 200, json: async () => ({ value: [] }) }))).ok === false, "BFS: driveId inválido → cerrado");
  // truncamiento por tiempo (reloj inyectado que avanza más allá del límite)
  { let t = 0; const reloj = () => (t += 100000);
    const f = async () => ({ ok: true, status: 200, json: async () => ({ value: [item("A", "a.pdf")] }) });
    const r = await G.listarBibliotecaBFS("b!Docs_Exacto", "TOK", f, { tiempoMs: 10 }, reloj);
    ok(r.ok && r.truncated === true, "BFS: límite de tiempo → truncated"); }

  console.log(`\n_friskuSpGraph: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
run();
