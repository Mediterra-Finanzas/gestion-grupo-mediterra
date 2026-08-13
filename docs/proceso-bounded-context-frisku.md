# proc_* — Regla arquitectónica permanente: Frisku ≠ Allegria Service

**Capability:** Servicio de Proceso de Fruta Fresca (`proc_*`) · **Fecha:** 2026-08-13
**Estado:** Regla permanente (ratificada por el CFO). Aplica a todas las fases (F1–F∞).

> **Principio rector:** *Shared identity does not imply shared business relationship.*
> Frisku y Allegria Service son **bounded contexts distintos**. Pueden **compartir identidades corporativas**, pero **no** comparten automáticamente contrapartes ni relaciones operacionales. `proc_*` **nunca** usará los maestros operacionales de Frisku como source of truth de clientes, productores, exportadoras o destinatarios.

## 1. Separación de bounded contexts

- **Frisku** posee sus propios clientes/exportadores/importadores/contrapartes/relaciones comerciales/BI/config.
- **Allegria Service (`proc_*`)** posee sus propios cliente_servicio/productores/dueños de fruta/exportadoras/destinatarios/transportistas/propietarios de planta.
- **No** reutilizar automáticamente el universo operacional de Frisku.

## 2. Prohibición de dependencia directa de Frisku

`proc_*` **NO** depende de: tablas `frisku_*`, catálogos de exportadores de Frisku, arrays/constantes de Frisku, datos del BI Frisku, ni componentes Frisku para resolver una contraparte de Service. En particular, el selector **"Exportadora"** de Service **no** se puebla desde el maestro de exportadores de Frisku. Prohibido `proc_* → frisku_*` e imports de módulos de negocio Frisku.

Simetría: **Frisku tampoco** debe consumir `proc_*` directamente. Si ambos necesitan una empresa: **identidad corporativa compartida** o integración explícita; nunca tablas operacionales compartidas.

## 3. Identidad corporativa vs relación operacional

Una misma sociedad puede operar en ambos negocios (ej. Exportadora X con Frisku y con Service). Modelo correcto:

```
Core / identidad corporativa (contab_empresas | contab_auxiliares | futuro maestro canónico)
   ↙ Frisku — su propia relación (frisku_*)
   ↘ Allegria Service proc_* — su propia relación (proc_vinculo)
```

- **Core** dice: "esta empresa es Exportadora X."
- **Frisku** dice: "Exportadora X tiene esta relación con Frisku."
- **Service** dice: "Exportadora X tiene estos roles y relación con Service" (vía `proc_vinculo`).

No duplicar la identidad si hay maestro corporativo válido; tampoco compartir la relación operacional.

## 4. `proc_vinculo` = la relación de Service (roles no colapsables)

`proc_vinculo` referencia una identidad corporativa (XOR `contab_empresas` | `contab_auxiliares`) y le asigna uno o varios `rol_operacional`: `cliente_servicio`, `productor`, `dueno_fruta`, `exportadora`, `propietario_planta`, `transportista`, `otro` (extensible: `destinatario` en F4+). Una identidad puede tener **varios roles**; los roles **no se colapsan** (`cliente_servicio ≠ exportadora ≠ dueno_fruta ≠ destinatario`), aunque coincidan en una operación. Ambos ejemplos deben soportarse sin hacks:
- Cliente=Exportadora A · Productor=B · Dueño=A · Exportadora=A · Destinatario=Frigorífico C.
- Cliente=Productor B · Productor=B · Dueño=B · Exportadora=D · Destinatario=Packing E.

## 5. Selectores de Service (F4/F5)

Se alimentan **solo** de relaciones propias de Service (`proc_vinculo` activo por rol), nunca de una lista global de Frisku:
`exportadora` → vínculos rol `exportadora`; `cliente_servicio` → rol `cliente_servicio`; `productor` → rol `productor` (o maestro corporativo de productor); `dueno_fruta` → rol `dueno_fruta`; `destinatario` → vínculo compatible con recepción física.
**No** poblar Service con "todos los exportadores de Frisku". Una empresa de Frisku que deba operar en Service requiere: (1) resolver identidad corporativa, (2) crear/habilitar su `proc_vinculo`, (3) asignar rol.

## 6. Intercompany Allegria Foods

Allegria Foods puede ser contraparte de Service (cliente_servicio / exportadora / dueno_fruta) **vía identidad corporativa + `proc_vinculo`**, nunca por dependencia del módulo Foods ni de `exp_*`. Ver `correlacion_externa` en F4 para la integración futura Foods↔Service (sin escritura directa).

## 7. Contrato de test (obligatorio en roadmap de integración)

Dadas: Exportadora **A** (Frisku y Service), **B** (solo Frisku), **C** (solo Service):
- Frisku ve A y B (sus reglas); Service ve A y C (sus reglas).
- **B NO** aparece automáticamente en los selectores de Service.
- **C NO** necesita existir en Frisku para operar en Service.
Este test es el contrato arquitectónico.

---

## 8. Revisión read-only F1–F4 (2026-08-13) — resultado

Barrido de `frisku`/`Frisku` en `src/proceso/` y `supabase/schema_proc_v1–v4.sql` + validation:

| Ubicación | Referencia | Clasificación | Acción |
|---|---|---|---|
| `schema_proc_v1–v4.sql`, `proc_v*_tests.sql` | **ninguna** | Sin FK/tabla `proc_*` que dependa de `frisku_*` | — (cero dependencia estructural) |
| `src/proceso/core/procesoDB.js:17` | `import { SUPA_URL, SUPA_KEY } from "../../friskuHelpers"` | **Infra técnica neutral** (config Supabase) físicamente en Frisku; **NO** maestros/negocio Frisku | **PROC-INFRA-001** (deuda): mover a capa neutral (`src/shared/`/`src/core/`) en fase posterior. Sin refactor ahora (no requerido por F5) |

**Conclusión:** `proc_*` **no tiene dependencia funcional de Frisku**. No usa exportadores/clientes/maestros de Frisku. La única referencia es la config Supabase (infra neutral, deuda PROC-INFRA-001 registrada). **No se cumple la condición de parada** (ninguna tabla/FK materializada de `proc_*` depende estructuralmente de Frisku). Se continúa.

**PROC-INFRA-001 (deuda técnica registrada):** `procesoDB.js` referencia `SUPA_URL`/`SUPA_KEY` desde `friskuHelpers` solo porque ahí vive esa infra compartida hoy. La capability Service no debe depender a largo plazo de `src/frisku*` para infra transversal → mover a `src/shared/`/`src/core/`/`src/lib/` cuando se aborde (no ahora; no es refactor amplio necesario para F5).
