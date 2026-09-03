/* eslint-disable */
/* GENERADOR DE RESPALDOS — ALLOWLIST, FAIL-CLOSED.  (hotfix auto-v4)
 *
 * Reemplazo preparado del generador vigente. NO ESTA CABLEADO: `src/App.jsx` no es de
 * este carril. Es la pieza que esa migracion va a usar, con su laboratorio y sus pruebas.
 *
 * ══ EL GENERADOR VIGENTE, IDENTIFICADO ═════════════════════════════════════════
 *   `src/App.jsx`, bloque "Backup automático diario", `version:"auto-v3"`.
 *   Es el UNICO escritor de filas `backup_YYYY-MM-DD` en `calendario_data`.
 *   (Ver `SHARED-PERSISTENCE-GENERADOR-RESPALDOS.md` para la evidencia.)
 *
 *   Su defecto: filtra por LISTA NEGRA de identificadores —
 *     `and=(id.not.like.backup_*, id.not.like.main_pre_restore_*, id.neq.audit_log)`
 *   asi que copia TODO lo demas, `main` y `pins` incluidas. Cada respaldo diario es una
 *   fotografia de las credenciales del dia. Y por diseño es generico: "un modulo nuevo
 *   queda cubierto automaticamente" — que es justo lo que hace que un CAMPO nuevo,
 *   sensible, entre solo.
 *
 * ══ EL CAMBIO, Y LO QUE CUESTA ════════════════════════════════════════════════
 *   Se invierte el sentido: se declara lo que SI se copia, por recurso y por campo.
 *   Lo que nadie declaro no se copia.
 *
 *   El precio es real y hay que decirlo: se pierde el "automatico" del generador
 *   viejo. Un modulo nuevo NO queda respaldado hasta que alguien lo declare. Por eso
 *   el generador REPORTA en voz alta cada recurso no declarado que encuentra: la
 *   omision tiene que doler antes de que haga falta el respaldo, no despues.
 *
 * ══ FAIL-CLOSED, EN DOS CAPAS ═════════════════════════════════════════════════
 *   1 · la allowlist: un campo no declarado no se copia, sea sensible o no;
 *   2 · el detector: si algo que PARECE sensible sobrevive igual, el respaldo se
 *       ABORTA entero. No se escribe un respaldo parcial ni "casi limpio".
 *   La segunda capa existe porque la primera puede estar mal escrita: una allowlist
 *   demasiado ancha es un error facil de cometer y dificil de ver.
 *
 * NO IMPRIME VALORES: identificadores, rutas de campo, conteos y booleanos.
 */

/* ── clases de recurso ─────────────────────────────────────────────────────── */
export const CLASE = {
  NEGOCIO: "negocio",
  CREDENCIAL: "credencial",
  AUDITORIA: "auditoria",
};

export const MOTIVO = {
  NO_DECLARADO: "no_declarado",
  CLASE_EXCLUIDA: "clase_excluida",
  SENSIBLE_SOBREVIVIO: "sensible_sobrevivio",
  SIN_FILAS: "sin_filas",
  CHECKSUM: "checksum",
  MANIFIESTO: "manifiesto",
};

/* ── la allowlist ──────────────────────────────────────────────────────────────
 * `campos: "*"` copia el valor entero. Se usa solo para recursos cuya forma es
 * enteramente de negocio. Para los MIXTOS se declaran las llaves, y para los arreglos
 * de objetos se declara ademas que campos de cada elemento se conservan.
 * ───────────────────────────────────────────────────────────────────────────── */
export const ALLOWLIST = [
  // `main` es MIXTA: datos de Tareas + `usuarios[]` con credencial adentro.
  { id: "main", clase: CLASE.NEGOCIO,
    campos: ["estados", "comentarios", "tareasConfig", "supervisores", "tareasExtra",
             "tareasOverrides", "recsDone", "recsComentarios", "mes", "anio"],
    arreglos: { usuarios: ["nombre", "email", "rol", "modulos", "activo", "cargo"] } },

  // recursos de negocio completos
  { id: "finanzas", clase: CLASE.NEGOCIO, campos: "*" },
  { id: "finanzas_bancos", clase: CLASE.NEGOCIO, campos: "*" },
  { id: "osiris", clase: CLASE.NEGOCIO, campos: "*" },
  { id: "allegria", clase: CLASE.NEGOCIO, campos: "*" },
  { id: "nominas", clase: CLASE.NEGOCIO, campos: "*" },
  { id: "nominas_v2_done", clase: CLASE.NEGOCIO, campos: "*" },
  { id: "nominas_tipos_doc", clase: CLASE.NEGOCIO, campos: "*" },
  { id: "nominas_correlativos", clase: CLASE.NEGOCIO, campos: "*" },
  { id: "rendiciones", clase: CLASE.NEGOCIO, campos: "*" },
  { id: "rendiciones_config", clase: CLASE.NEGOCIO, campos: "*" },
  { id: "terceros_maestro", clase: CLASE.NEGOCIO, campos: "*" },
  // Encontradas BLOQUEADAS al medir la cobertura contra las 107 filas productivas:
  // `frisku` a secas no calza con el prefijo `frisku_`, y la allowlist no adivina.
  // Ambas inspeccionadas: 0 llaves sensibles y 0 hallazgos del detector.
  { id: "frisku", clase: CLASE.NEGOCIO, campos: "*" },
  { id: "osiris_flags", clase: CLASE.NEGOCIO, campos: "*" },

  // familias por prefijo declarado
  { prefijo: "maestro_", clase: CLASE.NEGOCIO, campos: "*" },
  { prefijo: "frisku_", clase: CLASE.NEGOCIO, campos: "*" },
  { prefijo: "nominas_", clase: CLASE.NEGOCIO, campos: "*" },
  { prefijo: "eeff_", clase: CLASE.NEGOCIO, campos: "*" },
  { prefijo: "mayor_", clase: CLASE.NEGOCIO, campos: "*" },
  { prefijo: "finanzas_esc_", clase: CLASE.NEGOCIO, campos: "*" },
  { prefijo: "anf_", clase: CLASE.NEGOCIO, campos: "*" },
  { prefijo: "proceso_", clase: CLASE.NEGOCIO, campos: "*" },

  // Declarados EXPLICITAMENTE como excluidos. No hace falta para que no se copien
  // —bastaria con no declararlos— pero dejarlos anotados evita que alguien los agregue
  // "porque faltaban", y hace que el motivo de exclusion sea preciso en el informe.
  { id: "pins", clase: CLASE.CREDENCIAL, campos: [] },
  { id: "audit_log", clase: CLASE.AUDITORIA, campos: [] },
  { prefijo: "backup_", clase: CLASE.AUDITORIA, campos: [] },
  { prefijo: "main_pre_restore_", clase: CLASE.CREDENCIAL, campos: [] },
];

/** Resuelve la regla de un recurso: id exacto primero, despues el prefijo mas largo. */
export function reglaDe(id, allowlist = ALLOWLIST) {
  const exacta = allowlist.find((r) => r.id === id);
  if (exacta) return exacta;
  const prefijos = allowlist
    .filter((r) => r.prefijo && id.startsWith(r.prefijo))
    .sort((a, b) => b.prefijo.length - a.prefijo.length);
  return prefijos[0] || null;
}

/* ── el detector de campos sensibles ───────────────────────────────────────────
 * Segunda capa. Busca por NOMBRE de llave, no por valor: comparar valores exigiria
 * conocerlos, y este codigo no debe conocerlos.
 * ───────────────────────────────────────────────────────────────────────────── */
/* Se compara por SEGMENTO, no por subcadena. Un `/token/` suelto marcaba `tokenizado`,
 * y un falso positivo acá no es cosmético: el detector ABORTA el respaldo entero, así que
 * un campo de negocio con nombre parecido dejaría al grupo sin respaldos y nadie sabría
 * por qué. Por segmento: `token_recuperacion` y `accessToken` marcan; `tokenizado`,
 * `hashtag`, `pintura` y `salto` no. */
const VOCAB_SENSIBLE = new Set([
  "pin", "pins", "password", "passwd", "clave", "claves", "secret", "secreto",
  "token", "jwt", "hash", "salt", "sal", "cred", "credencial", "credential",
  "challenge", "otp", "pwd",
]);

/** Parte una llave en segmentos: `accessToken` → [access, token]; `a_b-c` → [a,b,c]. */
function segmentos(k) {
  return String(k)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+|\s+/)
    .filter(Boolean)
    .map((s) => s.toLowerCase());
}

/** ¿El nombre de esta llave delata una credencial? */
export function llaveSensible(k) {
  const s = String(k);
  if (/^_?(h|temp)$/i.test(s)) return true;          // `_h`, `_temp`
  if (/_(h|temp)$/i.test(s)) return true;            // `USR1_h`, `USR1_temp`
  if (/api_?key/i.test(s.replace(/[^A-Za-z]/g, ""))) return true;
  return segmentos(s).some((seg) => VOCAB_SENSIBLE.has(seg));
}

/** Devuelve las RUTAS de las llaves sensibles halladas. Nunca devuelve valores. */
export function detectarSensibles(valor, ruta = "", hallazgos = []) {
  if (valor === null || typeof valor !== "object") return hallazgos;
  if (Array.isArray(valor)) {
    valor.forEach((v, i) => detectarSensibles(v, ruta + "[" + i + "]", hallazgos));
    return hallazgos;
  }
  for (const k of Object.keys(valor)) {
    const r = ruta ? ruta + "." + k : k;
    if (llaveSensible(k)) hallazgos.push(r);
    detectarSensibles(valor[k], r, hallazgos);
  }
  return hallazgos;
}

/* ── saneo por allowlist ───────────────────────────────────────────────────── */
/**
 * Aplica la regla a un valor. Devuelve { valor, retirados } — `retirados` lista las
 * llaves de primer nivel que la allowlist dejo fuera, para poder informarlas.
 */
export function sanearFila(valor, regla) {
  if (!regla || regla.campos === undefined) return { valor: null, retirados: [] };
  if (regla.campos === "*") return { valor, retirados: [] };
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    return { valor: null, retirados: [] };
  }
  const permitidas = new Set(regla.campos || []);
  const arreglos = regla.arreglos || {};
  const salida = {};
  const retirados = [];
  for (const k of Object.keys(valor)) {
    if (permitidas.has(k)) { salida[k] = valor[k]; continue; }
    if (arreglos[k]) {
      const camposElem = new Set(arreglos[k]);
      const arr = Array.isArray(valor[k]) ? valor[k] : [];
      salida[k] = arr.map((el) => {
        if (!el || typeof el !== "object") return null;
        const o = {};
        for (const kk of Object.keys(el)) if (camposElem.has(kk)) o[kk] = el[kk];
        return o;
      });
      continue;
    }
    retirados.push(k);
  }
  return { valor: salida, retirados };
}

/* ── checksum ──────────────────────────────────────────────────────────────────
 * JSON canonico (llaves ordenadas) para que la huella sea reproducible: dos corridas
 * sobre el mismo dato tienen que dar lo mismo, o el manifiesto no sirve de nada.
 * ───────────────────────────────────────────────────────────────────────────── */
export function canonico(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonico).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonico(v[k])).join(",") + "}";
}

/** sha256 hex. `digest` se inyecta (node:crypto o pgcrypto) para no atarse a un runtime. */
export function huella(v, digest) { return digest(canonico(v)); }

/* ── construccion del respaldo ─────────────────────────────────────────────── */
/**
 * @param filas  [{id, value}] tal como vienen de la base
 * @param opts   { allowlist, digest, ahora, version }
 * @returns { ok, payload, manifiesto, excluidos, noDeclarados, motivo, sensibles }
 */
export function construirRespaldo(filas, opts = {}) {
  const { allowlist = ALLOWLIST, digest, ahora = () => new Date().toISOString(),
          version = "shp-allowlist-v1" } = opts;
  if (!digest) throw new Error("shp-backup: hace falta una funcion digest");
  if (!Array.isArray(filas) || filas.length === 0) {
    return { ok: false, motivo: MOTIVO.SIN_FILAS };
  }

  const payload = {};
  const excluidos = [];
  const noDeclarados = [];
  const retiradosPorFila = {};

  for (const f of filas) {
    const regla = reglaDe(f.id, allowlist);
    if (!regla) { noDeclarados.push(f.id); excluidos.push({ id: f.id, motivo: MOTIVO.NO_DECLARADO }); continue; }
    if (regla.clase !== CLASE.NEGOCIO) { excluidos.push({ id: f.id, motivo: MOTIVO.CLASE_EXCLUIDA }); continue; }
    const { valor, retirados } = sanearFila(f.value, regla);
    if (valor === null) { excluidos.push({ id: f.id, motivo: MOTIVO.CLASE_EXCLUIDA }); continue; }
    payload[f.id] = valor;
    if (retirados.length) retiradosPorFila[f.id] = retirados;
  }

  // SEGUNDA CAPA · fail-closed. Si algo sensible sobrevivio, no se emite NADA.
  const sensibles = detectarSensibles(payload);
  if (sensibles.length > 0) {
    return { ok: false, motivo: MOTIVO.SENSIBLE_SOBREVIVIO, sensibles, excluidos, noDeclarados };
  }

  const ids = Object.keys(payload).sort();
  const manifiesto = {
    version, creado: ahora(), filas: ids.length,
    recursos: ids.map((id) => ({ id, huella: huella(payload[id], digest),
                                 bytes: canonico(payload[id]).length })),
    excluidos, noDeclarados, retirados: retiradosPorFila,
  };
  manifiesto.huellaTotal = huella(manifiesto.recursos.map((r) => r.huella).join(""), digest);
  manifiesto.bytesTotal = manifiesto.recursos.reduce((s, r) => s + r.bytes, 0);

  return { ok: true, payload, manifiesto, excluidos, noDeclarados };
}

/* ── verificacion y restauracion ───────────────────────────────────────────── */
export function verificarRespaldo(payload, manifiesto, digest) {
  if (!manifiesto || !Array.isArray(manifiesto.recursos)) return { ok: false, motivo: MOTIVO.MANIFIESTO };
  const ids = Object.keys(payload || {});
  if (ids.length !== manifiesto.filas) {
    return { ok: false, motivo: MOTIVO.MANIFIESTO, esperadas: manifiesto.filas, halladas: ids.length };
  }
  for (const r of manifiesto.recursos) {
    if (!(r.id in payload)) return { ok: false, motivo: MOTIVO.MANIFIESTO, falta: r.id };
    if (huella(payload[r.id], digest) !== r.huella) return { ok: false, motivo: MOTIVO.CHECKSUM, recurso: r.id };
  }
  const total = huella(manifiesto.recursos.map((x) => x.huella).join(""), digest);
  if (total !== manifiesto.huellaTotal) return { ok: false, motivo: MOTIVO.CHECKSUM, recurso: "(total)" };
  return { ok: true, filas: ids.length };
}

/**
 * Restaura: verifica ANTES de devolver nada. Un restore que entrega datos sin
 * verificarlos no distingue una copia buena de una manipulada.
 */
export function restaurar(payload, manifiesto, digest) {
  const v = verificarRespaldo(payload, manifiesto, digest);
  if (!v.ok) return { ok: false, ...v };
  return { ok: true, filas: Object.keys(payload).map((id) => ({ id, value: payload[id] })) };
}
