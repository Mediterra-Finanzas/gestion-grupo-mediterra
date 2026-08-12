# Security Assessment — Osiris (Fase 0)

Solo documentación. **No se activa RLS, no se cambian keys, no se toca auth en Fase 0.**

## Estado actual
- **Persistencia:** una fila `calendario_data` (`id="osiris"`, `value` JSON) leída/escrita por `dbLoadOsiris`/`dbSaveOsiris` (`src/OsirisModule.jsx` L12-56).
- **Credencial:** `SUPA_KEY` **anon** hardcodeada en el bundle (L10 y duplicada en L4655 como `SUPA_KEY_OSIRIS`). Va al frontend; es pública por naturaleza.
- **RLS:** sin control de acceso efectivo a nivel de fila en esta ruta. Cualquiera con la anon key puede `GET`/`POST` sobre `calendario_data`. Es la vulnerabilidad ya conocida a nivel grupo (`supabase/AUDITORIA_SEGURIDAD_2026-06.md`, `cerrar_puerta_anon.sql`, `rls_activacion.sql`).
- **Storage:** bucket `osiris-fotos` (fotos de informes + HTML de informe). `ensureBucket()` es no-op. URLs públicas.
- **Scaffold auth relacional (inactivo):** `src/data/supabase-auth.js` + flag `REACT_APP_AUTH_DUAL` (App.jsx). Emite sesión Supabase de un proyecto *sandbox* vía Edge Function `osiris-auth`; tokens solo en `sessionStorage`. Hoy **no gobierna** la fila `osiris` (el módulo sigue leyendo/escribiendo el blob con anon key).

## Código que lee/escribe
| Acción | Ubicación |
|---|---|
| Lectura fila osiris | `dbLoadOsiris` L12-24 (GET) |
| Escritura fila osiris | `dbSaveOsiris` L26-56 (POST merge-duplicates, `keepalive`) |
| Gate anti-pérdida | L30-44 (bloquea si ≥3 arrays colapsan) |
| Upload fotos | `uploadFoto` L4665-4686 |
| Upload HTML informe | `uploadInformeHTML` L5307-5333 |

## Riesgos (detalle en G-risk-register R1, R2, R10)
1. Exposición: lectura no autenticada de data comercial/financiera real.
2. Escritura no autenticada: sobrescritura maliciosa/accidental de la fila.
3. Storage público: fotos/informes accesibles por URL.

## Restricciones para fases futuras (del brief)
- Documentar el riesgo (hecho aquí). Identificar el código de lectura/escritura (hecho). Identificar el scaffold (hecho).
- **NO** activar todavía una migración de auth que pueda bloquear usuarios (incidente de lockout previo, 2026-06-18).
- **NO** cambiar keys sin plan. **NO** introducir secretos al frontend. **NO** romper el acceso actual.
- La corrección va en fase controlada posterior (propuesta: RLS + auth relacional en 2 etapas, Fase 6).

## Nota Fase 0
El script de snapshot (`scripts/osiris-fase0-snapshot.mjs`) **lee** la anon key desde el propio `OsirisModule.jsx` (no re-hardcodea la key ni la agrega en un archivo nuevo) y realiza solo `GET`. El JSON completo del snapshot queda **gitignored** (data confidencial), y solo se commitea el manifest (conteos + sha256).
