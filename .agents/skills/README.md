# Skills para programar en Gestión Grupo Mediterra

Dos grupos: las **a medida** (creadas para este repo) y las **ya disponibles**
en la sesión de Claude Code (no requieren instalación).

## Skills a medida del proyecto (en este directorio)

Se activan solas por relevancia; también puedes invocarlas con `/`.

### Código / arquitectura de la app
| Skill | Cuándo aplica |
|---|---|
| `mediterra-persistencia` | Cualquier carga/guardado/auto-save a Supabase (`dbLoad*/dbSave*`, `calendario_data`). Gate anti-borrado `cargaOkRef`. Regla 9 de CLAUDE.md. |
| `mediterra-flujo-caja` | Cálculos del flujo en FinanzasModule: mensual-vs-semanal, subtotales, sublines de Préstamos, cuadre aritmético. |
| `mediterra-export-excel` | Exportar a Excel. Usar `xlsx-js-style` (no `'xlsx'`), estilos de celda, logos, hoja Parametros. |

### Dominio CFO / finanzas
| Skill | Cuándo aplica |
|---|---|
| `mediterra-consolidacion-ifrs` | Cifras consolidadas de grupo: línea a línea vs IAS 28 método patrimonio, NCI, eliminaciones intercompany, moneda funcional USD. |
| `mediterra-contabilidad-tributaria` | Contabilidad y tributaria chilena: F29/F50/F22, IVA+PPM, cierre+EEFF, análisis de cuenta, año fiscal vs temporada. |
| `mediterra-tesoreria` | Saldos bancos, créditos/cuotas/renovaciones (USD), crédito de socio, liquidez, conversión multimoneda USD/CLP/PEN vía triangulación. |
| `mediterra-analisis-kpi` | Análisis financiero, KPIs de grupo, variance Real vs Ppto vs Año Anterior, escenarios what-if, insumos para decisión/directorio. |

Contenido real acá en `.agents/skills/` (versionable); `.claude/skills/` son
symlinks a estas carpetas (`.claude/` está en `.gitignore`).

## Skills ya disponibles en la sesión (sin instalar)

### Revisión y calidad de código
- `/security-review` — auditoría de seguridad de la rama. Relevante para el RLS de Supabase pendiente.
- `/code-review` — revisión de código de los cambios (correctness, bugs).
- `/simplify` — limpia y simplifica el código recién tocado (solo calidad, no busca bugs).

### Generación de documentos (la app produce muchos)
- `xlsx` — abrir/editar/crear planillas Excel complejas.
- `pdf` — leer/crear/combinar/rellenar PDFs (reportes, expedientes).
- `pptx` / `docx` — presentaciones directorio, documentos Word.

### Finanzas genéricas (útiles como apoyo, base US-GAAP — adaptar a IFRS/Chile)
- `finance:financial-statements` — armar P&L / balance / flujo con comparativo y variance.
- `finance:variance-analysis` — análisis de varianza actuals vs presupuesto.
- `finance:close-management` / `finance:reconciliation` / `finance:journal-entry` — cierre, conciliación, asientos.
- `finance:audit-support` — apoyo a auditoría.

### Comunicación y contexto del grupo
- `humanizer` — limpiar texto AI en emails (obligatorio por CLAUDE.md: sin em-dashes, sin "ALERTA CRÍTICA", etc.).
- `mediterra-context` — contexto financiero/operativo profundo del grupo (claude.ai).
- `cfo-board-reporting` — informes directorio, KPIs IFRS (claude.ai).
- `comite-financiero-mediterra` / `comite-allpa-peru` — comités financieros del grupo (claude.ai).

## Flujo típico de una sesión de código
1. Cambio en flujo/persistencia/export → aplica la skill `mediterra-*` correspondiente.
2. Antes de cerrar: `CI=true npm run build` (warnings escalan a error).
3. Si tocó lógica financiera: mostrar el cuadre aritmético a Angelo.
4. Cambios sensibles o de acceso → `/security-review`.
5. Al final, opcional: `/simplify` sobre lo tocado.
