# Estándar de Normalización de Nombres — Allegria Service (F7.6.1)

**Ámbito:** capability `proc_*` (bounded context Service). Fuente canónica única: `src/proceso/ui/format.js`. Tests: `src/proceso/ui/format.test.mjs` (28/28).

## 1. Principio

Los nombres visibles (clientes, productores, destinatarios, plantas, ubicaciones, etc.) deben verse **iguales en todo el sistema**: pantalla, tabla, filtro, export y PDF. La consistencia se logra normalizando el **dato/función**, nunca con CSS.

**PROHIBIDO `text-transform: capitalize`.** El CSS solo cambia el pixel: no arregla el dato, ni el export, ni el PDF, ni la búsqueda, ni los duplicados, ni el snapshot. Un nombre mal escrito con `capitalize` sigue mal escrito en Excel, en el correo y en el ledger.

## 2. Función canónica

```
normalizarNombre(s)  →  Title Case idempotente
```

Reglas (idempotente, testeable, centralizada, reutilizable):

- **Title Case por palabra**; colapsa espacios múltiples y hace trim.
- **Acrónimos / sufijos legales** con casing fijo: `SpA, S.A., SAC, SAS, Ltda., Ltd., E.I.R.L., S.R.L., GmbH, LLC, Inc., Corp., Co., PLC, B.V., N.V.` y técnicos `QC, PT, IQ, IQF, SAG, USDA`. (Mapa `ACRONIMOS`, ampliable.)
- **Conectores en minúscula** salvo primera palabra: `de, del, la, las, los, el, y, e, en, con, a, da, do, van, von`.
- **Respeta guiones y apóstrofes internos**: `Rio-Blanco`, `D'Agen`.
- **NO inventa ni quita acentos** (preserva lo escrito): `ANTON DÜRBECK GMBH → Anton Dürbeck GmbH`. La normalización no corrige ortografía.
- **Idempotente:** `normalizarNombre(normalizarNombre(x)) === normalizarNombre(x)` (verificado en tests).

Ejemplos verificados:

| Entrada | Salida |
|---|---|
| `AGROKASA` / `agrokasa` / `AgroKasa` | `Agrokasa` |
| `AGRICOLA RIO BLANCO SPA` | `Agricola Rio Blanco SpA` |
| `agroindustrias del pacifico s.a.c.` | `Agroindustrias del Pacifico SAC` |
| `frigorifico rio-blanco ltda` | `Frigorifico Rio-Blanco Ltda.` |

## 3. Deduplicación

```
claveNormalizada(s)   →  clave case/acento/puntuación-insensible (NFD, sin acentos)
sonMismaEntidad(a,b)  →  claveNormalizada(a) === claveNormalizada(b)
```

- La dedup **no depende de acentos ni puntuación**: `Anton Dürbeck GmbH` ≡ `anton durbeck gmbh`.
- En el **punto de escritura** (Configuración → maestros), antes de crear/actualizar se calcula la clave y se compara contra los registros activos del mismo maestro. **Coincidencia exacta de clave → se bloquea** con mensaje explícito. Esto evita el "AGROKASA" y "Agrokasa" duplicados.

## 4. Sugerencia "¿quisiste decir…?" — NUNCA auto-merge

```
sugerenciaCercana(nombre, candidatos, umbral=0.82)  →  {candidato, similitud} | null
```

- Combina **Levenshtein** sobre la clave normalizada con **solapamiento de tokens** (captura sufijos legales: `Anton Durbeck` sugiere `Anton Dürbeck GmbH`).
- Conservadora: un solo token compartido no dispara sugerencia; requiere ≥2 tokens o alta similitud de edición.
- **Solo advierte.** Nunca fusiona, nunca auto-corrige, nunca reescribe el registro existente. El operador decide (confirm) si guarda igual como registro distinto.

## 5. Punto de aplicación

- **Escritura (una vez):** `normalizarNombre` se aplica al guardar en Configuración sobre campos de nombre libre (`nombre`, `nombre_provisional`, `razon_social`). El dato queda limpio en el origen.
- **Lectura/display:** las columnas de nombre en los listados aplican `normalizarNombre` como red de seguridad para datos históricos aún no re-guardados (Recepciones, Lotes, Bodega, Órdenes, Despachos: cliente/productor/destinatario).

## 6. `nombre_legal` vs `nombre_display` — propuesta (NO migrada)

Hoy existe **un solo** campo `nombre` por entidad Core. Para casos donde la razón social legal difiere del nombre comercial de pantalla (ej. `Agroindustrias del Pacífico S.A.C.` vs `Agrokasa`), se **propone** —sin migrar en esta fase— separar:

- `nombre_legal` — inmutable, para documentos formales/tributarios.
- `nombre_display` — normalizado, para UI y operaciones.

Decisión de arquitectura del CFO/Oficina de Arquitectura. **No se migra silenciosamente.** Mientras tanto, `normalizarNombre` sobre el `nombre` único cubre la necesidad operativa.

## 7. Snapshot histórico F5 — inmutable

Los informes emitidos (F5/F7.6) congelan `nombre_snapshot` del destinatario en el momento de emisión. **La normalización NO retro-modifica versiones emitidas.** Un informe v1 muestra el nombre tal como estaba congelado; sólo las etiquetas de referencia CURRENT (no los números) se resuelven de maestros. La historia no cambia.

## 8. Reglas permanentes (checklist para el desarrollo futuro)

1. Una sola función de normalización: `normalizarNombre`. No duplicar lógica de casing.
2. Nunca `text-transform: capitalize` en nombres de entidad.
3. Normalizar en escritura; aplicar en display como respaldo.
4. Dedup por `claveNormalizada`, no por igualdad literal.
5. Sugerir cercanos, jamás auto-fusionar/auto-corregir.
6. No tocar snapshots históricos.
7. Todo caso nuevo de acrónimo/sufijo se agrega al mapa `ACRONIMOS` con un test.
