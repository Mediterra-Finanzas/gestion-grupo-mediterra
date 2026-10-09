# Homogeneidad: diagnóstico del conjunto y plan de aplicación (oct-2026)

Complementa `docs/diseno/inventario-modulos.md` (no lo repite). Muestra de referencia:
`docs/diseno/muestra/` y la vista previa aislada. Estado y evidencia: documento de estado §6e.

## 1. Diferencias encontradas (todas las pantallas de negocio)

| Módulo | Encabezado y contexto | Pestañas | Acciones | Paleta propia | Diálogos nativos (prompt/confirm) | Texto < 11 px |
|---|---|---|---|---|---|---|
| Finanzas | **común (muestra)**: empresa, moneda, horizonte | chips del sistema | barras por vista | tema | 0 / 19 | 467 |
| Rendiciones | título simple, sin logo | subrayado | arriba y en tarjetas | tema | 0 / 3 | 5 |
| Tareas | degradado propio, mes | subrayado (barra del sistema en borrador g2) | «+ Nueva tarea» a la derecha | tema | 0 / 0 | 12 |
| Contabilidad | barra marina, empresa solo en algunas pestañas | subrayado | dentro de cada tabla | **propia (#4f6ff0)** + fondo oscuro de App | 0 / 3 | 17 |
| Osiris | NavBar marina + hub de tarjetas | por sub-app | variable | tema | **13 / 49** | 402 |
| Allegria Foods | NavBar + hub; temporada a la derecha | botones de colores fijos | variable | tema (acento = peligro) | 0 / 5 | 190 |
| Allegria Service | barra de contexto (planta, temporada, fecha) + menú lateral | menú | **arriba a la derecha** (ProcPageHeader) | tema | 1 / 3 | 8 |
| Frisku Comercial | marina con logo | subrayado con conteos | variable | tema | 1 / 14 | 308 |
| Frisku Maestros | título simple | grupos rotulados | variable | tema | 0 / 4 | 22 |
| EEFF / ANF | título + selector Empresa/Mes/Año | segmentado | variable | tema / info | 0 / 1 | 187 |
| Programas comerciales (Allegria) | dentro de Parámetros | — | en línea | tema | 0 / 11 | 127 |

Lo común ya resuelto en la rama: navegación (lateral / riel / barra inferior), estados
(cargando, vacío, error, restringido), diálogos de la app, límite de error, capa heredada única.

## 2. Reglas del sistema común (lo que cada módulo adopta)

1. **Encabezado de módulo** (`EncabezadoModulo`): ruta, título, logo con alto fijo (nunca
   deformado), contexto **Empresa · Moneda · Período** en el mismo lugar, estado de guardado y
   acciones a la derecha. Allegria Service ya tiene su barra de contexto: se conserva y se
   alinea al mismo formato. Contabilidad usa el selector de empresa como dato de contexto.
2. **Pestañas**: `.mdt-pestanas` (chips) para secciones de un módulo; variante `--barra`
   (subrayada) para el nivel interior (empresas del flujo, sub-vistas). Una fila; en teléfono
   se desliza. Sin colores por pestaña.
3. **Acciones**: la principal arriba a la derecha del encabezado de la vista; las de cada
   registro, en su fila o tarjeta. Mismas palabras para acciones equivalentes (Aprobar,
   Devolver con motivo, Anular con motivo, Exportar Excel, Imprimir).
4. **Circuito de aprobación** (`Circuito`): todo flujo con estados (rendiciones, nóminas;
   después contratos/anexos de Osiris, liquidaciones de Frisku, órdenes de Service) muestra
   quién y cuándo, el paso en curso y la devolución.
5. **Documentos**: resumen «Respaldos: X de Y» antes de la acción que los exige (rendiciones;
   nóminas ya tiene su cobertura; después COMEX de Frisku y contratos de Osiris).
6. **Tablas**: financieras se desplazan con columna y encabezado fijos (11 px mínimo); tablas
   de acción se apilan en teléfono (`.mdt-tabla-apilable`). Nunca se recortan columnas útiles.
7. **Estados**: `EstadoVista`; una lectura fallida nunca es «sin registros» ni cero.
8. **Diálogos**: los de la app; un registro que cambió mientras se respondía no se aplica.
9. **Paleta única** (`sistema.css` + `theme.js`): Contabilidad deja su paleta propia y el fondo
   oscuro; Allegria deja los colores fijos de pestañas.

## 3. Identidad que se conserva

- **Logos** (8 en `public/`): en pantalla, todos con alto fijo y `object-fit: contain`
  (verificado). **Deformados en exportaciones** (no se tocaron; requieren tu visto bueno porque
  cambian archivos que se entregan): PDF de Osiris (`OsirisModule.jsx:907`, logo 2,75:1 forzado a
  cuadrado), Reporte Semanal PDF (`FinanzasModule.jsx` ~12125, ≈ 23 % más angosto), PDF de PO
  de Frisku (`FriskuComercialModule.jsx:5013`, ≈ 27 % más ancho), Excel de Osiris
  (`OsirisModule.jsx:1217/1228`, ≈ 15 % más angosto). Propuesta: calcular el ancho desde la
  proporción real, como ya hacen Rendiciones y Frisku.
- **GIF de especies**: **no hay GIF en el repositorio.** Son URL que cada persona carga en
  Osiris → Maestro Especies (campo «.gif, .png, .jpg»); se muestran en cajas de 36 y 26 px con
  `object-fit: cover`, que **recorta** imágenes no cuadradas. Propuesta: `contain` y una caja
  algo mayor en las fichas. Los datos ficticios de la vista previa no traen esas URL, así que la
  animación no se puede verificar ahí con datos reales; se puede cargar una URL de prueba en el
  maestro de la vista previa.

## 4. Aplicación por grupos (después de tu revisión de la muestra)

| Grupo | Módulos | Qué cambia | Qué se conserva |
|---|---|---|---|
| 2 | Tareas, Contabilidad (borrador ya iniciado en `claude/diseno-grupo2-borrador`) | encabezado común, pestañas del sistema, tabla apilable de tareas, estados de error, paleta única en Contabilidad | semáforo doble, dependencias, apertura por empresa; árbol de cuentas y centralización |
| 3 | Osiris | encabezado común sobre el hub, circuito en contratos/anexos, 13 prompts → diálogos de la app, texto ≥ 11 px | hub de tarjetas, asistentes, informe de visita |
| 4 | Allegria Foods y Service | encabezado común con temporada; Service alinea su barra de contexto; circuito en órdenes/despachos | parámetros por fruta, liquidación por contraparte, menú lateral de Service |
| 5 | Frisku Comercial y Maestros | encabezado común, circuito en liquidaciones, resumen de documentos COMEX | programa semanal, OE/Packing List, reportes BI |

Cada grupo: sin reescribir módulos, sin tocar cálculos, persistencia ni permisos; pruebas solo de
lo que cambia sobre un build congelado; capturas en los 4 tamaños.
