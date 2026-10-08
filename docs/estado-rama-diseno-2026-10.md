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
| Jest completo, UTC y `TZ=America/Santiago` | 1.726 / 1.726 (52 omitidas, como en main) |
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
- **DD4 · Módulos dentro del marco.** Los módulos ahora se ven con la barra lateral, el riel o la
  barra inferior. Sus pantallas internas no se tocaron. No revisé módulo por módulo si algún
  elemento fijo abajo queda tapado por la barra inferior del teléfono. Es la siguiente etapa.
- **DD5 · Mes de los contadores de tareas — RESUELTA (Angelo, 08-10): mes en curso.**
  `estaVencida` / `estaProxima` aceptan un mes opcional; sin él se comportan como siempre (vista
  de Tareas, resumen por correo). El inicio les pasa el mes en curso. Antes el inicio heredaba el
  mes elegido en Tareas, y también el mes guardado en la fila `main`, que la app restaura al cargar.
  Prueba: tres casos nuevos en `hub-navegacion.mjs` (rótulo, cambiar de mes en Tareas, mes
  distinto guardado en `main`).
- **DD6 · Lectura de `rendiciones` en el inicio.** Usa `dbLoadGeneric`, que registra la versión
  leída en el contrato de guardado. Solo ocurre con el módulo cerrado y el módulo vuelve a leer
  al abrir; no escribe. Se deja anotado por si se prefiere una lectura sin registro.

## 6. Archivos

Nuevos: `src/diseno/{tokens.js,useClaseVentana.js,resumenInicio.js,Navegacion.jsx,Inicio.jsx}`,
`src/__tests__/resumenInicio.test.js`, `scripts/e2e/hub-navegacion.mjs`,
`scripts/vista-previa/semilla-diseno.mjs`, `docs/diseno/recorridos/*.png`.

Modificados: `src/App.jsx` (marco de navegación, inicio, herramientas de admin como funciones,
lectura de rendiciones para contadores), `src/FinanzasModule.jsx` (regla de pestañas exportada,
prop `destino`), `src/RendicionesModule.jsx` (`meTocaAprobar` exportada, `accionInicial`),
`src/data/__tests__/qa-hotfix-a.test.js` (ancla del aviso), `scripts/vista-previa/{armar.mjs,shim.js}`
(modo `--diseno`; la vista previa de Créditos no cambia).

Sin cambios de cálculos financieros, remuneraciones, permisos ni persistencia.
