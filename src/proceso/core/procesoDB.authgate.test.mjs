// F-1/F-2 — logout limpia token PROC + fail-closed sin fallback anon con flag ON.
// Unidad sobre procAuth (punto de decisión). node src/proceso/core/procesoDB.authgate.test.mjs
import {
  setProcToken, setProcSession, clearProcToken, getProcToken, getProcEmpresa,
  setOnProcAuthRequired, procAuthGuardToken, ProcAuthRequiredError,
} from "./procAuth.js";

let P = 0, F = 0;
const ck = (l, ok, d) => { if (ok) { P++; console.log("PASS", l); } else { F++; console.log("FAIL", l, d !== undefined ? JSON.stringify(d) : ""); } };
const now = () => Math.floor(Date.now() / 1000);
const reset = () => { setOnProcAuthRequired(null); clearProcToken(); };
const guardThrows = () => { try { procAuthGuardToken(); return false; } catch (e) { return e && e.code === "PROC_AUTH_REQUIRED"; } };

// procAuthGuardToken() es el token que iría en Authorization: Bearer <t> (o null→SUPA_KEY con flag OFF).

// 1) flag OFF → guard devuelve null (caller usa anon SUPA_KEY), sin throw
process.env.REACT_APP_PROC_AUTH = "false"; reset();
ck("01 flag OFF → guard=null (anon), sin throw", procAuthGuardToken() === null);

// 2) flag ON + token válido → guard devuelve el token (Bearer authenticated)
process.env.REACT_APP_PROC_AUTH = "true"; reset();
setProcSession({ access_token: "TOK123", expires_at: now() + 3600, empresa_id: "EMP-A" });
ck("02 flag ON + token → guard=TOK123", procAuthGuardToken() === "TOK123");
ck("02b empresa (X-Proc-Empresa) = EMP-A", getProcEmpresa() === "EMP-A", getProcEmpresa());

// 3) flag ON + token EXPIRADO → throw PROC_AUTH_REQUIRED (NO anon)
process.env.REACT_APP_PROC_AUTH = "true"; reset();
setProcToken("OLD", now() - 100);
ck("03 flag ON + expirado → PROC_AUTH_REQUIRED", guardThrows());
ck("03b token expirado no se usa (getProcToken null)", getProcToken() === null);

// 4) flag ON + token AUSENTE → throw (NO anon)
process.env.REACT_APP_PROC_AUTH = "true"; reset();
ck("04 flag ON + ausente → PROC_AUTH_REQUIRED", guardThrows());

// 5) logout → clearProcToken invalida el token en memoria
process.env.REACT_APP_PROC_AUTH = "true"; reset();
setProcToken("LIVE", now() + 3600);
ck("05a token vivo antes de logout", getProcToken() === "LIVE");
clearProcToken();
ck("05b clearProcToken → token null (logout)", getProcToken() === null);
ck("05c empresa también null tras logout", getProcEmpresa() === null);

// 6) callback de re-auth se dispara 1 vez (control, sin loop)
process.env.REACT_APP_PROC_AUTH = "true"; reset();
let reauth = 0; setOnProcAuthRequired(() => { reauth++; });
guardThrows();
ck("06 re-auth callback disparado 1 vez", reauth === 1, { reauth });

// 7) header X-Proc-Empresa ausente si hay token pero no empresa
process.env.REACT_APP_PROC_AUTH = "true"; reset();
setProcToken("TOKNOEMP", now() + 3600);   // sin setProcSession → _empresa null
ck("07a guard devuelve token", procAuthGuardToken() === "TOKNOEMP");
ck("07b sin empresa → getProcEmpresa null", getProcEmpresa() === null);

// 8) flag OFF NO dispara re-auth ni bloquea (baseline intacto sin token)
process.env.REACT_APP_PROC_AUTH = "false"; reset();
let reauth2 = 0; setOnProcAuthRequired(() => { reauth2++; });
ck("08 flag OFF → guard=null sin re-auth", procAuthGuardToken() === null && reauth2 === 0, { reauth2 });

// 9) ProcAuthRequiredError identificable
ck("09 ProcAuthRequiredError.code", new ProcAuthRequiredError().code === "PROC_AUTH_REQUIRED");

// 10) multi-tab: el estado es de módulo (una instancia por pestaña en browser). Aquí verificamos
//     que setProcSession/clear operan sobre ese estado aislado (no localStorage) → cada tab su token.
process.env.REACT_APP_PROC_AUTH = "true"; reset();
setProcSession({ access_token: "TABA", expires_at: now() + 3600, empresa_id: "EMP-A" });
ck("10 sesión in-memory (no localStorage) aislable por tab", getProcToken() === "TABA" && getProcEmpresa() === "EMP-A");

console.log(`\nAUTHGATE RESULT: PASS=${P} FAIL=${F}`);
if (F > 0) process.exit(1);
