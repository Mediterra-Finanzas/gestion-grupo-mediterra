# Matriz de cierre · respaldo, cobertura de contratos, conflictos, diseño y correo

Corte 2026-09-10. Sin porcentajes de avance: hay tramos sin ejercer.
Cifras de **producción** leídas en solo lectura; cifras de **staging** rotuladas
aparte. No se mezclan.

Estados usados: **EJERCIDO** (medido), **NO EJERCIDO** (falta el tramo),
**EVIDENCIA** (disponible, sin prueba de recuperación), **DECISIÓN** (requiere a
una persona).

---

## 1 · Respaldo

| Tramo | Estado | Evidencia | Falta |
|---|---|---|---|
| Reserva atómica del lote | EJERCIDO | pg_cron staging, 3 corridas | — |
| snapshot → cifrado A/B → subida → READY → verificación | EJERCIDO en proceso | 14/14, 9 pasos, 42 filas, 7 identidades | — |
| Credencial sin identidad → evidencia incompleta → reintento | EJERCIDO | 22/22: estado `INCOMPLETO`, restore rechaza, reintento mismo snapshot | — |
| **Disparo programado remoto → READY → descarga → restauración** | **NO EJERCIDO** | rama `runtime/staging-respaldo` lista y empujada | proyecto de Vercel (guía de panel) |
| Entrega SMTP real del aviso | NO EJERCIDO | composición 10/10 | mismo proyecto de Vercel |
| Respaldo nativo de producción | NO VERIFICADO | — | captura de Database → Backups |
| Adjuntos productivos (1.657 objetos, 837,62 MB) | NO RESPALDADOS por este paquete | mecanismo 17/17 en staging | PLATFORM SECURITY |
| Bitácora `audit_log` | EVIDENCIA | 8.164 eventos con `valorAnterior` | ver abajo |

**AUTOMATIZACIÓN COMPLETA = NO EJERCIDA.**

### Reconstrucción aislada desde la bitácora — ejecutada, no probada

Ámbito: `osiris / Contratos`. En memoria, nada escrito. Contra un snapshot
independiente de producción (Fase 0, T = 2026-08-12, sha256 del archivo
recalculado `2e8218b5aba1…`, igual al del manifiesto). Coherencia previa: cero
eventos dentro del intervalo en que la fila no cambió.

| Comprobación | Resultado |
|---|---|
| Integridad · enlaces entre eventos | 574 íntegros · **19 rotos** |
| Integridad · último evento vs valor actual | 95 íntegros · **15 rotos** |
| No verificables por corte a 200 caracteres | **696** |
| Cobertura · reconstruido en T vs snapshot en T | 1.108 campos iguales · **109 distintos** · 6 no reconstruibles |
| Conservación · replay T → hoy | 95 vuelven al valor de hoy · **15 no** · 27 no verificables |

**Veredicto: RECUPERACIÓN NO PROBADA.** Dos causas medidas:

1. La bitácora corta cada valor a 200 caracteres (`valA.slice(0,200)`). En
   `osiris / Contratos`, 708 de 1.399 eventos están cortados; 655 son
   `rpPlantaCuotas`. Los arreglos no se pueden reconstruir.
2. Hay cambios que no pasan por la bitácora: los 109 campos distintos se
   concentran en `anexo1/2/3`, `rpPlantaCuotas` y `plantaciones`, y las roturas
   incluyen campos simples editados sin evento.

Otras secciones (nóminas: 3.652 eventos, cero cortados) no se reconstruyeron y
no se declaran nada. La bitácora no sustituye el respaldo nativo ni el de adjuntos.

---

## 2 · Cobertura de los 23 contratos — producción

Evaluados desde el **contrato**, con o sin hecho persistido. Ninguno desaparece.

| Cantidad | Valor |
|---|---|
| Contratos evaluados | **23** |
| Líneas de concepto (contract fee, royalty planta, royalty comercial) | 69 |
| Cuotas de royalty planta | 46 |
| Hechos de ingreso persistidos | 5 |

**Contratos por clase** (un contrato con varias líneas toma la más exigente:
conflicto > pendiente > información > cerrado > no aplica):

| Clase | Contratos |
|---|---|
| Conflicto | 1 |
| Pendiente confirmado | 4 |
| Información pendiente | 14 |
| Cerrado con evidencia | 4 |
| No aplicable | 0 |
| **Suma** | **23** |

**Líneas por concepto:**

| Concepto | Conflicto | Pend. confirmado | Info. pendiente | Cerrado | No aplica |
|---|---|---|---|---|---|
| Contract fee | 1 | 1 | 8 | 13 | 0 |
| Royalty planta | 0 | 4 | 13 | 3 | 3 |
| Royalty comercial | 0 | 0 | 5 | 0 | 18 |

**Contract fee, importes contractuales** — ninguno es deuda confirmada ni
facturación exigible:

| Rótulo | USD |
|---|---|
| Pendiente de conciliación (sin factura ni pago registrados) | 240.000 |
| Con factura y sin pago registrado | 30.000 |
| En conflicto | 30.000 |
| Cerrado con evidencia | 390.000 |
| **Cuadre** 240.000 + 30.000 + 30.000 + 390.000 | **690.000 = 23 × 30.000** |

De los 13 cerrados, 10 tienen fecha de pago; 3 tienen factura y pago marcados sin fecha.

**Responsable interno:** asignado en 0 de 23. Toda línea con pendientes es hoy
tarea de configuración.

**Staging** tiene otra distribución (pendiente confirmado 1, información
pendiente 21, conflicto 1): son datos de prueba y no representan producción.

| Pendiente | Tipo |
|---|---|
| Conciliar los 240.000 contra facturación real | DECISIÓN |
| Asignar responsable interno por contrato | DECISIÓN |
| Definir mes de cobro de royalty comercial en los 5 contratos con base comercial | DECISIÓN |
| Registrar fecha de evento en las cuotas que no la tienen | DATO |

---

## 3 · Conflicto de contract fee (contrato `…2ba225`)

| | Contrato (pestaña Contratos) | Registro persistido (pestaña Fee Entrada) |
|---|---|---|
| Estado | pagado | por cobrar |
| Número de factura | presente (2 caracteres) | vacío |
| Fecha de pago | 2024-09-25 | vacía |
| Importe | 30.000 | 30.000 |

**Procedencia reconstruida:**

- **Causa de diseño.** El factura/pago del fee se edita en el contrato; la
  pestaña Fee Entrada muestra una fila persistida (`feeEntrada[]`, prefijo `fe_`)
  que **no lee el contrato**. El código declara al contrato como fuente de verdad
  (`derivarContractFeeDesdeContratos`, prefijo `cf_`), pero esa derivación no es
  la que muestra la pestaña. Dos fuentes, dos pantallas, sin sincronía.
- **Orden de cambios.** La bitácora empieza el 2026-07-10 y tiene **cero**
  eventos sobre la fila `fe_` y sobre `cf_`. El único evento de los campos del
  fee es un cambio de `fechaContrato` (2024-10-01 → 2024-10-09) el 2026-08-25,
  por un actor con rol gerente técnico. **Los dos estados son anteriores a la
  bitácora**: no se puede reconstruir quién ni cuándo los fijó.
- **Documentos en el sistema.** Contrato y cuatro anexos, enlazados a
  SharePoint. **Ningún campo guarda la factura ni el comprobante de pago.**
- **Observación sin decidir.** La fecha de pago registrada (2024-09-25) es
  anterior a la fecha de contrato vigente (2024-10-09), que se editó después.

**Tratamiento:** alerta de conflicto visible; el contrato **entero** queda fuera
de todo correo de facturación y cobranza (verificado en staging). No se admite
registrar ajustes sobre él.

| Pendiente | Tipo |
|---|---|
| Cotejar con la factura y el comprobante de pago reales, que están fuera del sistema | DECISIÓN |
| Decidir qué registro corrige al otro | DECISIÓN |
| Eliminar la doble fuente: que Fee Entrada lea el contrato | DISEÑO, requiere tu aprobación |

---

## 4 · Notas de crédito y anulaciones

Reglas y controles preparados en `PROPUESTA-NOTAS-CREDITO.md`. Sin implementar,
sin cambiar saldos.

- Anulación visible y trazable: motivo, actor y fecha obligatorios; nunca borra.
- Nota de crédito vinculada a una factura existente, con respaldo documental y hash.
- Ajustes anclados al contrato; contratos en conflicto no admiten ajustes.
- Permiso reutilizado para registrar: `tabPermisos.royalties = "editar"`.
- **Brecha identificada, no concedida:** no existe capacidad para *aprobar* un
  ajuste; quien registra hoy lo daría por bueno.

---

## 5 · Diseño

| Punto | Estado |
|---|---|
| Qué sirve `runtime/staging-respaldo` | **Solo el harness de diseño y la función de respaldo.** La aplicación completa no se monta |
| Cómo se conecta el frontend | **Directo a Supabase staging desde el navegador**, con la clave publicable. No pasa por el backend |
| "Cero URLs de Supabase en el bundle" | **Corregido:** se midió en un build sin la variable. Con `REACT_APP_UX_SUPABASE_URL` el bundle contiene la URL de staging, y la referencia productiva aparece una sola vez, en el guardia que se niega a leer |
| Artefacto compilado de la rama, servido estático con las variables de staging | EJERCIDO · `CI=true`, compila; bundle con la URL de staging y la referencia productiva una sola vez, en el guardia |
| Qué host contactó el navegador | EJERCIDO · solo `nlvfjp….supabase.co` (staging); producción: ninguno |
| Navegación lateral | EJERCIDO · riel con los 8 destinos |
| Los 23 contratos en la bandeja | EJERCIDO · 5 pestañas por clase, 23 evaluados, 69 líneas, cuotas y hechos por separado |
| Conflicto → ficha completa del contrato | EJERCIDO · la fila de conflicto abre la ficha (ingresos, base productiva, documentos, relacionados) |
| URL compartible | **NO EJERCIDO** · `https://mediterra-respaldo-staging.vercel.app` si Vercel asigna ese nombre; se confirma en el panel |

Datos del harness: **staging**. Sus cifras (pendiente de conciliación USD 450.000,
cerrado con evidencia USD 210.000, en conflicto USD 30.000; suma 690.000) no son
las de producción de la sección 2.

---

## 6 · Correo

| Punto | Estado |
|---|---|
| Composición por responsable + consolidado CFO | EJERCIDO · staging 13/13 con destinatarios sintéticos |
| Contrato en conflicto excluido entero | EJERCIDO · la prueba encontró que se colaba por sus otras líneas; corregido |
| Sin responsable → tarea de configuración visible | EJERCIDO |
| Sin duplicados en el día, historial sin correos en claro | EJERCIDO · `osiris_aviso_envio` en staging |
| Modo prueba rechaza dominios reales | EJERCIDO |
| Entrega SMTP real | NO EJERCIDO |
| Envíos reales | BLOQUEADO hasta: cobertura conciliada, responsables asignados, destinatarios aprobados |
