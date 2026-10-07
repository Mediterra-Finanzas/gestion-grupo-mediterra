# Propuesta de experiencia por perfil — Mediterra Hub (oct-2026)

**Estado:** propuesta. Nada de esto está en la app ni se publica: es un prototipo dentro de la rama (`prototipo/perfiles-2026-10/`), fuera del build y con datos ficticios. El rediseño anterior (`prototipo/rediseno-2026-10/`) queda como referencia y **no** se toma como aprobado.

Abrir: `prototipo/perfiles-2026-10/index.html` (doble clic; un solo archivo, sin red). Arriba se elige **perfil** (simulado) y **alternativa A/B**. La URL guarda ambos: `#/B/carol/bandeja/n41`.

## 1. Lo primero que hay que saber

**Ocultar no es proteger.** Hoy los permisos de módulos y pestañas se aplican **solo en el navegador**:
- La app habla con Supabase con la llave pública.
- `calendario_data` no tiene RLS (`supabase/fase4_cerrar_todo.sql` dice "NO EJECUTAR TODAVÍA").
- `supabase/AUDITORIA_SEGURIDAD_2026-06.md` lo califica de "cosmético".

Cualquier inicio por perfil es, por eso, **orden y foco**, no seguridad. Ninguna de las dos alternativas amplía permisos; tampoco cierran ese hueco.

**Los permisos reales viven en Supabase** (fila `usuarios`) y mandan sobre el código. Revisé el código y sus valores por defecto, **no** los valores de producción. Hay que comparar la tabla de la sección 2 con la fila real antes de diseñar en serio. **[Probable]** difieren: por ejemplo, Michelle es autorizadora de nóminas, pero por defecto no tiene el módulo Finanzas.

## 2. Perfiles y permisos reales (defaults del código)

| Persona | Rol | Módulos por defecto | Funciones que ejerce según el código |
|---|---|---|---|
| Angelo Huerta | admin (esCFO) | todos | Aprobación final de nóminas (solo admin), aprobador de rendiciones sin aprobador asignado, supervisa 22 tareas, responsable de pagos F29/F50, Permisos/Respaldo/Restaurar |
| Carol Machuca | editor | tareas, osiris, finanzas, contabilidad | Prepara nóminas, V°B° de nóminas (`AUTORIZADORES`), 11 tareas propias y 3 supervisadas, ve todas las rendiciones |
| Michelle Garcia | editor | tareas, contabilidad (+ rendiciones) | V°B° de nóminas **sin el módulo Finanzas por defecto**, 5 tareas, co-responsable F29 y Análisis de cuenta |
| Pablo Duran | editor | tareas, contabilidad (+ rendiciones) | 5 tareas, co-responsable Cierre+EEFF |
| Milagros Becerra | editor | tareas (+ rendiciones) | 12 tareas semanales, recibe los recordatorios, rinde por otros |
| Nicolás Fuenzalida | gerente_tecnico | osiris (+ rendiciones) | Aprueba y envía informes técnicos de Osiris |
| Comercial (Frisku/Allegria) | — | — | **No hay usuario por defecto** con estos módulos; el perfil existe en el prototipo para diseñarlo |
| Consulta | consulta | — | Rol existente **sin usuario por defecto** |
| Todo el personal | — | finanzas solo con `rendiciones` | Carga sus gastos (`garantizarAccesoRendiciones`) |

Una persona tiene varios roles: Carol es tesorería, aprobadora y responsable de tareas a la vez. Por eso la entrada se arma con **sus pendientes de todos sus módulos**, no con un menú por rol.

### Defectos de permisos encontrados (no corregidos: fuera del alcance de diseño)

| # | Defecto | Evidencia | Efecto |
|---|---|---|---|
| P1 | "Marcar pagada" en Rendiciones no revisa rol | `RendicionesModule.jsx:1177` | Milagros, Carol, Michelle y Pablo (`rendVerTodas:true`) pueden marcar pagada |
| P2 | `cadenaAprobacion` de Gestión de Usuarios no tiene efecto | `resolverCadena` definida y nunca llamada | La pantalla de permisos promete algo que no ocurre |
| P3 | Contabilidad: `canEdit={!esSoloConsulta}` niega una función | `App.jsx:3745` | Carol, Michelle y Pablo quedan en solo lectura en Contabilidad |
| P4 | Una pestaña no definida da **editar** por defecto | `getTabPerm` | Una pestaña nueva queda abierta a todos |
| P5 | Allegria ignora `tabPermisos` | `AllegriaModule.jsx:2221` | La configuración por pestaña no sirve en Allegria |
| P6 | Pestaña `params` de Finanzas configurable pero sin uso | `FinanzasModule.jsx:13351` | Configuración sin efecto |
| P7 | La documentación dice "rendiciones en editar" para todo el personal; el código da **ver** | `permisosCore.js:24-41` | Hay que decidir cuál es la regla y corregir la otra |

## 3. Qué necesita cada perfil

| Perfil | Información de entrada | Acciones frecuentes | En teléfono |
|---|---|---|---|
| CFO | Pendientes propios (aprobación final, rendiciones, pagos F29), alertas del grupo, caja consolidada **con perímetro e INCOMPLETO**, saldo mínimo, capital por vencer + por conciliar + JV aparte, compromisos con fecha vs mensual sin desglose | Aprobar, revisar flujo consolidado, generar reporte, revisar créditos por conciliar | Aprobar con respaldo a la vista; consultar cifras clave y el detalle mensual |
| Tesorería / finanzas (Carol) | Nóminas por preparar o en revisión, saldos con antigüedad de TC, cuentas sin paridad, pagos de crédito por conciliar | Preparar nómina, actualizar saldos, V°B° | V°B° y consulta |
| Contabilidad (Michelle, Pablo) | Tareas por vencer **por sociedad** (F29, cierre, análisis), V°B° de nóminas | Marcar tareas con respaldo, análisis de cuentas | Marcar tarea y adjuntar respaldo |
| Responsables / supervisores | Semáforo propio y del supervisor, tareas que esperan a otra (`dependeDe`) | Marcar hecho, confirmar revisión, devolver | Igual que escritorio, en lista |
| Administración (Milagros) | 12 tareas semanales, recordatorios, rendiciones de otros | Marcar, rendir por otros | Cargar boleta con la cámara |
| Operaciones técnicas (Nicolás) | Informes por aprobar | Aprobar y enviar informe | Aprobar y ver fotos |
| Comercial | Liquidaciones en borrador, embarques de la semana, cobranza | Programa, embarques, liquidaciones | Consulta de embarques y cobranza |
| Consulta | Dashboard y reporte | Descargar reporte | Lectura |
| Todo el personal | Estado de sus rendiciones | Cargar gasto con respaldo | **El caso principal**: foto, monto, moneda, enviar |

## 4. Referencias (verificadas)

La red de este entorno bloquea la mayoría de los sitios oficiales. "Verificada" significa que leí el texto en la fuente; cuando estaba publicada en GitHub, la leí desde ahí. No hay referencias de Flowlu.

| Referencia | Qué aporta | Verificada |
|---|---|---|
| Microsoft Business Central, *Role Centers* (MicrosoftDocs en GitHub) | "the user's entry point and home page"; indicadores de pendientes y acciones agrupadas: modelo directo de la alternativa A | Sí |
| Odoo, *Activities* (odoo/documentation) | Una bandeja de actividades de todas las apps: atrasadas / hoy / futuras, con color. Modelo de la alternativa B y del semáforo de tareas | Sí |
| Android, *adaptive navigation* y *window size classes* | Barra inferior en compacto (<600 dp), riel en mediano y lateral en expandido. Son los cortes que usa el prototipo | Sí |
| Material, *Bottom navigation* y *Navigation rail* | Barra inferior: 3 a 5 destinos. Riel: tablet y escritorio, con indicadores | Sí |
| Apple HIG, *Tab bars* / *Sidebars* | La barra de pestañas sirve para navegar, no para acciones. En iPad, la barra lateral se adapta al girar | Sí |
| GOV.UK, *Table*; Carbon, *Data table* | Mucha información: dividir o llevar a un panel o página de detalle. Cifras alineadas a la derecha | Sí |
| WCAG 2.2: 2.5.8 (24 px), 2.5.5 (44 px), 1.4.10 Reflow (las tablas son la excepción), 1.3.4 Orientation | Criterios de toque, ancho de 320 px y orientación libre | Sí |
| Apple HIG Accessibility (44 pt); Android (48 dp) | Tamaño de los controles táctiles | Sí |
| SAP Fiori *spaces*, NetSuite, Xero, Expensify, Ramp, Atlassian | — | **No** (bloqueadas): no se citan como respaldo |

No encontré una guía verificable sobre **columnas fijas**: la solución del punto 6 es propia y se valida con pruebas, no con una referencia.

## 5. Dos alternativas de navegación

### A · Inicio por perfil + módulos (recomendada)

- **Entrada:** "Hola, {nombre}", con cuatro contadores (vencidas · por aprobar · por conciliar/revisar · tareas de hoy), los primeros 5 pendientes, acciones frecuentes y "tus módulos". El CFO ve además la visión del grupo.
- **Escritorio:** barra lateral con Inicio y los módulos del perfil, cada uno con su número de pendientes.
- **Tablet:** riel de iconos con indicadores; en horizontal, lista y detalle lado a lado.
- **Teléfono:** barra inferior (Inicio · módulo principal · Rendir · Más).

Por qué la recomiendo:
- Conserva la organización por módulos que el equipo ya conoce.
- El trabajo de contabilidad y tesorería ocurre en tablas grandes de escritorio.
- La bandeja queda a un toque desde los contadores.

### B · Bandeja primero

- **Entrada:** una sola lista de pendientes de todos los módulos, con filtros (Aprobar · Tareas · Conciliar/revisar) y un panel de detalle con las acciones.
- **Teléfono:** lista → detalle a pantalla completa, con **Aprobar / Devolver** fijos sobre la barra inferior (Bandeja · Consultar · Cargar · Más).

Cuándo conviene: si el uso principal pasa a ser aprobar y marcar desde el teléfono. El riesgo es que, para quien hace análisis (CFO, contabilidad), es un paso más llegar a las tablas.

**Común a las dos:**
- Cada pendiente dice **quién actúa y por qué**, con la regla real del código. Ejemplo: "V°B° → aprobada: solo rol admin".
- Consulta ve sin botones de acción.
- Nada se marca pagado solo.

## 6. Tablas en escritorio, recorridos en teléfono, y el solapamiento

**El defecto del prototipo anterior, reproducido a 390 px:**
- La columna fija de conceptos (190 px) y el total fijo (92 px) dejaban unos 74 px para los meses.
- Al desplazar, las cifras quedaban **cortadas** bajo la columna fija: "103.000" se leía "03.000".
- El rótulo de grupo tenía un `left:272px` fijo que no coincidía con el ancho real.

**Solución en el prototipo nuevo:**
1. Un solo ancho de columna de conceptos (`--c0w`), usado por todas las celdas.
2. Las columnas de meses se ajustan para que quepa un número **entero** de meses entre la columna fija y el total. El desplazamiento se detiene en el borde de un mes (`scroll-snap`), así que ninguna cifra queda a medias, ni al principio ni al final.
3. El total queda fijo solo desde 1.024 px. En pantallas menores va al final.
4. En teléfono, los conceptos se leen en dos líneas en vez de "…".
5. En teléfono, la entrada al flujo es **mes a mes** (flechas ‹ ›). La **tabla completa** sigue a un toque: el detalle financiero no se esconde.
6. Las flechas del teclado avanzan de a un mes.

## 7. Validación (`node prototipo/perfiles-2026-10/pruebas/validacion.mjs`)

**1.340 comprobaciones, 0 fallas.** Todo **emulado en Chromium** (tamaño, toque y densidad de cada equipo).

**No probado:** dispositivos reales, Safari/WebKit y Firefox; este entorno no los tiene. Antes de aprobar, falta revisarlo en un iPhone, un iPad, un Android y un PC Windows y un Mac reales, con Safari, Chrome y Edge.

| Qué | Cómo | Resultado |
|---|---|---|
| Equipos | Escritorio 1920, Mac 1440, Windows 1366, iPad vertical y horizontal, tablet Android vertical y horizontal, iPhone 13 vertical y horizontal, Pixel 7, 320 px (equivale a zoom 400%) | 11 equipos × 2 alternativas × 6 perfiles × 3 pantallas |
| Sin desborde horizontal de página | `scrollWidth ≤ innerWidth` | OK en todos |
| Controles táctiles | ≥ 44 px con pantalla táctil y ≥ 24 px con mouse; enlaces dentro de texto ≥ 24 | OK |
| Legibilidad | Texto ≥ 12 px; cifras de la tabla 14 px; 16 px base en teléfono | OK |
| Contraste WCAG AA, tema claro y oscuro | Texto ≥ 4,5:1 y bordes de controles ≥ 3:1 | OK (se oscureció el borde fuerte en ambos temas) |
| Solapamiento | 6 posiciones de desplazamiento por equipo: ninguna columna cortada y al menos un mes entero visible | OK |
| Orientación | Vertical y horizontal en tablet y teléfono; en teléfono horizontal la barra inferior pasa a riel | OK |
| Teclado | "Saltar al contenido" es el primer foco; Enter abre el detalle y lleva el foco al título; Esc vuelve al pendiente; flechas recorren la tabla | OK |
| Reglas de perfil | Carol no ve la aprobación final; Carol sí ve "Dar V°B°"; consulta no tiene acciones | OK |

Capturas: se generan con `node prototipo/perfiles-2026-10/pruebas/validacion.mjs <carpeta>`.

## 8. Decisiones pendientes

1. A o B (o A con la bandeja como destino propio en teléfono).
2. Corregir P1–P7 antes de construir inicios por perfil: un inicio que muestra "Marcar pagada" a quien no corresponde **empeora** el problema.
3. Confirmar en Supabase los permisos reales de cada persona.
4. Definir quién es el perfil comercial y si se usará el rol consulta.
5. La seguridad de verdad (RLS / API con validación de rol) es un proyecto aparte de este diseño.
