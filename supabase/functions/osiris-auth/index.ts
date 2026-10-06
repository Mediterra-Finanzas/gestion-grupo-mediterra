// Edge Function: osiris-auth
// E1.5 Fase 2 — Auth dual transparente para Osiris (sandbox).
//
// Recibe { email, pin }, valida el PIN contra PRODUCCIÓN llamando al endpoint de la app
// POST {PROD_APP_URL}/api/auth/verificar (mismas reglas que el login: _temp, pol 6dig,
// 60 días, desactivado; sin PIN en texto plano). Ya NO lee filas de producción con la
// llave pública (antes leía main.pinsPersonalizados, desactualizado, y aceptaba _temp plano).
// verifica que la cuenta esté habilitada en user_osiris_accounts (sandbox) y emite una
// sesión Supabase Auth server-side vía generate_link + verify (sin password, sin signInWithPassword).
//
// Contrato: audit/E1.5-FASE2-EDGE-FUNCTION-SPEC.md (aprobado 2026-06-03).
// Deploy con verify_jwt=false (la función hace su propia autenticación email+PIN).
//
// Secrets:
//   Auto-inyectadas por Supabase (proyecto sandbox): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//   Custom (Dashboard): PROD_APP_URL (ej. https://gestion-grupo-mediterra.vercel.app),
//                       OSIRIS_VERIFICAR_SECRETO (igual al de Vercel), ALLOWED_ORIGINS
//   (PROD_URL y PROD_ANON_KEY ya no se usan: se pueden borrar tras desplegar.)
//   Plan B service key: SANDBOX_SERVICE_KEY (si la auto-inyectada no sirviera con formato sb_secret_)
//
// NINGÚN secreto está hardcodeado. NINGÚN log incluye PIN ni keys.

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SANDBOX_SERVICE_KEY") ?? "";
const PROD_APP_URL = (Deno.env.get("PROD_APP_URL") ?? "").replace(/\/+$/, "");
const VERIFICAR_SECRETO = Deno.env.get("OSIRIS_VERIFICAR_SECRETO") ?? "";
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

const MAX_BODY = 2048; // bytes — el body legítimo es minúsculo

// Validación de credenciales: la hace PRODUCCIÓN (api/auth/verificar). Esta función
// no conoce hashes ni PIN. Respuesta: 200 {ok,email,nombre,debeCambiarPin} | 401 | 429 | 5xx.
async function verificarEnProduccion(email: string, pin: string):
  Promise<{ ok: true; debeCambiarPin: boolean } | { ok: false; status: number }> {
  const r = await fetch(`${PROD_APP_URL}/api/auth/verificar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-mediterra-secreto": VERIFICAR_SECRETO },
    body: JSON.stringify({ email, pin }),
  });
  const j = await r.json().catch(() => null);
  if (r.status === 200 && j?.ok === true && typeof j.debeCambiarPin === "boolean" &&
      String(j.email ?? "").toLowerCase() === email) {
    return { ok: true, debeCambiarPin: j.debeCambiarPin };
  }
  return { ok: false, status: r.status };
}

// ---------- CORS ----------
function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
  }
  return h;
}

function json(
  status: number,
  body: unknown,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

// ---------- Handler ----------
Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin");

  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return json(400, { error: "bad_request", detail: "método no permitido" }, origin);
  }

  // Config presente
  if (!SB_URL || !SB_ANON || !SB_SERVICE || !PROD_APP_URL || !VERIFICAR_SECRETO) {
    console.error("config faltante", {
      SB_URL: !!SB_URL, SB_ANON: !!SB_ANON, SB_SERVICE: !!SB_SERVICE,
      PROD_APP_URL: !!PROD_APP_URL, OSIRIS_VERIFICAR_SECRETO: !!VERIFICAR_SECRETO,
    });
    return json(500, { error: "internal_error", detail: "configuración incompleta" }, origin);
  }

  try {
    // 1. Body
    const raw = await req.text();
    if (raw.length > MAX_BODY) {
      return json(400, { error: "bad_request", detail: "body demasiado grande" }, origin);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json(400, { error: "bad_request", detail: "JSON inválido" }, origin);
    }
    const email = (parsed as Record<string, unknown>)?.email;
    const pin = (parsed as Record<string, unknown>)?.pin;
    if (typeof email !== "string" || typeof pin !== "string" || !email.trim() || !pin.trim()) {
      return json(400, { error: "bad_request", detail: "email y pin son requeridos" }, origin);
    }
    const emailNorm = email.trim().toLowerCase();
    const pinNorm = pin.trim();

    // 2-4. Validar credenciales en PRODUCCIÓN (api/auth/verificar). Si el PIN debe
    //      cambiarse (código provisorio, PIN sin política de 6 dígitos o vencido) NO se
    //      emite sesión: igual que la app, que solo la pide tras un login completo.
    const v = await verificarEnProduccion(emailNorm, pinNorm);
    if (!v.ok) {
      if (v.status === 401 || v.status === 403) return json(401, { error: "invalid_credentials" }, origin);
      if (v.status === 429) return json(429, { error: "rate_limited" }, origin);
      console.error("verificar prod fallo", v.status);
      return json(500, { error: "internal_error", detail: "no se pudo validar credenciales" }, origin);
    }
    if (v.debeCambiarPin) {
      return json(401, { error: "invalid_credentials" }, origin);
    }

    // 5. ¿Cuenta Osiris habilitada? (sandbox, service_role)
    const accRes = await fetch(
      `${SB_URL}/rest/v1/user_osiris_accounts?app_user_email=eq.${encodeURIComponent(emailNorm)}&select=rol_osiris,activo`,
      { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` } },
    );
    if (!accRes.ok) {
      console.error("lectura user_osiris_accounts fallo", accRes.status);
      return json(500, { error: "internal_error", detail: "no se pudo verificar la cuenta" }, origin);
    }
    const accRows = await accRes.json();
    const acc = Array.isArray(accRows) && accRows[0] ? accRows[0] : null;
    if (!acc || acc.activo !== true) {
      // cubre "no provisionado" e "inactivo" con el mismo error (decisión #3: genérico)
      return json(403, { error: "account_inactive" }, origin);
    }

    // 6. generate_link (magiclink) — no envía correo, solo genera el token
    const glRes = await fetch(`${SB_URL}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        apikey: SB_SERVICE,
        Authorization: `Bearer ${SB_SERVICE}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "magiclink", email: emailNorm }),
    });
    const glBody = await glRes.json().catch(() => null);
    const hashedToken: string | undefined =
      glBody?.hashed_token ?? glBody?.properties?.hashed_token;
    if (!glRes.ok || !hashedToken) {
      console.error("generate_link fallo", glRes.status);
      return json(500, { error: "internal_error", detail: "no se pudo iniciar sesión" }, origin);
    }

    // 7. verify (canjea el token por una sesión real)
    const verRes = await fetch(`${SB_URL}/auth/v1/verify`, {
      method: "POST",
      headers: { apikey: SB_ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "magiclink", token_hash: hashedToken }),
    });
    const session = await verRes.json().catch(() => null);
    if (!verRes.ok || !session?.access_token) {
      console.error("verify fallo", verRes.status);
      return json(500, { error: "internal_error", detail: "no se pudo emitir la sesión" }, origin);
    }

    // 8. Sesión + rol
    return json(200, {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type ?? "bearer",
      user: { email: emailNorm, rol_osiris: acc.rol_osiris },
    }, origin);
  } catch (e) {
    console.error("error inesperado", e instanceof Error ? e.message : String(e));
    return json(500, { error: "internal_error", detail: "error inesperado" }, origin);
  }
});
