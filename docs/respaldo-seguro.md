# Respaldo diario seguro (auto-v4): arquitectura y prueba

Estado: **implementado y probado en aislamiento, NO activado.** Activarlo requiere la aprobación de Angelo y los pasos de la sección 5.

## 1. Situación actual (comprobada en el código, oct-2026)

| Pieza | Qué hace hoy | Riesgo |
|---|---|---|
| Generador automático `auto-v3` (`App.jsx`) | Suspendido (`BACKUP_AUTOMATICO_SUSPENDIDO = true`, hotfix A del 03-09-2026). No crea ni borra respaldos. | **No existe respaldo automático.** |
| "Respaldo diario" al iniciar sesión un admin (`App.jsx`, efecto "RESPALDO AUTOMÁTICO DIARIO") | Lee **todas** las filas desde el navegador, `pins` incluida, y envía un **correo resumen** a ahuerta@grupomediterra.cl. No guarda copia. | Se llama respaldo, pero no lo es. Lee credenciales con la llave pública. Hay que tenerlo en cuenta en las pruebas de producción: iniciar sesión como admin envía ese correo. |
| Botón "💾 Respaldo" (admin) | Descarga un JSON con todas las filas, **`pins` incluida** (hashes de PIN) y `main` (con PIN heredados en texto plano, si los hay). | El archivo descargado contiene credenciales. |
| Botón "📤 Restaurar" (admin) | Sobrescribe **todas** las filas del archivo, `pins` y `main` incluidas, con `merge-duplicates`, sin control de versión ni simulación previa. | Puede revertir PINs y pisar cambios recientes de otras personas. |

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
6. Recién entonces se pueden retirar el botón "📤 Restaurar" del navegador y el correo del admin, o pasarlos a usar el saneo. Ese cambio se hace aparte.

## 6. Lo que este cambio no hace

- No reactiva `auto-v3` ni cambia `BACKUP_AUTOMATICO_SUSPENDIDO`.
- No borra ni modifica respaldos existentes (`backup_*`).
- No toca `SUPA_URL` ni `SUPA_KEY`, ni los botones Respaldo y Restaurar actuales.
- No guarda ningún secreto en el repositorio.
