# Informe de integración — rama `claude/fervent-bell-uu6ae8` (oct-2026)

> **Histórico.** El estado vigente está en `docs/estado-rama-2026-10.md` (el calendario afecta 11 meses, no 12; el inventario es de 138 tablas, no ~92).

Estado: **sin merge a `main` y sin publicar.** Todas las pruebas son **locales**: navegador real contra el build de la rama, con un Supabase falso y aislado y con hora de Chile. **Nada se verificó en producción**, porque la red de este entorno bloquea Vercel y Supabase.

## 1. Commits de esta ronda (separables)

| Commit | Cambio | ¿Cambia cifras? |
|---|---|---|
| `ee5eeb0` | Fechas `AAAA-MM-DD` leídas como fecha local | **Sí, en producción**: con hora de Chile, las cuotas que vencen un día 1 caían en el mes anterior |
| `95f071d` | Calendario semanal de los 63 meses; el Reporte arranca en la semana real; listado completo | Sí: ventana y totales del Reporte; cuotas de 2028 en adelante en su semana real |
| `88ce198` | `InputNumero`: entrar y salir sin escribir ya no es un cambio | No (evita reescrituras con fecha nueva) |
| `cab4009` | Fuente única de TC (`maestro_tc`) para saldos | Sí: Reporte Semanal y Saldos Bancos; Flujo, Dashboard, Consolidado y Excel no cambian con saldos históricos |
| `30ecf58` | KPI de capital pendiente de créditos | Sí: reemplaza la cifra fija Q1-26 en el Dashboard |
| `8ef9ad7` | Plan de recuperación (documento) | No |
| `8b9ea06` | `e2e.mjs` al día y detalle de saldo sin `<table>` | No |

## 2. Antes / después con el mismo juego de datos

Juego de datos fijo (`scripts/e2e/datos-comparacion.mjs`, ficticio):
- Saldos **históricos**: Allegria Foods USD 17.433 + CLP 95.000.000 guardado sin TC; Allegria Service CLP 50.000.000 con US$ 52.083,33; Mediterra EUR 50.000 con US$ 0; Allpa Perú PEN 380.000 con US$ 101.333,33.
- `maestro_tc` con USD-CLP, EUR-USD y USD-PEN manual.
- Créditos por defecto del repositorio.
- Navegador con hora de Chile. Captura: `scripts/e2e/comparacion.mjs`. Antes = build `55a26d1`, después = `8b9ea06`.

| Cifra | Antes | Después | Por qué |
|---|---|---|---|
| Mediterra · flujo neto Jun-26 | −55.784 | −90.434 | Cuota del 01-06-2026 (34.650) vuelve a junio: −55.784 − 34.650 |
| Mediterra · flujo neto Nov-26 | −37.934 | −3.284 | La cuota del 01-12 salía en noviembre: −37.934 + 34.650 |
| Mediterra · flujo neto Dec-26 | −553.284 | −37.934 | El bullet de 550.000 del **01-01-2027** estaba en Dec-26 (cambiaba de año): −553.284 + 550.000 − 34.650 |
| Mediterra · flujo neto Jan-27 | −3.284 | −553.284 | Recibe el bullet: −3.284 − 550.000 |
| Mediterra · saldo acumulado Dec-26 | −594.501 | −44.501 | +550.000 (el bullet se paga un mes después); Jan-27 queda igual en los dos casos (−597.784) |
| Reporte · saldo bancos grupo | USD 159.538 | USD 59.100 | Antes: 17.433 + 95.000.000/**950 fijo** + 50.000.000/950 × 80%. Ahora: 17.433 + 52.083,33 × 80% = 59.099,67; el CLP sin TC queda **sin paridad** y rotulado |
| Reporte · compromisos 8 semanas | USD 1.784.637 | USD 1.987.636 | Ventana desde la semana real (Oct S2 → Dec S1, antes Oct S1 → Nov S4), sin recorte a 50 y cuotas en su mes |
| Reporte · ingresos 8 semanas | USD 1.474.944 | USD 1.583.623 | Ídem |
| Dashboard · "Créditos Totales Q1-26" | 8.355.763 (fijo) | Capital pendiente 5.974.372 (6 sociedades) + JV 1.801.974 = 7.776.346 | Calculado desde Créditos al corte de hoy; incluye 1.647.854 de pagos vencidos sin marcar como pagados |
| Saldos Bancos, Dashboard bancos, saldo inicial consolidado | 69.516 / 243.136 | 69.516 / 243.136 | Sin cambio con saldos históricos (ya leían `rec.usd`); ahora marcados INCOMPLETO con detalle |

El salto de "Compromisos 8 Sem." no es todo nuevo dinero. Al correr la ventana una semana, entra **Dec S1**, que concentra los valores mensuales sin desglose (regla S1). Es una consecuencia de la regla de imputación, pendiente de decisión (sección 4).

### Diferencia 117.433 vs 17.433 (punto 1)

Es de **cálculo**, no de redacción. Mismo saldo: Allegria Foods BICE USD 17.433 + BICE CLP 95.000.000 guardado con `usd: null`.

| Pantalla | Cálculo | US$ |
|---|---|---|
| Reporte (antes) | 17.433 + 95.000.000 / 950 (TC fijo) = 17.433 + 100.000 | 117.433 |
| Dashboard / Flujo / Excel | 17.433 + 0 (CLP sin conversión guardada, contado como 0 sin avisar) | 17.433 |
| Ahora, ambas | 17.433 · **INCOMPLETO** (CLP sin paridad, nombrada) | 17.433 |
| Ahora, al volver a guardar el CLP con TC 925,40 del 15-09 | 17.433 + 95.000.000 / 925,40 = 17.433 + 102.658,31 | 120.091,31 |

## 3. Evidencia (local)

| Prueba | Resultado |
|---|---|
| Suite jest, reloj UTC | 1.593 verdes, 0 fallas |
| Suite jest, `TZ=America/Santiago` (`npm run test:cl`) | 1.593 verdes, 0 fallas |
| Contratos de persistencia, anticipos, programas, respaldo aislado | 15/15 · 7/7 · 6/6 · verde · verde · 27/27 |
| `tc-politica.mjs` (navegador) | 14/14 |
| `e2e.mjs` (pantalla vs Excel recalculado, anticipos) | 4.028 comparaciones, 0 diferencias |
| `semanal-cuadre.mjs` / `consolidado-semanal.mjs` | ver resumen final del informe en el chat |
| `regresion-empresas.mjs` (8 empresas, pantalla vs Excel) | ver resumen final |

## 4. Riesgos y decisiones pendientes

1. **Producción no verificada.** Antes de publicar: habilitar la red y correr `prod-solo-lectura.mjs` con la cuenta de consulta (credenciales solo por variable de entorno).
2. **Calendario semanal:** en 12 de los 21 meses originales (Apr-26..Dec-27) la tabla parte una semana antes que el día 1, así que la primera semana real del mes cae en S2. Sus etiquetas son claves de "Datos reales por semana". Corregirlo exige migrar esas claves: decisión tuya.
3. **Regla S1** (mensual sin desglose → S1) produce saltos en ventanas semanales, como el de Dec S1. Sigue vigente porque lo pediste.
4. **Saldos históricos:**
   - Todos se ven como "TC histórico" hasta que se vuelvan a guardar.
   - Los que tienen `usd` null o 0 quedan sin paridad.
   - PEN requiere `USD-PEN` **manual** en `maestro_tc` con fecha a ≤ 5 días hábiles del saldo; si no, quedará sin paridad al guardarlo.
   - Los feriados no se descuentan, así que el límite es más estricto.
5. **Saldos Bancos** ya no convierte "en vivo": muestra la conversión guardada. Es un cambio de hábito para quien la usa.
6. **Capital pendiente:**
   - Incluye pagos vencidos no marcados como pagados (en los datos por defecto, 1.647.854): hay que depurar Créditos.
   - Que `monto` sea capital y `cuota` traiga intereses en Leasing es [Probable] por la forma de los datos.
   - Las series de cuotas mensuales usan un supuesto lineal.
7. **Zona horaria:** el arreglo cambia meses en producción para toda cuota con vencimiento día 1. Con los datos reales puede haber más casos que en los datos por defecto: revisar Mediterra (bullets del día 1) después de publicar.
8. **Respaldo:** sigue desactivado. auto-v4 cubre 1 de ~92 tablas y ningún documento (`docs/plan-recuperacion.md`). Las filas `backup_*` con credenciales siguen sin tocar.
9. **`SUPA_URL` fija en el código:** recuperar a un proyecto nuevo exige cambiar código (R1 del plan).

## 5. Propuesta de integración con rollback

**Por qué el rollback es seguro:** ningún cambio migra datos. Lo que la versión nueva escribe es compatible con la anterior:
- Un saldo nuevo agrega campos `tc*` y la versión anterior los ignora.
- Un `usd: null` lo lee como 0, igual que hoy.
- No se renombran claves ni etiquetas guardadas.

Por eso volver atrás no requiere tocar la base.

1. **Preview:** revisar el deploy de preview de la rama (Vercel) y, con la red habilitada, correr `prod-solo-lectura.mjs` (escrituras bloqueadas) contra el preview.
2. **Antes del merge:**
   - Descargar "💾 Respaldo" (ya sin credenciales).
   - Confirmar en el panel de Supabase el respaldo nativo del día.
   - Anotar el deployment de producción vigente (para "Promote" en Vercel).
3. **Merge con merge commit** (no squash): cada commit de la sección 1 se puede revertir por separado. Si se prefiere bajar riesgo, integrar en dos pasos:
   - **(a)** zona horaria, `InputNumero`, calendario, KPI de créditos y documentos;
   - **(b)** política de TC, después de cargar `USD-PEN` manual en `maestro_tc`.
4. **Después del deploy (mismo día):**
   - Mediterra Dec-26/Jan-27 contra Créditos.
   - Saldos Bancos: tiles de TC con fecha y fuente.
   - Reporte Semanal: KPI y "Ver listado completo".
   - Dashboard: capital pendiente.
   - Guardar UN saldo CLP de prueba y verificar que quede con TC, par, fecha y fuente.
5. **Rollback:**
   - Inmediato: en Vercel, "Promote" del deployment anterior (minutos, sin tocar datos).
   - Parcial: `git revert <commit>` del cambio que falle y redeploy.
   - Los saldos guardados con la política nueva siguen siendo legibles por la versión anterior.
