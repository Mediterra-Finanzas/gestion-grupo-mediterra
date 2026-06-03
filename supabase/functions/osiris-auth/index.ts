// Edge Function: osiris-auth
// E1.5 Fase 2 — Auth dual transparente para Osiris (sandbox).
//
// Recibe { email, pin }, valida el PIN contra PRODUCCIÓN (mismo criterio que App.jsx),
// verifica que la cuenta esté habilitada en user_osiris_accounts (sandbox) y emite una
// sesión Supabase Auth server-side vía generate_link + verify (sin password, sin signInWithPassword).
//
// Contrato: audit/E1.5-FASE2-EDGE-FUNCTION-SPEC.md (aprobado 2026-06-03).
// Deploy con verify_jwt=false (la función hace su propia autenticación email+PIN).
//
// Secrets:
//   Auto-inyectadas por Supabase (proyecto sandbox): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//   Custom (Dashboard): PROD_URL, PROD_ANON_KEY, ALLOWED_ORIGINS
//   Plan B service key: SANDBOX_SERVICE_KEY (si la auto-inyectada no sirviera con formato sb_secret_)
//
// NINGÚN secreto está hardcodeado. NINGÚN log incluye PIN ni keys.

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SANDBOX_SERVICE_KEY") ?? "";
const PROD_URL = (Deno.env.get("PROD_URL") ?? "").replace(/\/+$/, "");
const PROD_ANON = Deno.env.get("PROD_ANON_KEY") ?? "";
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

const MAX_BODY = 2048; // bytes — el body legítimo es minúsculo

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
  if (!SB_URL || !SB_ANON || !SB_SERVICE || !PROD_URL || !PROD_ANON) {
    console.error("config faltante", {
      SB_URL: !!SB_URL, SB_ANON: !!SB_ANON, SB_SERVICE: !!SB_SERVICE,
      PROD_URL: !!PROD_URL, PROD_ANON: !!PROD_ANON,
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

    // 2. Leer usuarios de PRODUCCIÓN
    const prodRes = await fetch(
      `${PROD_URL}/rest/v1/calendario_data?id=eq.main&select=value`,
      { headers: { apikey: PROD_ANON, Authorization: `Bearer ${PROD_ANON}` } },
    );
    if (!prodRes.ok) {
      console.error("lectura prod fallo", prodRes.status);
      return json(500, { error: "internal_error", detail: "no se pudo validar credenciales" }, origin);
    }
    const prodRows = await prodRes.json();
    const value = Array.isArray(prodRows) && prodRows[0] ? prodRows[0].value : null;
    const usuarios: Array<Record<string, unknown>> = value?.usuarios ?? [];
    const pinsPersonalizados: Record<string, string> = value?.pinsPersonalizados ?? {};

    // 3. Usuario existe (por email, case-insensitive)
    const u = usuarios.find(
      (x) => typeof x.email === "string" && x.email.toLowerCase() === emailNorm,
    );
    if (!u) {
      return json(401, { error: "invalid_credentials" }, origin);
    }

    // 4. Validar PIN (fiel a App.jsx: activo = pinsPersonalizados[nombre] || u.pin; + temporal)
    const nombre = String(u.nombre ?? "");
    const activePin = pinsPersonalizados[nombre] || (u.pin as string | undefined);
    const tempPin = pinsPersonalizados[`${nombre}_temp`];
    const ok = !!activePin && pinNorm === String(activePin);
    const temp = !!tempPin && pinNorm === String(tempPin);
    if (!ok && !temp) {
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
