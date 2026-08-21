/* eslint-disable */
// Tests del contrato Option C del cliente (fetchProcToken). node src/proceso/core/procAuth.optionc.test.mjs
process.env.REACT_APP_PROC_AUTH = "true";
const { fetchProcToken, getProcToken, getProcEmpresa, clearProcToken } = await import("./procAuth.js");

const ALS = "5aa10886-2a76-4a9e-9bc3-303fb776cd49", B = "11111111-1111-1111-1111-111111111111";
const now = Math.floor(Date.now() / 1000);
let P = 0, F = 0; const ok = (c, m) => { if (c) { P++; console.log("PASS", m); } else { F++; console.log("FAIL", m); } };
const mock = (status, body) => { global.fetch = async () => ({ status, ok: status >= 200 && status < 300, json: async () => body }); };

// FE-01 single membership → sesión lista, token + empresa en memoria
clearProcToken();
mock(200, { access_token: "AT", expires_at: now + 1200, empresa_id: ALS, iam_usuario_id: "iam-ang" });
let r = await fetchProcToken({ email: "a@x.cl", pin: "1234" });
ok(r.ok === true && r.empresa_id === ALS, "FE-01 single → ok+empresa");
ok(getProcToken() === "AT", "FE-01 token en memoria");
ok(getProcEmpresa() === ALS, "FE-01 empresa context = ALS");

// FE-02 N memberships → needs_selection, SIN token
clearProcToken();
mock(200, { needs_selection: true, memberships: [{ id: ALS, codigo: "ALS", nombre: "Allegria Service" }, { id: B, codigo: "BET", nombre: "Empresa B" }] });
r = await fetchProcToken({ email: "a@x.cl", pin: "1234" });
ok(r.needsSelection === true && r.memberships.length === 2, "FE-02 N → needs_selection + lista");
ok(getProcToken() === null, "FE-02 sin token hasta seleccionar");
ok(getProcEmpresa() === null, "FE-02 sin empresa context");

// FE-03 selección → sesión para B
mock(200, { access_token: "AT2", expires_at: now + 1200, empresa_id: B });
r = await fetchProcToken({ email: "a@x.cl", pin: "1234", empresaId: B });
ok(r.ok === true && r.empresa_id === B, "FE-03 selección → sesión B");
ok(getProcEmpresa() === B, "FE-03 empresa context = B");

// FE-04 403 sin_membership → throw code, sin token
clearProcToken();
mock(403, { error: "sin_membership" });
try { await fetchProcToken({ email: "a@x.cl", pin: "1234" }); ok(false, "FE-04 debía throw"); }
catch (e) { ok(e.code === "sin_membership" && getProcToken() === null, "FE-04 403 → throw+deny"); }

// FE-05 429 → throw, limpio
mock(429, { error: "demasiados_intentos" });
try { await fetchProcToken({ email: "a@x.cl", pin: "1" }); ok(false, "FE-05 debía throw"); }
catch (e) { ok(e.code === "demasiados_intentos", "FE-05 429 → throw"); }

// FE-06 expiry: token expirado → getProcToken null → getProcEmpresa null
clearProcToken();
mock(200, { access_token: "AT3", expires_at: now - 1, empresa_id: ALS });
await fetchProcToken({ email: "a@x.cl", pin: "1234" });
ok(getProcToken() === null, "FE-06 token expirado → null");
ok(getProcEmpresa() === null, "FE-06 sin token → empresa context null");

console.log(`\nAUTH-FE RESULT: PASS=${P} FAIL=${F}`);
if (F > 0) process.exit(1);
