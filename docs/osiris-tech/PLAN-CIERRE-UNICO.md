# Plan de cierre único — tres paquetes separables

Fecha de corte: 2026-09-09. Nada desplegado en producción. Nada publicado a `main`.

Los paquetes no comparten archivos y pueden avanzar en paralelo. La única
dependencia cruzada está marcada explícitamente.

| # | Paquete | Rama | Toca |
|---|---|---|---|
| A | Respaldo y continuidad | `respaldo/candidato-produccion` | `src/data/`, `scripts/respaldo/`, `sql/respaldo/` |
| A2 | Riesgo de rama productiva | `integracion/main-mas-suspension-auto-v3` | `src/App.jsx` |
| B | Incidente de adjuntos | por crear | Storage y policies, ningún archivo de A |
| C | Osiris: cobranza y UX | por crear desde `worktree-agent-a7145ad26d1b8f9fb` | `src/ux/`, `src/OsirisModule.jsx` |

---

# Paquete A · Respaldo y continuidad

## A2 · Riesgo de la rama productiva — LISTO PARA REVISIÓN

Rama `integracion/main-mas-suspension-auto-v3` = `27b423b`.

Medido:

- `origin/main` está en `699b1d8`, que es **el padre directo** de `27b423b`.
- `git rev-list --count 27b423b..origin/main` = **0**. Ningún carril ha aterrizado
  en `main` desde el hotfix, así que no hay cambios posteriores que preservar.
- `git merge-base --is-ancestor origin/main 27b423b` = **verdadero**: la
  integración es un fast-forward. No pisa nada, no reescribe nada, no necesita
  force-push ni restaurar una base antigua.
- Diff contra `origin/main`: 2 archivos, +142 / −67.
- `qa-hotfix-a.test.js` **9/9 PASS**.
- `CI=true react-scripts build` **compila** (verificado en checkout limpio de la
  rama, con `node_modules` enlazado; el intento anterior falló por mezclar
  archivos entre ramas, no por la rama).

Advertencia de coordinación: `hotfix/b-endpoint-respaldo` y
`respaldo/candidato-produccion` salieron de `699b1d8` y **no contienen** la
suspensión ni su test. Si alguno se integra a `main` antes que A2, `main` queda
sin la suspensión. **A2 debe entrar primero.**

No se publica: un push a `main` puede disparar un deploy. Queda a la espera de la
frase de autorización.

## A1 · Automatización en staging

**Quién ejecuta el tramo snapshot → cifrado A/B → subida → READY.**
Una función serverless en Vercel invocada por Vercel Cron. No es un mecanismo
nuevo: el proyecto ya opera exactamente ese patrón en producción —
`vercel.json` declara `/api/proc-reporting-daily-cron` a las `0 23 * * *`, con
`cronAutorizado(Bearer CRON_SECRET)`, acceso `service_role` y envío por
`api/send-email.js`. El respaldo debe reusar ese patrón, no inventar otro.

**AUTOMATIZACIÓN COMPLETA = NO EJERCIDA.**
Lo ejercido hoy en staging es solo la reserva del lote: `pg_cron` disparó
3 corridas exitosas (18:54, 18:55, 18:56 UTC), `app=pg_cron`, backend local del
servidor, sin intervención de esta computadora. El tramo de snapshot, cifrado y
subida **no corrió por el programador**, porque staging no tiene ningún runtime
desplegado y esta máquina no tiene CLI de Supabase ni credenciales de Vercel.

Lo que no se hizo, a propósito: implementar el respaldo dentro de Postgres con
`pgsodium`/`http`. Era técnicamente posible y habría dado un PASS, pero crea una
segunda implementación del mismo respaldo, que es exactamente lo prohibido.

**Falta**, y es lo único que falta: un runtime desplegado apuntando a staging.
Se desbloquea con un Preview de Vercel de la rama del respaldo con variables de
entorno de staging. Eso también desbloquea el Preview del paquete C.

## A3 · Salud verificada — CERRADO

La salud dejó de medir el último disparo. Ahora mide el último lote
**verificado**: descargado, descifrado y restaurado en aislamiento
(`respaldo_lote.verificado_at`). Un disparo exitoso que sube basura ya no deja la
alarma en verde.

Ocho ramas de veredicto, todas probadas, incluida la rama OK y la nueva
`hay lotes publicados pero ninguno verificado`. **8/8 PASS.**

## A4 · Aviso por canal operativo — PARCIAL

`avisoRespaldo.js` reusa `api/send-email.js` (SMTP Microsoft 365), el canal que
ya opera el informe diario en producción. **10/10 PASS** contra la salud real de
staging: compone, no repite el mismo veredicto dentro de 12 h, avisa también la
vuelta a la normalidad, no filtra claves ni rutas, y no finge haber avisado
cuando no hay destinatarios.

**ENTREGA SMTP REAL = NO EJERCIDA.** `SMTP_*_USER` y `SMTP_*_PASS` viven en
Vercel. Se cierra con el mismo Preview de A1.

## A5 · Horario — DECLARADO

Cadencia diaria `0 7 * * *` **en UTC**. Equivalencia en Chile, medida con la base
de zonas horarias, no estimada:

| Período | Offset | 07:00 UTC en Chile |
|---|---|---|
| 2026-01-01 → 2026-04-05 | UTC−3 | **04:00** |
| 2026-04-06 → 2026-09-06 | UTC−4 | **03:00** |
| 2026-09-07 → 2027-04 | UTC−3 | **04:00** |

Transiciones medidas: **2026-04-06** y **2026-09-07**.

El horario se expresa en UTC a propósito. Un cron en hora local de Chile salta un
día o lo duplica en la madrugada del cambio de hora; en UTC la hora local se
corre 60 minutos dos veces al año, pero nunca falta ni sobra una corrida.

## A6 · Adjuntos: mecanismo — CERRADO en staging

`respaldoAdjuntos.js`, **17/17 PASS** contra Storage real. Direccionamiento por
contenido: cada archivo se guarda bajo su SHA-256.

Probado, no supuesto:

- manifiesto con bucket, ruta, nombre, bytes, mime, SHA-256 y **vínculo con la
  fila** que lo referencia; los huérfanos se declaran, no se callan;
- deduplicación: 3 archivos, 2 contenidos → 2 subidas; segundo respaldo, 0 subidas;
- **borrado recuperable**: archivo eliminado del origen, recuperado byte a byte;
- **sobrescritura recuperable**: la versión previa se recupera con el hash del día
  del respaldo, mientras el origen conserva la nueva;
- **permisos separados**: la anon key no lee ni escribe el almacén, sobre la misma
  ruta exacta donde el backend sí lee 4.009 bytes (el control de existencia hace
  que el DENY signifique algo);
- **restauración aislada**: escribe en un prefijo de ensayo, nunca sobre el bucket
  original — verificado después de la restauración;
- contenido alterado en el almacén → DENY por SHA.

Falta: correrlo sobre los volúmenes reales (1.657 objetos, 837,62 MB) y decidir
retención del almacén de contenido.

---

# Paquete B · Incidente de exposición de adjuntos

**Separado de A a propósito.** A no toca policies ni buckets; B no toca
`src/data/` ni `scripts/respaldo/`.

## Exposición comprobada

Metodología: se prueba primero que el objeto **existe** (el listado autoritativo
de Storage declara ruta y tamaño), y recién entonces se pide **esa misma ruta
exacta** con cada identidad. Un `not_found` aislado no probaría nada.

| Bucket | Objeto | Sin credencial | Con anon key | Ruta pública |
|---|---|---|---|---|
| `frisku-docs` | PDF de 506.707 B | **200 · 506.707 B** | 200 · 506.707 B | 200 · 506.707 B |
| `nominas-docs` | PDF de 32.190 B, carpeta `nominas/allegria_foods/` | 400 `NoSuchBucket` | **200 · 32.190 B, cabecera `%PDF-1.4`** | 400 |

Contraprueba en staging: sobre la ruta exacta donde el backend descarga 789
bytes, la anon key recibe `NoSuchKey`. Es decir, **Storage devuelve `NoSuchKey`
también cuando deniega un objeto que existe**. Sin el control de existencia, ese
código no distingue ausencia de denegación. Con el control, aquí sí distingue.

Conclusión: `frisku-docs` es público; `nominas-docs` es privado a la ruta pública
pero abierto a la anon key, que viaja en el bundle del frontend.

## Explotación — NO EVALUADA

**No hay evidencia presentada de descargas por terceros.** Exposición
comprobada no es explotación ocurrida. Determinarlo requiere los logs de Storage
del panel; no los tengo y no los infiero.

## Cobertura previa de los adjuntos — corregido

No afirmo que carezcan de todo respaldo. Lo verificado:

- **Este paquete no los incluye.** Confirmado.
- **Ningún código del repositorio copia Storage.** Verificado: cero coincidencias
  de `copyObject`, `/storage/v1/object/copy` o equivalentes en `src/`, `api/`,
  `scripts/`.
- **Respaldo nativo de Supabase: PENDIENTE DE VERIFICAR.** La documentación de
  Supabase indica que los backups de base no incluyen los objetos de Storage,
  pero no lo he verificado en este proyecto y no lo doy por cierto.

## Trabajo del paquete B

1. **Dueño**: por confirmar. Debe ser una sola persona, porque toca tres carriles.
2. **Inventario y consumidores**: `frisku-docs` (869 obj / 527,10 MB, carpetas
   `embarques/…`) lo consume FriskuComercial; `nominas-docs` (788 obj /
   310,52 MB, carpetas por sociedad) lo consume el Expediente Digital de Nóminas;
   `rendiciones/` dentro de `frisku-docs` lo consume RendicionesModule, y ahí
   cargan **todos** los trabajadores. `proc-docs` está vacío en producción.
3. **Preservación primero**: ningún cierre antes de tener los 1.657 objetos
   respaldados con el mecanismo de A6.
4. **Ruta de acceso autorizado antes de cerrar**: URLs firmadas con expiración,
   emitidas por servidor. `expedienteHelpers.js` ya usa URLs firmadas para
   `nominas-docs`; hay que verificar que Frisku y Rendiciones también, y recién
   entonces cerrar. **No se cierra ningún bucket ni policy sin demostrar antes que
   las personas autorizadas siguen viendo sus documentos.**
5. **Sin modificaciones simultáneas**: ventana única coordinada con Frisku,
   Nóminas y Allegria Service.

---

# Paquete C · Osiris: cobranza y mejora visual

## C1 · Fuentes canónicas — IDENTIFICADAS

Leídas de la fila `osiris` de producción (solo lectura, 15 claves de primer
nivel, actualizada 2026-09-04).

**Hitos contractuales** — viven en `contratos[]` (23 contratos):

| Flujo | Campos del hito |
|---|---|
| Contract Fee | `montoContractFee`, `tipoContractFee`, `contractFeeEstado`, `contractFeeNFact`, `contractFeeFechaPago`, `contractFeePagado` |
| Royalty Planta | `rpPlantaCuotas[]` = `{id, descripcion, fechaEvento, fechaPago, nFact, nPlantas}` |
| Royalty Comercial | `rcCohortes[]`, `rcInicioTemporada`, `rcMesCobro`, `mesFacuracionRC`, `rcPagos`, `valorRoyaltyComercial` |
| Órdenes de compra | `ordenesCompra[]` = `{n_oc, fecha_oc, estado, plantacionIds}` |

**Tablas de hechos derivadas**, marcadas `_fromContract`: `feeEntrada` (n=1),
`royaltyPlanta` (n=3), `royaltyComercial` (n=1), `feeViveros` (n=0).
La derivación contrato → hecho **ya existe**. No se crea otra.

**Vacíos reales — no se inventan:**

| Falta | Evidencia | Consecuencia |
|---|---|---|
| Fecha de vencimiento de factura | `"vencimiento"` y `"fechaVencimiento"`: **0 apariciones** en el blob productivo | Sin esto no hay "vencidos" ni "por vencer". Hay que definir la regla (condición de pago por contrato) y de dónde sale. **Decisión del CFO.** |
| Notas de crédito y anulaciones | 0 apariciones | No se puede netear ni excluir lo anulado |
| Cobros parciales | El código existe en `OsirisModule.jsx` (líneas ~397-487) pero `"cobros"`: 0 apariciones en producción | El saldo pendiente hoy es binario `pagado` sí/no |
| Responsable por factura | 2 apariciones | Hay `clientes[].contactoCobranza`; falta el responsable interno |

Regla que se respeta: **no todo devengo es facturable.** El disparador de
facturación es el hito (`fechaEvento`, `rcMesCobro`, `contractFeeEstado`), no el
devengo económico. Las reglas económicas aprobadas no se tocan.

Erratas detectadas, no corregidas en silencio: el campo se llama
`mesFacuracionRC` (falta la «t») y `plantaciones[].nPlantas` tiene un `-5` en
producción.

Fechas civiles de Chile: `America/Santiago`, con las transiciones medidas en A5.

## C2 · Componentes existentes — IDENTIFICADOS, SE REUSAN

`src/ux/` ya existe en `worktree-agent-a7145ad26d1b8f9fb` (commit `b56bf1b`),
con 12 componentes React y 4 suites de test, y **no está montado en `App.jsx`**:

| Objetivo del CFO | Componente que ya existe |
|---|---|
| Navegación lateral compacta | `RielNavegacion.jsx` |
| Inicio ejecutivo con pendientes y acciones | `HomeEjecutivo.jsx` + `PanelAlertas.jsx` |
| Tablas legibles | `TablaDensa.jsx` |
| Ficha completa de contrato | `Ficha360.jsx` |
| Derivaciones | `selectores.js` — ya trae `alertasAccionables()`, `contractFeePorCobrar()`, `kpisEjecutivos()`, `ficha360()`, `filasContratos()` |

Las tarjetas grandes del hub actual son `hubCardsOrder` en la fila `osiris`, y no
son el diseño final: `RielNavegacion` las reemplaza.

La bandeja de cobranza es **una extensión de `alertasAccionables()`**, que hoy
cubre vencimiento de contratos, firmas y «contract fee sin cobrar», pero no
aging. No es un módulo nuevo.

## C3 · Correo diario

Reusa `api/send-email.js` y el patrón de `proc-reporting-daily-cron.js`, que ya
resuelve idempotencia, timezone por config, y «una config que falla no frena las
demás». Historial y cierre al facturar o pagar: `proc_reporte_config` y su
ejecución idempotente son el molde. Destinatarios sintéticos en las pruebas.

## C4 · Preview

Preview de Vercel conectado **exclusivamente a staging**. Es el mismo
desbloqueo que necesitan A1 y A4.

---

# Lista de cierre

| # | Ítem | Paquete | Dueño | Depende de | Evidencia pendiente | Estimación |
|---|---|---|---|---|---|---|
| 1 | Integrar la suspensión a `main` | A2 | CFO autoriza · yo ejecuto | — | ninguna: 9/9 y build OK | 10 min tras autorización |
| 2 | Preview de Vercel → staging | A1/A4/C4 | quien tenga acceso a Vercel | 1 | despliegue existente | 1 h |
| 3 | Ejecución completa disparada por el programador | A1 | yo | 2 | snapshot→cifrado→subida→READY→restauración | 3 h |
| 4 | Entrega SMTP real del aviso | A4 | yo | 2 | correo recibido, destinatarios sintéticos | 1 h |
| 5 | Nombres, destinos y custodia de claves A/B | A | CFO define custodios | — | tres copias, A y B en sobres distintos | 1 h · **sin generar secretos** |
| 6 | Metadata del respaldo nativo | A/B | CFO | — | **pantalla Database → Backups**. Un DSN read-only da `archive_mode` y WAL, pero **no** da frecuencia, retención ni PITR: eso solo lo expone el panel o la API de gestión | 15 min |
| 7 | Dueño único del incidente de adjuntos | B | CFO | — | — | 15 min |
| 8 | Respaldar los 1.657 objetos reales | B | yo | 5, 7 | manifiesto + almacén + restauración aislada | 4 h |
| 9 | Verificar URLs firmadas en Frisku y Rendiciones | B | dueño de B | 7 | cada consumidor sigue viendo lo suyo | 3 h |
| 10 | Cerrar `frisku-docs` y la anon key de `nominas-docs` | B | dueño de B | 8, 9 | ventana coordinada, acceso autorizado demostrado | 2 h |
| 11 | Logs de Storage: ¿hubo descargas de terceros? | B | CFO | 7 | panel de Supabase | 30 min |
| 12 | Regla de vencimiento de facturas Osiris | C | **CFO decide** | — | de dónde sale la fecha de vencimiento | 1 h de decisión |
| 13 | Modelo de nota de crédito, anulación y cobro parcial | C | CFO define, yo implemento | 12 | sobre las fuentes canónicas, sin segunda verdad | 6 h |
| 14 | Extender `alertasAccionables()` a facturación y cobranza | C | yo | 12, 13 | tests sobre el blob real de producción | 6 h |
| 15 | Bandeja: cliente, contrato, concepto, moneda, fecha, atraso, responsable, acción | C | yo | 14 | reusa `TablaDensa` y `PanelAlertas` | 5 h |
| 16 | Correo diario por responsable + consolidado CFO | C | yo | 15 | destinatarios sintéticos, sin duplicados, con historial | 5 h |
| 17 | Montar `src/ux/` en Osiris | C | yo | 2 | Preview de staging, sin tarjetas grandes | 6 h |

## Autorizaciones que espero, cada una sobre un paquete concreto

1. **`AUTORIZO MERGE integracion/main-mas-suspension-auto-v3 → main`** — fast-forward
   verificado, 2 archivos, 9/9 tests, build OK. Es lo único que quita el riesgo de
   que un push revierta la suspensión en silencio.
2. **Preview de Vercel apuntando a staging** — desbloquea los ítems 3, 4 y 17.
3. **Dueño del incidente de adjuntos** — nada de B avanza sin eso.
4. **Regla de vencimiento de facturas** — nada de la cobranza de Osiris avanza sin eso.

Ninguna acción productiva se ejecuta antes de la frase de autorización
correspondiente.
