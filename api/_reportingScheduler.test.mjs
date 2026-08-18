/* eslint-disable */
// Tests de los helpers puros del scheduler (SCH-01..15 parte pura). Ejecutar:
//   node api/_reportingScheduler.test.mjs
import sched from "./_reportingScheduler.js";
const { cronAutorizado, horaEnTz, fechaOpTz, configDue, resumenJob } = sched;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const eq = (a, b, m) => ok(a === b, `${m} (esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)})`);

// SCH-01/02/03: autenticación fail-closed.
ok(!cronAutorizado(undefined, "s3cr3t"), "SCH-01: sin header → rechazo");
ok(!cronAutorizado("Bearer s3cr3t", ""), "SCH-01b: sin CRON_SECRET → fail-closed (nadie pasa)");
ok(!cronAutorizado("Bearer otra", "s3cr3t"), "SCH-02: secret incorrecto → rechazo");
ok(!cronAutorizado("s3cr3t", "s3cr3t"), "SCH-02b: sin prefijo Bearer → rechazo");
ok(cronAutorizado("Bearer s3cr3t", "s3cr3t"), "SCH-03: secret correcto → autoriza");

// SCH-10: timezone America/Santiago (invierno UTC-4). 14:00Z = 10:00 Santiago; 02:30Z = día anterior.
eq(horaEnTz(new Date("2026-08-18T14:00:00Z"), "America/Santiago"), "10:00", "SCH-10: 14:00Z → 10:00 Santiago");
eq(fechaOpTz(new Date("2026-08-18T02:30:00Z"), "America/Santiago"), "2026-08-17", "SCH-10b: 02:30Z → día operacional 17 (Santiago)");

// SCH-04: config inactiva → no due.
ok(!configDue({ activo: false, hora_envio: "00:00", timezone: "America/Santiago" }, new Date("2026-08-18T14:00:00Z")), "SCH-04: config inactiva no ejecuta");
// SCH-05: hora aún no corresponde (envío 11:00, ahora 10:00 Santiago) → no due.
ok(!configDue({ activo: true, hora_envio: "11:00", timezone: "America/Santiago" }, new Date("2026-08-18T14:00:00Z")), "SCH-05: antes de hora_envio no ejecuta");
// SCH-06: hora corresponde (envío 09:00, ahora 10:00 Santiago) → due.
ok(configDue({ activo: true, hora_envio: "09:00", timezone: "America/Santiago" }, new Date("2026-08-18T14:00:00Z")), "SCH-06: pasada la hora_envio ejecuta");
ok(!configDue({ activo: true, hora_envio: "abc", timezone: "America/Santiago" }, new Date()), "hora_envio inválida no ejecuta");

// SCH-09: config A falla / B sigue → resumen agrega correctamente.
const r = resumenJob([{ estado: "enviado" }, { estado: "error" }, { estado: "enviado" }, { estado: "omitido" }]);
eq(r.procesadas, 4, "SCH-09: procesadas=4"); eq(r.enviadas, 2, "SCH-09: enviadas=2");
eq(r.errores, 1, "SCH-09: errores=1"); eq(r.omitidas, 1, "SCH-09: omitidas=1");

console.log(`\nscheduler tests: ${pass} pasaron, ${fail} fallaron`);
if (fail > 0) process.exit(1);
console.log("TODOS LOS TESTS PASARON ✓");
