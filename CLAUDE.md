# CLAUDE.md — Gestión Grupo Mediterra

Aplicación web interna para la gestión financiera y operativa de **Grupo Mediterra**, un grupo agrícola chileno con 8 empresas. Este archivo es el contexto principal del proyecto para Claude Code.

## Stack técnico

- **Frontend**: React 18 (sin TypeScript, sin framework — JSX puro)
- **Backend**: Supabase (Postgres + Auth + Storage)
- **Hosting**: Vercel (deploy automático desde GitHub)
- **Build**: Create React App (`react-scripts 5.0.1`) — NO Vite
- **Sin tests activos** (existe `@testing-library/react` pero sin specs propios)
- **Sin linter activo** (archivos usan `/* eslint-disable */`); en build con `CI=true` los warnings escalan a error
- **APIs externas integradas**: `mindicador.cl` (Banco Central Chile, TC del CLP) y `api.frankfurter.app` (Banco Central Europeo, cross-rates globales). Sin auth, CORS abierto.

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

### Archivos principales

- `App.jsx` (~3.180 L) — entry point, autenticación (email + PIN), routing por tabs, backup automático. Incluye el módulo **Seguimiento Tareas** (no es archivo aparte): `TAREAS_BASE` (catálogo de tareas con `responsable/supervisor/categoria/frecuencia/diaLimite/diaLimiteSem/dependeDe`), pestañas por frecuencia (Diarias, Semanales, Quincenales, Mensuales, Puntuales, Anuales, Config), semáforo doble (responsable + supervisor) con notificación por email, y dependencias entre tareas (`dependeDe`). **Apertura por empresa**: tareas con `porEmpresa:true` (hoy F29 `m14`, Pago F29 `m17`, Cierre+EEFF `m13`, Análisis de cuenta `m19`) se despliegan en sub-filas por sociedad usando la constante `EMPRESAS_TAREAS` (10 sociedades, lista propia que NO coincide con `EMPRESAS_KEYS_ALL` de Finanzas — incluye Montejato/Arrayan/Mesain). Cada sub-fila tiene su propio semáforo; las claves de estado son `${taskId}__${empresa}` (o `${taskId}_s${num}__${empresa}` en semanal). Responsable/supervisor se heredan de la tarea padre. Helper `clavesInstancia(t,baseKey)` expande las instancias; `dependenciaOk(t,numSem,emp)` resuelve dependencias por empresa. **Co-responsables**: una tarea puede tener `coResponsables:[...nombres]` para que cualquiera de varios trabajadores marque el semáforo del responsable (hoy F29/F50/Análisis/Cierre+EEFF las pueden marcar Michelle o Pablo). `puedeEditar` valida contra `[responsable, ...coResponsables]`; el conteo de vencidas/resumen sigue usando el responsable principal. Display vía `respLabel(t)` (ej. "Pablo/Michelle").
- `FinanzasModule.jsx` (~13.300 L) — módulo central: flujo de caja, créditos, saldos bancos, nóminas, reportes, consolidado, auditoría
- `OsirisModule.jsx` — gestión Osiris Plant: contratos, anexos, royalties
- `AllegriaModule.jsx` — módulo Allegria
- `FriskuModule.jsx` (~1.500 L) — **Maestros globales de Frisku** (a pesar del nombre del archivo, internamente es `FriskuMaestrosModule`): 11 tabs — Países, Ciudades, Puertos, Aeropuertos, Shipping Lines, Tipos Embarque, **Especies** (Fase 2), Tipos Embalaje, Mercados, Monedas, **Tipo de Cambio histórico** (Fase 2, con APIs), Checklist Docs
- `FriskuComercialModule.jsx` (~5.900 L) — módulo comercial: Dashboard, **Clientes**/**Exportadoras** (CRUD), Contratos (Business Closure), **Programa** (semanal, con cajas por formato + **Contenedores/FCL** por semana), **Embarques** (OE + Packing List + COMEX), **Liquidaciones** + PO, **📈 Reportes** (Fase 8) y embed de Maestros + TC. **Tab Reportes** (`ReportesTab`): selector con 6 reportes BI, todos con export **Excel (ExcelJS, con logo Frisku)** + **PDF (jsPDF/autoTable, con logo)** — (1) Ingreso Frisku por temporada, (2) Rentabilidad por especie/mercado/cliente, (3) Programa vs Real en **FCL** (plan = `contenedoresFCL` del programa por especie del closure; real = OEs marítimas no canceladas, 1 OE = 1 contenedor; agrupa por especie/cliente/ambos), (4) Pipeline de embarques, (5) Ranking de exportadoras, (6) Cobranza/aging de comisión (sobre PO, buckets 0–30/31–60/61–90/>90 días desde emisión). Tabla de hechos = liquidaciones (comisión ya en USD). Helpers de export/logo con prefijo `fr_*` (fr_loadExcelJS, fr_sheetTabla, fr_logoPDF/Excel). **Nota**: el resto del módulo aún exporta el Packing List con XML SpreadsheetML manual; solo el tab Reportes usa ExcelJS.
- `friskuHelpers.js` (~290 L, **nuevo Fase 2**) — helpers compartidos: persistencia genérica, modelo de comisión Frisku, formateo de montos, búsqueda TC, conversión multimoneda, integración mindicador.cl + frankfurter.app
- `RendicionesModule.jsx` — **Rendiciones de gasto del personal**: cada trabajador carga sus propios gastos con respaldos (boletas/facturas en Supabase Storage) y workflow de aprobación (borrador → enviada → aprobada/rechazada → pagada). Se renderiza como **pestaña "🧾 Rendiciones" DENTRO de FinanzasModule** (no es un tile aparte del hub). Sub-tabs internos: Mis Rendiciones (todos), Por Aprobar / Pagos / Reportes (solo aprobadores = admin o `esCFO`). Reutiliza `dbLoadGeneric/dbSaveGeneric` y `uploadArchivoFrisku` (bucket `frisku-docs`, prefijo `rendiciones/`) de `friskuHelpers.js`. Persiste en `calendario_data` id=`rendiciones`. Independiente del flujo de caja. **Multimoneda con conversión para pago**: cada rendición tiene `monedaPago` (default CLP) y `fechaTC`; cada gasto se convierte a la moneda de pago **triangulando vía USD** (`convertir()` usa `buscarTC` de `friskuHelpers`, con par inverso). Ej. soles: `PEN→USD→CLP`. Las APIs gratis NO cubren PEN, así que el par `USD-PEN` debe cargarse manual en Maestros → Tipo de Cambio; los gastos sin TC se marcan ⚠ y se excluyen del total. Reportes totaliza en CLP equivalente. **Acceso**: en el merge de usuarios de `App.jsx`, a quien no tenga el módulo `finanzas` se le otorga, pero con TODAS las pestañas financieras en `sin_acceso` y solo `rendiciones` en `editar` → así todo el personal puede cargar gastos sin ver datos financieros sensibles. Quienes ya tenían Finanzas (Angelo, Carol) conservan acceso completo.
- `emailHelper.js` — utilidades de email

**Nota histórica**: el archivo `FriskuModule.jsx` se llamó así por compatibilidad con imports anteriores, pero su contenido es el módulo de Maestros (la cabecera del archivo lo declara explícitamente). El módulo Frisku que ve el usuario al entrar a "Frisku Foods" es `FriskuComercialModule`, el cual embebe `FriskuModule` (Maestros) dentro de su sub-tab "🗂️ Maestros + TC".

### Persistencia en Supabase

Tabla principal: `calendario_data` con columnas `id` (string), `value` (JSON), `updated_at` (timestamp). Cada módulo guarda en una fila distinta:

**Módulos de negocio:**
- `id="finanzas"` → módulo finanzas completo
- `id="osiris"` → módulo Osiris
- `id="allegria"` → módulo Allegria
- `id="nominas"` → módulo nóminas
- `id="rendiciones"` → módulo rendiciones de gasto (array de rendiciones con gastos + adjuntos + historial workflow)

**Maestros Frisku (11 ids):**
- `maestro_paises`, `maestro_ciudades`, `maestro_puertos`, `maestro_aeropuertos`, `maestro_shipping_lines`
- `maestro_tipos_embarque`, `maestro_tipos_embalaje`, `maestro_mercados`, `maestro_monedas`
- `maestro_especies` (**Fase 2**) — catálogo normalizado de frutas: `{codigo, nombreEs, nombreEn, icono, familia, kgPorCajaDefault, unidadComercial, temporadaInicio, temporadaFin, observ}`
- `maestro_checklist_docs`
- `maestro_tc` (**Fase 2**) — TC histórico, estructura distinta: `{"USD-CLP":[{fecha,valor,fuente}], "USD-EUR":[...]}` con fuentes `mindicador|frankfurter|manual`

**Datos comerciales Frisku (Fase 2 en adelante):**
- `frisku_clientes` — clientes (importadores) con especies asociadas, contactos, modelo de comisión + overrides por especie y especie+formato, multimoneda
- `frisku_exportadoras` — exportadoras (chilenas/peruanas) con especies que producen, certificaciones, contactos
- `frisku_contratos`, `frisku_programa`, `frisku_embarques`, `frisku_liquidaciones` — estructuras placeholder, se completan en Fases 3-6

URL Supabase: `https://bywovqayuzodbzwsriet.supabase.co`
Las API keys están hardcodeadas en `friskuHelpers.js` y en cada módulo como constantes `SUPA_URL` y `SUPA_KEY` (NO mover a `.env` sin avisar a Angelo, porque rompería deploy actual).

### Modelo de comisión Frisku (Fase 2)

Implementado en `friskuHelpers.js → calcularComisionFrisku()`. **El cliente cobra X% sobre FOB a la exportadora; Frisku recibe Y% de esa comisión cliente.**

```
% Frisku efectivo sobre FOB = (cliente% × frisku%) / 100
```

Ejemplo Disney: cliente 8% × Frisku 25% = Frisku se queda con **2% del FOB**.

Los porcentajes pueden venir de 3 niveles (lookup en cascada, en este orden):
1. Override por especie+formato: `cliente.comisionOverrides["CHE::CHE-5KG-CB"]`
2. Override por especie: `cliente.comisionOverrides["CHE"]`
3. Global del cliente: `cliente.comisionGlobalSobreFOB` + `comisionFriskuSobreClienteGlobal`

### Tipo de cambio (Fase 2)

Implementado en `friskuHelpers.js`. UI en el sub-tab "📈 Tipo de Cambio" del módulo de Maestros.

- **mindicador.cl** para pares `?-CLP` (Banco Central Chile, oficial). Soporta dólar y euro.
- **api.frankfurter.app** para cross-rates global (Banco Central Europeo). Cubre las monedas mayores, omite las exóticas (ej. PEN no aparece).
- Si mindicador falla en un par CLP, frankfurter es fallback.
- **Las entradas con `fuente:"manual"` no se sobrescriben** por la API → preservan ajustes/overrides del CFO.

Pares por defecto (configurables): USD→CLP, PEN, EUR, GBP, CNY, BRL, MXN, AUD, CAD, JPY; EUR→CLP/USD.

### Estructura del módulo Finanzas (el más complejo)

Sub-tabs dentro de FinanzasModule:
1. **Dashboard** — KPIs grupo
2. **Flujo Empresas** — flujo de caja proyectado por empresa + consolidado
3. **Saldos Bancos** — saldos por banco/cuenta
4. **Créditos** — créditos por empresa, cuotas, renovaciones
5. **Nóminas** — nóminas de pago semanales con workflow autorización. **Expediente Digital (Fases 0-6, jun-2026)**: respaldo documental por línea (bucket privado `nominas-docs` + URLs firmadas; helpers en `friskuHelpers.js` y `expedienteHelpers.js`), soft-delete de líneas/documentos/nóminas (nunca borrado físico: `estadoLinea`/`doc.estado`/`estadoNomina="inactiva"`), hash SHA-256 por documento, semáforo 🟢/🔴 + % cobertura por nómina, documento interno autogenerado para líneas de empresas relacionadas (`emp_rel_clp`/`emp_rel_usd`: correlativo `DI-{COD}-{AAAA}-{NNNNN}` + UUID + PDF), trazabilidad (`nomina.historial[]` + `window.auditLog` en transiciones), Vista Auditoría (`AuditoriaNominaModal`), validación de respaldo obligatorio al avanzar a "revision" (`VALIDACION_RESPALDO`, exime `anticipos`), y "Descargar Expediente" (ZIP resumen + documentos). La impresión incluye cobertura, respaldos por línea y anexos.
6. **Reporte Semanal** — PDF ejecutivo del flujo grupo
7. **Auditoría** — log de cambios
8. **EEFF** — carga balance + P&L (EEFFModule)
9. **Rendiciones** — rendiciones de gasto del personal (RendicionesModule embebido)

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

### Lifecycle de un embarque (Plan Frisku Fase 4)

```
Business Closure → Programa Comercial (semanal) → Orden de Embarque → Despacho (Packing List) → Carpeta COMEX → Liquidación
```

Orden de Embarque debe tener mínimo: Exportadora, Cliente, Tipo de Embarque, Origen, Notify.

### Plan de fases Frisku

- ✅ **Fase 1**: Maestros (completada). 10 catálogos en `FriskuModule.jsx` (a pesar del nombre, es el módulo de Maestros).
- ✅ **Fase 2**: Especies normalizadas + multimoneda + TC histórico + Clientes/Exportadoras. Entregado en `FriskuComercialModule.jsx` + `friskuHelpers.js` + tabs Especies/TC en `FriskuModule.jsx`. Modelo de comisión `cliente% × frisku%` implementado.
- ⏳ **Fase 3**: Checklist documental con alertas + upload archivos a Supabase Storage
- ⏳ **Fase 4**: Flujo comercial restructurado (programa semanal, OE, despacho con Packing List, equivalencias contenedor)
- ⏳ **Fase 5**: Carpeta COMEX (Packing List + Docs Embarque + QC Destino + Liquidaciones, upload Supabase Storage)
- ⏳ **Fase 6**: Liquidaciones avanzadas (aplica `calcularComisionFrisku` × TC para conversión a USD)
- ⏳ **Fase 7**: Carga histórica (importador Excel/CSV con mapeo)
- 🔄 **Fase 8** (en progreso): Dashboards CFO + Comercial. Tab **📈 Reportes** en `FriskuComercialModule` con 6 reportes BI descargables (Excel ExcelJS + PDF, con logo Frisku): Ingreso por temporada, Rentabilidad, Programa vs Real (FCL), Pipeline de embarques, Ranking de exportadoras, Cobranza/aging. Nota: reportes probados solo a nivel de build (compilación); falta verificación en runtime de la descarga Excel/PDF.

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

Casi todos los módulos hacen auto-save con debounce ~1-2 segundos a Supabase. Ver patrón `useAutoSave` en `FriskuModule.jsx` (Maestros) y `FriskuComercialModule.jsx`.

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

# Desarrollo local (CRA → puerto 3000)
npm start

# Build producción (con CI=true los warnings escalan a error — buena verificación)
$env:CI = "true"; npm run build      # PowerShell
CI=true npm run build                 # bash

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
9. **Patrón de persistencia anti-borrado (OBLIGATORIO para todo módulo nuevo)**: la función de carga DEBE propagar el error de red (lanzar excepción), NUNCA devolver defaults/`{}`/`null` en `catch`. El componente marca `cargaOkRef.current = true` solo tras una carga exitosa, y TODO guardado/auto-save se bloquea si `cargaOkRef` es false. Sin esto, un parpadeo de conexión deja el estado vacío y el auto-save lo escribe encima en Supabase (borró toda la fila `main` el 2026-06-16). El backup diario es genérico, así que un `id` nuevo queda respaldado solo.

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

**Última actualización**: 2026-06-16 — Fix crítico de persistencia: gate de carga exitosa (`cargaOkRef`) en todos los módulos para que un fallo de red no sobrescriba Supabase con defaults (incidente que borró la fila `main`). Backup diario ahora genérico (cubre cualquier fila/módulo futuro) + retención automática (30 días + mensual). Ver regla 9.
**Mantener este archivo actualizado** después de cambios mayores en estructura, módulos nuevos, o decisiones de arquitectura importantes.
