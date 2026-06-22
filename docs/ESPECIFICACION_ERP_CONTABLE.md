# Especificación ERP Contable — Grupo Mediterra

## 0. Objetivo y principio rector

Construir un sistema contable y de gestión lo más fiel posible a Softland, partiendo de lo más básico de la contabilidad hasta la emisión de informes contables y de gestión, para las empresas de Grupo Mediterra. Debe absorber la historia de los dos ERP de origen (CONTEC y Megasystem) desde al menos 2020 y convertirse en el sistema único del grupo.

**Principio rector:** la verdad contable es el asiento de doble entrada cuadrado (Σ debe = Σ haber por asiento). Todo lo demás (libros, balances, informes, módulos auxiliares, agrícola, remuneraciones) son productores o lectores de asientos. Ningún módulo escribe saldos directamente; todo pasa por el libro diario.

**Regla de oro de ejecución:** no se altera ni se borra una fase ya entregada y validada para avanzar. Migraciones y refactors se hacen aditivos. Períodos cerrados y ejercicios migrados son inmutables.

---

## 1. Empresas del grupo y sus particularidades

| Empresa | RUT | Régimen | ERP origen | Moneda funcional | Agrícola |
|---|---|---|---|---|---|
| Inversiones Mediterra SpA | 76.732.213-5 | 14A | Megasystem | USD | No |
| Allegria Foods SpA | 77.026.047-7 | 14A | CONTEC | USD | No |
| Allegria Service SpA | 77.328.702-3 | 14A | CONTEC | USD | No |
| Osiris Plant Management SpA | 77.190.867-5 | 14A | Megasystem | USD | No |
| Frisku Foods SpA | 76.758.722-8 | 14A | Megasystem | USD | No |
| Integrity Farms SpA | 77.253.101-K | 14D | Megasystem | USD | No |
| Allpa Farms SpA (Chile) | 77.446.984-2 | 14A | Megasystem | CLP | Sí |
| Allpa Farms (Perú) | n/a (RUC Perú) | n/a (Perú) | Megasystem | USD | No |
| Inversiones Arrayan SpA | 77.026.239-9 | 14A | Megasystem | CLP | No |
| Montejato SpA | 77.009.311-2 | 14A | Megasystem | CLP | No |
| Asesorías e Inversiones Pafu SpA | 77.371.701-K | 14D | Megasystem | CLP | No |
| Mesain SpA | 77.997.049-3 | 14A | Megasystem | USD | No |
| Lucía Corbetto (persona natural) | 22.679.064-0 | 14A | Megasystem | CLP | No |
| Cristóbal Ortiz (persona natural) | 14.121.484-5 | 14A | Megasystem | CLP | No |

**Notas:**
- Régimen: 14A = Régimen General Semi Integrado (Art. 14 A). 14D = Pro Pyme (Art. 14 D); confirmar si Integrity y Pafu son Pro Pyme General (14 D N°3) o Transparente (14 D N°8), porque la transparente no determina RLI a nivel de empresa.
- Allpa Farms SpA (Chile) es la productora de cerezas y único usuario del módulo agrícola hoy; Allpa Farms Perú es entidad peruana (no aparece en el cuadro SII chileno).
- Lucía Corbetto y Cristóbal Ortiz son personas naturales con actividad y sí entran al sistema; su contabilidad es más simple (14A, en CLP, sin módulo agrícola).
- El módulo agrícola debe diseñarse reutilizable: activable por empresa vía flag, listo para una futura empresa agrícola sin tocar el core.

### Implicación de la moneda funcional USD (clave de diseño)

La mayoría de las entidades del grupo lleva su contabilidad financiera (IFRS) en dólar. La contabilidad tributaria, en cambio, depende de si la entidad tiene autorización del SII para llevar contabilidad en dólares (Art. 18 Código Tributario), y algunas entidades del grupo sí la tienen. Esto vuelve estructural, no opcional, la combinación de (a) la marca de marco T/F por asiento de la sección 4 y (b) la multimoneda de la sección 5. Por eso `contab_empresas` lleva `moneda_tributaria` separada de `moneda_funcional`, y se resuelve por empresa en dos casos:

- **Entidad autorizada a contabilidad en USD:** `moneda_funcional = moneda_tributaria = USD`. El dólar es la moneda base única; las operaciones en CLP se convierten a USD. No hay conversión USD→CLP para el SII.
- **Entidad no autorizada:** `moneda_funcional = USD` (IFRS) y `moneda_tributaria = CLP`. Conviven dos monedas base: cada asiento se expresa en ambas, y la conversión USD↔CLP alimenta los informes tributarios.

La lista exacta de qué empresa está en cada caso se completa con los regímenes tributarios que Angelo cargará (ver sección 11). Hasta tener esa lista, Claude Code deja el campo `moneda_tributaria` parametrizable por empresa sin asumir un valor.

---

## 2. Arquitectura de datos (Supabase / Postgres)

### 2.1 Lo ya existente (mantener, extender)

```
contab_empresas, contab_plan_cuentas, contab_homologacion,
contab_asientos, contab_asientos_lineas, contab_periodos,
cc_campos, cc_sectores, cc_cuarteles, doc_lotes, doc_lotes_lineas
```

Vistas: `contab_balance_8_columnas`, `contab_costos_cuartel`, `contab_saldos_acumulados`

### 2.2 Correcciones estructurales obligatorias antes de seguir

**contab_empresas — agregar:**
- `usa_modulo_agricola boolean default false`
- `usa_modulo_remuneraciones boolean default false`
- `usa_activo_fijo boolean default false`
- `moneda_funcional char(3)` — moneda en que se lleva la contabilidad financiera (IFRS)
- `moneda_tributaria char(3)` — moneda de presentación al SII; puede diferir de la funcional (ver sección 1)
- `moneda_presentacion char(3)` — moneda del consolidado del grupo (USD)
- `regimen_tributario text` (ProPyme, semi-integrado, etc.)

**contab_plan_cuentas — atributos explícitos, NO inferir tipo del primer dígito:**
- `naturaleza char(1)` D/H (deudora/acreedora)
- `mueve (= imputable) boolean` — true solo en cuentas hoja; los agrupadores tienen mueve=false
- `nivel int`, `cuenta_padre_id`
- `exige_auxiliar boolean`, `exige_centro_costo boolean`
- `moneda char(3) null` (null = moneda funcional de la empresa)
- `clasificacion_esf text` (Activo corriente, Activo no corriente, Pasivo corriente, Pasivo no corriente, Patrimonio)
- `clasificacion_eri text` (Ingresos, Costo de venta, GAV, No operacional…)
- `tipo char(1)` (A/P/C/I/E) — derivado, editable, el dígito es solo sugerencia inicial del wizard

**contab_homologacion — soportar múltiples orígenes:**
- `sistema_origen text` (CONTEC, MEGASYSTEM, MANUAL)
- `codigo_externo text`, `nombre_externo text`
- `cuenta_id` (FK a plan interno, nullable hasta mapear)
- `UNIQUE (empresa_id, sistema_origen, codigo_externo)`

**contab_asientos — agregar:**
- `marco char(1)` T/F/A (Tributario / Financiero-IFRS / Ajuste) — ver sección 4
- `tipo_comprobante text` (Ingreso, Egreso, Traspaso, Apertura, Cierre, Centralización)
- `origen text` (MANUAL, CENTRALIZACION_SII, REMUNERACIONES, ACTIVO_FIJO, AGRICOLA, MIGRACION)
- `glosa text`, `estado text` (borrador/cuadrado/contabilizado/anulado)

**contab_asientos_lineas — agregar:**
- `moneda char(3)`, `tipo_cambio numeric`, `debe_mo numeric`, `haber_mo numeric` (montos en moneda origen) + debe/haber ya convertidos a moneda funcional
- `auxiliar_id` (FK), `centro_costo_id` (FK cuartel/sector/campo)
- `glosa_linea text`

### 2.3 Tablas nuevas por módulo (resumen; el detalle se modela en su fase)

```sql
-- Tributario
trib_documentos          (DTE: factura, NC, ND, boleta, honorario, exenta…)
trib_libro_compras / trib_libro_ventas
trib_codigos_iva         (afecto, exento, retención, proporcional)

-- Auxiliares y cuenta corriente
aux_entidades            (clientes/proveedores por RUT, unificado)
aux_partidas_abiertas    (open items para pareo cobranza/pago)
tes_bancos / tes_cartolas / tes_conciliacion

-- Activo fijo
af_activos               (con vida útil tributaria y financiera separadas)
af_depreciaciones        (cuota mensual por marco T/F)
af_movimientos           (alta, baja, revalorización, traslado)

-- Corrección monetaria
cm_indices               (IPC/UF/UTM/TC por fecha)
cm_ajustes               (reajuste cuentas no monetarias y capital)

-- Multimoneda
fx_tipos_cambio          (por moneda y fecha; observado, cierre)

-- Presupuesto y gestión (ver sección 8.1)
pres_presupuestos        (cabecera: empresa, ejercicio, versión/escenario, moneda, calendario fiscal o temporada)
pres_lineas              (cuenta + centro de costo + período + monto presupuestado)
gest_desviaciones        (comentario editable por línea de variación real vs PPTO)

-- Remuneraciones (módulo aparte, ver sección 7)
rem_*                    (esquema separado, se centraliza vía asiento)

-- Agrícola (solo empresas con flag, ver sección 6)
agri_*
```

### 2.4 Convenciones técnicas

- RLS por empresa en todas las tablas. Toda query filtra por `empresa_id`.
- IDs UUID. Timestamps `created_at`/`updated_at`/`created_by`.
- Auditoría: tabla `audit_log` para todo cambio en asientos contabilizados.
- Nunca borrado físico de asientos contabilizados; solo anulación con contra-asiento.
- Vistas materializadas para informes pesados; refresco controlado.

---

## 3. Migración multi-origen (CORE del proyecto)

### 3.1 Patrón de adaptador

Un adaptador por sistema origen, desacoplado del core:
- `adapter_contec` — parser de los exports de CONTEC (Allegria Foods, Allegria Service)
- `adapter_megasystem` — parser de los exports de Megasystem (resto)

Cada adaptador vuelca a tablas de staging (`stg_*`) antes de tocar el core. El core nunca se escribe directo desde un archivo.

Claude Code: los formatos exactos de export de CONTEC y Megasystem se descubren desde los archivos reales que entregue Angelo. No asumir estructura. Primer paso de cada adaptador: inspeccionar el archivo y proponer el mapeo de columnas para aprobación.

### 3.2 Estrategia de historia (decidida)

| Empresa | Desde | Detalle |
|---|---|---|
| Allegria Foods | 2020 | Mixto: 2020–2023 saldos de apertura + mayores resumidos mensuales; 2024+ asientos detallados |
| Allegria Service | 2020 | Mixto: 2020–2023 saldos de apertura + mayores resumidos mensuales; 2024+ asientos detallados |
| Resto del grupo | 2024 | Asientos detallados desde 2024 |

El detalle al 100% línea por línea de 2020–2023 en Allegria solo se hace si Angelo lo pide explícitamente para una cuenta o análisis puntual; el default es resumido para esos años, suficiente para tendencia y comparativos.

### 3.3 Control de integridad (no negociable)

Cada año/empresa migrado debe cuadrar contra el balance oficial ya presentado al SII. El proceso de migración genera un reporte de conciliación: saldo migrado vs saldo oficial por cuenta, con diferencias resaltadas. Un año no se da por migrado hasta que concilia.

### 3.4 Inmutabilidad

Ejercicios migrados y períodos cerrados quedan marcados `cerrado/inmutable`. No editables. Correcciones solo vía asiento de ajuste en período abierto.

---

## 4. Contabilidad tributaria vs financiera (IFRS)

**Decisión adoptada:** libro único con marco etiquetado, NO dos libros paralelos.

- Cada asiento lleva `marco = T` (tributario), `F` (financiero/IFRS) o `A` (ajuste).
- La operación normal genera asientos `T` (que también valen para `F` salvo ajuste).
- Las diferencias IFRS (leasing, deterioro, valor razonable, activos biológicos en agrícola, etc.) se registran como asientos `A` que solo suman en la vista financiera.
- Los informes se emiten filtrando por marco: Balance Tributario (T), Balance IFRS (T+A).
- Puente a renta: la RLI parte del resultado tributario y aplica agregados/deducciones. Modelar registros empresariales (RAI, DDAN, REX, SAC) en fase tributaria avanzada.

---

## 5. Multimoneda y corrección monetaria (son cosas distintas)

**Multimoneda.** Cada línea puede registrarse en moneda origen y se convierte a moneda funcional vía `fx_tipos_cambio`. Diferencia de cambio realizada (al pago) y no realizada (al cierre) se calcula y contabiliza automáticamente. Para consolidación, conversión de moneda funcional a moneda de presentación del grupo.

**Corrección monetaria (Chile tributario).** Reajuste por IPC de cuentas no monetarias (activo fijo, existencias, capital propio) al cierre. Motor separado que lee `cm_indices` y genera el asiento de corrección monetaria. Obligatorio para la renta, independiente de la multimoneda.

---

## 6. Submódulo agrícola (opcional por empresa)

Activable vía `usa_modulo_agricola`. Hoy solo Allpa Farms Chile. Alcance basado en MEGAAGRO:

- **Maestros:** especies, variedades sobre jerarquía fundo (campo) → sector → cuartel. Cada cuartel con especie/variedad, superficie, año de plantación.
- **Insumos y bodega:** maestro de insumos, bodegas, movimientos de entrada/salida, stock valorizado (PMP o FIFO).
- **Órdenes de aplicación (OA) y BPA:** crear OA por cuartel/labor, confirmar aplicación, libro de campo. Trazabilidad.
- **Asignación de mano de obra:** por labor + centro de costo (cuartel) + trabajador. Trato, jornada, contratista propio o externo.
- **Costeo:** el consumo de insumos y la mano de obra se costean y se asignan al cuartel/especie/variedad.
- **Centralización de consumo:** el consumo costeado genera asiento contable automático (origen `AGRICOLA`), igual que la centralización SII.
- **Cosecha y rendimiento:** registro de cosecha por fundo/especie/variedad/cuartel, kilos y rendimiento.
- **Informes:** costo por especie/variedad/cuartel, costo anual y mensual, estado de resultado agrícola.
- **IFRS:** activos biológicos (NIC 41) como asiento de marco `A` cuando corresponda.

El tab agrícola en la UI aparece solo si el flag está prendido. El core contable no depende del módulo agrícola.

### 6.1 Referencias de Megasystem (revisar antes de diseñar)

Para entender cómo opera Megasystem en la práctica, revisar:
- Área agrícola y listado de módulos: https://www.megasystem.cl/area-agricola/
- Ficha técnica agrícola (PDF): https://www.megasystem.cl/wp-content/uploads/2018/07/002-FICHA-AGRICOLA.pdf

Claude Code: antes de modelar el módulo agrícola, hacer `web_fetch` de la página y del PDF de ficha técnica para alinear nomenclatura y flujo. No copiar la UI; tomar el modelo conceptual y la nomenclatura conocida por el usuario.

### 6.2 Remuneración agrícola (MEGAAGRO Remuneraciones)

El módulo de remuneraciones (sección 7) debe contemplar el caso agrícola. Particularidades a soportar para Allpa Chile y futuras agrícolas: haberes y descuentos variables, trato (pago por rendimiento/labor), liquidaciones de sueldo, control de feriado y finiquitos, gratificación anual 25%/30%, y sobre todo la asignación del costo de la mano de obra por labor, cuartel y trabajador, que es el puente con el costeo agrícola de la sección 6 y con la centralización contable. La nómina agrícola alimenta el costo del cuartel, no solo el gasto contable.

---

## 7. Módulo de remuneraciones (separado, estilo BUK)

Esquema separado del contable (`rem_*`). Se comunica con contabilidad solo vía centralización (asiento origen `REMUNERACIONES`). MVP escalonado:

1. Ficha de personal, contratos y finiquitos.
2. Estructura de haberes y descuentos parametrizable por el usuario (imponibles, no imponibles, legales).
3. Liquidación de sueldo mensual, AFP/Isapre, impuesto único, gratificación 25%/30%.
4. Previred, libro de remuneraciones.
5. Centralización a contabilidad (provisión y pago), con asignación a centro de costo. Para empresas con `usa_modulo_agricola`, la nómina además distribuye el costo de mano de obra por labor, cuartel y trabajador hacia el costeo agrícola (sección 6.2), no solo al gasto contable.
6. Certificados de renta y DJ anuales.

Replicar BUK completo es fuera de alcance del MVP; se documenta el camino pero se entrega por capas.

---

## 8. Informes (contables, tributarios, de gestión)

- **Contables:** Libro Diario, Libro Mayor, Balance de Comprobación y Saldos (8 columnas), Balance Clasificado, Estado de Resultado, análisis de cuentas.
- **Tributarios:** Libro de Compras y Ventas, base F29, libro de honorarios, libro de remuneraciones.
- **Gestión:** ver detalle en sección 8.1.
- **Consolidación (fase posterior):** consolidado multiempresa con conversión de moneda y eliminación de intercompany.

Todos los informes filtran por marco (T / F) y respetan multimoneda.

### 8.1 Módulo de presupuesto e informes de gestión

**Submódulo de presupuesto.** Tablas `pres_presupuestos` (cabecera: empresa, ejercicio, versión/escenario, moneda, calendario) y `pres_lineas` (cuenta interna + centro de costo + período + monto). Requisitos:

- **Doble calendario.** El presupuesto debe poder armarse por año fiscal (ene–dic, para EEFF y tributario) y por temporada operativa/agrícola (jul–jun, para flujo, presupuestos y análisis de gestión). Cada presupuesto declara su calendario.
- **Versiones y escenarios.** PPTO original, reproyecciones, escenario optimista/pesimista. Se compara contra cualquiera.
- **Carga desde Excel.** Importador que mapea cuenta + CeCo + período, validando contra el plan interno.
- **Multimoneda.** Presupuesto en la moneda funcional de la empresa, comparable contra el real en la misma moneda.

**Informes de gestión:**

- **Real vs Presupuesto.** Por cuenta, agrupación ESF/ERI, centro de costo y empresa. Variación absoluta y porcentual, del mes y acumulada. Comparable contra cualquier versión de PPTO.
- **Explicación de desviaciones.** Detección automática de las mayores desviaciones (por monto y por %) con comentario editable por línea, para construir la narrativa ejecutiva. Las desviaciones marcadas se arrastran al informe de comité.
- **Ratios financieros.** Liquidez corriente y prueba ácida, endeudamiento y leverage, rentabilidad (margen bruto/operacional/neto, ROE, ROA), EBITDA y margen EBITDA, rotación y días de cuentas por cobrar/pagar y existencias, capital de trabajo. Cada ratio con su fórmula explícita y comparativo contra período anterior y contra presupuesto.
- **Comparativos.** Mes vs mes, año contra año (YoY), acumulado vs PPTO, evolución mensual y tendencia.
- **Estado de resultado agrícola** por cuartel/especie/variedad (empresas con módulo agrícola).
- **Dashboard CFO.** Resumen ejecutivo con KPIs, semáforos de desviación y evolución, por empresa y consolidado.
- **Integración con el flujo de comité.** El módulo debe poder exportar la estructura que ya usan los informes de directorio del grupo (P&L con variación vs PPTO, composición de OPEX, detalle de desviaciones con comentario), de modo que alimente directamente la generación del deck mensual de comité en vez de rehacer el dato a mano.

---

## 9. Roadmap por fases

Cada fase termina con datos reales validados y aprobados por Angelo antes de avanzar.

| Fase | Nombre | Resumen |
|---|---|---|
| **0** | Correcciones estructurales | Aplicar 2.2 (atributos de plan de cuentas, marco T/F y campos de moneda en asientos, moneda_funcional/moneda_tributaria en empresas, sistema_origen en homologación). Sin esto nada más es sólido. |
| **1** | Core operativo (piloto Allpa Chile) | Importar plan de cuentas, homologar 746 códigos Megasystem, Libro Diario + cuadre, centralización SII, Balance 8 columnas y ER con datos reales. Allpa Chile es CLP funcional — buena piloto sin complejidad cambiaria. Segunda empresa: una USD (Osiris o Frisku) para ejercitar funcional vs tributaria. |
| **2** | Adaptadores de migración | adapter_megasystem primero (Allpa, Osiris, Frisku, Integrity, Allpa Perú), luego adapter_contec (Allegria Foods/Service). Staging, estrategia mixta de historia, conciliación contra balances oficiales. |
| **3** | Multimoneda y corrección monetaria | Diferencia de cambio realizada/no realizada, conversión funcional↔tributaria, corrección monetaria por IPC. Imprescindible para operar las seis entidades USD y Allpa Perú con propiedad. |
| **4** | Motor tributario | IVA, libros compras/ventas, honorarios, base F29, conciliación RCV. Sobre la base USD/CLP ya resuelta en Fase 3. |
| **5** | Auxiliares y tesorería | Cuenta corriente clientes/proveedores con open items, bancos, conciliación bancaria. |
| **5B** | Presupuesto e informes de gestión | Ver sección 8.1. Puede arrancar apenas Fase 2 entregue real comparable, en paralelo a Fases 4/5. Solo depende del plan de cuentas y saldos reales. Prioridad alta (trabajo central del CFO). |
| **6** | Activo fijo | Altas, depreciación T y F, revalorización, bajas, centralización. |
| **7** | Submódulo agrícola (Allpa Chile) | Maestros, insumos/bodega, OA/BPA, mano de obra, costeo, centralización de consumo, cosecha, informes agrícolas. |
| **8** | Remuneraciones | Por capas según sección 7. |
| **9** | IFRS y consolidación | Asientos de ajuste marco A, activos biológicos, consolidado multiempresa multimoneda con eliminación intercompany. |

---

## 10. Restricciones de seguridad y operación

- Ejecución vía Claude Code CLI con aprobación individual de cada tool call (modo single-approval).
- Sin exposición de credenciales en código ni en commits.
- RLS estricto por empresa. Hashing de PIN pendiente (SEG-001) antes de exponer multiusuario.
- Cada fase con migración Supabase reversible y respaldo previo.

---

## 11. Regímenes tributarios y matriz de moneda por empresa (pendiente de carga)

Angelo cargará la confirmación de autorización SII por dólar y el sub-tipo de los regímenes 14D. Define cómo se modelan los registros empresariales y la RLI (Fase 4) y el valor de `moneda_tributaria` (Fase 0).

| Empresa | RUT | Régimen | Autorizada contab. USD | moneda_funcional | moneda_tributaria |
|---|---|---|---|---|---|
| Inversiones Mediterra SpA | 76.732.213-5 | 14A | por confirmar | USD | según autorización |
| Allegria Foods SpA | 77.026.047-7 | 14A | por confirmar | USD | según autorización |
| Allegria Service SpA | 77.328.702-3 | 14A | por confirmar | USD | según autorización |
| Osiris Plant Management SpA | 77.190.867-5 | 14A | por confirmar | USD | según autorización |
| Frisku Foods SpA | 76.758.722-8 | 14A | por confirmar | USD | según autorización |
| Integrity Farms SpA | 77.253.101-K | 14D (sub-tipo?) | por confirmar | USD | según autorización |
| Allpa Farms SpA (Chile) | 77.446.984-2 | 14A | No | CLP | CLP |
| Allpa Farms (Perú) | n/a Perú | n/a | n/a (Perú) | USD | n/a Perú |
| Inversiones Arrayan SpA | 77.026.239-9 | 14A | No | CLP | CLP |
| Montejato SpA | 77.009.311-2 | 14A | No | CLP | CLP |
| Asesorías e Inversiones Pafu SpA | 77.371.701-K | 14D (sub-tipo?) | No | CLP | CLP |
| Mesain SpA | 77.997.049-3 | 14A | por confirmar | USD | según autorización |
| Lucía Corbetto (p. natural) | 22.679.064-0 | 14A | No | CLP | CLP |
| Cristóbal Ortiz (p. natural) | 14.121.484-5 | 14A | No | CLP | CLP |

**Regla de llenado:** si la entidad está autorizada a contabilidad en USD, `moneda_tributaria = USD`; si no, `moneda_tributaria = CLP`. Las entidades CLP funcional no requieren la pregunta de autorización (su tributaria es CLP por defecto). La autorización SII solo queda abierta para las USD funcional: Mediterra, Allegria Foods, Allegria Service, Osiris, Frisku, Integrity y Mesain. El sub-tipo de los 14D (Pro Pyme General N°3 vs Transparente N°8) define si la entidad determina RLI propia o traspasa resultado a los dueños.
