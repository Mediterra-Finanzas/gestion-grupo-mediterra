# Matriz de acceso DETALLADA por módulo y pestaña — insumo para RLS (FASE 4)
Fecha: 2026-06-18 · Estado: BORRADOR para revisión de Angelo.

Define **quién lee/escribe cada función**. Guiará las reglas de seguridad.
**[DECISIÓN]** = necesito tu confirmación (regla de negocio).

## Nota técnica importante (granularidad)
La seguridad de base de datos (RLS) protege a nivel de **fila/tabla**, no de pestaña.
- Si varias pestañas comparten **una misma fila**, la regla las trata **juntas** (todo o nada). La separación fina entre ellas queda a nivel **pantalla** (permisos por pestaña que ya existen).
- Si una función tiene **su propia fila**, sí se puede separar con una regla propia.
Lo marco abajo con **[fila propia]** o **[fila compartida]**.

## Roles
admin (Angelo) · editor (Carol, Michelle, Pablo, Milagros…) · gerente_tecnico (Nicolás) · flags: esCFO, rendVerTodas, empresas_permitidas · personal general (solo sus rendiciones).

---

## TAREAS — fila `main` [fila compartida: todas las pestañas]
| Pestaña | Lee | Escribe | [DECISIÓN] |
|---|---|---|---|
| Diarias / Semanales / Quincenales / Mensuales / Anuales | equipo con login | responsable/supervisor de la tarea; admin | ¿algún rol solo-lectura? |
| Configuración | admin | admin | confirmar |

---

## FINANZAS
| Pestaña | Fila/tabla | Lee | Escribe | [DECISIÓN] |
|---|---|---|---|---|
| Dashboard | `finanzas` [compartida] | esCFO/admin/finanzas | — (solo lee) | quién ve Finanzas |
| **Flujo de caja** (Flujo Empresas) | `finanzas` [compartida] | finanzas autorizados | finanzas con "editar" | ¿respetar `empresas_permitidas` como límite duro? |
| Saldos Bancos | `finanzas` [compartida] | idem | idem | **sensible** |
| Créditos | `finanzas` [compartida] | idem | idem | |
| Parámetros | `finanzas` [compartida] | idem | admin/CFO | ¿restringir solo a CFO? |
| Reporte Semanal | `finanzas` [compartida] | idem | idem | |
| Auditoría | `audit_log` [fila propia] | admin | nadie (solo lectura) | confirmar |
| **Nóminas** | `nominas` [fila propia] + bucket `nominas-docs` | **admin + esCFO** | admin + esCFO; cadena de aprobación | **MUY sensible (sueldos)** — confirmar lista exacta |
| **Rendiciones** | `rendiciones` [fila propia] + `frisku-docs/rendiciones` | cada uno las suyas; aprobadores su cadena; `rendVerTodas` todas | cada uno crea las suyas; aprobadores aprueban/pagan | confirmar aprobadores y quién tiene `rendVerTodas` |
| **EEFF** | `eeff_*` (por empresa/mes) [filas propias] | esCFO/admin/finanzas | idem | ¿separar por empresa? |

> Nota: Flujo, Bancos, Créditos, Parámetros, Dashboard, Reporte **comparten la fila `finanzas`** → a nivel base se protegen juntas; la separación entre ellas es por pantalla. Nóminas, Rendiciones, EEFF y Auditoría tienen **fila propia** → se pueden separar con reglas.

---

## OSIRIS — fila `osiris` [fila compartida]
| Pestaña | Lee | Escribe | [DECISIÓN] |
|---|---|---|---|
| Contratos Prod-Exp / Obtentores / Viveros / Operación Técnica / Royalties | admin, gerente_tecnico, editores con osiris | idem | confirmar quiénes |

---

## ALLEGRIA — fila `allegria` [fila compartida]
| Pestaña | Lee | Escribe | [DECISIÓN] |
|---|---|---|---|
| Clientes / Productores / Embarques / Liquidación Productor / Liquidación Cliente / Anticipos / Cobranza | admin, editores con allegria | idem | confirmar quiénes |

---

## FRISKU
| Pestaña | Fila/tabla | Lee | Escribe | [DECISIÓN] |
|---|---|---|---|---|
| Dashboard / Clientes / Exportadoras / Contratos / Programa / Embarques / Liquidaciones | `frisku_*` [filas propias por entidad] | admin, editores con frisku | idem | confirmar quiénes |
| Maestros + TC | `maestro_*` [filas propias] | ¿lectura amplia? (datos de referencia) | admin/encargado | ¿quién edita maestros? |
| Archivos (boletas/docs) | bucket `frisku-docs` | idem módulo | idem | hoy PÚBLICO → pasar a privado |

---

## CONTABILIDAD — tablas `contab_*`, `cc_*`, `doc_*`, `af_*`, `mayor_*`
| Área | Lee | Escribe | [DECISIÓN] |
|---|---|---|---|
| Plan de cuentas, asientos, auxiliares, presupuesto, activo fijo, centros de costo, libro mayor | admin + contadores (Michelle, Pablo, Carol) | idem | confirmar quiénes entran a Contabilidad |
| `audit_log` | admin | NUNCA update/delete | regla fija |
| Multi-empresa | — | — | ¿cada quién ve **solo sus empresas** o todas? |

---

## Reglas transversales (default-deny)
1. Toda fila/tabla/bucket **nueva nace cerrada** a la llave pública.
2. Nadie sin sesión válida accede a nada.
3. `audit_log`: lectura admin; **nunca** borrar/editar.
4. Nóminas: círculo más reducido (admin + esCFO).
5. Buckets: **prohibido público**; `frisku-docs` pasa a privado + URL firmada; `nominas-docs` se corrige.

## Lo que necesito de ti (por módulo)
Confirma **quién LEE y quién ESCRIBE**, en especial:
- **Nóminas:** ¿solo admin + esCFO? ¿quiénes son esCFO?
- **Finanzas (flujo/bancos/créditos):** ¿lista de personas? ¿`empresas_permitidas` es límite duro?
- **Rendiciones:** ¿aprobadores y `rendVerTodas`?
- **Contabilidad:** ¿quiénes? ¿cada quién solo sus empresas?
- **Maestros Frisku:** ¿lectura amplia o restringida? ¿quién edita?
