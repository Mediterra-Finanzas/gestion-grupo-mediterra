# Respaldo diario seguro (auto-v4): arquitectura y prueba

Estado: **implementado y probado en aislamiento, NO activado.** Activarlo requiere la aprobación de Angelo y los pasos de la sección 5. Plan integral (todas las tablas, Storage, copia fuera del proyecto): `docs/plan-recuperacion.md`.

## 1. Situación actual (comprobada en el código, oct-2026)

| Pieza | Antes (hasta sep-2026) | Ahora en esta rama |
|---|---|---|
| Generador automático `auto-v3` (`App.jsx`) | Suspendido (`BACKUP_AUTOMATICO_SUSPENDIDO = true`, hotfix A del 03-09-2026). | Sin cambios: suspendido. **No existe respaldo automático.** |
| Correo diario del admin (`App.jsx`) | Leía todas las filas, `pins` incluida, y lo llamaba "respaldo". | Lee sin `pins` ni `backup_*`, sanea y se titula "Resumen de datos (no es respaldo)". Sigue sin guardar copia. |
| Botón "💾 Respaldo" | Descargaba todas las filas con `pins` y PIN heredados. | Descarga `Mediterra Hub Backup v2` **saneado**: sin `pins`, sin PIN/hash/salt/token/JWT; anota las rutas quitadas (nunca los valores). |
| Botón "📤 Restaurar" | Sobrescribía todo, `pins` incluida, sin control de versión. | Valida formato y versión; muestra por fila qué reemplaza y si cambió después del respaldo (queda desmarcada); pide escribir RESTAURAR; relee y aborta si algo cambió; escribe con `updated_at=eq.`; conserva las credenciales **actuales**; `pins` nunca se restaura. Lee respaldos antiguos (v1, auto-v1) saneándolos. |

Pruebas: `src/__tests__/respaldoSaneo.test.js` (6) y `scripts/e2e/respaldo-restaurar.mjs` (18/18, navegador + Supabase falso).

## 2. Alternativas evaluadas

| Opción | A favor | En contra | Decisión |
|---|---|---|---|
| **A. Cron de Vercel + bucket privado de Supabase Storage** | Usa la infraestructura existente (ya hay un cron, `CRON_SECRET` y `service_role` en el servidor). Sin dependencias nuevas. Copia fuera de la tabla. | El respaldo queda en el mismo proyecto de Supabase (no fuera del proveedor). | **Elegida.** |
| B. `pg_cron` dentro de Postgres (copia a otra tabla) | Sin tráfico externo. | Queda en la misma base; requiere migración SQL; el saneo en SQL es más difícil de probar. | Descartada. |
| C. GitHub Actions programado → artefacto o almacenamiento externo | Copia fuera de Supabase. | Exige poner `service_role` en GitHub; los artefactos tienen retención limitada; suma otro lugar con secretos. | Posible **segunda copia** a futuro. |
| D. Reactivar `auto-v3` | Es una línea. | Copia credenciales y corre en el navegador con la llave pública. | Rechazada. |

## 3. Arquitectura

```
Vercel Cron (1/día)                         Supabase
  │ Authorization: Bearer CRON_SECRET          │
  ▼                                            │
api/respaldo-diario.js ──GET calendario_data──▶ REST (service_role, solo servidor)
  │  (sin escrituras en la base)               │
  ├─ excluye: pins, backup_*, respaldo_*       │
  ├─ sanea: pin, pin_temporal, *_h, *_hist,    │
  │   {salt,hash}, token/secret/apiKey, JWT    │
  ├─ paquete gzip + manifiesto (SHA-256/fila)  │
  ├─ sube ─────────────────────────────────────▶ Storage, bucket PRIVADO "respaldos"
  │                                            │   diario/AAAA-MM-DD.json.gz
  ├─ baja y verifica (ida y vuelta) ◀───────────│   diario/AAAA-MM-DD.manifiesto.json
  ├─ retención: 30 diarios + 1/mes × 12 ───────▶│   (borra solo dentro de diario/)
  └─ estado/ultimo.json (ok, archivo, hashes) ─▶│   estado/ultimo.json

Restauración (equipo del admin, CLI)
  scripts/respaldo/restaurar.mjs --archivo … --filas finanzas   → SIMULA y muestra el plan
  … --aplicar   → 1) verifica SHA-256  2) foto previa saneada (deshacer)
                  3) reinyecta las credenciales ACTUALES en las rutas quitadas
                  4) PATCH con updated_at=eq.<leído>: si cambió, no escribe (conflicto)
                  5) pins nunca se restaura
```

Archivos:
- `api/_respaldo.js`: núcleo puro (saneo, paquete, verificación, retención, plan de restauración, cliente REST/Storage).
- `api/_respaldo-diario.js`: endpoint del cron. **Inerte:** el `_` inicial evita que Vercel lo publique.
- `scripts/respaldo/restaurar.mjs`: CLI de restauración (simula por defecto).
- `scripts/respaldo/inspeccionar.mjs`: revisión **offline** de qué rutas quitaría el saneo sobre un respaldo real.
- `scripts/respaldo/prueba-aislada.mjs`: prueba de ciclo completo contra un Supabase falso en memoria.

## 4. Prueba de restauración (aislada, sin producción)

`node scripts/respaldo/prueba-aislada.mjs` → **27 correctas, 0 fallas.** Comprueba:

- **Ejecución:** el respaldo queda verificado; 0 escrituras en la base; una segunda corrida el mismo día no sobrescribe (`-2`).
- **Credenciales:** no hay ningún PIN, hash, salt, token ni JWT en Storage (se buscan los valores sembrados). El manifiesto lista las rutas quitadas, por ejemplo `usuarios[email=…].pin`. Se conservan los hashes de documentos de nóminas, que no son credenciales.
- **Retención:** con 400 días simulados quedan 30 diarios más los primeros de mes de los últimos 12 meses, y cada uno con su manifiesto.
- **Recuperación:**
  - Se pierde `finanzas` y vuelve idéntica, byte a byte.
  - `main` recupera los estados de tareas y conserva el PIN **actual**, que cambió después del respaldo.
  - `pins` no se toca.
  - La foto previa permite deshacer.
  - Una fila borrada se vuelve a crear.
- **Seguridad:**
  - Ante un conflicto de versión no escribe y lo informa.
  - Un respaldo alterado se rechaza por SHA-256.
  - El cron responde 401 sin `CRON_SECRET` o con un secreto incorrecto, y 500 sin la llave de servicio.

## 5. Activación (después de aprobar)

1. **Inspección con datos reales (sin conexión):** exportar con "💾 Respaldo" o con `scripts/e2e/snapshot.mjs` y correr `node scripts/respaldo/inspeccionar.mjs archivo.json`. Revisar que las rutas quitadas sean solo credenciales; un caso como `tareasConfig.x.pin` podría ser una marca de "fijado" y no un PIN. Ajustar las reglas si hace falta. Después, borrar el archivo exportado, porque contiene `pins`.
2. Crear en Supabase el bucket **privado** `respaldos` (Storage → New bucket → Public: off).
3. En Vercel, confirmar que existen `SUPABASE_SERVICE_ROLE_KEY` y `CRON_SECRET` en Production (ya los usa `proc-reporting-daily-cron`).
4. Renombrar `api/_respaldo-diario.js` → `api/respaldo-diario.js` y agregar a `vercel.json`:
   `{ "path": "/api/respaldo-diario", "schedule": "15 7 * * *" }` (07:15 UTC = 04:15 Chile en invierno).
   [Probable] El plan Hobby de Vercel limita la cantidad de crons y su frecuencia a 1 por día; confirmarlo en el panel.
5. Primera corrida manual: `curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/respaldo-diario`. Revisar `estado/ultimo.json` y hacer una **restauración simulada** de `finanzas` con la CLI.
6. El botón "📤 Restaurar" y el correo del admin ya usan el saneo (sección 1). Retirarlos o mantenerlos es una decisión aparte.
7. Antes de activar: correr el paso 1 sobre una **copia real** y un simulacro de restauración de esa copia en un entorno aislado. Mientras eso no esté hecho, el respaldo sigue **desactivado**.

## 6. Alcance: qué respalda y qué NO

**auto-v4 respalda solo la tabla `calendario_data`.** No cubre:

| Fuera del respaldo | Dónde vive | Qué contiene |
|---|---|---|
| Bucket `nominas-docs` (privado) | Supabase Storage | Respaldos documentales de nóminas (Expediente Digital). El respaldo guarda la ruta y el SHA-256 de cada documento, **no el archivo**. |
| Bucket `frisku-docs` ([Probable] público: la app arma URLs `object/public/`) | Storage | Documentos Frisku (checklist, COMEX) y adjuntos de Rendiciones (`rendiciones/`). |
| Bucket `osiris-fotos` (público) | Storage | Fotos e informes HTML de Osiris. |
| Bucket `proc-docs` | Storage | Documentos del módulo de procesos. |
| Otras tablas | Postgres | `currency_tc`, `currency_canonical_pair`, `currency_migration_batch`, `anf_*` (filiales, informes, saldos, movimientos, KPIs, justificaciones, tipos de cambio, métricas), `core_entities`, `core_entity_external_refs`, `acc_journal_entry`, `auxiliares`, `dim_type` y la tabla del limitador `frisku_sp_rl_*`. |

Propuesta (no implementada, requiere aprobación):
1. **Inventario de Storage** diario dentro de auto-v4: listar cada bucket y guardar ruta, tamaño, fecha y SHA-256 en el manifiesto. Permite detectar archivos perdidos o alterados, pero no los recupera.
2. **Copia de Storage** incremental (solo archivos nuevos o cambiados según el inventario) a un destino **fuera de Supabase**. Es la única forma de recuperar documentos ante un borrado del bucket.
3. Agregar las tablas de la lista anterior al paquete, con el mismo saneo.

### Pérdida completa de la base o del proyecto

auto-v4 guarda en un bucket **del mismo proyecto** de Supabase. Si se pierde el proyecto (borrado, cuenta comprometida, error del proveedor), se pierde el respaldo con él. Hoy la recuperación dependería de:

- [Probable] Los respaldos propios de Supabase: el plan Pro incluye respaldos diarios de la base con retención de 7 días, y PITR (recuperación a un punto en el tiempo) es un complemento pagado. **No cubren los archivos de Storage.** Hay que confirmar en el panel (Database → Backups) qué está activo hoy; no lo pude ver.
- Los JSON que descargue un admin con "💾 Respaldo" (manual, sin credenciales; sirven para `calendario_data`, no para Storage ni las otras tablas).

Recomendación: una **segunda copia fuera de Supabase** (opción C de la sección 2 o un bucket S3/R2 propio), con la llave de escritura solo en el servidor, y un simulacro de restauración en un proyecto Supabase vacío antes de dar el sistema por bueno. Las credenciales (`pins`) no viajan en esa copia; tras una pérdida total, los usuarios **redefinen su PIN** (flujo de PIN temporal), que es el comportamiento deseado.

### Cifrado: plataforma vs. propio

| | Cifrado de la plataforma | Cifrado propio (no implementado) |
|---|---|---|
| Qué es | [Probable] Supabase cifra en reposo los discos de la base y de Storage (AES-256, infraestructura del proveedor) y en tránsito con TLS. | El cron cifraría el paquete (p. ej. AES-256-GCM con `crypto` de Node, sin dependencias) antes de subirlo, con una llave en una variable de entorno de Vercel. |
| Protege contra | Robo de discos o acceso físico en el proveedor. | Cualquiera que pueda leer el bucket: una `service_role` filtrada, un bucket marcado público por error, una copia externa comprometida. |
| No protege contra | Quien tenga la `service_role` o acceso al panel: ve el respaldo en claro. | Pérdida de la llave: **sin la llave el respaldo es irrecuperable.** La llave debe guardarse fuera de Vercel y de Supabase (gestor de contraseñas del CFO). |

auto-v4 hoy **solo** tiene el cifrado de la plataforma. El saneo reduce lo que se expone (sin credenciales), pero los datos financieros quedan legibles para quien acceda al bucket. Recomiendo el cifrado propio **solo junto con la copia externa** (punto 2) y con un procedimiento escrito de custodia de la llave; sin eso, agrega más riesgo de pérdida que protección.

## 7. Lo que este cambio no hace


- No reactiva `auto-v3` ni cambia `BACKUP_AUTOMATICO_SUSPENDIDO`.
- No borra ni modifica respaldos existentes (`backup_*`).
- No toca `SUPA_URL` ni `SUPA_KEY`. (Los botones Respaldo y Restaurar se corrigieron en un commit aparte: ver sección 1.)
- No guarda ningún secreto en el repositorio.
- No sanea las filas `backup_*` antiguas que ya existen en la base: pueden contener PIN y hashes. Borrarlas o sanearlas es una decisión de Angelo (cambia la política de respaldos).
