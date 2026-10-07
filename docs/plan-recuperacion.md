# Plan de recuperación integral — Grupo Mediterra Hub

Estado: **propuesta para revisar. Nada de esto está activo.** El respaldo nuevo (auto-v4) sigue desactivado y los respaldos antiguos (`backup_*`) no se borran ni se sanean mientras no se apruebe este plan.

Inventario tomado del **repositorio** (oct-2026). La base de producción puede tener más objetos; la sección 1.4 trae las consultas para confirmarlo en el panel de Supabase. No tuve acceso a producción.

## 1. Inventario

### 1.1 Base de datos (Postgres, proyecto `bywovqayuzodbzwsriet`)

| Dominio | Tablas | Lo usa | Hoy respaldado por auto-v4 |
|---|---|---|---|
| Datos de la app (JSON por módulo) | `calendario_data`: finanzas, finanzas_bancos, nominas, osiris, allegria, rendiciones, main, usuarios, pins, maestros Frisku, frisku_*, audit_log, `backup_*` | Toda la app | **Sí** (saneado, sin `pins` ni `backup_*`) |
| Procesos (planta) | ~80 tablas `proc_*` (lotes, recepciones, pallets, despachos, QC, contratos, envases, reporting) — `supabase/schema_proc_*.sql` | Módulo Proceso, cron de reporting | No |
| Contabilidad / consolidación | `acc_*` (journal_entry, account_balance, period, chart_mapping, source_batch…), `asientos`, `asiento_lineas`, `plan_cuentas`, `periodos`, `saldos_cuenta`, `presupuesto`, `eliminaciones_intercompany`, `activo_fijo*`, `contab_*`, `auxiliares` | Contabilidad, EEFF | No |
| Análisis financiero | `anf_*` (filiales, informes, saldos_esf, movimientos_er, KPIs, justificaciones, tipos de cambio, libro mayor) | Módulo ANF | No |
| Identidad / maestros | `core_entities`, `core_entity_external_refs`, `dim_type`, `empresas`, `usuarios_empresa`, `user_osiris_accounts` | Varios | No |
| Tipo de cambio | `currency_tc`, `currency_canonical_pair`, `currency_migration_batch`, `tipos_cambio` | Monedas | No |
| Auditoría / seguridad | `auditoria_log`, `proc_audit_log`, limitador `frisku_sp_rl_*` | Trazabilidad | No |
| Auth de Supabase | `auth.users` (si se usa en `api/_auth.js` / `osiris-auth`) | Login de APIs | No |

Los archivos `supabase/schema_*.sql` definen **91 tablas** distintas, a las que se suma `calendario_data`. **auto-v4 cubre 1 de ~92.**

### 1.2 Documentos (Supabase Storage)

| Bucket | Acceso | Contenido | Respaldo hoy |
|---|---|---|---|
| `nominas-docs` | Privado (URL firmada) | Expediente Digital de nóminas (con SHA-256 por documento en `nominas`) | **No** |
| `frisku-docs` | [Probable] público | Docs Frisku (checklist, COMEX) y adjuntos de Rendiciones (`rendiciones/`) | **No** |
| `osiris-fotos` | Público | Fotos e informes HTML de Osiris | **No** |
| `proc-docs` | — | Documentos del módulo Proceso | **No** |
| `accounting-source` | — | Fuentes contables (adaptador CONTEC) | **No** |
| `respaldos` | Privado (a crear) | Destino de auto-v4 | — |

### 1.3 Fuera de la base

| Pieza | Dónde vive | Cómo se recupera |
|---|---|---|
| Código de la app y de `api/` | GitHub (`main`) + Vercel | Clonar y desplegar |
| Edge functions (`currency-fx-capture`, `osiris-auth`) | Repo `supabase/functions` + proyecto Supabase | `supabase functions deploy` |
| Secretos (`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, HMAC del limitador, EmailJS) | Vercel y Supabase | Guardados en el gestor de contraseñas del CFO; **hoy no hay copia documentada** |
| URL y llave pública | Constantes `SUPA_URL`/`SUPA_KEY` en el código | Ver riesgo R1 |

### 1.4 Consultas para confirmar el inventario real (solo lectura, panel SQL)

```sql
-- Tablas y tamaño
select table_schema, table_name, pg_size_pretty(pg_total_relation_size(format('%I.%I', table_schema, table_name))) as tamano
from information_schema.tables
where table_schema not in ('pg_catalog','information_schema') and table_type = 'BASE TABLE'
order by pg_total_relation_size(format('%I.%I', table_schema, table_name)) desc;

-- Documentos por bucket
select bucket_id, count(*) as archivos, pg_size_pretty(sum((metadata->>'size')::bigint)) as tamano
from storage.objects group by bucket_id order by 1;
```

## 2. Objetivos propuestos

| | Objetivo | Por qué |
|---|---|---|
| RPO datos (cuánto se puede perder) | 24 h; **1 h** si se contrata PITR | Hoy se pierde todo lo posterior al último respaldo manual |
| RPO documentos | 24 h | Los respaldos de nómina son evidencia de pagos |
| RTO (cuánto tarda volver) | 1 día hábil | Incluye recrear proyecto, restaurar y verificar |

## 3. Arquitectura: tres capas independientes

| Capa | Qué cubre | Dónde queda | Frecuencia | Retención |
|---|---|---|---|---|
| **A. Respaldo nativo de Supabase** (+ PITR opcional) | Toda la base (no Storage) | Mismo proveedor | Diario (PITR: continuo) | [Probable] 7 días en Pro; PITR según add-on |
| **B. auto-v4 (ya construido, desactivado)** | `calendario_data` saneado, restaurable fila por fila desde la app | Bucket privado `respaldos`, **mismo proyecto** | Diario | 30 diarios + 12 mensuales |
| **C. Copia fuera del proyecto (nuevo)** | **Todas** las tablas (`pg_dump`) + **todos** los buckets (copia incremental) | Almacenamiento externo con versionado y bloqueo de borrado (S3/R2/GCS) | Diario 02:00 Chile; Storage incremental | 30 diarios + 12 mensuales + 1 anual por cierre (7 años [Suponiendo], a validar con asesor tributario) |

La capa C se ejecuta en **GitHub Actions** programado: `pg_dump` necesita el binario de Postgres y Vercel no lo trae. La capa C hace lo siguiente:

1. Exporta con un **rol de solo lectura** creado para esto, nunca con `service_role`.
2. Copia Storage con una llave de solo lectura: lista los objetos y descarga los nuevos o cambiados según tamaño y fecha.
3. Escribe un manifiesto con SHA-256 por archivo y conteo de filas por tabla.
4. **Cifra con llave propia** antes de subir (`age`/GPG; la llave privada no está en GitHub ni en Supabase). Es necesario porque esta copia **sí** incluye credenciales (`pins`, `auth.users`).
5. Sube a un destino con versionado y retención bloqueada: ni la propia cuenta puede borrar antes de tiempo.

Diferencia clave: la capa B está **saneada** y sirve para errores operativos (alguien borró datos de un módulo). La capa C es **completa y cifrada** y sirve para desastres (se perdió el proyecto o la cuenta).

## 4. Acceso

| Rol | Puede | No puede |
|---|---|---|
| CFO (Angelo) | Custodiar la llave de descifrado de C; aprobar restauraciones | — |
| TI / responsable técnico (1 persona) | Ejecutar restauraciones en entorno de prueba; ver registros del job | Descifrar C sin la llave del CFO (dos personas para un desastre) |
| GitHub Action | Escribir en el destino externo (solo agregar) | Borrar, leer copias antiguas, escribir en la base |
| App (navegador) | Restaurar desde B fila por fila (admin, con plan y control de versión) | Tocar `pins` o credenciales |

MFA obligatorio en Supabase, Vercel, GitHub y el destino externo. Cada restauración queda en `audit_log`.

## 5. Prueba de restauración (antes de activar y luego trimestral)

En un **proyecto Supabase vacío de prueba**, nunca en producción:

1. Restaurar el `pg_dump` más reciente de C y comparar el conteo de filas por tabla con el manifiesto (diferencia 0).
2. Restaurar Storage y verificar el SHA-256 de cada archivo con el manifiesto. Para `nominas-docs`, cruzar además con el hash que guarda cada documento del Expediente Digital.
3. Apuntar un build de prueba al proyecto restaurado y correr:
   - `scripts/e2e/prod-solo-lectura.mjs`, que no escribe;
   - la regresión pantalla vs Excel de las 8 empresas, comparando las cifras con las del día del respaldo.
4. Restaurar una fila de `calendario_data` con B (botón "Restaurar") y verificar que conserva las credenciales actuales.
5. Registrar: fecha, duración real (RTO medido), diferencias encontradas.

## 6. Riesgos y decisiones pendientes

| # | Riesgo | Propuesta |
|---|---|---|
| R1 | `SUPA_URL`/`SUPA_KEY` están fijas en el código: restaurar a un **proyecto nuevo** exige cambiar el código y desplegar | Leer la URL de una variable de entorno, con la actual como respaldo (requiere tu aprobación; regla 1) |
| R2 | Hoy solo existe respaldo de `calendario_data`, y desactivado | Activar la capa A con PITR + la capa C antes que la capa B |
| R3 | Las filas `backup_*` antiguas guardan PIN y hashes en la propia base | No tocar hasta tener la capa C; después decidir borrarlas o sanearlas |
| R4 | `frisku-docs` y `osiris-fotos` parecen públicos | Revisar en el panel; `api/storage.js` ya está preparado para firmar URLs |
| R5 | Secretos sin copia documentada | Inventario en el gestor de contraseñas, con fecha de rotación |
| R6 | Costo | [Suponiendo] PITR ~US$100/mes; almacenamiento externo unos pocos US$/mes con este volumen; confirmar con la consulta 1.4 |

## 7. Pasos para activar (cada uno con tu aprobación)

1. Correr las consultas 1.4 y confirmar en el panel qué respaldos nativos y PITR están activos.
2. Crear el rol de solo lectura, el destino externo con versionado y bloqueo, y el par de llaves de cifrado.
3. Implementar el workflow de la capa C en una rama, probarlo contra un proyecto de prueba y ejecutar la sección 5.
4. Con la prueba aprobada: activar C, después B (pasos de `docs/respaldo-seguro.md` §5) y recién entonces decidir R3.
