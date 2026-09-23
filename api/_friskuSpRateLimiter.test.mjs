/* eslint-disable */
// Tests del adaptador de rate limiter (S4.2), sin red real. Ejecutar: node api/_friskuSpRateLimiter.test.mjs
import RL from "./_friskuSpRateLimiter.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const eq = (a, b, m) => ok(a === b, `${m} (esp ${JSON.stringify(b)}, obt ${JSON.stringify(a)})`);
const SECRET = "rl-secreto-test";

// ── HMAC determinista y opaco ──
ok(RL.bucketHmac(SECRET, "ip:1.2.3.4") === RL.bucketHmac(SECRET, "ip:1.2.3.4"), "HMAC determinista para misma entrada");
ok(RL.bucketHmac(SECRET, "ip:1.2.3.4") !== RL.bucketHmac(SECRET, "ip:1.2.3.5"), "HMAC distinto para entradas distintas");
ok(RL.bucketHmac(SECRET, "x") !== RL.bucketHmac("otro", "x"), "HMAC distinto con secreto distinto");
ok(/^[0-9a-f]{64}$/.test(RL.bucketHmac(SECRET, "x")), "HMAC es hex de 64 (sin PII)");

// ── normalizarIp ──
eq(RL.normalizarIp("203.0.113.5:443"), "203.0.113.5", "ipv4:puerto → ipv4");
eq(RL.normalizarIp("[2001:db8::1]:443"), "2001:db8::1", "[ipv6]:puerto → ipv6");
eq(RL.normalizarIp("203.0.113.5, 70.1.1.1"), "203.0.113.5", "lista xff → primera");
eq(RL.normalizarIp("fe80::1%eth0"), "fe80::1", "zona ipv6 removida");
eq(RL.normalizarIp("  "), "", "vacío → ''");

async function run() {
  const cfgOk = { supaUrl: "https://x.supabase.co", serviceKey: "SVCKEY", hmacSecret: SECRET };
  const okResp = (obj) => async () => ({ ok: true, json: async () => obj });

  // permitido / denegado con retry
  const lim = RL.crearLimiterSupabase({ ...cfgOk, fetchImpl: okResp({ permitido: true, retry_after_seg: 0 }) });
  eq((await lim.golpe("uno@x.test", { ventanaMs: 300000, max: 8, bloqueoMs: 900000, tipo: "identidad" })).permitido, true, "bajo umbral → permitido");
  const limDeny = RL.crearLimiterSupabase({ ...cfgOk, fetchImpl: okResp({ permitido: false, retry_after_seg: 900 }) });
  const d = await limDeny.golpe("uno@x.test", { ventanaMs: 300000, max: 8, bloqueoMs: 900000, tipo: "identidad" });
  ok(d.permitido === false && d.retry_after_seg === 900, "sobre umbral → denegado con retry_after");

  // fail-closed: secreto/clave/url ausentes → THROW
  for (const bad of [{ ...cfgOk, hmacSecret: "" }, { ...cfgOk, serviceKey: "" }, { ...cfgOk, supaUrl: "" }]) {
    let t = false; try { await RL.crearLimiterSupabase({ ...bad, fetchImpl: okResp({ permitido: true }) }).golpe("k", { max: 8, ventanaMs: 1000, tipo: "ip" }); } catch (e) { t = true; }
    ok(t, "config ausente → throw (fail-closed)");
  }

  // HTTP no-ok (401/403/429/5xx) → THROW
  for (const st of [401, 403, 429, 500]) {
    const l = RL.crearLimiterSupabase({ ...cfgOk, fetchImpl: async () => ({ ok: false, status: st, json: async () => ({}) }) });
    let t = false; try { await l.golpe("k", { max: 8, ventanaMs: 1000, tipo: "ip" }); } catch (e) { t = true; }
    ok(t, `Supabase ${st} → throw → 503 aguas arriba`);
  }
  // timeout/red → THROW
  { const l = RL.crearLimiterSupabase({ ...cfgOk, timeoutMs: 5, fetchImpl: async () => { throw new Error("red"); } });
    let t = false; try { await l.golpe("k", { max: 8, ventanaMs: 1000, tipo: "ip" }); } catch (e) { t = true; }
    ok(t, "red caída → throw"); }
  // respuesta con forma inválida → THROW
  { const l = RL.crearLimiterSupabase({ ...cfgOk, fetchImpl: okResp({ cualquier: "cosa" }) });
    let t = false; try { await l.golpe("k", { max: 8, ventanaMs: 1000, tipo: "ip" }); } catch (e) { t = true; }
    ok(t, "respuesta RPC inválida → throw"); }

  // Supabase SOLO recibe el bucket HMAC + tipo + números (NUNCA email/ip)
  let capt = null;
  const lCap = RL.crearLimiterSupabase({ ...cfgOk, fetchImpl: async (url, opts) => { capt = { url, body: JSON.parse(opts.body) }; return { ok: true, json: async () => ({ permitido: true, retry_after_seg: 0 }) }; } });
  await lCap.golpe("uno@ejemplo.test", { ventanaMs: 300000, max: 8, bloqueoMs: 900000, tipo: "identidad" });
  ok(capt.url.includes("/rpc/frisku_sp_rl_consumir"), "llama a la RPC dedicada");
  ok(/^[0-9a-f]{64}$/.test(capt.body.p_bucket), "envía bucket HMAC hex");
  ok(!JSON.stringify(capt.body).includes("ejemplo.test"), "el email NO viaja a Supabase");
  ok(!JSON.stringify(capt.body).includes("uno@"), "ningún identificador en claro en el payload");
  eq(capt.body.p_tipo, "identidad", "tipo correcto");
  // capas ip/identidad → buckets distintos (prefijo tipo)
  ok(RL.bucketHmac(SECRET, "ip:mismo") !== RL.bucketHmac(SECRET, "identidad:mismo"), "capa ip e identidad → buckets distintos");

  // concurrencia simulada (el adaptador refleja fielmente la decisión del server bajo N llamados)
  { let n = 0; const max = 8;
    const l = RL.crearLimiterSupabase({ ...cfgOk, fetchImpl: async () => { n += 1; const permit = n <= max; return { ok: true, json: async () => ({ permitido: permit, retry_after_seg: permit ? 0 : 900 }) }; } });
    const res = await Promise.all(Array.from({ length: 12 }, () => l.golpe("k", { ventanaMs: 300000, max, bloqueoMs: 900000, tipo: "ip" })));
    eq(res.filter(x => x.permitido).length, 8, "12 concurrentes, max 8 → 8 permitidos (atomicidad real la garantiza el FOR UPDATE del SQL)");
  }

  // errores del adaptador son genéricos (sin PII)
  { const l = RL.crearLimiterSupabase({ ...cfgOk, fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) });
    let msg = ""; try { await l.golpe("uno@ejemplo.test", { max: 8, ventanaMs: 1000, tipo: "identidad" }); } catch (e) { msg = e.message; }
    ok(!msg.includes("ejemplo.test") && /^rl_/.test(msg), "mensaje de error genérico sin PII"); }

  console.log(`\n_friskuSpRateLimiter: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
run();
