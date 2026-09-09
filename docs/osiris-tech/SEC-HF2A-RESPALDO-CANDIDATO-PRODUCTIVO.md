# SEC-HF2-A · Respaldo seguro · Candidato productivo

Estado: **CANDIDATO. No desplegado. No se creó ningún recurso en producción.**
Rama: `respaldo/candidato-produccion` · commit `18e5162` sobre `e1463ef`.
Medición: staging `nlvfjpwiecgrosjnwwik`. Producción `bywovqayuzodbzwsriet` solo lectura.

---

## 1 · Commit y diff revisables

| Archivo | Qué hace |
|---|---|
| `src/data/restaurarLote.js` | Restore que falla cerrado ante un lote incompleto. |
| `src/data/recuperacion.js` | Recuperación en dos tiempos: ensayo aislado y aplicación selectiva por fila. |
| `src/data/__tests__/qa-restore-lote.test.js` | 14 casos, sin base de datos. |
| `scripts/respaldo/prueba-restore-lote.mjs` | Los mismos rechazos contra Storage y base reales. |
| `scripts/respaldo/prueba-recuperacion.mjs` | Escrituras posteriores del equipo, con contraprueba. |
| `scripts/respaldo/prueba-custodia-claves.mjs` | Verifica forma y correspondencia de claves, nunca valores. |
| `sql/respaldo/salud-y-programador.sql` | `pg_cron`, función de reserva, vista `respaldo_salud`. |

Ya en la rama de origen: `snapshot-transaccional.mjs`, `respaldoIdentidad.js`, `backupGenerador.js`, `api/osiris-backup.js`.

`git diff e1463ef..18e5162` — 7 archivos, 497 líneas, sin borrados.

---

## 2 · Frecuencia, retención y alerta

**Frecuencia propuesta:** diaria, 07:00 UTC (03:00 / 04:00 America/Santiago según DST).
En staging ya corre así: `cron.job` → `respaldo-osiris-staging-diario`, `0 7 * * *`, activo.

**Retención propuesta:** 30 diarios + 12 mensuales (el primero de cada mes). El borrado
lo hace un job aparte y **solo sobre lotes `READY`**: un `FAILED` nunca se limpia solo,
porque su permanencia es la señal.

**Alerta.** `public.respaldo_salud` publica un veredicto. El veredicto sale de
`respaldo_veredicto(...)`, función pura, para poder probar las seis ramas —
incluida la rama OK, porque una alarma que nunca dice OK no es una alarma.

```
PASS  sano                       -> OK
PASS  nunca hubo lote            -> ALERTA: nunca hubo un lote publicado
PASS  respaldo vencido 27 h      -> ALERTA: respaldo vencido
PASS  justo dentro de ventana 25 -> OK
PASS  programador fallo          -> ALERTA: el programador fallo en las ultimas 24 h
PASS  lote FAILED                -> ALERTA: lotes FAILED en las ultimas 24 h
PASS  CREATING colgado           -> ALERTA: lotes CREATING colgados
```

Ventana de vencimiento 26 h sobre cadencia de 24 h: una corrida perdida no alarma,
dos sí. La alarma se probó contra una falla real: las tres primeras corridas del
programador fallaron por un error mío de tipo (`uuid` vs `text`) y **nadie se habría
enterado**; `respaldo_salud` las levantó sola.

Falta por decidir: el canal de salida (correo al CFO vía `emailHelper`, o consulta
de la vista desde el hub). La detección está; el aviso al humano no.

---

## 3 · Custodia de claves A y B

13/13 PASS. Verificado sin imprimir ningún valor:

```
PASS  el archivo vive fuera de worktrees temporales   raiz del repositorio
PASS  gitignored (no viaja en un commit)              patron .env* en .gitignore
PASS  no esta rastreado por git                       git ls-files .env* -> vacio
PASS  clave A presente y de 256 bits                  256 bits
PASS  kid A declarado                                 kid=A-stg-82a046f3
PASS  kid del objeto A coincide con el custodiado     A-stg-82a046f3 == A-stg-82a046f3
PASS  la clave custodiada ABRE el objeto A            descifrado y checksum OK
PASS  (idem para B)                                   kid=B-stg-ef5ee1f5
PASS  una clave distinta de 256 bits NO abre A        autenticacion_fallida
```

El `kid` viaja en la cabecera del objeto en claro. Sirve para saber, mirando el
respaldo, cuál de las claves lo abre, sin probarlas a ciegas.

**Custodia productiva propuesta — tres copias, ningún worktree:**

1. Variables de entorno en Vercel (`BACKUP_ENCRYPTION_KEY_A/B`, `BACKUP_KID_A/B`).
   Es la copia que usa el sistema.
2. Copia sellada del CFO, fuera de esta máquina y fuera del repositorio.
3. Copia sellada de un segundo custodio, para el caso de que 1 y 2 se pierdan juntos.

Regla: **A y B nunca en el mismo sobre.** Si estuvieran juntas, la separación en dos
objetos con claves distintas no compra nada.

Las claves productivas no existen todavía. **No las genero yo sin instrucción tuya**,
y cuando se generen no pasan por este chat.

---

## 4 · Cobertura: usuarios, permisos y credenciales

Dos objetos, dos claves. Restaurar A no permite descifrar B (medido: cruce DENY).

**Objeto A — negocio + padrón.** 14 campos por usuario, entre ellos `identity_id`,
`capabilities`, `esCFO`, `desactivado`, `tab_permisos`, `cadenaAprobacion`,
`rendPorOtros`, `rendVerTodas`. Un campo desconocido **aborta** el respaldo
(`CAMPO_DESCONOCIDO`) en vez de descartarlo en silencio: si mañana identidad agrega
un permiso, el respaldo se detiene y avisa, no lo pierde calladamente.
Prohibidos: pin, password, hash, salt, token, jwt, secret.

**Objeto B — credenciales.** `hash`, `sal`, `iteraciones >= 100.000`, vinculadas por
`identity_id`. Ningún PIN en claro, verificado por campo y por detector.

**Coordinación con el carril de identidad de Allegria Service.** `identity_id` es la
llave común. La reconciliación bloquea reactivar un usuario desactivado, quitar
permisos, conceder permisos nuevos y cambiar `identity_id`. Es decir: el restore
**no puede** conceder acceso que el padrón vivo no tenía.

- Restore medido en staging: **3/3**.
- Cobertura calculada de producción: **94/94**.

---

## 5 · Alcance de documentos adjuntos de Storage

Medido en producción, solo lectura, hoy:

| Bucket | Objetos | Tamaño | Tipos |
|---|---|---|---|
| `frisku-docs` | 869 | 527,10 MB | pdf 455, jpg 327, xlsx 84, msg 3 |
| `nominas-docs` | 788 | 310,52 MB | pdf 783, xlsx 3, txt 1, jpg 1 |
| **Total** | **1.657** | **837,62 MB** | |

**Estos adjuntos NO están respaldados.** El respaldo cubre filas de `calendario_data`,
que guardan la *referencia* al documento. Si se pierde el bucket, el expediente
digital de nóminas queda con punteros a nada.

Dos hallazgos de seguridad aparecieron al medir, y son P0 aparte de este paquete:

- `frisku-docs` es **bucket público**. `HEAD` por la ruta pública, sin credencial
  alguna, devuelve **HTTP 200**: 869 documentos (facturas, boletas, packing lists)
  descargables por cualquiera que tenga la URL.
- `nominas-docs` es privado por la ruta pública (**HTTP 400**), pero la **anon key**
  —que está en el bundle del frontend— **descarga sus 788 documentos (HTTP 200)** y
  además **lista los nombres de carpeta por sociedad**.

No toqué nada. Solo `GET`/`HEAD`/listado, con el método validado antes de salir.

Propuesta de alcance: incorporar los adjuntos al respaldo por *manifiesto* (ruta,
tamaño, SHA-256, bucket) en el objeto A, y las copias de los archivos a un bucket de
respaldo separado. El manifiesto solo ya permite detectar pérdida; hoy no la
detectaríamos.

---

## 6 · Restauración aislada y recuperación sin pisar al equipo

**Tiempo 1 — aislado.** El lote se abre en `restauracion_ensayo`. La tabla viva no se
toca. Si el lote está malo, nos enteramos ahí. Medido: 3 filas vivas intactas durante
todo el ensayo.

**Tiempo 2 — aplicación selectiva.** Cada fila se clasifica y solo se escriben las que
no compiten. **Nunca `UPSERT` masivo.**

| Clase | Acción |
|---|---|
| `ausente_en_vivo` | insertar |
| `igual` | omitir |
| `vivo_mas_nuevo` | **omitir** — el equipo escribió después |
| `respaldo_mas_nuevo` | requiere decisión humana, por id explícito |

El plan **nunca** propone un borrado. Una fila viva que el respaldo no conoce es
posterior al respaldo, y se deja.

Escenario medido: respaldo del día anterior; después el equipo edita `b`, borra `a`
por accidente y crea `d`. Resultado: `a` recuperada, `b` conserva `n=99`, `d`
sobrevive. **Data loss del equipo = 0.**

Contraprueba, sobre la tabla de ensayo y no sobre la viva: el `UPSERT` masivo **sí**
habría pisado `b`, dejándola en `n=1` cuando el equipo tenía `99`.

**Rechazo de lotes incompletos — 9/9 contra Storage y base reales:**

```
PASS  lote READY completo -> RESTAURA                 3 recursos · 1 credenciales
PASS  lote CREATING -> RECHAZA                        lote_no_publicado
PASS  lote FAILED -> RECHAZA                          lote_fallido
PASS  READY con objeto B ausente -> RECHAZA           objeto_ausente B
PASS  READY con sha_b nulo -> RECHAZA                 registro_incompleto
PASS  objeto reemplazado tras publicar -> RECHAZA     sha_no_coincide A
PASS  A y B de ejecuciones distintas -> RECHAZA       correlation_dispar
PASS  lote inexistente -> RECHAZA                     lote_desconocido
PASS  los DENY se dieron con el bucket poblado        7/7 objetos A presentes
```

El último caso existe porque un `DENY` sobre un bucket vacío no prueba nada.

---

## 7 · Respaldo nativo de Supabase

**Staging — verificado directamente por mí, hoy:**

```
archive_mode     = on
archive_command  = /usr/bin/admin-mgr wal-push ...   (wal-g)
archive_timeout  = 120
wal_level        = logical
```

El archivado continuo de WAL a wal-g está activo. Es el mecanismo sobre el que
Supabase construye sus respaldos físicos y PITR.

**Producción — NO VERIFICADO.** Solo tengo la anon key; `pg_settings` requiere una
conexión de base. Sigue como **CONFIRMADO POR OPERADOR / NO VERIFICADO DIRECTAMENTE**:
última corrida, frecuencia, retención, alcance y si PITR está o no contratado.

Para cerrarlo hacen falta dos cosas, y ninguna las decido yo:
1. La pantalla Database → Backups del proyecto productivo (captura basta).
2. O un DSN productivo de solo lectura para correr la misma consulta de arriba.

Aunque el nativo esté sano, no reemplaza a este respaldo: el nativo restaura el
*proyecto entero* a un punto en el tiempo, y eso pisa las escrituras posteriores del
equipo. Justamente lo que la sección 6 evita.

---

## Lo que este paquete todavía NO resuelve

1. **El endpoint sigue BLOCKED BY AUTH.** `api/osiris-backup.js` no está desplegado.
   Sin él no hay disparo automático en producción.
2. **`main` no contiene el commit que producción sirve.** Producción corre `27b423b`
   desde `hotfix/a-detener-generador-v2`; `origin/main` está en `699b1d8`.
   Un push a `main` revertiría la suspensión de `auto-v3` en silencio.
3. **Los adjuntos de Storage no están cubiertos** (sección 5), y dos buckets tienen
   exposición P0.
4. **El canal de la alerta no existe.** La detección está probada; el aviso al humano
   no está cableado.
5. **Las claves productivas no existen** y no las genero sin instrucción.
