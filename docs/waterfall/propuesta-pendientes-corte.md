# Flujo posterior al corte: propuesta de registro y criterios entre pantallas

Estado: **propuesta, no implementada**. Rama `claude/waterfall-perimetro` (sin integrar). Datos
de ejemplo ficticios. Ninguna pantalla fuera del Waterfall cambió.

## 1. Qué muestra hoy el Waterfall (rama candidata)

- **Proyección parcial** = saldo bancario al corte + flujo de los meses POSTERIORES al mes del
  corte. Rótulo: «Proyección parcial (USD): mes del corte pendiente de conciliar».
- **Mes del corte EXCLUIDO, pendiente de conciliar.** Se muestra su importe por sociedad, junto a
  la fecha del saldo de cada sociedad.
- **Simulación** «si TODO el flujo del mes del corte estuviera pendiente». No es el saldo
  correcto, ni un mínimo, ni un máximo: el pendiente real puede tener cualquier signo y tamaño.
- **Fechas distintas.** Si el total suma saldos a fechas distintas, se advierte: «no es la caja
  del grupo a una fecha común». Si una sociedad tiene cuentas con fechas distintas, se nombran
  las fechas: se toma la más reciente y lo ocurrido entre ellas puede estar o no en el saldo.
  - Datos ficticios: 6 fechas distintas, del 15-09 al 12-10-2026.
  - Con una segunda cuenta de Mediterra al 04-10 y la otra al 10-10, la pantalla y el Excel
    muestran los dos avisos.
  - **No verificado en producción.** Contar fechas por cuenta exige leer los saldos reales, y no
    hay autorización para eso.

## 2. Propuesta: entrada explícita de cobros y pagos pendientes desde el corte

Objetivo: reemplazar «mes del corte pendiente de conciliar» por cifras **declaradas**, sin
inferir nada.

**Qué se registra**, por sociedad y por fecha de corte:

| Campo | Contenido |
|---|---|
| Fecha esperada | posterior a la fecha del saldo y dentro del mes del corte |
| Importe | moneda original y US$ con el TC de la política vigente (maestro_tc) |
| Contraparte y concepto | |
| Línea del flujo | `categoría::etiqueta`, la misma identidad que usa la app |
| Origen | manual, o el movimiento fechado del que viene |
| Trazabilidad | usuario y fecha |

Además, una **declaración de cierre del mes del corte**: «el resto de la proyección mensual ya
está en el banco o no ocurrirá». Mientras no exista, el mes sigue «pendiente de conciliar». Nada
se da por pagado ni se pone en cero solo.

**Reutilizar lo que ya tiene fecha** (inventario sobre `main`). Se proponen como sugerencias que
la persona confirma o descarta, nunca como alta automática.

| Fuente | Fecha | Hoy alimenta el flujo | Uso propuesto |
|---|---|---|---|
| Créditos (`creditos.js` `vencimientosCredito` + `aplicarPagos`) | exacta, `fecha` de la cuota; estado pagada / pendiente | sí («Pago Préstamos», «Renovaciones») | sugerir las cuotas pendientes con fecha posterior al corte en ese mes |
| Programas y anticipos de Allegria (`programas.js` cuotas `fecha_prevista`, `realizaciones.fecha`) | prevista y real | sí, pero mensual (`mes`) | sugerir las cuotas vigentes con fecha prevista posterior al corte, menos lo ya realizado |
| addedLines / subLines con semanas (`vals["mes_sem"]`) | semana | sí | sugerir las semanas posteriores a la semana del corte |
| Nóminas (`nominas_<emp>`, ítems `fVenc`, `pagado`, nómina `estado`) | vencimiento por ítem | **no** | sugerir los ítems aprobados no pagados; hay que asignarles una línea del flujo |
| Rendiciones (`rendiciones`, `aprobada` → `pagada`, `pagadoEn`) | fecha real de pago | **no** | sugerir las aprobadas no pagadas como pago pendiente |
| Frisku PO (`frisku_po`, `estado` emitida/pagada, `fecha` de emisión) | solo emisión, sin fecha de cobro | **no** | sugerir cobros pendientes; la fecha esperada la pone la persona |

**Regla contra doble conteo.** Al declarar el mes del corte, el monto de cada línea del flujo de
ese mes se REEMPLAZA por la suma de sus pendientes declarados; no se suma encima. Una sugerencia
de una fuente que hoy no alimenta el flujo (nóminas, rendiciones, PO) debe asignarse a la línea
que ya la proyecta; si no, se contaría dos veces.

**Cuentas con fechas distintas.** La declaración se hace contra la fecha más reciente, mostrando
las otras. Para que el total sea caja a una fecha común, hace falta un saldo de todas las cuentas
a la misma fecha. Eso es operativo (actualizar los saldos), no un cálculo.

**Dónde guardarlo (decisión tuya):**

- **(a) Fila propia** `flujo_pendientes_corte`. Separada de la fila `finanzas`: no entra en sus
  conflictos de guardado y su permiso es propio. Recomendada.
- **(b) Campo nuevo dentro de `finanzas`.** Exige agregarlo al mapa de permisos por pestaña
  (`CAMPO_PESTANA`) y comparte el conflicto de toda la fila.

## 3. Diferencia de criterio entre pantallas (main c9c5792 + rama candidata)

| Pantalla | Saldo inicial | Desde cuándo proyecta | Mes en curso / del corte | Perímetro | Avisa fechas distintas |
|---|---|---|---|---|---|
| Flujo Empresas (mensual) | saldo bancario (último por cuenta) o saldo base | mes de HOY | completo | 1 sociedad | no; las notas del Excel listan cada cuenta |
| Flujo Empresas (semanal) | ídem | semana de HOY | semanas desde la actual | 1 sociedad | no |
| Excel del flujo (individual y consolidado) | ídem | mes de HOY | completo | 1 sociedad / 6 | notas por cuenta, sin aviso de fecha común |
| Consolidado (pantalla) | suma de sociedades | mes de HOY | completo | 6 + JV proporcional opcional | no |
| Reporte Semanal | ídem | semana de HOY | semanas desde la actual | 6 (Allpa Perú excluida) | no |
| Dashboard | solo saldos bancarios, sin proyección | — | — | «Saldo Banco Chile» = 6 sociedades **+ Allpa Farms al 100 %**; «Perú» = Allpa Perú | no |
| Waterfall (rama candidata) | saldo bancario al corte de cada sociedad | mes POSTERIOR al mes del corte de cada sociedad | excluido, pendiente de conciliar | 6; JV aparte o proporcional como vista gerencial | **sí** |

Consecuencias:

- Con los mismos datos ficticios, el cierre 2026-2027 del Consolidado (2.181.662) y la proyección
  parcial del Waterfall (2.356.064) difieren en 174.402. Es el octubre de las cinco sociedades con
  corte en octubre, que el Consolidado suma completo. Ninguno de los dos es el saldo final
  definitivo.
- Una sociedad con saldo de un mes anterior (Allegria Foods, 15-09) se proyecta desde el mes de
  hoy en todas las pantallas salvo el Waterfall: su flujo posterior al 15-09 de septiembre no
  aparece en ninguna proyección.
- El Dashboard suma Allpa Farms (JV) al 100 % junto a las subsidiarias en «Saldo Banco Chile».
  Es un perímetro distinto al del Consolidado.

## 4. Propuesta común (antes de integrar)

1. **Una función única** de posición de caja por sociedad. Devuelve el saldo por cuenta con su
   fecha, la fecha de corte, el mes del corte, el estado del mes del corte («pendiente de
   conciliar» o «declarado», con sus pendientes) y la proyección. La consumen Flujo Empresas,
   Consolidado, Reporte Semanal, Dashboard, Waterfall y los Excel. Es el mismo patrón de fuente
   única que ya se usa para el TC de los saldos.
2. **Mismo rótulo en todas.** Mientras el mes del corte no esté declarado, el resultado se llama
   «proyección parcial».
3. **Mismo perímetro declarado.** 6 sociedades; JV aparte; la inclusión proporcional como vista
   gerencial. El Dashboard separaría Allpa Farms de «Saldo Banco Chile».
4. **Mismo aviso de fechas distintas** en todas las pantallas y en los Excel.
5. **Orden.** Primero la entrada de pendientes (sección 2, opción a), con sus pruebas. Después
   migrar las pantallas una por una, cada una con su prueba pantalla = Excel. Ninguna se cambia
   antes de que apruebes el criterio.
