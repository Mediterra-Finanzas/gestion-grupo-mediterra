# Entrega · Permiso de Operación Técnica

Paquete independiente, listo para publicación. No incluye las respuestas por labor ni nada
del paquete económico/tributario.

- **Rama:** `osiris/permiso-op-tecnica`
- **Candidato:** `42e4d74` (código en `a447f44` + esta acta; la documentación no cambia comportamiento)
- **Base exacta:** `5c0da41` (`origin/main` al 2026-09-30)
- **Archivos:** 1 (`src/OsirisModule.jsx`), 27 líneas agregadas, 1 modificada

---

## 1 · Qué podrá hacer el usuario

Hoy, en producción, la pestaña **Operación Técnica** ignora su propio permiso: leía solo el rol
base (`esEditorOAdmin`) y no miraba `tab_permisos.osiris.opTecnica` ni el rol consulta, a
diferencia de las otras cuatro pestañas de Osiris. Un usuario con la pestaña en "ver" podía
editar y borrar informes en borrador, visitas, equipo técnico y entregables.

Con este paquete:

| Configuración del usuario | Qué ve | Qué puede hacer |
|---|---|---|
| `opTecnica: "editar"` | La pestaña completa | Crear, editar y borrar, igual que hoy |
| `opTecnica: "ver"` | La pestaña completa, en solo lectura | Nada: no aparece el botón de alta ni los controles de edición |
| `opTecnica: "sin_acceso"` | Pantalla "Sin acceso a Operación Técnica" con botón Volver | Nada |
| Rol `consulta` (con cualquier permiso) | La pestaña en solo lectura | Nada |
| Sin `opTecnica` definido | Hereda de `contratos`, como las demás pestañas | Lo que diga ese permiso |

El bloqueo además se valida **dentro de las funciones de guardado** (`addItem`, `updItem`,
`delItem`), no solo deshabilitando controles: un guardado que llegue por otra vía tampoco
escribe, y deja un aviso en consola.

## 2 · Qué queda pendiente

Nada dentro de este alcance. Lo que **no** entra acá y sigue su propio camino:

- Respuestas por labor por variedad (paquete de informes técnicos, en revisión).
- Todo el paquete económico y tributario.
- La revisión general de permisos de otros módulos, que no se tocó.

## 3 · Pruebas

**Automáticas**, sobre la base `5c0da41`: suite completa **1.189 pasan, 9 saltadas, 0 fallan**
(42 de 44 suites; 2 saltadas). Build `CI=true`: `Compiled successfully`.

**En navegador, entorno aislado** (Postgres local + PostgREST 3068 + servidor de revisión 3070,
copia sintética de la fila `osiris`, credenciales sintéticas). Cuatro usuarios de prueba, uno por
configuración. La comprobación no mira solo los campos deshabilitados: cuenta las visitas en la
base antes y después de intentar el alta.

| Usuario | Ve la pestaña | Botón de alta | Visitas antes → después | Escribió |
|---|---|---|---|---|
| `opTecnica: editar` | sí | habilitado | 1 → 2 | **sí**, como corresponde |
| `opTecnica: ver` | sí, solo lectura | ausente | 2 → 2 | no |
| `opTecnica: sin_acceso` | no ("Sin acceso a Operación Técnica") | — | — | no |
| rol `consulta` | sí, solo lectura | ausente | 2 → 2 | no |

Registro del servidor de revisión: 84 peticiones, **0 llamadas a producción**.

**Límite de esta prueba, dicho explícitamente:** la guarda dentro de `addItem`/`updItem`/`delItem`
se verifica por lectura de código y porque la base no cambia; no se puede invocar esa función
desde fuera del componente, que es justamente lo que la hace una guarda.

## 4 · Recuperación

El cambio es de una sola función y un solo archivo. Volver atrás es revertir el commit: no hay
migración de datos, no se escribe ningún campo nuevo y no se toca ninguna fila de Supabase. Un
rollback devuelve el comportamiento anterior (la pestaña vuelve a ignorar su permiso) sin mover
ningún dato.

Deployment de recuperación: el último desplegado de `5c0da41`, que se registra al pedir la
ventana.

## 5 · Autorización que se necesita

> `AUTORIZO MERGE osiris/permiso-op-tecnica → main`, push y despliegue del paquete exacto
> `42e4d74` sobre la base exacta `5c0da41`.

Si al momento de publicar `origin/main` ya avanzó, se revalida la base y se vuelve a pedir la
autorización con el par nuevo.
