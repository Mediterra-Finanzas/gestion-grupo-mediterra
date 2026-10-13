# Créditos → 📥 Reportes (oct-2026)

Rama `claude/creditos-reportes`, creada desde `origin/main` 778a397. Sin merge, sin migraciones, sin despliegue.

## Qué hace

Una sub-pestaña de Créditos para consultar y descargar el detalle de créditos en Excel y PDF.
La pantalla, el Excel y el PDF salen de la **misma tabla** (`tablasReporte`), así que filtros, filas,
subtotales y encabezado coinciden.

| Archivo | Rol |
|---|---|
| `src/reporteCreditos.js` | Modelo puro: filtra, ordena y agrupa. **No recalcula la deuda.** |
| `src/reporteCreditosExport.js` | Excel (ExcelJS 4.4.0) y PDF (jsPDF 2.5.1 + autoTable 3.8.2), cargados desde cdnjs igual que hoy en Frisku y en el Reporte Semanal. Sin dependencias npm nuevas. |
| `src/ReportesCreditos.jsx` | Pantalla. Solo lee; no guarda nada. |
| `src/FinanzasModule.jsx` | +5 líneas: la pestaña y el render con `creditosVisibles`. |
| `src/reporteCreditos.datosPrueba.js` | Datos FICTICIOS para pruebas, vista previa y ejemplos. |

## De dónde sale cada cifra (creditos.js vigente)

- Estado del crédito, capital, intereses, cargos, sin desglose, vencido, por conciliar, pagado → `estadoCredito(créditoAlCorte, corte)`.
- Cuotas y su estado → `estadoCredito(...).vencimientos` (= `aplicarPagos` sobre `vencimientosCredito`), renovaciones incluidas (`R@R0@0`…).
- Pagos → `pagosVigentes`, `totalPago` (los anulados no se listan; la extinción se lista pero no entra a los subtotales de caja).
- TC → `infoTC(c, maestro_tc, corte)`: Maestros a la fecha de corte o TC declarado en el crédito (rotulado como hipótesis).

«Crédito al corte» = el crédito con solo los pagos de fecha efectiva ≤ corte, la misma regla que `posicionAlCorte`.

## Dos fechas

- **Fecha de corte**: fija el saldo de deuda, el estado de cada cuota (vencida si vence antes del corte) y el TC.
- **Rango del detalle (desde/hasta)**: elige qué cuotas (por **fecha de vencimiento**) y qué pagos (por **fecha efectiva**) se listan. No cambia el saldo. Inclusivo en ambos extremos. Un rango invertido bloquea pantalla y descargas.

Un pago con fecha posterior al corte se lista dentro del rango, rotulado «Posterior al corte», y no reduce el saldo.

## Filtros

Empresa, acreedor, estado del crédito (por defecto, todos salvo anulados), estado de la cuota, tipo de pago y rango.
**Empresa = deudor**: el modelo no tiene un campo «deudor» aparte; la empresa del crédito es la deudora (así lo
rotula el formulario). Hay un solo filtro y la pantalla lo dice.
Estado de la cuota y tipo de pago filtran el detalle, no la lista de créditos ni su saldo; el encabezado lo dice.

## Monedas

- Importes siempre en moneda original. Un total por moneda; nunca se suman monedas distintas.
- Total en USD = solo lo que tiene TC, con par, fecha y fuente listados. Si falta TC, el crédito se nombra y el total queda **INCOMPLETO**. Una empresa sin ningún TC muestra «sin TC», nunca 0.
- Capital confirmado y «por conciliar» van en columnas separadas.

## Perímetro

- Consolidado por defecto: las 6 sociedades línea a línea, con detalle por empresa y TOTAL GENERAL.
- Las JV (Allpa Farms, Allpa Farms Perú) van en un bloque aparte rotulado «no se suma al consolidado».
- Reporte por empresa: el logo de esa empresa. Consolidado: logo de Mediterra. Los logos se dibujan con su proporción natural dentro de una caja.

## Archivos

- Excel: hojas **Resumen**, **Créditos** y **Cuotas y pagos**; encabezado con logo, filtros, TC usados y avisos; valores numéricos (no texto) con formato por moneda; fila de títulos fija; filtro automático en las hojas de una tabla.
- PDF: A4 apaisado; logo, título y corte en cada página; encabezado de columnas repetido; subtotales inmediatamente después de las filas que suman (agrupadas por empresa y moneda). En el PDF se omiten tres columnas informativas por ancho (perímetro, desembolso, n.º de pagos); el Excel las lleva.

## Permisos

- La pestaña existe solo dentro de Créditos, que ya exige `puedoVer("creditos")`.
- Recibe `creditosVisibles` (filtrados por empresas autorizadas) y vuelve a pasar las empresas permitidas al modelo: una descarga no puede incluir una empresa que la pantalla no muestra.
- Descargar es leer: quien tiene Créditos en «ver» puede descargar lo que ya ve. No se amplió ningún permiso.
- Es protección de pantalla. La protección real sigue siendo servidor/RLS (pendiente, regla 13).

## Evidencia (alcance: local, Chromium emulado, Supabase falso, datos ficticios)

| Prueba | Resultado |
|---|---|
| `src/__tests__/reporteCreditos.test.js` (contra `posicionAlCorte`, `analisisCartera`, `vencimientosCredito`, `pagosVigentes`) | 28/28 |
| Suite jest completa, UTC y `TZ=America/Santiago` | 2.078 pasan, 0 fallan (74 omitidas: requieren `RECALC=1`/LibreOffice) |
| `CI=true npm run build` | sin advertencias |
| `scripts/creditos/ejemplos-reporte.mjs` (genera los ejemplos y los vuelve a leer) | 46/46 |
| `scripts/e2e/creditos-reportes.mjs` (app real; descargas desde la app) | 69/69 |
| Control: la misma prueba contra una variante que pasa TODOS los créditos al reporte | 7 fallas (detecta la fuga) |

Lo que el e2e cubre: consolidado por defecto, filtros combinados (empresa + estado de cuota + rango),
rango invertido, resultado vacío, por empresa con renovación y pago parcial, Excel descargado = pantalla
celda a celda, PDF con cada cuota y cada pago una sola vez, logos sin deformar, usuario restringido a Osiris
(ve y descarga solo Osiris), usuario sin acceso a Créditos (no ve la pestaña), y que abrir, filtrar y
descargar no escribe en la base (0 escrituras).

No probado: otros navegadores, dispositivos reales, Excel de escritorio (se leyó con ExcelJS, no con Excel),
datos reales, producción.

## Ejemplos

`docs/ejemplos/creditos-reportes/`: consolidado, consolidado oct–dic con filtro de estados, Osiris,
Allegria Service (CLP + renovación), Frisku (PEN sin TC → INCOMPLETO) y vacío, en Excel y PDF, más tres capturas.

## Decisiones pendientes

1. Si un usuario con Créditos en «ver» debe poder descargar (hoy sí, porque ya ve los mismos datos en pantalla). Si se quiere separar, sería una facultad nueva y no la creé.
2. La columna «TC» para UF se expresa como UF por US$ (0,0238), igual que el módulo. Si prefieres CLP por UF y CLP por US$ por separado, es solo presentación.
