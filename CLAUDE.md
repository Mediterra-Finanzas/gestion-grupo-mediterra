# CLAUDE.md — Gestión Grupo Mediterra

Aplicación web interna para la gestión financiera y operativa de **Grupo Mediterra**, un grupo agrícola chileno con 8 empresas. Este archivo es el contexto principal del proyecto para Claude Code.

## Stack técnico

- **Frontend**: React (sin TypeScript, sin framework — JSX puro)
- **Backend**: Supabase (Postgres + Auth + Storage)
- **Hosting**: Vercel (deploy automático desde GitHub)
- **Build**: Vite (probable, verificar `package.json`)
- **Sin tests** actualmente
- **Sin linter** configurado (los archivos usan `/* eslint-disable */`)

## Usuario principal

**Angelo Huerta** — CFO Grupo Mediterra. Chile. Idioma español chileno por defecto. Prefiere outputs concisos y verificación de números antes de aceptar cambios.

## Grupo Mediterra — Estructura de empresas

8 entidades. Las 6 primeras consolidan línea-a-línea; Allpa Chile y Perú entran por método patrimonio (IAS 28).

| Empresa | % Controladora | Moneda | Negocio | Consolidación |
|---|---|---|---|---|
| Mediterra Holding | 100% | USD | Holding pura, fee admin intercompany | Línea a línea |
| Allegria Foods | 100% | USD | Exportadora cerezas + comisión arándanos Perú | Línea a línea |
| Allegria Service | 80% | USD | Procesamiento cerezas/ciruelas Chile | Línea a línea + NCI 20% |
| Frisku Foods | 90% | USD | Representación importadores fruta (% s/venta) | Línea a línea + NCI 10% |
| Osiris Plant Management | 100% | USD | Royalties genéticos varietales | Línea a línea |
| Integrity Farms | 100% | USD | Fee admin campos por hectárea (abril c/año) | Línea a línea |
| Allpa Farms Chile | 50% | USD | JV productora cerezas | Método patrimonio (IAS 28) |
| Allpa Farms Perú | 26% | PEN/USD | JV productora arándanos | Método patrimonio (IAS 28) |

**Año fiscal/contable:** Enero–Diciembre.
**Temporada operativa/agrícola:** Julio–Junio (afecta flujos de caja, presupuestos operativos, análisis comercial).

## Arquitectura de la app

### Archivos principales (a la fecha de este CLAUDE.md)

- `App.jsx` — entry point, autenticación (email + PIN), routing por tabs
- `FinanzasModule.jsx` (~13.300 líneas) — módulo central: flujo de caja, créditos, saldos bancos, nóminas, reportes, consolidado, auditoría
- `OsirisModule.jsx` — gestión Osiris Plant: contratos, anexos, royalties
- `FriskuModule.jsx` (~3.200 líneas) — sistema Frisku (clientes, exportadoras, contratos, programa comercial, embarques, liquidaciones)
- `FriskuMaestrosModule.jsx` (~1.400 líneas, nuevo May-26) — maestros globales: países, ciudades, puertos, aeropuertos, shipping lines, tipos embarque/embalaje, mercados, monedas, checklist documental

### Persistencia en Supabase

Tabla principal: `calendario_data` con columnas `id` (string), `value` (JSON), `updated_at` (timestamp). Cada módulo guarda en una fila distinta:

- `id="finanzas"` → módulo finanzas completo
- `id="osiris"` → módulo Osiris
- `id="frisku"` → módulo Frisku (clientes, exportadoras, contratos, embarques, liquidaciones)
- `id="nominas"` → módulo nóminas
- `id="maestro_paises"`, `id="maestro_puertos"`, `id="maestro_aeropuertos"`, etc. → maestros Frisku (10 ids: paises, ciudades, puertos, aeropuertos, shipping_lines, tipos_embarque, tipos_embalaje, mercados, monedas, checklist_docs)

URL Supabase: `https://bywovqayuzodbzwsriet.supabase.co`
Las API keys están hardcodeadas en cada módulo como constantes `SUPA_URL` y `SUPA_KEY` (NO mover a `.env` sin avisar a Angelo, porque rompería deploy actual).

### Estructura del módulo Finanzas (el más complejo)

Sub-tabs dentro de FinanzasModule:
1. **Dashboard** — KPIs grupo
2. **Flujo Empresas** — flujo de caja proyectado por empresa + consolidado
3. **Saldos Bancos** — saldos por banco/cuenta
4. **Créditos** — créditos por empresa, cuotas, renovaciones
5. **Nóminas** — nóminas de pago semanales con workflow autorización
6. **Reporte Semanal** — PDF ejecutivo del flujo grupo
7. **Auditoría** — log de cambios

#### Conceptos clave del flujo de caja

- **65 meses** de proyección (`MESES_65`)
- **Líneas base** vienen de `EMPRESAS_STATIC` por empresa
- **AddedLines** = líneas que el usuario agrega manualmente (en `addedLines[seccion]`)
- **SubLines** = sub-items de líneas con `subLines: true` (en `subLines[lineLabel]`)
- **6 categorías** por empresa: `ing_op`, `ing_nop`, `egr_var`, `egr_fijo`, `egr_nop`, `imp`

#### Lógica de valores mensuales vs semanales (definida en sesión May-26)

Para AddedLines y SubLines, cada celda puede tener:
- Valor **mensual**: `vals[5]` (mes idx 5)
- Valores **semanales**: `vals["5_0"]`, `vals["5_1"]`, `vals["5_2"]`, `vals["5_3"]` (4 semanas del mes)

**Regla acordada:**
- Si hay semanas cargadas → suma de semanas manda (mensual ignorado)
- Si NO hay semanas → usa valor mensual (retrocompatibilidad)
- La celda mensual en vista UI NO es editable cuando hay semanas (muestra suma calculada en cursiva)
- Para modificar valores, ir a vista semanal

Esta lógica está implementada en:
- `flujoArr` useMemo en FlujoEmpresa
- `sumAddedLinesMes()` y `sumAddedLinesSemana()` helpers
- `empresasConOverrides` en Consolidado (línea ~3099)
- Render celda mensual de AddedLines (línea ~5256)

**IMPORTANTE**: no romper esta lógica en cambios futuros. Si necesitas modificar el cálculo, hay logs de debug históricos comentados que ayudan a diagnosticar.

#### Sublines de "Préstamos" — caso especial

Las líneas con `formula:true` y "Préstamos" en el label:
- Cuotas calculadas automáticamente desde `creditosData` (módulo Créditos)
- `proy[i]` ya incluye las cuotas mensuales
- `calcPrestamosSemanasEmpresa()` calcula las cuotas por semana exacta
- Las sublines visibles vienen de `calcPrestamosDesglose()` (por acreedor)
- Mantienen consistencia con el módulo Créditos: una sola fuente de verdad

#### Bug histórico arreglado (no volver a romper)

El subtotal de categoría debe **incluir** las sublines de líneas con "Préstamos" en el nombre. Antes se excluían y generaba descuadre con el Flujo Neto. La exclusión `!l.label.includes("Préstamos")` fue removida del cálculo de subtotales — no volverla a poner.

### Estructura del módulo Frisku

#### Modelo de comisión Frisku

Frisku representa importadores. Cobra **% sobre la comisión del cliente** (no sobre la venta directa).

**Ejemplo Disney:**
- Cliente Disney cobra 8% a la exportadora
- De ese 8%, Frisku recibe el 25% → 2% del FOB es para Frisku

Los % de comisión Frisku pueden variar por **especie + formato**.

#### Lifecycle de un embarque (Plan Frisku Fase 4)

```
Business Closure → Programa Comercial (semanal) → Orden de Embarque → Despacho (Packing List) → Carpeta COMEX → Liquidación
```

Orden de Embarque debe tener mínimo: Exportadora, Cliente, Tipo de Embarque, Origen, Notify.

#### Plan de fases Frisku (a la fecha de este CLAUDE.md)

- ✅ **Fase 1**: Maestros (completada May-26)
- ⏳ **Fase 2**: Asociación especies-cliente + multimoneda + TC por fecha
- ⏳ **Fase 3**: Checklist documental con alertas + upload archivos
- ⏳ **Fase 4**: Flujo comercial restructurado (programa semanal, OE, despacho con Packing List, equivalencias contenedor)
- ⏳ **Fase 5**: Carpeta COMEX (Packing List + Docs Embarque + QC Destino + Liquidaciones, upload Supabase Storage)
- ⏳ **Fase 6**: Liquidaciones avanzadas (% comisión cliente × % comisión Frisku por especie+formato)
- ⏳ **Fase 7**: Carga histórica (importador Excel/CSV con mapeo)
- ⏳ **Fase 8**: Dashboards CFO + Comercial

## Convenciones de código

- **Idioma**: variables y comentarios en español, con anglicismos donde es natural (`override`, `useMemo`, `setData`)
- **Sin TypeScript**
- **JSX inline styles** con objeto `C` para colores (paleta consistente)
- **Sin librerías UI** externas (todo custom)
- **PptxGenJS + jspdf** para generación de PDFs y PPTs (reportes semanales, presentaciones directorio)
- **openpyxl style** para xlsx (a través de SheetJS o similar)

### Paleta de colores

Algunos módulos usan `C.teal/accent/blue/green/yellow/accent` etc. Cada módulo tiene su propio objeto `C`. Mantener consistencia visual.

### Auto-save

Casi todos los módulos hacen auto-save con debounce ~1-2 segundos a Supabase. Ver patrón `useAutoSave` en FriskuMaestrosModule.

## Estilo de trabajo con Angelo

- **Idioma**: español chileno (registro neutro profesional)
- **Verificación**: Angelo siempre valida los números antes de aceptar cambios. Mostrar siempre el cálculo aritmético cuando se trata de finanzas.
- **Iteración rápida**: prefiere ver el resultado y ajustar sobre la marcha, en lugar de planear perfecto desde el inicio
- **Outputs concisos**: no inflar las respuestas. Si no hay que explicar mucho, no explicar mucho.
- **No emojis salvo que él los use primero**
- **Email profesional**: cuando se redacten emails, aplicar las reglas del skill humanizer (sin em-dashes, sin "I hope this helps", sin "ALERTA CRÍTICA", sin listas innecesarias)

## Comandos útiles

```bash
# Instalar dependencias
npm install

# Desarrollo local
npm run dev

# Build producción
npm run build

# Deploy a Vercel (si tienes Vercel CLI)
vercel --prod

# Git workflow estándar
git add .
git commit -m "fix: descripción del cambio"
git push origin main
```

## Reglas para Claude Code

1. **No tocar las constantes `SUPA_URL` y `SUPA_KEY`** sin avisar a Angelo (rompería deploy)
2. **Verificar cuadre aritmético** después de cualquier cambio en cálculos financieros
3. **Mantener la lógica mensual-vs-semanal** acordada (ver sección Finanzas arriba)
4. **No reescribir módulos completos** sin antes confirmar con Angelo
5. **Mantener consistencia con la estética actual** (paleta de colores, tipografía, layout de tabs)
6. **Cuando haya dudas sobre números o lógica**, generar logs de debug temporales en consola, mostrar a Angelo para verificar, y después limpiar logs
7. **Commits frecuentes y descriptivos** — facilita rollback si algo se rompe
8. **No agregar dependencias npm** sin avisar (mantener bundle pequeño)

## Skills útiles disponibles

- `mediterra-context` — contexto financiero/operativo profundo del grupo (Claude.ai)
- `cfo-board-reporting` — preparar informes directorio, KPIs IFRS (Claude.ai)
- `humanizer` — limpieza de outputs AI-generated en comunicaciones (Claude.ai)

(Estos skills están en Claude.ai; en Claude Code no se invocan así, pero el conocimiento que contienen está descrito acá)

## Pendientes operativos

- Revisar quota Supabase mediterra-calendario (Pro plan, renovación mid-May 2026)
- RLS Supabase mediterra-calendario (vulnerabilidad de seguridad pendiente de fix sequential)
- Módulo EEFF (Etapa 1: carga balance + P&L con análisis comparativo Real vs Ppto vs Año Anterior) — esperar Excel de plantilla de Angelo

## Estructura típica de un archivo de módulo

```javascript
/* eslint-disable */
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";

const SUPA_URL = "https://bywovqayuzodbzwsriet.supabase.co";
const SUPA_KEY = "...";

// Persistencia
async function dbLoadModulo() { /* fetch desde calendario_data */ }
async function dbSaveModulo(value) { /* upsert con anti-pérdida */ }

// Paleta
const C = { /* colores hex */ };

// Datos por defecto / constantes
const DEFAULTS = [...];

// Componentes auxiliares
function Card({...}) {}
function Btn({...}) {}

// Componente principal (export default)
export default function MiModulo({ canEdit, ... }) {
  const [data, setData] = useState([]);
  // ... auto-save, render
  return <div>...</div>;
}
```

---

**Última actualización**: Mayo 2026.
**Mantener este archivo actualizado** después de cambios mayores en estructura, módulos nuevos, o decisiones de arquitectura importantes.
