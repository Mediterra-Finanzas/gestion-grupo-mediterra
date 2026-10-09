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

## 5. Franja ejecutiva del CFO (propuesta, no implementada)

**Qué mostraría** (una fila compacta sobre «Requiere tu decisión», solo para quien tiene
Finanzas → Dashboard): caja hoy (saldos bancarios vigentes, con «INCOMPLETO» si hay cuentas sin
paridad), deuda (capital por vencer de créditos, con lo «por conciliar» aparte), mínimo de caja
proyectado con su mes, y alertas (cuentas sin paridad, cuotas por conciliar, mínimo bajo cero).
Cada cifra lleva al Dashboard o a Créditos, donde está su detalle.

**Por qué no se implementó en esta rama.** Reutilizar «los cálculos existentes» aquí significa
reutilizar los del Dashboard de `main`, y dos de ellos no sirven:

- **Deuda**: el KPI «Créditos Totales Q1-26» es una cifra fija en el código (8.355.763). Llevarla
  al inicio sería justo la cifra estática que no se debe incorporar.
- **Mínimo y saldo final**: en `main` suman las 8 sociedades al 100 % (incluidas las JV que van
  por patrimonio), desde Apr-26 y con el saldo estático. No coinciden con el Consolidado.

Las dos están corregidas en la **rama funcional** (`claude/fervent-bell-uu6ae8`):
`capitalPendienteCreditos` (capital por vencer, por conciliar) y `cajaGrupoBase` (6 sociedades,
saldo de Saldos Bancos, arrastre desde el mes en curso), con sus pruebas. Solo la caja de hoy
tiene aquí una función pura reutilizable (`saldoBancoEmpresaUSD` / `avisoSaldoIncompleto`).

**Dependencias, en orden:**

1. Integrar la rama funcional (decisión tuya, por etapas; regla 15).
2. Extraer de `FinanzasModule` un **selector puro de solo lectura**
   (`resumenEjecutivo({finanzas, bancos, creditos, hoy})`) que use esas mismas funciones, y que
   el Dashboard pase a leer de él: una sola fuente para Dashboard e inicio.
3. Que el inicio lea las filas `finanzas` y `finanzas_bancos` con un lector **que no registre
   la carga en el contrato de guardado** (hoy `dbLoad`/`dbLoadBancos` llaman
   `persist.registrarCarga`; leer con ellas desde el inicio cambiaría el estado de guardado de
   Finanzas). Es un cambio de persistencia y por eso va con su prueba propia.

**Alternativa parcial (no recomendada):** solo «caja hoy» con `saldoBancoEmpresaUSD`, dejando
deuda y mínimo como enlace a Finanzas. Exige igual el paso 3 y muestra media foto: una caja
alta sin la deuda al lado induce a una lectura equivocada.
