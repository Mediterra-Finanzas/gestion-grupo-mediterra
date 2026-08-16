/* eslint-disable */
// src/proceso/core/procStorage.js — documentos privados de proceso (contratos).
// Bucket PRIVADO `proc-docs`: NUNCA URL pública; acceso vía signed URL temporal.
// Solo se persiste el PATH en proc_cliente_contrato.documento_path. Las versiones
// históricas nunca se borran físicamente (cada versión guarda su propio path).
// Reusa SUPA_URL/SUPA_KEY (infra corporativa neutral, patrón PROC-INFRA-001).
// El bucket se crea en el dashboard (la key anon no puede crear buckets).
import { SUPA_URL, SUPA_KEY } from "../../friskuHelpers";

export const PROC_BUCKET = "proc-docs";
const BASE = `${SUPA_URL}/storage/v1`;
const H = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` };

// best-effort: 409 = ya existe. Nunca lanza.
export async function ensureBucketProc() {
  try {
    const res = await fetch(`${BASE}/bucket`, {
      method: "POST", headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify({ id: PROC_BUCKET, name: PROC_BUCKET, public: false }),
    });
    return res.ok || res.status === 409;
  } catch { return false; }
}

// Sube un File al bucket privado. Devuelve { ok, path, error }. No retorna URL pública.
export async function subirDocumentoProc(file, path) {
  subirDocumentoProc.lastError = null;
  try {
    const res = await fetch(`${BASE}/object/${PROC_BUCKET}/${path}`, {
      method: "POST",
      headers: { ...H, "Content-Type": file.type || "application/octet-stream", "x-upsert": "true" },
      body: file,
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      const m = e.message || e.error || `HTTP ${res.status}`;
      subirDocumentoProc.lastError = m;
      return { ok: false, path: null, error: m };
    }
    return { ok: true, path, error: null };
  } catch (e) {
    subirDocumentoProc.lastError = e.message || String(e);
    return { ok: false, path: null, error: subirDocumentoProc.lastError };
  }
}

// Signed URL temporal (default 1h). NO persistir: expira. Devuelve URL absoluta o null.
export async function urlFirmadaProc(path, ttl = 3600) {
  try {
    const res = await fetch(`${BASE}/object/sign/${PROC_BUCKET}/${path}`, {
      method: "POST", headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: ttl }),
    });
    if (!res.ok) return null;
    const j = await res.json().catch(() => ({}));
    return j.signedURL ? `${BASE}${j.signedURL}` : null;
  } catch { return null; }
}

// slug seguro para segmentos de path (sin acentos ni espacios). NFD + filtro de
// caracteres seguros elimina también las marcas combinantes (é→e) sin regex frágil.
export const slugPath = (s) =>
  String(s || "").normalize("NFD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "x";
