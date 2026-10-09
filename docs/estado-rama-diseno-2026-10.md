# Estado de la rama de diseño `claude/diseno-hub-navegacion` (oct-2026)

Documento único de esta rama. La rama funcional (`claude/fervent-bell-uu6ae8`) tiene el suyo
(`docs/estado-rama-2026-10.md`); las dos se aprueban por separado.

- **Base:** `origin/main` 0b86538 (Merge PR #43, Créditos). No trae nada de la rama funcional:
  ni remuneraciones, ni facultades, ni realtime por fila, ni la matriz de permisos.
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

- **DD1 · Socios en consulta y Rendiciones — RESUELTA (Angelo, 08-10): sí rinden gastos.**
  Hoy ya pueden porque su ficha no configura `rendiciones` y main lo toma como «editar» por
  omisión; esta rama no cambia código por esto. Pendiente para la rama funcional: dejarlo
  explícito en la ficha (`rendiciones: "ver"` = cargan y ven lo suyo) en vez de depender del
  valor por omisión, ya que ahí el rol consulta tiene tope «ver». No se aplicó: es un cambio de
  permisos y se hace con la vista previa de la matriz.
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

### Pendiente (no corregido: es tipografía y densidad interna de los módulos, decisión tuya)

- **DD7 · Tabla de cuentas en tablet.** Con el riel la tabla de Saldos Bancos necesita desplazarse
  de lado, cosa que en main a 834 px no pasaba. Opciones: riel de 64 px solo con íconos (gana 20 px,
  podría no bastar con más cuentas) o compactar la columna Moneda, que hoy se parte en dos líneas.
- **DD8 · Texto muy chico en Finanzas.** Flujo Empresas y Dashboard usan textos de hasta **6 px**;
  Saldos y Créditos, de 8–9 px (cientos de elementos). En teléfono y tablet no es legible. Corregirlo
  es una pasada tipográfica por un archivo de 17.000 líneas: propongo hacerla por pestaña, con
  capturas antes/después.
- **DD9 · Tablet con densidad de computador.** Las reglas táctiles de main (campos de 16 px,
  pestañas de 42 px) aplican solo hasta 700 px de ancho; una tablet (834 px) no las recibe y la
  mayoría de sus controles mide menos de 32 px (Créditos 180/191, Saldos 114/131). Propuesta:
  aplicarlas por tipo de puntero (`pointer: coarse`) en vez de por ancho; cambia filas de tablas
  densas y conviene verlo antes.
- **DD10 · Texto técnico en el encabezado de Finanzas**: «bundle: main.xxxx.js» se ve en todos los
  equipos. Propongo quitarlo o dejarlo solo para administrador.
- **DD11 · Botones repetidos.** Los encabezados de los módulos conservan «← Mediterra» y «Salir»,
  que ahora también están en la navegación. Se pueden quitar en teléfono para ganar alto.
- Tareas muestra «34 vencidas» del equipo completo y el inicio «5» propias: es correcto, pero el
  encabezado de Tareas podría decir «del equipo».

Alcance: solo el perfil CFO y datos ficticios; Chromium emulado; los modales se verificaron por
código (todas las prioridades declaradas) y con un modal de prueba, no abriendo cada uno.

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

Sin cambios de cálculos financieros, remuneraciones, permisos ni persistencia.
