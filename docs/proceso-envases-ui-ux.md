# PROC-ENVASES-001 · UI / UX target (B19–B23)

Estado: DISEÑO. NO materializado. Estética objetivo: software operacional premium (mismo design system `Proc*` que el resto de Allegria Service). Referencias humanas siempre (nunca UUID). Filtros AND. Empty states.

## Ubicación en navegación (B19, ENV-D10)

Nuevo grupo/entrada en el sidebar de Allegria Service, bajo **OPERACIÓN / LOGÍSTICA**:

```
OPERACIÓN
  Recepciones
  Lotes / Materia Prima
  QC
  Envases        ← nuevo
```

Alternativa evaluada: un grupo propio "ENVASES" si crece (Resumen / Movimientos / Saldos / Config). Recomendación (ENV-D10): una entrada "Envases" con sub-tabs internos, para no inflar el sidebar.

## Pantallas

### 1. Resumen de Envases
KPIs: total en custodia Service (por tipo), pendientes de devolución (a favor / en contra), dañados/perdidos del período, contrapartes con saldo. Tiles al estilo Centro de Operaciones.

### 2. Movimientos (ledger)
Listado read-only del `proc_envase_movimiento`: fecha operacional, tipo de envase, naturaleza (badge: ingreso/salida/devolución/daño/…), cantidad, owner, contraparte, ubicación origen→destino, ref (recepción/despacho/manual). Filtros AND: tipo, naturaleza, owner, contraparte, ubicación, planta, fecha. Es un ledger: no editable (append-only); correcciones vía movimiento de ajuste/reversa.

### 3. Saldos por Contraparte (B10, B16)
Tabla derivada del ledger. Dos vistas (toggle): **"Nos deben devolver"** (owner = contraparte, en custodia Service) y **"Les debemos devolver"** (owner = Service, en poder de la contraparte).

```
Contraparte     Tipo      Recibidos  Devueltos  Saldo
Cliente A       Bin            100         70     30
Cliente A       Tote            50         40     10
Productor B     Rejilla        200        180     20
```

Saldo derivado, nunca `saldo=30` mutable como verdad.

### 4. Registrar movimiento (B22)
Formulario para un movimiento manual (independiente de recepción/despacho): tipo de envase, cantidad, naturaleza, owner, contraparte, ubicación origen/destino, fecha operacional (default "ahora" America/Santiago, editable, misma mecánica T10C), motivo. Validación backend de saldo cuando la naturaleza lo exija (no en React).

### 5. Configuración · Tipos de Envase
Maestro data-driven (mismo componente que Tipos de Documento Contractual): código, nombre, categoría, unidad, retornable, capacidad referencial, activo. Buscar / crear / editar / activar-inactivar / filtro por estado.

## Integración en pantallas existentes (secciones opcionales, no pesadas)

### Nueva Recepción → "Envases recibidos" (B21)
Sección opcional bajo la cabecera:
```
Tipo    Cantidad   Propietario
Bin        100     Productor A
Tote        30     Cliente X
```
Si no hay envases retornables en la recepción, la sección queda colapsada / no obliga. Genera movimientos `ref_tipo=recepcion`.

### Despacho → "Envases entregados / devueltos" (B22)
Tipo · cantidad · destinatario · propietario · ubicación origen. Genera `ref_tipo=despacho`. Además existe la operación independiente (pantalla 4) para "cliente retira bins vacíos" sin despacho de fruta.

## Reportería (B23)
Reporte con: saldo actual, movimientos del período, recibidos / entregados / devueltos, daño/pérdida, saldo por contraparte. Filtros: cliente, productor, propietario, tipo envase, planta, ubicación, fecha. Export coherente con el resto (cuando aplique).

## Centro de Operaciones (B20) — futuro
Tiles potenciales (no en este bloque): envases pendientes de devolución, saldo vencido, diferencias de conciliación, envases dañados.

## Principios de UI a respetar
Backend autoridad · cero UUID · formatters canónicos · normalización de nombres · filtros AND · RLS intacta · empty states · fecha operacional canónica (America/Santiago) reutilizando T10C.
