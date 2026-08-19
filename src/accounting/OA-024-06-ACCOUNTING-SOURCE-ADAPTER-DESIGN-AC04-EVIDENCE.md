# OA-024-06 — Evidencia AC-04: Análisis de Muestras Reales Contec

**Fecha:** 2026-08-17  
**Fuente:** CFO Angelo Huerta — tres archivos Contec reales de Allegria Foods  
**Scope:** DESIGN ONLY / READ-ONLY. Sin código ejecutable. Sin datos financieros reproducidos.  
**Relación:** Cierre del bloqueo AC-04 reportado en OA-024-06-R1 §14.

---

## 1. Archivos analizados

| Archivo | Filas | Tipo |
|---|---|---|
| `Balance Foods.xlsx` | 366 | ESF acumulado (trial balance a la fecha) |
| `EERR Julio A.Foods 2026.xlsx` | 90 | ER de un período mensual (julio 2026) |
| `EERR Acumulado A.Foods 2026.xlsx` | 175 | ER acumulado YTD (enero–julio 2026) |

Los tres son exportaciones nativas de Contec. Los montos individuales no se reproducen en este documento.

---

## 2. Estructura real del BALANCE (ESF)

### 2.1 Columnas confirmadas

| Índice (0-based) | Columna Excel | Contenido | Notas |
|---|---|---|---|
| 0 | A | Código de cuenta (`x.xx.xx.xxx`) o código de grupo (`x.xx.xx.000`) | Grupos = cabeceras de subtotal |
| 1 | B | Nombre de cuenta / nombre de grupo | |
| 2 | C | **Movimientos Debe YTD** (débitos brutos acumulados del ejercicio) | ← **NO leídos por parser actual** |
| 3 | D | **Movimientos Haber YTD** (créditos brutos acumulados del ejercicio) | ← **NO leídos por parser actual** |
| 4 | E | Saldo deudor neto (= G para cuentas activo) | Columna intermedia |
| 5 | F | Saldo acreedor neto (= H para cuentas pasivo) | Columna intermedia; valor 0 en activos |
| 6 | G | **Inventario Activo** — posición deudora neta | ← Parser lee `[6]` → `inventario_activo` |
| 7 | H | **Inventario Pasivo** — posición acreedora neta | ← Parser lee `[7]` → `inventario_pasivo` |
| 8 | I | Resultado Pérdida (cuentas ER: resultado deudor) | Siempre 0 en cuentas ESF (1.x / 2.x / 3.x) |
| 9 | J | Resultado Ganancia (cuentas ER: resultado acreedor) | Siempre 0 en cuentas ESF |

### 2.2 Comportamiento por tipo de cuenta

**Cuentas de Balance (1.xx / 2.xx / 3.xx):**
- G = saldo activo (deudor); H = saldo pasivo (acreedor); I = J = 0
- C = débitos YTD brutos; D = créditos YTD brutos; G = C − D (para cuenta deudora)

**Cuentas de Resultado (4.xx / 5.xx / 6.xx / 7.xx / 8.xx) cuando aparecen en el Balance:**
- G = 0; H = 0 (columns G/H vacíos para cuentas de resultado)
- I = resultado deudor; J = resultado acreedor
- El parser `parseBalanceContec` lee [6] y [7] → devuelve 0,0 para cuentas ER → **CORRECTO**: las cuentas ER no deben filtrarse como ESF

### 2.3 Hallazgo nuevo: movimientos brutos YTD disponibles

El Balance de Contec exporta en columnas C y D los movimientos brutos acumulados (debe y haber YTD) a nivel de cuenta. Esto **no era conocido** en el diseño R0/R1 y modifica el CapabilitySet:

- `ytd_gross_movements_balance: true` — disponible en Balance, cols C y D
- `period_debit_credit: false` (R1) sigue válido para movimientos del período específico, pero hay una capacidad YTD no declarada

**Implicación matemática:** Para una cuenta de Balance en período N:
```
G[N] = C[N] − D[N]          (por construcción Contec)
G[N] − G[N-1] = Δneto       (requiere dos archivos consecutivos)
C[N], D[N] son YTD brutos   (no del período N solo, sino acumulado desde inicio del ejercicio)
```
Para obtener movimientos brutos del período N aislado se requiere: `C[N] − C[N-1]` y `D[N] − D[N-1]` desde dos exportaciones consecutivas.

### 2.4 Verificación del parser existente

El parser `parseBalanceContec` en `anfParser.js` lee índices [6] (G) y [7] (H). **CONFIRMA CORRECTO** para cuentas ESF. No lee C/D; eso es una limitación conocida y aceptable en V1.

---

## 3. Estructura real del EERR (Estado de Resultado)

### 3.1 Columnas confirmadas

Formato idéntico en EERR-Período (Julio) y EERR-Acumulado (YTD):

| Índice (0-based) | Columna Excel | Contenido |
|---|---|---|
| 0 | A | **Naturaleza** (INGRESOS / GASTOS DE ADM. Y VENTAS / GASTOS OPERACIONALES / EGRESOS NO OPERACIONALES) |
| 1 | B | **Clase** (INGRESOS POR VENTA / COSTOS DE VENTA / GASTOS DE PERSONAL / …) o marcador de total ("Total Sub Clase" / "Total Clase" / "Total Naturaleza" / "RESULTADO FINAL") |
| 2 | C | **Sub-clase** (VENTAS EXPORTACION / GASTOS DE PERSONAL / GASTOS DE GESTION / …) |
| 3 | D | **Código de cuenta** (e.g., `4.01.01.002`, `6.11.01.010`) |
| 4 | E | **Nombre de cuenta** (VENTA CEREZAS FRESCAS EXPORTACION / SUELDOS Y SALARIOS / …) |
| 5 | F | **Centro de Costo / Descripción** (SIN DESCRIPCION / ADMINISTRACION Y FINANZAS / OPERACIONES / COMEX / …) |
| 6 | G | **Real** — monto actual del período (período = julio para EERR-Período; acumulado YTD para EERR-Acumulado) |
| 7 | H | **Presupuesto** — monto presupuestado (H=0 para cuentas sin presupuesto cargado) |
| 8 | I | **Varianza** (G − H; negativo para gastos que superan el presupuesto) |

### 3.2 Jerarquía de filas

```
Fila de detalle: A=Naturaleza, B=Clase, C=Sub-clase, D=código, E=nombre, F=CC, G=real, H=ppto, I=var
Fila subtotal Sub-clase: B="Total Sub Clase", G=suma_real, H=suma_ppto, I=var_total
Fila subtotal Clase:     B="Total Clase", G=..., H=..., I=...
Fila subtotal Naturaleza:B="Total Naturaleza", G=..., H=..., I=...
Fila resultado final:    B="RESULTADO FINAL", G=real_total, H=ppto_total, I=var_total
```

### 3.3 Naturalezas observadas (Allegria Foods julio 2026)

| Naturaleza | Descripción |
|---|---|
| INGRESOS | Ventas exportación, ventas nacionales |
| GASTOS DE ADM. Y VENTAS | Personal, viajes, arriendos, sistemas, gestión |
| GASTOS OPERACIONALES | Costos de venta / exportación |
| EGRESOS NO OPERACIONALES | Impuesto renta, amortización derecho de uso, intereses, depreciación, diferencia de cambio, resultado inversiones (método patrimonio) |

### 3.4 Centro de Costo: múltiples filas por código de cuenta

Una misma cuenta puede aparecer en N filas (una por CC distinto):

```
Cuenta 6.11.01.010 SUELDOS Y SALARIOS:
  CC = ADMINISTRACION Y FINANZAS → G = X
  CC = OPERACIONES               → G = Y
  
Cuenta 6.11.07.290 GASTOS BANCARIOS:
  CC = ADMINISTRACION Y FINANZAS → G = X
  CC = OPERACIONES               → G = Y
  
Cuenta 6.11.07.310 SEGUROS:
  CC = COMEX → G = X
```

**Implicación para acc_account_balance:** La UNIQUE constraint `(entity_id, period_id, account_code, balance_type)` prohíbe filas duplicadas por (cuenta, período). Para posting en V1 se **debe agregar** el real de todos los CC antes de insertar:

```
net_balance por account_code = SUM(G) sobre todos los CC del account_code
```

El detalle por CC queda disponible en el archivo fuente (`acc_source_file`), pero no se preserva en `acc_account_balance` en V1. Esto es una limitación declarada, no un bug.

### 3.5 Presupuesto en EERR

- Column H contiene el presupuesto para el mismo período
- H = 0 cuando no existe presupuesto cargado para esa cuenta/CC
- Los importes de presupuesto van a `pln_*` (OD-004 CLOSED en R1); no mezclar con `acc_account_balance.balance_type='actual'`

---

## 4. EERR MENSUAL: hallazgo crítico

**El EERR mensual acumulado con todos los meses como columnas NO existe como exportación directa de Contec.**

Confirmado por el CFO:
> "no tenemos un estado de resultado mensual como tal, te adjunto lo que podemos sacar de contec, el estado de resultado mensual lo armamos manual"

**Impacto en anfParser.js:**

La función `parseEerrMensualContec` fue diseñada para un formato con meses como columnas (estructura `Map<codigo, {desglose: {'1': {real, ppto}, '2': {...}, ...}}>`). Este formato **no es una exportación nativa de Contec** — es la representación del EERR ensamblado manualmente por el equipo.

El formato real de Contec es:
- EERR-Período: un archivo por mes, single-period (columnas Real/Ppto/Varianza para ese mes)
- EERR-Acumulado: un archivo YTD, misma estructura pero montos acumulados

Para el ContecAdapter se requiere una función diferente:
- **`parseEerrPeriodoContec(ws, period_label)`** — lee la estructura A-I real (cols 0-8), agrega por account_code, registra CC como dimensión
- Esta función **no existe** en anfParser.js — es parte del gap que cierra AC-04 en estado CONDITIONAL PASS

---

## 5. CapabilitySet actualizado (post-evidencia AC-04)

Reemplaza la definición de R1 para `CONTEC_CAPABILITY_SET`:

```javascript
const CONTEC_CAPABILITY_SET = {
  // ─── BALANCE (ESF) ─────────────────────────────────────────────────
  balance: {
    source_format:         'contec_balance_export',   // 10-column Excel
    trial_balance_debit:   true,   // col G — inventario_activo
    trial_balance_credit:  true,   // col H — inventario_pasivo
    ytd_gross_movements:   true,   // cols C (debe) y D (haber) YTD — no leídos en V1 parser
    opening_balance:       false,  // no disponible
    period_debit_credit:   false,  // no por período aislado; YTD sí (ver ytd_gross_movements)
    cost_centers:          false,  // no disponible en Balance
  },

  // ─── EERR PERÍODO (un mes) ──────────────────────────────────────────
  eerr_periodo: {
    source_format:         'contec_eerr_periodo_export',  // 9-column Excel
    real_amount:           true,   // col G — monto real del período
    budget_amount:         true,   // col H — presupuesto (H=0 si no hay presupuesto)
    variance:              true,   // col I — calculado: G − H
    cost_centers:          true,   // col F — múltiples filas por account_code
    account_hierarchy:     true,   // cols A/B/C — Naturaleza / Clase / Sub-clase
    period_granularity:    'single_month_per_file',  // un archivo = un período
    multi_month_single_file: false,                   // NO disponible en Contec nativo
  },

  // ─── EERR ACUMULADO (YTD) ───────────────────────────────────────────
  eerr_acumulado: {
    source_format:         'contec_eerr_acumulado_export',  // misma estructura 9-col
    real_amount:           true,   // col G — monto real YTD (ene→mes N)
    budget_amount:         true,   // col H — presupuesto YTD
    variance:              true,   // col I
    cost_centers:          true,   // col F
    account_hierarchy:     true,
    period_granularity:    'ytd',                           // un archivo = acumulado ene–N
  },

  // ─── NO DISPONIBLE ──────────────────────────────────────────────────
  not_available: {
    individual_journal_entries:        false,
    opening_closing_balance_explicit:  false,
    intercompany_flags:                false,
    period_gross_debit_credit_isolated: false,  // se puede DERIVAR si se tienen dos YTD consecutivos
  },
};
```

**Correcciones respecto a R1:**
- `cost_centers: false` → `true` (para EERR; en Balance sigue false)
- `ytd_gross_movements: true` añadido (Balance cols C, D — no declarado en R0/R1)
- `eerr_periodo` y `eerr_acumulado` separados (antes no había distinción de formato)
- `multi_month_single_file: false` explicitado

---

## 6. Función parseEerrPeriodoContec — especificación de diseño

> DESIGN ONLY — no implementar. El código ejecutable (ContecAdapter) está fuera del alcance de OA-024-06.

```
parseEerrPeriodoContec(ws, period_label) → List<EerrImportRecord>

Entrada:  worksheet de EERR-Período o EERR-Acumulado (estructura A-I de 9 columnas)
Salida:   lista de registros por account_code (CC agregado en V1)
Lógica:
  1. Ignorar filas donde col B contiene "Total Sub Clase" / "Total Clase" / "Total Naturaleza" / "RESULTADO FINAL"
  2. Ignorar filas donde col D (código) está vacío
  3. Por cada fila de detalle: acumular G (real), H (ppto) indexado por (D=código, E=nombre)
  4. Por cada account_code: emitir un EerrImportRecord con:
       account_code: D
       account_name: E
       naturaleza:   A   (para mapping posterior)
       clase:        B
       sub_clase:    C
       real:         SUM(G) sobre todos los CC
       budget:       SUM(H) sobre todos los CC
       period_label: ej. "2026-07" o "2026-07-YTD"
       source_report_type: 'eerr_periodo' | 'eerr_acumulado'
  5. (Opcional V2) Retener detalle por CC como dimensión separada
```

**EerrImportRecord** — reemplaza `BalanceImportRecord` para ingresos de EERR:
```
{
  account_code:       string,
  account_name:       string,
  naturaleza:         string,
  clase:              string,
  sub_clase:          string,
  real:               number,
  budget:             number,
  period_label:       string,
  source_report_type: 'eerr_periodo' | 'eerr_acumulado',
}
```

**Mapping a acc_account_balance:**
```
debit_balance  = real si la cuenta tiene naturaleza GASTOS/EGRESOS (cuenta deudora)
credit_balance = real si la cuenta tiene naturaleza INGRESOS (cuenta acreedora)
net_balance    = debit_balance − credit_balance
balance_type   = 'actual'
currency       = según ficha técnica de la entidad (D8 — OPEN)
```

**Budget mapping a pln_* (V2):**
```
budget_amount → pln_budget_entry (no mezclar con acc_account_balance)
```

---

## 7. Impacto sobre los fixtures existentes

El fixture `allegria-contec-jun2026.js` contiene:
- `ER_MENSUAL_MAP` — estructura `Map<code, {desglose: {'1': {real}, ...}}>` con meses como keys
- Esta estructura NO corresponde a ninguna exportación directa de Contec
- Es la representación del EERR ensamblado manualmente

**Posición de diseño:**
- Los fixtures son SINTÉTICOS y sirven como contrato para el parser existente
- OA-024-06 no requiere modificar los fixtures (están fuera de scope)
- La diferencia de formato entre fixture y realidad Contec debe documentarse en el DESIGN para que el implementador de ContecAdapter no construya sobre los fixtures actuales como si fueran la fuente real

---

## 8. Impacto sobre OD-001 (CLOSED en R1)

La decisión OD-001 permanece válida:
- No fabricar `period_debit` / `period_credit` para EERR
- La columna G del EERR da el monto real del período (período aislado para EERR-Período; acumulado para EERR-Acumulado)
- Esto se mapea a `net_balance` en `acc_account_balance`, no a `debit/credit` por separado

**Adición menor:** Los movimientos brutos YTD del Balance (cols C/D) son una fuente de `debit_credit` AGREGADO YTD. Si en V2 se desea cargar movimientos brutos de períodos intermedios del Balance, se puede derivar `Δdebe = C[N] − C[N-1]` con dos archivos consecutivos. Esto no cambia OD-001 sino que extiende las opciones de V2.

---

## 9. Estado AC-04 — CIERRE

### Criterios de R1 para cerrar AC-04

| Criterio | Estado | Evidencia |
|---|---|---|
| Estructura real Balance confirmada | PASS | §2: 10 columnas, G=inv_activo, H=inv_pasivo |
| Parser lee columnas correctas | PASS | §2.4: índices [6] y [7] confirman |
| Estructura real EERR descubierta | PASS (nuevo) | §3: 9 columnas A-I, CC en col F |
| CapabilitySet corregido con datos reales | PASS | §5: cost_centers=true EERR, ytd_gross=true |
| EERR MENSUAL: aclaración | PASS | §4: no existe como export nativo; es manual |
| Función de ingesta EERR diseñada | PASS (diseño) | §6: parseEerrPeriodoContec especificada |
| Limitación CC en UNIQUE constraint documentada | PASS | §3.4: agregación requerida en V1 |

**Veredicto AC-04: PASS**

Los tres archivos reales (Balance Foods.xlsx, EERR Julio A.Foods 2026.xlsx, EERR Acumulado A.Foods 2026.xlsx) son evidencia suficiente para validar el contrato estructural de la fuente. Las condiciones identificadas durante el análisis pasan a ser **requisitos de implementación de ContecAdapter** (scope OA-024-08), no blockers del diseño.

Archivos registrados como evidencia real:
- `Balance Foods.xlsx` — ESF/trial balance Allegria Foods (Contec)
- `EERR Julio A.Foods 2026.xlsx` — ER período mensual julio 2026 (Contec)
- `EERR Acumulado A.Foods 2026.xlsx` — ER acumulado YTD ene-jul 2026 (Contec)

---

## 10. Gate final OA-024-06

### Tabla de condiciones actualizada

| Condición | Estado |
|---|---|
| AC-01 acc_source_batch_issue tabla | APPROVED (R1) |
| AC-02 schema acc_account_balance verificado | APPROVED (R1) |
| AC-03 fixture Allegria Foods | SYNTHETIC ACKNOWLEDGED (no bloquea diseño) |
| AC-04 muestra real Contec | **PASS** (este documento + decisión CFO 2026-08-17) |
| AC-05 lineage/storage bucket confirmado | DEFERRED — gate para ingesta real, no bloquea OA-024-07 |

### Open decisions remanentes

| ID | Estado | Bloqueante para OA-024-07 |
|---|---|---|
| D7 — tipo jurídico NCI entities | OPEN | NO — OA-024-07 usa fixtures sintéticos |
| D8 — moneda funcional entidades mixtas | OPEN | NO — OA-024-07 usa NULL / unresolved |
| AC-05 — bucket para acc_source_file | DEFERRED | NO — bloquea OA-024-08/09 (ingesta real) |

### Posición OA-024-06

**OA-024-06 = APPROVED / FROZEN v1**

OA-024-07 AUTORIZADO por CFO (2026-08-17). No reabrir este diseño salvo evidencia real nueva que cambie el contrato.

---

## CHANGELOG AC-04-EVIDENCE

| # | Hallazgo | Impacto sobre R1 |
|---|---|---|
| EV-001 | Balance: cols C/D = movimientos brutos YTD | CapabilitySet: agrega `ytd_gross_movements: true` |
| EV-002 | Balance: cuentas ER (4.xx+) tienen G=H=0, resultado en I/J | Parser correcto: no lee I/J desde Balance |
| EV-003 | EERR: formato 9-col A-I, diferente al esperado por parseEerrMensualContec | Requiere nueva función parseEerrPeriodoContec |
| EV-004 | EERR: col F = CC, múltiples filas por account_code | CapabilitySet: `cost_centers: true` para EERR |
| EV-005 | EERR: col H = presupuesto (H=0 si no hay) | Confirma OD-004 (pln_* separado) |
| EV-006 | EERR MENSUAL no existe como export nativo Contec | Fixtures sintéticos no son fuente de verdad real |
| EV-007 | CC múltiples violan UNIQUE(entity, period, code, type) | Diseño: agregar CC antes de posting en V1 |
| EV-008 | EERR-Período vs EERR-Acumulado: misma estructura, diferente período | Separar en CapabilitySet |
