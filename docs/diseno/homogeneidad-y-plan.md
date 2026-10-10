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

- **Logos** (8 en `public/`): en pantalla, alto fijo y `object-fit: contain`. En las 4
  exportaciones que los deformaban (PDF de Osiris, Excel de Osiris, Reporte Semanal PDF, PDF de PO
  de Frisku) ahora se encajan con su proporción real (`src/diseno/logoExport.js`); medido en los
  archivos: estado §6f.
- **GIF de especies**: siguen siendo las URL del Maestro de Especies; se muestran completos
  (`contain`, cajas de 32 y 48 px). La vista previa trae un GIF de prueba; animación y ausencia de
  recorte comprobadas (estado §6f).

## 4. Aplicación por grupos (después de tu revisión de la muestra)

| Grupo | Módulos | Qué cambia | Qué se conserva |
|---|---|---|---|
| 2 | Tareas, Contabilidad (borrador ya iniciado en `claude/diseno-grupo2-borrador`) | encabezado común, pestañas del sistema, tabla apilable de tareas, estados de error, paleta única en Contabilidad | semáforo doble, dependencias, apertura por empresa; árbol de cuentas y centralización |
| 3 | Osiris | encabezado común sobre el hub, circuito en contratos/anexos, 13 prompts → diálogos de la app, texto ≥ 11 px | hub de tarjetas, asistentes, informe de visita |
| 4 | Allegria Foods y Service | encabezado común con temporada; Service alinea su barra de contexto; circuito en órdenes/despachos | parámetros por fruta, liquidación por contraparte, menú lateral de Service |
| 5 | Frisku Comercial y Maestros | encabezado común, circuito en liquidaciones, resumen de documentos COMEX | programa semanal, OE/Packing List, reportes BI |

Cada grupo: sin reescribir módulos, sin tocar cálculos, persistencia ni permisos; pruebas solo de
lo que cambia sobre un build congelado; capturas en los 4 tamaños.

## 5. Franja ejecutiva del CFO (propuesta, no implementada) — revisada el 10-10

**Qué mostraría** (una fila compacta sobre «Requiere tu decisión», solo para quien tiene
Finanzas → Dashboard): caja hoy, deuda (capital pendiente, con lo vencido y lo por conciliar
aparte) y alertas. Cada cifra lleva a la pantalla donde está su detalle.

### Corrección a la versión del 09-10

La versión anterior decía que había que integrar la rama funcional. **Es incorrecto para la
deuda.** `main` (c9c5792, la base de esta rama) ya reemplazó el modelo de créditos: contratos con
calendario, pagos registrados, conciliaciones y TC al corte, todo en `src/creditos.js`, puro y
probado. El `capitalPendienteCreditos` de la rama funcional se escribió sobre el modelo anterior
(marca `pagado`, `f_venc`, `cuota`): no conoce los créditos tipo «contrato» ni los pagos
registrados, así que llevarlo sería retroceder. Lo que falta en `main` no es el cálculo, es
usarlo: el KPI del Dashboard sigue mostrando la cifra fija 8.355.763.

### Conjunto que sí se puede extraer sin integrar la rama funcional

| Cifra | Función (ya existe en `main`, pura) | Lee | Cambio necesario |
|---|---|---|---|
| Caja hoy por sociedad y total, con «INCOMPLETO» | `saldoBancoEmpresaUSD`, `avisoSaldoIncompleto` (`src/saldosBancosUSD.js`) | `finanzas_bancos` | ninguno en el cálculo |
| Deuda: capital pendiente, vencido, por conciliar, sin TC | `valorizarCreditos` + `analisisCartera` (`src/creditos.js`), los mismos de Créditos → «Análisis CFO» | `finanzas.creditos_data`, `maestro_tc` | exportar `EMPRESAS_KEYS_CONSOLIDADO` (hoy constante interna de `FinanzasModule`) para separar las JV |
| Alertas | `porConciliarCartera` (créditos), `avisoSaldoIncompleto` (bancos), `sinTC` de `analisisCartera` | las mismas filas | ninguno |

Selector propuesto: `resumenEjecutivo({ bancos, creditos, tc, hoy })` en un archivo nuevo, que
solo llame a esas funciones. Sin fórmulas propias y sin cifras fijas.

**Mínimo de caja proyectado: queda fuera de este conjunto.** Necesita el flujo de las 6
sociedades ya construido (`buildEmpresas` + ajustes de préstamos y Allegria Service + valores
manuales, líneas agregadas y sublíneas), que hoy se arma **dentro del componente** de Finanzas
(un `useMemo` y la normalización de `applyData`). Para leerlo desde el inicio habría que
extraer ese armado a una función pura: es un cambio funcional en el motor del flujo, más grande
que la franja. Además, la definición correcta del mínimo (`cajaGrupoBase`: 6 sociedades, saldo
de Saldos Bancos, desde el mes en curso) está solo en la rama funcional (commit 6407e6d) y
`main` todavía suma las 8 sociedades al 100 %. Mientras tanto, la franja enlaza al Dashboard
para el mínimo.

### Lectura sin efectos de guardado (requisito previo)

`dbLoad` y `dbLoadBancos` de Finanzas llaman a `persist.registrarCarga`, que **borra el conflicto
pendiente y la marca de cambios** de la fila y le cambia la versión. Si el inicio leyera
`finanzas` con ellas mientras Finanzas está en conflicto con otra sesión, el siguiente
auto-save de Finanzas pisaría el trabajo de la otra persona. `dbLoadGeneric` (para
`maestro_tc`) registra su propia lectura.

Prueba: `src/__tests__/lecturaInicioSinEfectos.test.js` (4 casos, contra un servidor en memoria):

1. **Control**: leer «como hoy» desde el inicio borra el conflicto, y el guardado siguiente
   reemplaza el 1.000 de la otra sesión por 7.777. La prueba detecta el defecto.
2. **Lector propuesto** (solo GET y ninguna llamada al contrato de guardado): el estado de
   guardado de `finanzas`, `finanzas_bancos` y `maestro_tc` queda idéntico, el conflicto sigue
   bloqueando el guardado y no sale ninguna escritura.
3. Una lectura fallida (red o HTTP 503) es un error, nunca una cifra.
4. Ninguna petición sale del servidor falso.

El lector vive en la prueba: no hay código de producción nuevo. Implementarlo es el primer paso
cuando autorices la franja.

### Orden propuesto (cuando lo autorices)

1. Lector de solo lectura en `src/diseno/` (el de la prueba) y su uso desde el inicio.
2. `resumenEjecutivo` con las funciones de la tabla, más una prueba que compare sus cifras con
   las de Créditos → «Análisis CFO» y Saldos Bancos sobre los mismos datos.
3. Franja en el inicio, con estados cargando / error / sin permiso.
4. Aparte, y con su propia decisión: que el Dashboard de `main` deje la cifra fija y use
   `analisisCartera`; y la extracción del motor del flujo para el mínimo proyectado.
