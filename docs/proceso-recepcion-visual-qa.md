# Visual QA — Recepción y Trazabilidad (macrobloque A, parcial)

Estado: **Nueva Recepción = FIX aplicado** (pendiente veredicto live del CFO).
`VISUAL QA CERTIFIED = NO` · `T10C-FECHA-OPERACIONAL-GAP = OPEN` · `PRODUCTION IDENTITY / AUTOMATIC SCHEDULER / EMAIL E2E = BLOCKED`.

## Fixes de listado/detalle de Recepciones (T11-VIS, certificados live)

- **T11-VIS-CONTRACT-DETAIL-01** — `estadoContractualCliente` / `clienteHabilitadoParaOperar` omiten `p_fecha` cuando no viene (`rpcFecha`), en vez de enviar `null` que anulaba el `DEFAULT current_date` del SQL.
- **T11-VIS-CONTRATO-01** — columna CONTRATO del listado: `ok→"Vigente"`, niveles con tono, `info→"—"`.
- **T11-VIS-QC-01** — resumen QC del listado (`qcListadoResumen`): si no hay QC por lote pero sí de cabecera, muestra el resultado real (`Rechazado · QC cabecera`), nunca "sin QC".
- **T11-VIS-ORIGIN-01** — `loteSinOrigen`: lote legacy sin origen → "Origen no informado" (listado/detalle) sin inferir de la cabecera.
- **T11-VIS-P1-01/02** — orden de listados Despachos/Resultados por columnas existentes.

## Fixes de Nueva Recepción (NR-02 … NR-05)

- **NR-02 · Origen agrícola no informado** — `evaluarOrigenLote`: al agregar un lote sin Productor/Predio/Cuartel completos se exige **confirmación consciente** ("Registrar sin origen" / "Cancelar"). Si el Productor existe pero falta Predio/Cuartel, el mensaje nombra exactamente la dimensión faltante. No se infiere desde la cabecera, no se fabrica snapshot, no se persiste un motivo inexistente, no se usa localStorage.
- **NR-03 · Temporada obligatoria** — eliminado el placeholder `"s-t"`. Sin temporada seleccionada no se llama al correlativo; mensaje "Seleccioná una temporada antes de registrar…". El backend (`proc_fn_siguiente_correlativo`) ya rechaza temporada nula; el fix evita que el frontend evada ese guard generando folios malformados (`REC--`).
- **NR-04 · Copy QC de cabecera** — `textoQcCabecera`: aclara que el QC de cabecera es fallback mono-especie y que las demás especies requieren su QC por lote en el Detalle. El QC por lote sigue siendo autoridad.
- **NR-05 · Recuperación de borrador** — acción "Continuar" en listado y Detalle → reabre `recepcion_nueva` con `recepcion_id`, re-hidrata cabecera + lotes ya persistidos (read-only, badge "persistido"). Los lotes persistidos **nunca** se reenvían a la RPC de ingreso; solo se agregan lotes nuevos.
  - **Autoridad de masa (crítica)**: el kg de cada lote persistido se toma del **movimiento de entrada inicial del ledger** (`kgEntradaPorLote`, misma autoridad que `proc_fn_cerrar_recepcion`), **no de `on_hand`** (que neto de salidas posteriores).
  - Idempotencia garantizada por `UNIQUE(empresa_id, codigo)` en `proc_lote` + correlativo fresco por ingreso. Simulación transaccional A–J (con ROLLBACK): tras fallo de lote 2, lote 1 aparece una sola vez (3000 kg); al agregar lote 2 el movimiento de lote 1 no se duplica; cierre concilia (dif 0). Sin cambios de ledger/RPC/schema.

### NR-05 · Semántica exacta de kg (rehidratación vs saldo vs cierre)

Tres cantidades que NO deben confundirse:

- **kg asignados originales (rehidratación del borrador)** = `kgEntradaPorLote` = Σ(`cantidad`) de los movimientos `naturaleza='entrada'`, `ref_tipo='recepcion'`, `objeto_tipo='lote'` de esa recepción. Es lo que el operador ingresó/asignó al lote. **El helper filtra solo entradas; NO resta salidas.**
- **Saldo CURRENT (`on_hand`)** = físico actual del lote = entradas − salidas − reservas… posteriores. Cambia con cualquier movimiento posterior (traslado, ajuste, consumo). **NO se usa para el formulario de recuperación.**
- **kg de cierre** (`proc_fn_cerrar_recepcion`) = Σ(entrada) − Σ(salida) **sobre `ref_tipo='recepcion'`** de la recepción. Es la autoridad del cuadre de masa.

Demostración en DB (transaccional, ROLLBACK): lote recibe 4000 → `on_hand=4000`; una salida posterior de 1500 (ajuste) → `on_hand=2500` (el saldo CURRENT cambió), pero la **rehidratación sigue mostrando 4000** (entrada original) y el cierre sobre `ref recepción` sigue en 4000 (el ajuste no está ligado a la recepción). Test unitario `kgEntradaPorLote` incluye una salida con `ref_tipo='recepcion'` y verifica que **igual devuelve 4000** (no es `on_hand` ni entrada−salida).

Diferencia documentada, no oculta: rehidratación = entradas asignadas; cierre = entrada−salida sobre la ref de la recepción. Coinciden durante el armado normal de un borrador (no hay salidas ligadas a la recepción antes del cierre); solo divergirían si existiera una salida con `ref_tipo='recepcion'`, que el flujo de ingreso no genera.

## Gap abierto — T10C-FECHA-OPERACIONAL-GAP = OPEN

La fecha operacional NO se materializa en este lote. Diagnóstico CURRENT:

- `proc_recepcion.fecha` existe (`timestamptz DEFAULT now()`); `crearRecepcion` la omite → server now().
- El **Reporting Daily** (`proc_fn_informe_diario_operacion`) agrupa por `(proc_movimiento.fecha AT TIME ZONE 'America/Santiago')::date`, es decir por la **fecha del movimiento del ledger**, no por `recepcion.fecha`.
- `proc_fn_ingresar_lote_ubicado` sella `movimiento.fecha = now()` **sin parámetro** → hoy no hay forma de declarar una fecha operacional que fluya al informe.
- `proc_planta` no tiene columna timezone; la tz autoridad ('America/Santiago') ya vive en el backend (no en el navegador).

**Conclusión**: permitir fecha operacional real (ingreso tardío / turno anterior) que sea consistente con el Reporting Daily requiere parametrizar `movimiento.fecha` en la RPC de ingreso — **cambio de backend/ledger fuera del alcance de este lote**. Requiere un gate de diseño y autorización propio (distinguir fecha física / operacional / auditoría, permisos, auditoría del backdating). Mientras tanto, CURRENT registra en tiempo real con timestamp del servidor.
