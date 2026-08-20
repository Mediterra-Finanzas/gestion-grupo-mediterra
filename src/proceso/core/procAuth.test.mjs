/* eslint-disable */
// Tests del token PROC en memoria (flag/expiry). Ejecutar: node src/proceso/core/procAuth.test.mjs
process.env.REACT_APP_PROC_AUTH = "true"; // activar flag antes del import dinámico
const { getProcToken, setProcToken, clearProcToken, procAuthActivo } = await import("./procAuth.js");
const { traducirError } = await import("./procesoF7Domain.js");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };

const NOW = 1_700_000_000;
ok(procAuthActivo() === true, "flag REACT_APP_PROC_AUTH activo");

setProcToken("tok.abc", NOW + 1200);
ok(getProcToken(NOW) === "tok.abc", "AUTH: token vigente se devuelve");
ok(getProcToken(NOW + 1200) === null, "AUTH-11: token expirado → null (margen)");
ok(getProcToken(NOW + 1186) === null, "AUTH-11b: dentro del margen de 15s → null");
clearProcToken();
ok(getProcToken(NOW) === null, "AUTH-12: logout/clear → null (cae a anon)");
setProcToken(null, 0);
ok(getProcToken(NOW) === null, "sin token → null");

// AUTH client-side: traducción de 401/JWT expired
ok(/expir/i.test(traducirError("proc load proc_planta → HTTP 401")), "traducir HTTP 401 → mensaje de sesión expirada");
ok(/expir/i.test(traducirError("JWT expired")), "traducir 'JWT expired' → sesión expirada");
ok(!/expir/i.test(traducirError("permission denied for table proc_planta")), "permission denied NO se confunde con 401");

console.log(`\nprocAuth tests: ${pass} pasaron, ${fail} fallaron`);
if (fail > 0) process.exit(1);
console.log("TODOS LOS TESTS PASARON ✓");
