# Estado de la rama de diseño `claude/diseno-hub-navegacion` (oct-2026)

Documento único de esta rama. La rama funcional (`claude/fervent-bell-uu6ae8`) tiene el suyo
(`docs/estado-rama-2026-10.md`); las dos se aprueban por separado.

- **Base:** `origin/main` c9c5792 (Merge PR #44, hotfix Nóminas: respaldo junto a Crédito),
  integrado el 09-10 con un merge sin conflictos (antes 0b86538). No trae nada de la rama
  funcional: ni remuneraciones, ni facultades, ni realtime por fila, ni la matriz de permisos.
- **Alcance aprobado:** dirección A con bandeja en teléfono (decisión de Angelo, 08-10).
  Esta etapa implementa **solo el inicio y la navegación**. Las pantallas internas de los
  módulos no cambian.
- **Sin merge a `main` ni despliegue.** El preview de revisión es la vista previa aislada
  (más abajo), no un preview de Vercel.

## 1. Qué cambia

| Clase de ventana | Ancho | Navegación |
|---|---|---|
| Expandida (computador, laptop) | ≥ 1024 px | Barra lateral fija: «Nueva rendición», Inicio, Mis rendiciones, módulos asignados; abajo el usuario y sus herramientas |
| Media (tablet) | 600–1023 px | Riel de íconos con rótulo; «Más» abre usuario y herramientas |
| Compacta (teléfono) | < 600 px | Barra inferior **Inicio · Pendientes · Rendir · Más**; «Más» abre módulos y herramientas |

**Inicio.** Pendientes y acciones primero, módulos después:

- Tarjeta **Tareas** del **mes en curso** (siempre, aunque en Tareas se mire otro mes): vencidas, vencen en 2 días, por revisar como supervisor
  (en computador y tablet, con la lista de cuáles son).
- Tarjeta **Rendiciones**: te toca aprobar, devueltas a ti, aprobadas por pagar (solo si el perfil
  ve todas), tus borradores.
- **Módulos**: tarjetas compactas. La de Finanzas trae accesos directos a las pestañas que el
  perfil puede abrir; cada acceso abre esa pestaña.
- En teléfono los contadores van como pastillas y solo los distintos de cero; si todos son cero,
  dice «Al día». El aviso de respaldo suspendido (solo administrador) baja al final y ocupa una línea.

**Quien solo rinde gastos** (Finanzas con únicamente la pestaña Rendiciones y ningún otro
módulo): entrada simple con «Nueva rendición» y sus estados (borradores, devueltas para
corregir, enviadas, aprobadas, pagadas, rechazadas). Sin módulos ni Pendientes.

**Herramientas de administración** (Permisos, Descargar respaldo, Restaurar respaldo) salen del
encabezado y pasan a la barra lateral o a «Más». El código de respaldo y restauración es el
mismo de `HubScreen`, movido a funciones (`descargarRespaldo`, `restaurarDesdeArchivo`).

**Tipografía.** Escala fija (`src/diseno/tokens.js`): cuerpo 15 px, mínimo 12 px en rótulos,
controles táctiles de 44 px. Colores del tema central (`src/theme.js`).

Se quitaron del diseño final el selector de perfiles simulados y las explicaciones del prototipo.

## 2. De dónde sale cada cosa (permisos efectivos y cifras)

- **Módulos ofrecidos:** `modulosDeUsuarioSeguro` (la misma regla del hub de main).
- **Pestañas de Finanzas:** `pestanasVisiblesFinanzas(usuario, tabPermisos)`, exportada de
  `FinanzasModule.jsx` y usada **también** por la barra de pestañas del módulo: una sola regla.
  Es la de main sin cambios (Auditoría solo admin; Dashboard y Reporte solo con acceso completo a
  las empresas; el resto, permiso distinto de `sin_acceso`).
- **Rendir:** Finanzas asignado y la pestaña Rendiciones visible.
- **Contadores de rendiciones** (`src/diseno/resumenInicio.js`): lectura de la fila `rendiciones`
  (la misma que ya lee el módulo para cualquier perfil con la pestaña). «Te toca aprobar» usa
  `meTocaAprobar` exportada de `RendicionesModule.jsx`. «Por pagar» usa la regla de **main**
  (ve todas = admin, CFO o `rendVerTodas`).
- **Contadores de tareas:** `estaVencida` / `estaProxima` de `App.jsx`, sin copia. Cuentan
  semanales y mensuales solo si el perfil ve esa pestaña, y puntuales. Diarias, quincenales y
  anuales no tienen vencimiento en la app. «Por revisar» = el responsable la marcó en verde y
  el supervisor aún no.
- **Sin datos no hay cifra.** Si la lectura falla o sigue en curso, la tarjeta dice que no está
  disponible y ofrece «Reintentar». El distintivo de Pendientes no muestra un total parcial.
  Un cero solo aparece cuando la fuente se leyó y el resultado es cero.

**«Nueva rendición»** abre Finanzas en Rendiciones y crea el borrador **después** de que el
módulo cargó con éxito (regla 9). Cada pulsación crea uno; «Rendir» / «Mis rendiciones» solo abre la lista.

## 3. Evidencia (alcance: local, build con `CI=true`, Supabase falso, solo Chromium, datos ficticios)

| Prueba | Resultado |
|---|---|
| `CI=true react-scripts build` | compila |
| Jest completo, UTC y `TZ=America/Santiago` | 1.726 / 1.726 (52 omitidas, como en main); tras §6: 1.729 / 1.729 en UTC |
| `src/__tests__/resumenInicio.test.js` (nueva) | 11 / 11 |
| `scripts/e2e/hub-navegacion.mjs` (nueva): 6 perfiles × 4 tamaños + mes en curso | 76 / 76 |
| `apertura-sin-cambios.mjs` (main) | pasa: abrir y navegar no escribe |
| `aislamiento.mjs` (main) | pasa |
| `creditos-guardado-fallas.mjs` (main) | pasa |
| `e2e.mjs` (main) | **falla igual en main 0b86538** sin cambios (se detiene en «+ Agregar anticipo» de Parámetros de Allegria). No lo causa esta rama |
| `restaurar-parcial.mjs` (main) | **no corrido**: exige el binario de PostgREST, que no está en este entorno |
| Vista previa aislada (navegador, Carol y Operario) | 0 peticiones a la base de producción o al correo |

Lo que `hub-navegacion.mjs` comprueba con los datos ficticios:

- **Carol** (Saldos Bancos y Nóminas en editar, Rendiciones en ver, el resto sin acceso): Finanzas
  ofrece solo Saldos Bancos, Nóminas y Rendiciones. **No** aparecen Flujo, Créditos, Dashboard,
  Reporte ni Auditoría, y al entrar al módulo sus pestañas son las mismas. Sin herramientas de
  administración. Rendiciones: aprobar 0, por pagar 1, borradores 1. Tareas: por revisar 1.
- **CFO:** 9 pestañas, herramientas Permisos, Respaldo y Restaurar. Aprobar 2 (las enviadas sin
  aprobador asignado), por pagar 1, tareas por revisar 2. El aviso de respaldo está en el inicio.
- **Gerente Frisku** (empresas parciales): Finanzas solo con Saldos Bancos y Rendiciones; sin
  tarjeta de tareas.
- **Operario:** entrada simple con borrador 1, devuelta 1, enviada 1, pagada 1. «Nueva rendición»
  crea un borrador propio (7 → 8 rendiciones en el store).
- **Lectura fallida de rendiciones:** aviso sin cifras ni distintivo; «Reintentar» trae las cifras.
- En los 24 recorridos: navegación correcta según el ancho, sin desplazamiento horizontal, sin
  errores de página, y navegar no escribe datos de negocio (solo la escritura conocida de
  `main`/`usuarios` al entrar, que también ocurre en main).

Control de la prueba de respaldo suspendido: `qa-hotfix-a` exigía el aviso dentro de
`HubScreen`, que ya no existe. Ahora exige que esté en la pantalla de inicio (`<Inicio>`), y se
comprobó que **falla** si el aviso se mueve a la vista de Tareas.

Capturas en `docs/diseno/recorridos/` (computador y teléfono de los seis perfiles; tablet,
laptop, Pendientes, «Más», lectura fallida y nueva rendición de Carol/Operario).

No probado: Safari, Firefox, equipos reales, lector de pantalla. Que los datos ficticios se vean
bien no prueba cómo se ven con los volúmenes reales.

## 4. Vista previa para revisar

- **Artifact privado:** https://claude.ai/artifact/LrZcNRqkQTEECt4kcCr6c8
- Armado con `node scripts/vista-previa/armar.mjs --diseno` (build real + `shim.js`, que responde
  en el navegador todas las llamadas a la base). Datos ficticios; nada sale a producción ni se
  envían correos. Los cambios quedan solo en ese navegador; «Reiniciar datos» los borra.
- Ingresos de prueba (PIN 482913, solo de prueba) en la etiqueta «Vista previa · datos simulados»
  arriba a la derecha. Esa etiqueta es de la vista previa, no de la app.
- Local: `node scripts/vista-previa/armar.mjs --diseno && node scripts/vista-previa/servir.mjs`.
- **No usar un preview de Vercel de esta rama:** `SUPA_URL` está fija en el código, así que ese
  preview leería y escribiría la base de producción.

## 5. Hallazgos y decisiones pendientes

- **DD1 · Socios en consulta y Rendiciones — PENDIENTE.** El 08-10 se respondió «sí» y el 09-10
  Angelo indicó que sigue sin decidirse. Se conserva el comportamiento actual (la ficha no configura
  `rendiciones` y main la toma como «editar», así que hoy pueden cargar) y no se cambia ningún permiso.
- **DD2 · «Por pagar» al integrar con la rama funcional.** Aquí usa la regla de main (ve todas).
  Con la matriz de la rama funcional paga solo quien tiene la facultad `rendPagar`; al integrar,
  este contador debe usar esa misma regla, o Michelle y Pablo verían rendiciones «por pagar» que no pueden pagar.
- **DD3 · Integración con la rama funcional.** Las dos tocan `App.jsx` (esta reemplaza
  `HubScreen`; la funcional le agrega `AvisosPermisos`, reintento de facultades y aviso de
  transición), `FinanzasModule.jsx` y `RendicionesModule.jsx`. Habrá conflictos a resolver a mano:
  los avisos de la funcional deben ir al inicio nuevo, en una línea en teléfono.
- **DD4 · Módulos dentro del marco — REVISADA (08-10).** Ver §6: lo que tapaba la barra o cortaba cifras está corregido; quedan DD7–DD11.
- **DD5 · Mes de los contadores de tareas — RESUELTA (Angelo, 08-10): mes en curso.**
  `estaVencida` / `estaProxima` aceptan un mes opcional; sin él se comportan como siempre (vista
  de Tareas, resumen por correo). El inicio les pasa el mes en curso. Antes el inicio heredaba el
  mes elegido en Tareas, y también el mes guardado en la fila `main`, que la app restaura al cargar.
  Prueba: tres casos nuevos en `hub-navegacion.mjs` (rótulo, cambiar de mes en Tareas, mes
  distinto guardado en `main`).
- **DD12 · Letra de las celdas del flujo en computador — IMPLEMENTADA (09-10).** Ver §6c.
- **DD13 · Limitaciones que dependen de la rama funcional (no se corrigen aquí).** Las brechas de
  permisos se llevaron a la rama funcional (commit a4f2318, `docs/estado-rama-2026-10.md` §4.18):
  menú de Allegria Service por página, reportería de Frisku según la clave `bi` explícita y las
  claves de Frisku que faltaban en la pantalla de permisos. En esta rama siguen como en main:
  (a) Allegria Service muestra todas sus páginas aunque la ficha diga `sin_acceso` en alguna;
  (b) Frisku decide la reportería con un OR de claves; (c) «Por pagar» usa la regla de main
  (DD2); (d) Contabilidad no tiene permisos por pestaña (decisión pendiente en ambas ramas);
  (e) las páginas de Service sin clave propia quedan visibles (decisión pendiente). Ninguna de
  estas pantallas se amplió en esta rama.
- **DD6 · Lectura de `rendiciones` en el inicio.** Usa `dbLoadGeneric`, que registra la versión
  leída en el contrato de guardado. Solo ocurre con el módulo cerrado y el módulo vuelve a leer
  al abrir; no escribe. Se deja anotado por si se prefiere una lectura sin registro.

## 6. Revisión de módulos en teléfono y tablet (08-10)

Recorrido `scripts/e2e/modulos-movil.mjs` (CFO, que ve todo; datos ficticios; Chromium; teléfono
390×844 y tablet 834×1112): 7 módulos y las 9 pestañas de Finanzas, arriba y al final de cada
pantalla. Mide desborde, elementos fijos bajo la barra, alcance del último control, **texto
recortado** (montos cortados por el contenedor), texto < 12 px y controles < 32 px. Resultado
final: **93 / 93**. Capturas antes/después en `docs/diseno/modulos/`.

### Corregido

| Hallazgo | Origen | Corrección | Prueba |
|---|---|---|---|
| La barra inferior quedaba **encima** de 7 modales de Tareas y Osiris (prioridad 300) y del panel de EEFF y Frisku (199–200): tapaba sus botones de abajo | navegación nueva | La barra baja a prioridad 100: sobre los encabezados fijos de tablas (máx. 10), bajo todo modal | `barraInferiorCapas.test.js` lee el código de todos los módulos; falla con 300 |
| Los avisos fijos de guardado («Guardado / Guardar ahora», «NO se guardó», carga de bancos, Allegria, Allegria Service, versión nueva) quedaban dentro de la franja de la barra; el de Osiris tapaba el botón «Más» | navegación nueva | Variable `--mdt-barra-inf` (64 px en teléfono, 0 en el resto): esos 7 avisos suben esa altura | misma prueba, regla 3: todo fijo anclado abajo debe usarla; falla sin el cambio |
| En teléfono el contenido no iba dentro de `<main>` (lectores de pantalla) | navegación nueva | `<main>` también en teléfono | recorrido |
| **Créditos**: 6 y 7 indicadores en columnas fijas; en teléfono y tablet los montos salían cortados («$6,» por $6.727.365) | **existe en main** (medido igual en 0b86538) | Columnas que se acomodan al ancho (mín. 145 px, siempre ≥ 2 por fila) y el monto pasa de línea en vez de cortarse | recorrido + comparación main vs rama en 390/834/1280/1440: 0 cifras cortadas, sin cambio en computador |
| **Saldos Bancos** en teléfono: la página medía ~800 px y el contenedor del módulo escondía la mitad derecha (saldo consolidado, aviso «SIN PARIDAD», tipos de cambio) | **existe en main** | Los bloques de esa columna no pueden exceder el ancho disponible (`.mdt-col-ajustada`) | recorrido |
| **Saldos Bancos** en tablet: la tabla de cuentas perdía «A paridad de hoy» y «Fecha» sin forma de verlas | **causado por el riel** (en main a 834 px cabía: Fecha termina en 810 px) | La tabla se desplaza de lado dentro de su tarjeta; comprobado que al desplazar aparece Fecha | prueba de desplazamiento en navegador |
| **Reporte Semanal**: 4 indicadores en columnas fijas; en teléfono «6 de 7» cortado | existe en main | Igual que Créditos | recorrido |

Las mismas columnas adaptables en las 5 grillas de indicadores de Finanzas no cambian la vista de
computador (medido a 1280 y 1440 px).

### DD7 a DD11 — aplicadas (09-10)

- **DD7 · Moneda compacta** (Saldos Bancos): código en una línea (el símbolo va en el monto; el
  nombre completo queda en el título), y bajo 1024 px celdas de 6 px de margen, títulos en dos
  líneas y campo de monto de 100 px. En tablet la tabla cabe sin desplazar con los datos de prueba
  (667 de 668 px). Con montos reales más largos puede volver a desplazarse: nunca se esconde.
- **DD8 · Texto mínimo 11 px en Finanzas bajo 1024 px** (`index.css`, clase `.mdt-finanzas`); el
  computador no cambia (medido a 1440 px: los textos de 9 px siguen en 9). **No cubre los gráficos
  SVG** (Flujo y Dashboard tienen etiquetas de 6 px): queda abierto, ver la ampliación de alcance.
- **DD9 · Reglas táctiles por tipo de puntero** (`pointer: coarse`): campos de 16 px, pestañas de
  42 px, controles de 36 px mínimo. Con mouse no cambia. En tablet: 0 controles bajo 32 px (antes
  180/191 en Créditos). Que midan 36 px no prueba que sean cómodos: la separación entre controles no
  está evaluada todavía.
- **DD10 · Marcador de versión solo para administrador** (prueba jest nueva para quien no lo es).
- **DD11 · «← Mediterra / Volver» y «Salir» de los encabezados** se esconden en teléfono (la barra
  ofrece Inicio y Más → Salir); en tablet y computador siguen.

Evidencia (Chromium emulado, datos ficticios): `modulos-movil.mjs` **177 comprobaciones** (no son
módulos: 7 módulos y 9 pestañas de Finanzas × teléfono y tablet, varias comprobaciones por
pantalla, más 3 de computador), jest 1.730/1.730, `hub-navegacion` 76/76, y de main
`apertura-sin-cambios`, `aislamiento`, `creditos`, `creditos-guardado-fallas`.

- Tareas muestra «34 vencidas» del equipo completo y el inicio «5» propias: es correcto, pero el
  encabezado de Tareas podría decir «del equipo».

Alcance: solo el perfil CFO y datos ficticios; Chromium emulado; los modales se verificaron por
código (todas las prioridades declaradas) y con un modal de prueba, no abriendo cada uno.

## 6b. Ampliación de alcance (09-10): sistema compartido y piloto

Pedido de Angelo: una arquitectura visual coherente para todos los módulos y submódulos, por
etapas: 1) componentes y estilos compartidos; 2) piloto en una tabla financiera, un formulario y una
aprobación; 3) extensión módulo por módulo sin reescribirlos. Inventario completo en
`docs/diseno/inventario-modulos.md` (7 módulos de negocio, ≈ 69 pantallas de primer nivel y ≈ 135 de
segundo; «177» eran comprobaciones, no módulos).

### Etapa 1 · Sistema compartido

- `src/diseno/sistema.css`: variables de color (las del tema), escala tipográfica (11 en celdas
  densas, 12 en rótulos, 14 en cuerpo; 15 en táctil), espaciado base 4, capas (`--mdt-z-*`), alto
  de control 36 px y **44 px en pantalla táctil** con **separación mínima de 8 px (12 en táctil)**, y
  clases para encabezado, pestañas (una línea deslizable en teléfono), filtros, tablas anchas
  (desplazamiento propio, encabezado y 1.ª columna fijos), formularios, botones, acciones, tarjetas
  con acciones, modales (hoja inferior en teléfono), estados (cargando, error, vacío, restringido,
  aviso), indicador de guardado e **impresión sin la navegación**.
- `src/diseno/componentes.jsx`: `Encabezado`, `Pestanas`, `Filtros`, `Tabla`, `Campo`, `Boton`,
  `Modal` (Esc, foco al abrir y al cerrar), `EstadoVista` (nunca muestra cifras) y
  `useFuenteGrafico` para etiquetas de gráficos SVG legibles a cualquier ancho.
- `src/diseno/capacidades.js`: **ver ≠ hacer**. «Por pagar» se muestra a quien ve todas; contar
  como pendiente y ofrecer «Marcar pagada» exige poder pagar. Recibe la fila de facultades con la
  forma de la rama funcional (`{modo, porCorreo}`), sin importarla: hoy (main, sin fila) aplica la
  regla publicada; con la matriz, solo `rendPagar`; fila sin leer, nadie paga. Pruebas en
  `resumenInicio.test.js` (Michelle ve y no paga en modo matriz; lo que solo se ve no suma).
- Los módulos lo adoptan conectando sus primitivas locales (su `Btn`, `Field`, `Modal`) a las
  compartidas, no reescribiendo pantallas.

**Hallazgo: una segunda capa de estilos compite con el sistema.** `App.jsx` inyecta al iniciar
una hoja «responsive» con reglas por atributo para < 768 px: parte en varias líneas todo contenedor
flexible con separación (lo que apilaba las 9 pestañas de Finanzas en 4 filas), convierte toda tabla
en bloque, fuerza 2 columnas en tablet, y trae una regla de grillas que nunca aplica
(`gridTemplateColumns` no aparece así en el HTML). Por ahora se exceptúan las barras del sistema
(`:not(.mdt-pestanas)`). Migrada en el grupo 1 a una capa heredada única sin excepciones (§6c).

### Etapa 2 · Piloto (`scripts/e2e/piloto-sistema.mjs`, 34 comprobaciones)

**Tabla financiera: Flujo de caja de una empresa + gráfico (teléfono, tablet, computador)**
- Pestañas de Finanzas, empresas y vistas de Créditos en **una línea deslizable** en teléfono:
  el resumen de la empresa aparece a 573 px (antes había que pasar ≈ 600 px solo de pestañas).
- Título «Finanzas» del encabezado: **no se veía en ningún tamaño** (azul sobre el mismo azul;
  también en main). Ahora en blanco.
- Tabla: ya tenía encabezado y 1.ª columna fijos; ahora **se enfoca con el teclado** y se desplaza
  con las flechas.
- Gráfico `LineChart` (Dashboard, Consolidado): los rótulos se dibujaban con 6–7 unidades de un
  lienzo de 460, es decir **≈ 4 px en teléfono**. Ahora miden 14 px de caja en teléfono y tablet y
  17 en computador (≥ 11 px de letra), el margen de montos crece con su largo y los rótulos de meses
  se eligen para **no encimarse** (el último siempre se muestra).
- **DD12** (celdas del flujo en 9 px en computador): implementada en el grupo 1, ver §6c.

**Formulario: rendición de gastos (teléfono táctil)**: hoja inferior a lo ancho, 5 campos de 44 px
o más con letra de 16 px (sin zoom de iOS), la barra inferior no la tapa.

**Aprobación: Por aprobar y Pagos (teléfono)**: 8 botones de acción, todos de 44 px o más y con
**al menos 8 px entre vecinos**; las acciones de cada tarjeta bajan a lo ancho bajo el contenido.
«Devolver para corrección» usaba `window.prompt`: ahora es un **diálogo en la página** con el mismo
texto por omisión y la misma acción (cancelar no escribe; confirmar escribe una vez con la nota).
«Marcar pagada» solo aparece si la persona puede pagar, y **la acción también lo verifica**; quien
solo puede ver recibe un aviso «solo lectura» (no alcanzable en main, cubierto por pruebas unitarias).

**Estados: lectura fallida de rendiciones.** Antes mostraba la lista vacía («no tienes
rendiciones») con «Guardado ✓», aunque nada se había leído ni podía guardarse. Ahora: error visible
con «Reintentar», sin lista ni «Guardado», y nada se escribe.

Accesibilidad: las barras de pestañas son botones con `aria-pressed` (no `role="tab"` sin paneles).

Regresión encontrada y corregida en el piloto: la barra deslizable de Créditos, al no partirse,
ensanchaba la columna del módulo y cortaba montos de los avisos en teléfono (mismo mecanismo que
Saldos Bancos). Regla del sistema: una barra de pestañas nunca es más ancha que su contenedor.

Pruebas de la etapa (Chromium emulado, datos ficticios): piloto 34/34 · `modulos-movil` 177/177 ·
`hub-navegacion` 76/76 · jest 1.738/1.738 · de main: `apertura-sin-cambios`, `aislamiento`,
`creditos`, `vista-previa-aislamiento` y `regresion-empresas` (**12.032 celdas pantalla vs Excel,
0 diferencias**). Capturas en `docs/diseno/piloto/`.

Alcance de la evidencia: Chromium emulado, datos ficticios. No probado en Safari, Firefox ni
equipos reales.

## 6c. Etapa 3 · Grupo 1: Finanzas y Rendiciones (09-10)

Pruebas sobre un **build congelado** (copia de `build/` servida aparte, que no se toca durante la
ejecución) y comparación contra un build de `main` c9c5792 sin cambios. Chromium emulado, datos
ficticios, Supabase falso con escrituras a producción bloqueadas.

### DD12 · Letra del flujo en computador

- Celdas de **Flujo Empresas** y de **Consolidado** (vistas «Sumada» y «Por empresa»): todo el
  texto de la tabla en **11 px o más** (antes 8–10 px). Botón **«A+ Letra grande»** (13 px), en
  ambas pantallas, con la preferencia guardada en el navegador de cada persona.
- Se conservan la columna fija, el encabezado fijo, el desplazamiento horizontal y vertical, las
  temporadas plegables y los **63 meses** (Apr-26 → Jun-31, comprobado con las temporadas abiertas
  y desplazando hasta Jun-31; la columna de conceptos sigue a 1 px del borde).
- **Valores idénticos** con letra normal y grande (4.837 caracteres de la tabla, iguales).
- **Impresión idéntica a main celda por celda** (220 celdas en Flujo Empresas, todas las del
  Consolidado). Cómo: cada tamaño original quedó como variable (`--mdt-fs-f8`…`f14`), que en
  pantalla vale 11 px o más y al imprimir vuelve exactamente al tamaño de main (8, 9, 10, 10,5, 11,
  12, 13, 14 px). La columna de conceptos imprime en 7 px, igual que en main (allí manda la hoja
  de impresión). «Letra grande» no cambia el impreso.
- Excel y PDF no se tocaron (se generan desde los datos, no desde la tabla en pantalla).
- Capturas: `docs/diseno/grupo1/DD12-*.png`.

### Capa responsive heredada: migración gradual

- La hoja que `App.jsx` inyectaba al iniciar y el bloque móvil de `index.css` pasan a **una sola
  capa**, `src/diseno/legado.css`, importada **antes** de `sistema.css`. Todo selector va dentro de
  `:where()` (especificidad cero): el sistema gana sin excepciones. Se eliminó la excepción
  `:not(.mdt-pestanas)` y dos reglas que nunca aplicaban.
- `src/__tests__/capasEstilo.test.js`: falla si la capa supera **20 reglas** (el tope solo baja) o
  si aparece un selector por atributo (`[style*=…]`) fuera de ella. Cada regla dice qué corrige, a
  quién afecta y cuándo se retira; los grupos siguientes las retiran módulo por módulo.
- **Defecto heredado de main corregido:** la regla que parte en varias líneas las filas flexibles en
  teléfono también se aplicaba a **columnas** (`flex-direction: column`). En una columna, cada
  «línea» toma el ancho de su contenido más ancho: una tabla con desplazamiento propio ensanchaba
  la columna entera y se cortaban tarjetas y montos (Créditos → Análisis CFO y Conciliación,
  Rendiciones → Maestros). Ahora la regla excluye las columnas.

### Diálogos de la app en lugar de los del navegador

`src/diseno/dialogos.jsx`: `pedirTexto`, `elegirOpcion` y `confirmar` devuelven lo mismo que
`prompt`/`confirm` (texto o nada; sí o no). Se dibujan con el modal del sistema (hoja inferior en
teléfono, Esc cancela, foco en el campo). Convertidos en este grupo: devolución de nómina,
elección de revisor, anular pago / impaga / anular conciliación / anular saldo informado / anular
crédito, resolver override, interés trimestral de socio, nombre de escenario, nueva línea, tipo de
documento, aplazar semana, rechazo en ANF, RUT y nombre de tercero en EEFF, devolución en el
editor de Rendiciones.

**No es un cambio mecánico.** `prompt`/`confirm` bloqueaban la página: nada cambiaba mientras se
respondía. Los diálogos nuevos esperan sin bloquear, así que durante la espera puede llegar un
cambio de otra sesión (realtime) y la acción, al continuar, escribiría la copia que tenía al
preguntar. Medidas:
- **Un solo diálogo a la vez**: una segunda solicitud con uno abierto se responde como «cancelar»
  (no abre otro ni ejecuta la acción dos veces). Un doble clic en «Aceptar» resuelve una vez.
- **Datos vigentes**: las acciones que escriben un registro guardan su huella al preguntar y, al
  volver, comparan con el valor vigente (`useUltimo` + `sigueIgual`). Si cambió, **no aplican
  nada** y dicen «cambió mientras respondías… revisa y vuelve a intentarlo». Aplicado a: avanzar
  y devolver nómina, anular pago, confirmar impaga (dos pantallas), anular conciliación, anular
  saldo informado, anular crédito, devolver rendición (las dos vías) y rechazar informe ANF.
  Las que crean algo nuevo o modifican por id con la versión vigente (nombre de escenario, nueva
  línea, tipo de documento, tercero, aplazar, descartar cambios, anular pago desde la nómina) no lo
  necesitan.
- **Motivos**: donde el dominio ya exige motivo (anular pago/crédito/conciliación/saldo, impaga,
  devolución de nómina) el diálogo no deja aceptar vacío ni con solo espacios; el dominio sigue
  validando. Cancelar la devolución de nómina ya no muestra «Debe ingresar un motivo» (la primera
  conversión lo hacía: defecto encontrado por la prueba de control).

### Límite de error por módulo

Si una pantalla falla al dibujarse, se ve un aviso dentro del marco con la navegación activa,
«Volver al inicio» y «Recargar». El texto **no afirma qué se guardó**: «Lo guardado antes del
error sigue en el servidor; lo que estaba sin guardar en esta pantalla puede no haberse
registrado». (La primera versión decía «No se guardó nada desde esta pantalla», que no se puede
asegurar: el guardado pendiente puede completarse al desmontar.)

### Otros cambios del grupo

- Botones de Finanzas con las clases del sistema y `aria-pressed`; barras de pestañas sin estilos
  en línea que compitan.
- Reporte Semanal → Umbrales: la fila (empresa, monto, USD) ya no se sale en teléfono.
- Créditos → Análisis CFO: los dos paneles lado a lado se apilan cuando no caben (en tablet la
  columna izquierda medía 472 px por el ancho mínimo de su tabla y cortaba la derecha).

### Recorrido (`scripts/e2e/grupo1-finanzas.mjs`)

26 pantallas × 3 tamaños (computador 1440, tablet 834 táctil, teléfono 390 táctil): Dashboard,
Flujo (consolidado, por empresa, matriz, waterfall, semanal, empresa, parámetros), Saldos Bancos,
Créditos (5 vistas), Nóminas, Reporte Semanal y Umbrales, Auditoría, EEFF (3 vistas) y
Rendiciones (5 vistas). En cada una: sin errores de página, sin diálogos del navegador, sin
desborde ni cifras recortadas, nada fijo bajo la barra inferior, rótulos de gráficos ≥ 11 px y,
en táctil, pestañas y botones del sistema de 44 px. Más DD12 y la devolución de una nómina con V°B°
en teléfono (perfil CFO): diálogo de la app, motivo obligatorio, la nómina vuelve a «revisión»
con el motivo y el historial.

### Evidencia del grupo 1

- **Main integrado:** `origin/main` **c9c5792** (merge en la rama: 7dda0e1, sin conflictos).
- **Build probado:** commit **19f3298**, bundle `main.4d6b4c43.js`. El build se congeló (copia
  servida aparte) y, tras el commit, se recompiló desde el commit: mismo bundle.
- Las pruebas que no tocan lo cambiado después del build anterior (`main.a3921cd4.js`, mismos
  cambios salvo diálogos/límite de error) no se repitieron: `regresion-empresas` **12.032 celdas
  pantalla vs Excel, 0 diferencias, 0 peticiones a producción**, `apertura-sin-cambios`,
  `aislamiento`, `hub-navegacion` 76/76, `modulos-movil`.

| Prueba (build 19f3298 salvo indicación) | Diálogos | Resultado |
|---|---|---|
| `dialogos-app.mjs` (nuevo) | **de la app, modo nativo apagado y comprobado** | 27/27 |
| `dialogos-app.mjs` contra el build anterior (control) | de la app | 21/27: detecta el aviso espurio al cancelar, el motivo opcional en anular crédito, la **anulación escrita sobre un crédito cambiado por otra sesión** y el texto del límite de error |
| `grupo1-finanzas.mjs` | de la app (devolución en teléfono) | 203/203 |
| `piloto-sistema.mjs` | de la app (Rendiciones) | 34/34 |
| jest UTC / America/Santiago | de la app (RTL, incluye un solo diálogo a la vez, Esc, `sigueIgual`) | 1.749/1.749 en ambas |
| `creditos`, `creditos-guardado-fallas`, `nomina-respaldo`, `nomina-condicionado`, `nomina-credito`, `nomina-guardado` | **antiguos (modo nativo)**: validan que la lógica posterior al diálogo no cambió | todos OK |
| `nomina-base-real` (Postgres 16 + PostgREST 12 locales) | antiguos (modo nativo) | OK |
| `vista-previa-aislamiento` (vista previa rearmada con este build) | — | OK, 0 salidas a producción |

`dialogos-app.mjs` recorre: devolver nómina con Cancelar, Esc y «×» (ni escritura ni cambio de
estado), motivo vacío y con espacios (no deja aceptar, Enter tampoco), segunda solicitud con el
diálogo abierto (no abre otro), aceptar con doble clic (una devolución, una escritura); anular
crédito con Cancelar y Aceptar; **cambio del crédito por realtime mientras el diálogo espera**
(avisa, no escribe y el cambio de la otra sesión se conserva); límite de error en Contabilidad con
un dato mal formado (navegación visible, texto sin afirmar guardado, salir por la navegación y por
«Volver al inicio»).

Alcance: Chromium emulado, Supabase falso o Postgres local, datos ficticios. No probado en Safari,
Firefox ni equipos reales; nada corrido en producción.

### Lo que queda pendiente en este grupo (honesto)

- **Controles táctiles de Finanzas.** El recorrido informa, por pantalla, cuántos controles miden
  menos de 44 px y cuántos pares quedan a menos de 8 px. Rendiciones (piloto) está en 0; Finanzas
  no: Saldos Bancos 112 de 129 controles bajo 44 px, Créditos 175 de 189 con 114 pares juntos,
  Conciliación 78 de 92. Son los campos y botones dentro de las tablas editables (36 px en táctil).
  Llevarlos a 44 px exige convertir esas tablas a tarjetas o filas expandibles en teléfono: es
  rediseño de esas pestañas, no un ajuste de estilo. Propuesta: hacerlo pestaña por pestaña, con
  Créditos primero. **No está hecho.**
- Las celdas del flujo en **teléfono y tablet** siguen la regla DD8 (11 px); DD12 cubre el
  computador.
- Prompts nativos que quedan en otros módulos: Osiris 12, Allegria Service 1, Frisku 1
  (grupos siguientes). `alert` y `window.confirm` siguen nativos en Finanzas (avisos y
  confirmaciones simples, p. ej. «Reactivar», «mantener/retirar override»); bloquean, así que no
  tienen el problema de datos desactualizados.
- La comprobación de datos vigentes cubre lo que llega a la pantalla (realtime de la fila
  `finanzas`, estado local). Un cambio en el servidor que todavía no llegó a la pantalla lo frena
  el guardado condicionado de Nóminas; la fila `finanzas` no tiene ese guardia en main. ANF se
  lee bajo demanda (sin realtime): ahí solo protege contra cambios locales.

## 6d. Figma (09-10) — en curso, bloqueado por límites del plan

- **Acceso comprobado:** integración de Figma con lectura y escritura. Archivo privado en los
  borradores de Angelo: «Mediterra · Sistema de diseño y navegación»
  (https://www.figma.com/design/MktZLki3Bn1EShwKrqO12p). No se publicó ni se compartió.
- **Hecho en Figma (no imágenes: variables, estilos y componentes editables):**
  41 variables con sintaxis `var(--mdt-…)` tomadas de `sistema.css` (color, espaciado, radios,
  control 36/44, escala tipográfica, medidas de navegación); 9 estilos de texto; 10 componentes
  con variantes y descripción de su equivalente React (Botón, Pestaña chip/barra, Campo,
  Filtro, Celda de tabla, Ítem de navegación lateral/riel/inferior, Modal computador/hoja
  inferior, Estado de la vista con cargando/vacío/error/restringido/aviso/guardado pendiente,
  Indicador de guardado, Distintivo); hoja de fundamentos y tabla de correspondencia
  Figma ↔ React; pantalla A «tabla financiera densa» (Flujo Empresas) en computador y tablet,
  armada con instancias (datos ficticios). La versión teléfono está creada pero sin revisión
  visual.
- **Bloqueos:** (1) el plan Starter permite 3 páginas por archivo (se organizó en 3 páginas
  con secciones); (2) se alcanzó el **límite de llamadas del MCP de Figma del plan Starter**,
  así que no se puede seguir editando ni revisando hasta que se restablezca o se mejore el plan.
- **Falta:** formulario con documentos, circuito de aprobación, pantalla comercial, pantalla de
  operaciones, inicio de quien solo rinde, página de navegación por perfil (ver ≠ ejecutar) y
  los vínculos del prototipo navegable.
- **Grupo 2 en pausa:** el avance de Tareas y Contabilidad quedó en la rama
  `claude/diseno-grupo2-borrador` (no está listo para revisión); no se extiende el patrón hasta
  validar el grupo 1 en Figma.

## 7. Archivos

Nuevos: `src/diseno/{tokens.js,useClaseVentana.js,resumenInicio.js,Navegacion.jsx,Inicio.jsx}`,
`src/__tests__/resumenInicio.test.js`, `scripts/e2e/hub-navegacion.mjs`,
`scripts/vista-previa/semilla-diseno.mjs`, `docs/diseno/recorridos/*.png`.

Modificados: `src/App.jsx` (marco de navegación, inicio, herramientas de admin como funciones,
lectura de rendiciones para contadores), `src/FinanzasModule.jsx` (regla de pestañas exportada,
prop `destino`), `src/RendicionesModule.jsx` (`meTocaAprobar` exportada, `accionInicial`),
`src/data/__tests__/qa-hotfix-a.test.js` (ancla del aviso), `scripts/vista-previa/{armar.mjs,shim.js}`
(modo `--diseno`; la vista previa de Créditos no cambia).

Revisión de módulos (§6): `src/diseno/Navegacion.jsx` (prioridad de la barra, `--mdt-barra-inf`,
`<main>`), `src/index.css` (`.mdt-col-ajustada`), `src/FinanzasModule.jsx` (grillas de
indicadores, tabla de cuentas desplazable), y la posición de los avisos fijos en
`OsirisModule.jsx`, `AllegriaModule.jsx`, `AvisoPersistencia.jsx`,
`proceso/ui/components/base.jsx` y `App.jsx`. Nuevos: `src/__tests__/barraInferiorCapas.test.js`,
`scripts/e2e/modulos-movil.mjs`, `docs/diseno/modulos/*.png`.

Grupo 1 (§6c): nuevos `src/diseno/{legado.css,dialogos.jsx}`, `src/__tests__/capasEstilo.test.js`,
`scripts/e2e/{grupo1-finanzas,dialogos-app}.mjs`, `docs/diseno/grupo1/*.png`; modificados `src/diseno/{sistema.css,
componentes.jsx}`, `src/index.{css,js}`, `src/App.jsx` (diálogos, límite de error, sin hoja
inyectada), `src/FinanzasModule.jsx` (DD12, diálogos, botones, umbrales, análisis CFO),
`src/RendicionesModule.jsx`, `src/anf/AnfTab.jsx`, `src/EEFFModule.jsx` (diálogos),
`scripts/e2e/fake.mjs` (modo de diálogos nativos para pruebas antiguas y bloqueo de
`*.vercel.app`) y `scripts/vista-previa/semilla-diseno.mjs` (nóminas ficticias).

Sin cambios de cálculos financieros, remuneraciones, permisos ni persistencia.
