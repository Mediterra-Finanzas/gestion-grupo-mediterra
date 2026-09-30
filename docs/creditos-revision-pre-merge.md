# Créditos — revisión antes del merge a `main`

Rama: `claude/laughing-dijkstra-8665xz`. Todo lo verificado aquí usa **datos simulados**
(tests y un Supabase falso en memoria). **Nada de esto concilia los datos reales**:
producción respondió 403 desde el entorno de trabajo, así que la conciliación real
se hace desde la app con el procedimiento de la sección 5.

---

## 1. Criterios aplicados (decisiones de Angelo)

| Tema | Regla implementada |
|---|---|
| Cuotas vencidas impagas | Una cuota vencida **confirmada** impaga se proyecta en el mes y la semana en curso, marcada "vencida" y con su **fecha contractual original** visible. |
| Registros antiguos | Una cuota que venció **antes de que el crédito se controlara en la app** (`control_desde`) y no tiene pago registrado queda **"por conciliar"**. No entra a la deuda confirmada ni al flujo. Su impacto potencial en caja se muestra aparte, en el aviso del flujo, en la pestaña 🔎 Conciliación y en la columna "Por conciliar" del servicio de deuda. Se concilia de dos maneras: (a) registrando el pago real, o (b) "Confirmar impaga" con un respaldo; esta confirmación se puede anular con motivo. Los créditos antiguos no tienen `control_desde`. Uno nuevo lo fija el día de su alta. |
| Cuotas sin desglose | No se asume que sean capital. Se completan con "Desglosar cuota", que exige un **respaldo contractual**. Mientras falte el desglose, la cuota aparece como "cuota sin desglosar": queda **fuera** del saldo de capital identificado y **dentro** del servicio de deuda. El Análisis CFO advierte el monto, el número de cuotas y de créditos, y el % de la deuda confirmada que representa. |
| Pagos y flujo real | El flujo real sigue siendo de ingreso manual. Registrar un pago reduce la obligación pendiente y el capital (solo por la parte de capital) y queda en el historial. **No** agrega ninguna salida al flujo real. |
| Nóminas | Una línea de nómina se vincula a un vencimiento. Vincularla **no** paga nada. El pago se registra solo con **"Confirmar pago efectivo"**, que exige nómina "Aprobada CFO" y permiso de edición en Créditos, e indica fecha, monto y desglose. Admite pagos parciales. La clave `nomina:<nómina>:<línea>` evita duplicados al reintentar. Anular el pago desde la línea exige motivo y el pago anulado queda en el historial. Crear o autorizar la nómina no cambia nada en Créditos. |
| Valores manuales antiguos en Pago Préstamos / Renovaciones | **Siguen aplicándose** hasta que se decide mes a mes en 🔎 Conciliación. La tabla muestra, para cada mes, valor manual, calendario de Créditos y diferencia. "Usar Créditos" retira el valor manual. "Mantener manual" lo conserva y exige motivo. Cada decisión queda registrada en `_resolucionesCreditos` con usuario, fecha y ambos montos. En el flujo ya no se pueden escribir valores manuales nuevos en esas líneas. |

---

## 2. Verificación del prepago (reproducible a mano)

### Crédito de prueba

| Dato | Valor |
|---|---|
| Capital original | USD 400.000 |
| Desembolso | 10-01-2026 |
| Tasa | 8% anual fija |
| Base | Actual/360 |
| Amortización | capital constante, trimestral: 4 cuotas de 100.000 |
| Comisión de prepago | 1 mes de interés sobre el capital prepagado |

**Ojo:** la comisión de "1 mes de interés" es una **hipótesis de prueba**, no una condición de un contrato real. En cada crédito real hay que cargar la condición que diga el contrato.

### Calendario original

| Vencimiento | Días desde el anterior | Saldo inicial | Capital | Interés = saldo × 8% × días/360 | Saldo final |
|---|---|---|---|---|---|
| 10-04-2026 | 90 (10-ene → 10-abr) | 400.000 | 100.000 | 8.000,00 | 300.000 |
| 10-07-2026 | 91 | 300.000 | 100.000 | 6.066,67 | 200.000 |
| 10-10-2026 | 92 | 200.000 | 100.000 | 4.088,89 | 100.000 |
| 10-01-2027 | 92 | 100.000 | 100.000 | 2.044,44 | 0 |

La cuota del 10-04-2026 se pagó completa ese día: 100.000 de capital + 8.000 de interés.
Ese es el **último pago de intereses** antes del prepago.

### A) Prepago total el 25-05-2026

| Paso | Cálculo | Monto |
|---|---|---|
| Capital pendiente antes del prepago | cuotas del 10-07, 10-10 y 10-01 | 300.000,00 |
| Días devengados | 10-04-2026 → 25-05-2026 = 20 (abril) + 25 (mayo) | 45 |
| Interés devengado | 300.000 × 8% × 45/360 | 3.000,00 |
| Comisión | 300.000 × 8% / 12 | 2.000,00 |
| **Desembolso total** | 300.000 + 3.000 + 2.000 | **305.000,00** |
| Intereses futuros del calendario original | 6.066,67 + 4.088,89 + 2.044,44 | 12.200,00 |
| Intereses futuros del escenario | no quedan cuotas | 0,00 |
| Intereses evitados | 12.200 − 0 − 3.000 | 9.200,00 |
| **Ahorro neto** | 9.200 − 2.000 | **7.200,00** |

Por qué se resta el devengado: en el calendario original, esos 3.000 se pagaban dentro de
la cuota del 10-07 (6.066,67). Con el prepago se pagan igual, solo que antes. Lo evitado es
el interés desde el 25-05 hasta cada vencimiento. El ahorro **no** descuenta el costo de
oportunidad de la caja usada.

### B) Prepago parcial de 100.000 el 25-05-2026, reduciendo el plazo

| Paso | Cálculo | Monto |
|---|---|---|
| Interés devengado sobre lo prepagado | 100.000 × 8% × 45/360 | 1.000,00 |
| Comisión | 100.000 × 8% / 12 | 666,67 |
| Desembolso | 100.000 + 1.000 + 666,67 | 101.666,67 |

Calendario posterior al prepago. El capital de cada cuota se mantiene en 100.000 y la última cuota desaparece:

| Vencimiento | Saldo inicial | Capital | Interés |
|---|---|---|---|
| 10-07-2026 | 200.000 | 100.000 | 200.000 × 8% × 91/360 = 4.044,44 |
| 10-10-2026 | 100.000 | 100.000 | 100.000 × 8% × 92/360 = 2.044,44 |

| Paso | Cálculo | Monto |
|---|---|---|
| Intereses evitados | 12.200,00 − (4.044,44 + 2.044,44) − 1.000,00 | 5.111,12 |
| Ahorro neto | 5.111,12 − 666,67 | 4.444,45 |

En mi reporte anterior dije 5.111,11 y 4.444,44. Sin redondear, el escenario suma 6.088,89. La app
redondea cada interés al centavo, igual que un banco, así que 4.044,44 + 2.044,44 = 6.088,88. Por eso la diferencia de 1 centavo.

### C) Prepago parcial de 100.000 el 25-05-2026, reduciendo la cuota

El devengado (1.000,00), la comisión (666,67) y el desembolso (101.666,67) son los mismos que en B.
El capital se reparte en las 3 cuotas que quedan: 66.666,67 + 66.666,67 + 66.666,66.

| Vencimiento | Saldo inicial | Interés |
|---|---|---|
| 10-07-2026 | 200.000,00 | 200.000 × 8% × 91/360 = 4.044,44 |
| 10-10-2026 | 133.333,33 | 133.333,33 × 8% × 92/360 = 2.725,93 |
| 10-01-2027 | 66.666,66 | 66.666,66 × 8% × 92/360 = 1.362,96 |

| Paso | Cálculo | Monto |
|---|---|---|
| Intereses del escenario | 4.044,44 + 2.725,93 + 1.362,96 | 8.133,33 |
| Intereses evitados | 12.200 − 8.133,33 − 1.000 | 3.066,67 |
| Ahorro neto | 3.066,67 − 666,67 | 2.400,00 |

Estos casos están en `node src/creditos.test.mjs`. El E2E en navegador repite otro caso:
prepago total el 20-10-2026, con devengado 100.000 × 8% × 10/360 = 222,22 y comisión 666,67.

### Regla usada para el devengado

- **Prepago total:** devenga todo el saldo desde el último vencimiento pagado hasta la fecha del prepago.
- **Prepago parcial:** el capital prepagado paga su interés devengado hasta la fecha del prepago. El capital que queda devenga el período completo, hasta su vencimiento.
- **Datos faltantes:** si falta la tasa, la base o la condición de prepago, el resultado se muestra como **estimación**, con el dato faltante declarado y sin opción de aplicarlo. La app no inventa condiciones.

---

## 3. Tasa variable

- La tasa del contrato se calcula como **referencia vigente cargada como hipótesis + margen**.
- La hipótesis se proyecta **constante hasta el vencimiento**.
- Dónde se ve marcada como proyección:
  - vista previa del calendario: "Intereses PROYECTADOS: SOFR 3M 5% supuesta constante (hipótesis) + margen 3%";
  - detalle del crédito: etiqueta "proy." en cada interés;
  - servicio de deuda: columna "de ello proy. tasa variable";
  - Análisis CFO: la hipótesis de cada crédito y una sensibilidad de +100 pb (saldo variable × 1%);
  - simulador: la hipótesis aparece explícita.
- No hay integración con fuentes de tasas: la referencia se actualiza a mano en cada crédito.

---

## 4. Qué se verificó y cómo

| Nivel | Qué | Resultado |
|---|---|---|
| Compilación | `CI=true npx react-scripts build` | sin errores |
| Modelo (Node) | `node src/creditos.test.mjs`: 6 casos pedidos + conciliación + nómina + tasa variable, también con TZ=America/Santiago | todo OK |
| Suite jest | `CI=true npx react-scripts test --watchAll=false` | 43 suites OK |
| Navegador (datos simulados) | `scripts/e2e/creditos.mjs`: alta de contrato, pago parcial con servidor que rechaza y luego acepta, conciliación de valores manuales, flujo en pantalla = modelo, prepago | OK |
| Navegador (datos simulados) | `scripts/e2e/nomina-credito.mjs`: vincular no paga; confirmar con rechazo y reintento → un solo pago; anulación con motivo | OK |
| Navegador (datos simulados) | `scripts/e2e/regresion-empresas.mjs`: pantalla vs Excel recalculado por LibreOffice, 8 empresas | 12.056 celdas, 0 diferencias; 0 peticiones a producción |
| **Datos reales** | — | **NO verificado** (producción 403) |

---

## 5. Procedimiento de conciliación con datos reales (desde la app)

1. **Respaldo.** Antes de desplegar, descarga el "💾 Respaldo" de la app.
2. **Revisar lo pendiente.** Con la rama desplegada en un entorno de revisión (o ya en producción), entra a Créditos → 🔎 Conciliación.
   Revisa el total "Cuotas históricas por conciliar" y el "impacto potencial" por empresa.
3. **Cotejar.** "📥 Exportar a Excel para cotejar" genera dos hojas:
   - *Cuotas por conciliar*: tiene columnas en blanco (estado según banco, fecha y monto pagado, documento).
     Complétalas con la cartola o con el certificado de deuda de cada acreedor.
   - *Valores manuales vs Créditos*: una fila por empresa, línea y mes, con la diferencia.
4. **Resolver cada cuota:**
   - Si está pagada: 📅 → "💵 Pagar", con la fecha y el monto de la cartola.
   - Si está impaga: "Confirmar impaga", con el respaldo.
5. **Resolver cada valor manual:**
   - "Usar Créditos", si el calendario es el correcto.
   - "Mantener manual" con motivo, si falta registrar esa deuda en Créditos. En ese caso hay que registrarla después y volver a conciliar.
6. **Completar desgloses.** Desglosa las cuotas sin desglose con su respaldo (📅 → "Desglosar cuota").
7. **Cuadre final.** En Análisis CFO → agrupar por **Acreedor**, compara "Saldo capital identificado" + "Cuota sin desglosar" con el saldo que informa cada acreedor a la fecha de corte.
   El flujo del mes en curso debe cambiar exactamente en las cuotas que se confirmaron impagas.

---

## 6. Limitaciones pendientes

1. **Datos reales no conciliados.** Todo lo anterior se probó con datos simulados.
2. **Registros legacy casi sin desglose.** Con los datos por defecto del código, prácticamente toda la deuda figura como "cuota sin desglosar". Mientras no se desglose, el costo financiero y el saldo de capital son parciales.
3. **Monedas distintas de USD.** El flujo usa el `tc_flujo` que se declara en cada crédito, un tipo de cambio fijo. No está conectado con el TC histórico de Maestros.
4. **Documentos de respaldo.** Se guardan como enlaces (nombre + URL). No hay subida a Supabase Storage.
5. **Prepago parcial en registros legacy o de socio.** Solo se simula; aplicarlo requiere pasar el crédito a "con calendario". En esos tipos, el prepago total sí se aplica.
6. **Renovaciones legacy.** Siguen con su modelo anterior: interés mensual simple y cuotas por mes/año, sin día.
7. **Nómina anulada o línea inactivada.** No anula por sí sola el pago que ya se registró en Créditos: hay que anularlo desde la línea. Además, la tabla de la nómina tiene una columna nueva, "Crédito", y en pantallas angostas puede necesitar desplazamiento horizontal.
8. **Flujo real.** Los pagos registrados no se trasladan al flujo real, por decisión: evita duplicar lo que se ingresa a mano. Queda pendiente definir esa conciliación.
9. **Excel del flujo.** Pago Préstamos sale como una sola línea. El detalle de capital, intereses y cargos solo se ve en pantalla y en Análisis CFO.
