# Checklist de preparación y activación: `main` y `pins`

> **Estado (2026-10-06): PROPUESTA. Nada aplicado, desplegado ni mergeado.** Rama `claude/seguridad-main-pins`, separada del PR de Créditos/Nóminas y de la propuesta de roles. Este documento no autoriza nada: cada ítem marcado **[AUT]** necesita autorización explícita de Angelo en su momento.
>
> Detalle técnico: `docs/seguridad-main-pins-servidor.md`. SQL: `supabase/seguridad_main_pins/`.

**Lo que este plan NO logra.** Después de la etapa 5, la app sigue sin ser segura frente a quien tenga la llave pública (está dentro del código que descarga cualquier navegador):

- **Datos financieros:** `finanzas`, `nominas_*`, `rendiciones` y `eeff` se siguen leyendo, modificando y borrando con esa llave.
- **Correo:** el endpoint de correo sigue abierto.

Ver la sección 7. Cerrar `main` y `pins` protege el acceso y los permisos de la app, no los datos.

---

## 0. Definiciones

- **Administrador.** Fila activa en `public.seg_administradores`.
  - La escriben solo `service_role` o el SQL Editor.
  - El servidor la relee en cada petición.
  - No cuentan como administrador: el `rol` de `main`/`usuarios`, la cookie, `user_metadata`, ni nada que envíe el navegador.
- **Exposición de PIN (no filtración comprobada).**
  - **Lo que sabemos:**
    - [Seguro] Los hashes de todos los PIN estuvieron accesibles con la llave pública en la fila `pins`, y así siguen hoy.
    - [Seguro] No tenemos evidencia de que alguien los descargara, pero tampoco evidencia de que no.
    - Los registros de Supabase (P10) **pueden aportar evidencia de una descarga** si cubren ese tipo de petición y el período. **Su ausencia no descarta una filtración**: la retención es limitada (los meses anteriores no estarán) y la cobertura puede ser incompleta (qué peticiones se registran y con qué detalle).
    - Por eso se tratan como **potencialmente comprometidos**.
  - **Costo de probar PINs contra un hash** (medición puntual, **no es una garantía general**):
    - En el contenedor de pruebas de esta sesión (Node 22, un núcleo), un intento PBKDF2-SHA256 con 100.000 iteraciones tardó ~16 ms. A ese ritmo, recorrer los 10^6 PIN de 6 dígitos tomaría ~4,5 h; en promedio se acierta a la mitad.
    - Es un orden de magnitud para ese equipo: con otro hardware, más núcleos o GPU, el tiempo cambia (normalmente baja) y no se midió.
    - Lo que no depende del hardware: el espacio de 10^6 combinaciones es pequeño. Por eso los PIN se tratan como potencialmente comprometidos.
- **Sesión.**
  - **Dónde se guarda el control:**
    - **En la cookie firmada** (`mediterra_sess`, HMAC con `SESSION_SECRET`): último uso `act`, vencimiento absoluto `exp` (12 h) y huella `fp`.
    - **En la base (fila `pins`)**: el PIN vigente y la **época** de cada persona (`<Nombre>_epoca`). La huella de la cookie debe coincidir con ambos. El servidor los relee en cada petición, en cualquier instancia.
    - No hay tabla de sesiones: se revoca por persona (todas sus sesiones), no una sesión suelta.
  - **Comprobado en local reenviando copias reales de cookies, sin falsificar y esperando en tiempo real:**
    - la inactividad rechaza la sesión;
    - una copia anterior a la última renovación vence por su propio último uso;
    - el cambio de PIN invalida todas las copias previas, incluida la de la sesión que lo cambió.
  - **Límites comprobados:**
    - **Navegador restaurado:** la cookie no tiene `Max-Age`, pero un navegador que "restaura la sesión" puede conservarla. Lo que realmente la corta es la inactividad del servidor (30 min) o las 12 h.
  - **"Salir" (D3, implementado):**
    - sube la época de la persona en la base, así que **todas** sus sesiones y copias de cookies quedan inválidas en toda instancia;
    - comprobado con **dos procesos independientes** (`prueba-revocacion.mjs`, 16/16), incluidos dos "Salir" simultáneos y la base caída;
    - si la base no responde, el servidor contesta 503 `revocado:false` (no informa éxito) y la app avisa a la persona;
    - una copia ya inválida no puede cerrar las sesiones nuevas;
    - el cierre automático por inactividad de una pestaña solo borra su cookie y no cierra los otros equipos.
    - Las sesiones de Frisku SharePoint y de Osiris (Supabase Auth) son aparte y no se cierran con este "Salir".
- **Límite de intentos.**
  - Contadores en Postgres (RPC `frisku_sp_rl_consumir`, con `FOR UPDATE`), compartidos por todas las instancias de Vercel. No hay estado en memoria.
  - Si el contador no responde, el login responde 503: **falla cerrado**.
  - **Comprobado con dos instancias independientes contra Postgres local:**
    - 16 intentos alternados → 8 permitidos;
    - 20 simultáneos → 8 permitidos;
    - login real desde 16 IP distintas → 8 respuestas 401 y 8 respuestas 429.
  - **Frisku SharePoint usa el mismo contador por correo** (antes sumaba 8 intentos aparte). Corregido en la rama.
  - **La demora de 3 s de "¿Olvidaste tu PIN?" no reemplaza al contador:** solo evita que el tiempo de respuesta revele si el correo existe.

---

## 1. Bloqueantes de esta activación (antes de la etapa 3)

| # | Bloqueante | Estado |
|---|---|---|
| B1 | XSS en `/api/informe`. El `id` de la URL se insertaba sin escapar en la página, y el HTML guardado (Storage público, fila `osiris`) se servía desde el dominio de la app. Con sesión por cookie, un clic de un admin bastaba para actuar como él | **Corregido en la rama:** página aislada (`sandbox`, sin scripts) + `id` escapado. Probado en navegador (7/7, con control positivo); los informes legítimos se ven igual |
| B2 | Frisku SharePoint verificaba PINs con un contador propio: el doble de intentos por cuenta | **Corregido en la rama:** comparte `login:<email>`. Requiere `AUTH_RATELIMIT_SECRET` en Vercel antes de desplegar; sin él, Frisku SharePoint responde 503 |
| B3 | Las guardas SQL de la propuesta DELETE y de main/pins chocaban entre sí | **Resuelto en la rama (D2):** fase D integrada como primera fase (0 → D → A → B → C); la fase A exige D; `verificacion.sql` y `reversion.sql` reconocen HOY/D/A/B/C. Probado: 234/234 dos veces |
| B4 | Personas que no podrían entrar por el servidor: sin `_h`, sin correo, correo o nombre repetido, código en texto plano sin vencimiento | **Pendiente:** M4 en producción; resolver cada caso antes de la etapa 3 |
| B5 | Recuperación verificada en entorno real: correo, dos administradores y SQL Editor | **Pendiente:** sección 3 (condición puesta por Angelo para el corte) |
| B6 | Administrador de respaldo | **Pendiente:** lo confirma Angelo |
| B7 | Infraestructura en producción: RPC del límite de intentos, tipo de las filas | **Pendiente:** M1 y M5 |
| B8 | Un tercero podía bloquear una cuenta una y otra vez (D4) | **Implementado y probado en local** (`docs/seguridad-limite-intentos-propuesta.md`, 47/47): cuenta + origen, demoras con tope, umbral por cuenta con código por correo de 60 bits, equipo reconocido. Pendiente: aplicar `api/sql/seg_intentos.sql` en staging y producción **[AUT]** |
| B9 | Aislamiento de la Preview | **Implementado (D7):** fuera de `VERCEL_ENV=production` no hay destino sin `SUPABASE_URL`, y se rechaza un `SUPABASE_URL` de producción; navegador aislado con variables de build; guardia de destinos y correos en el servidor; detector de salidas (local) en verde. Antes de usarla: P7/P12 |

---

## 2. Consultas e información pendientes (todas de solo lectura)

| Código | Dónde | Para qué |
|---|---|---|
| M1–M5 | `supabase/seguridad_main_pins/consultas_previas.sql`, en el SQL Editor | Forma de las filas, Realtime, Storage, quién quedaría sin acceso, infraestructura |
| M6–M8 | ídem | Vistas y funciones sobre `calendario_data` y versión de Postgres, antes de la fase D. **Ya leídas el 2026-10-05** (D4/D5/D2: 0 vistas, 0 funciones, sin MAINTAIN); se repiten el día de aplicar |
| S1–S7 | Rama de roles, `supabase/seguridad_roles/consultas_lectura.sql` | Usuarios de Auth, claims, tablas abiertas, permisos por defecto |
| `verificacion.sql` | `supabase/seguridad_main_pins/` | Debe decir estado **HOY**. Si dice DESCONOCIDO, la foto de producción difiere de la probada |
| V8 completo | Ya enviado en forma parcial | JSON completo |
| P5, P6 | Consola → Authentication | Registro abierto o anónimo; hooks |
| P7 | Vercel | Commit desplegado y nombres de variables (sin valores) |
| P8 | Supabase → Edge Functions | Si osiris-auth corre en producción o en sandbox |
| P9 | Supabase → Database → Backups | Si hay respaldos diarios de la plataforma (tras la etapa 3, son el único respaldo de `pins`, `usuarios` y `main`) |
| P10 | Supabase → Logs (API) | Retención y cobertura de los registros; si muestran lecturas de `id=eq.pins`. Un hallazgo es evidencia de descarga; la ausencia no la descarta |
| P11 | Supabase | Staging: usar el existente `gestion-mediterra-staging` (compartido con proc/contab, pruebas de persistencia y el piloto Osiris) o crear uno dedicado (recomendado) |
| P12 | Vercel → Settings → Environment Variables | Que "Automatically expose System Environment Variables" esté activo (el candado usa `VERCEL_ENV`) y los ámbitos de cada variable |

---

## 3. Pruebas en el entorno real (antes de activar en producción)

**Preparación completa (proyecto, aislamiento, variables solo por nombre, datos sintéticos, destinatarios, método por prueba y controles antes/después): `docs/seguridad-preview-staging.md`.** Resumen:
- **Vercel Preview protegida (Deployment Protection) + Supabase staging.** Ninguna variable de producción en el ámbito Preview y secretos nuevos; el candado impide caer a producción si falta `SUPABASE_URL`.
- **El navegador NO está aislado** [Seguro]: un solo intento de login escribe `audit_log` de producción, y un admin dispara una lectura masiva y correos a direcciones reales. Por eso las pruebas van **por HTTP (curl o scripts)**. La interfaz se usa solo para T9, con un usuario sintético no admin, `REACT_APP_SUPA_URL`/`KEY` de staging, sin abrir módulos y bloqueando el dominio de producción en el navegador.
- **Correo:** una casilla M365 dedicada a pruebas como remitente (solo en el ámbito Preview) y solo casillas de prueba como destinatarias. El SMTP está fijo en `smtp.office365.com`.
- **Datos:** usuarios sintéticos generados en local (dos admins, editor, celular, desactivado, sin PIN, PIN vencido, sin política, rol admin sin ser admin). No se copia ninguna fila, hash ni llave de producción.
- **Control de aislamiento:** antes y después de cada sesión de pruebas, `updated_at` de `pins`/`usuarios`/`main`/`audit_log` de producción (solo lectura) debe seguir igual.
- T10 lee producción (solo lectura pública): se hace en la etapa 2.

**[AUT]** Pendiente de tu revisión: crear o modificar staging, variables y despliegue de la Preview, Deployment Protection, osiris-auth en staging, y envío de correos reales a casillas de prueba.

| # | Prueba | Resultado esperado |
|---|---|---|
| T1 | `GET /api/auth/sesion` sin cookie | 401 |
| T2 | Desde una IP: PIN incorrecto ×6; desde otra: PIN correcto | 5 × 401, luego 429 con espera de 1 min (luego 2, 4… hasta 60); la otra IP entra |
| T3 | 10 fallos de una cuenta desde 10 IP distintas (repartidos entre instancias); luego PIN correcto desde una IP nueva y desde el equipo reconocido | IP nueva → 403 "verificación requerida"; equipo reconocido → entra |
| T4 | "¿Olvidaste tu PIN?" con correo de prueba **real**: código de 12 caracteres; el PIN vigente sigue sirviendo; un segundo pedido mientras el primero está vigente no envía otro correo | Llega un solo código; con él entra a crear PIN; el código no sirve dos veces |
| T5 | Admin 1 resetea a una persona; admin 2 resetea al admin 1 | Ambos funcionan; la sesión del reseteado se cierra |
| T6 | Recuperación por SQL Editor (bloque del documento técnico) en staging | Entra solo a crear PIN; el código vence en 2 h |
| T7 | Corte de credenciales en staging (`AUTH_CREDENCIALES_DESDE`) | PIN antiguo → "debe restablecerse por correo"; recuperación por correo → entra |
| T8 | Copia de la cookie: cambiar el PIN y reenviarla; esperar 31 min sin uso y reenviarla; "Salir" en una sesión y reenviar la copia de otra | 401 en los tres casos |
| T9 | Cerrar y restaurar el navegador (Chrome y Edge, "continuar donde lo dejaste") | Documentar si la sesión sigue. Esperado: sigue si no pasaron 30 min |
| T10 | `/api/informe?id=<script>…` y un informe real | Sin ejecución; el informe real se ve igual |
| T11 | Frisku SharePoint con el umbral por cuenta activo: desde una IP nueva, y desde el equipo reconocido por la app | IP nueva → 403 verificación requerida; equipo reconocido → entra |
| T12 | osiris-auth contra `/api/auth/verificar` | Sesión de Osiris solo con PIN vigente |
| T13 | Sin `SESSION_SECRET` (o con la función del límite caída) | 503 para todos: falla cerrado, nadie entra sin control |
| T14 | `consultas_previas.sql` y fases 0/D/A/B/C + `verificacion.sql` en staging, con políticas copiadas de producción | Cada fase pasa sus guardas; tras D, anon no borra; tras B, anon recibe 0 filas de `pins`/`usuarios` |
| T15 | Revocación entre instancias: dos sesiones de la misma persona, "Salir" en una y reenvío de la otra (de ser posible, desde regiones o ventanas distintas) | 401 |
| T16 | Interfaz completa en la Preview (login fallido y correcto, recuperación, Salir, admin → resetear PIN) con el registro de red del navegador | Solo destinos autorizados (§2b.1 de `docs/seguridad-preview-staging.md`); antes y después, `updated_at` de producción sin cambios |

---

## 4. Activación por etapas en producción

Cada etapa necesita su **[AUT]**, una ventana avisada y la anterior estable.

| Etapa | Prerrequisitos | Pasos | Verificación en producción | Si falla (sin reabrir) |
|---|---|---|---|---|
| 0 | — | Ejecutar M1–M8, S1–S7, `verificacion.sql` (fuera de horario: prueba borrados dentro de subtransacciones que se deshacen y toma bloqueos breves) | Estado HOY; B4 y B7 resueltos | — |
| D | Etapa 0 | `faseD_quitar_delete.sql`. Independiente de la app: ni el cliente ni el servidor borran filas | `verificacion.sql` → D; anon no borra; "Restaurar" (upsert) y el guardado siguen funcionando | Sección 5; revertir D → HOY solo con [AUT] aparte (sección 6) |
| 1 | Etapa D; B6 | `fase0_admins.sql` + alta de dos administradores | `select email, activo from seg_administradores` → 2 filas | Tabla nueva, sin efecto en usuarios |
| 2 | Etapa 1; variables de Vercel (incluida `AUTH_RATELIMIT_SECRET`); pruebas de la sección 3 | Desplegar el servidor con el flag **apagado**; después, osiris-auth | T1, T10, T11, T12 en producción con usuarios reales; la app sigue igual | Vercel "Instant Rollback" al despliegue anterior |
| 3 | Etapa 2 estable | Desplegar el cliente con `REACT_APP_AUTH_SERVER=true` | Login, cambio de PIN, recuperación, permisos y Tareas con 2–3 personas; los dos administradores entran | Instant Rollback al cliente anterior (todavía no se cerró nada en la base, así que no reabre nada) |
| 4 | Etapa 3 estable 1–2 días; **existe al menos un despliegue en modo servidor estable al cual volver**; B5; B8 | `faseA` + `faseB` en la misma ventana. Con el corte aceptado: `AUTH_CREDENCIALES_DESDE` = hora de B, avisando antes a todos | `verificacion.sql` → B; anon recibe 0 filas; cada persona recupera por correo una vez; quien no tenga correo, por reseteo del admin | Sección 5. No se revierte SQL salvo la sección 6 |
| 5 | Etapa 4 estable | `faseC_cerrar_main.sql` | `verificacion.sql` → C; Tareas funcionan | Sección 5 |

Por qué A y B juntas:
- Con A sola, la llave sigue leyendo `pins`.
- Cualquiera puede pedir un código para cualquier cuenta, incluida la del administrador, y probarlo fuera de línea contra su hash.

---

## 5. Recuperación ante fallos que conserva las protecciones (vía habitual)

| Falla | Respuesta | Qué NO se hace |
|---|---|---|
| Servidor responde 503 a todos (variable faltante o mal puesta) | Corregir la variable en Vercel y volver a desplegar, o hacer Instant Rollback al último despliegue en modo servidor. Mientras tanto nadie entra (falla cerrado) | No se reabren permisos |
| Error en un despliegue nuevo | Instant Rollback al despliegue anterior en modo servidor | — |
| La función del límite de intentos falla | Login 503. Revisar la función. Si hay que reaplicarla (`api/sql/frisku_sp_ratelimit.sql`) es SQL: **[AUT]** en la ventana | — |
| Un atacante bloquea una cuenta (por ejemplo, la del admin) con intentos fallidos | Esperar 15 min, o en el SQL Editor `delete from frisku_sp_ratelimit where tipo = 'identidad'` (reinicia los contadores por cuenta) **[AUT]** | — |
| Nadie recuerda el PIN o falla el correo | Reseteo por un administrador (el código se le muestra a él). Si no hay administrador disponible, código por SQL Editor (2 h) | — |
| `seg_administradores` vacía o incorrecta | `insert` desde el SQL Editor **[AUT]** | No se usa el `rol` del padrón |
| Sospecha de que se filtró `SESSION_SECRET` o una cookie | Rotar `SESSION_SECRET` en Vercel (cierra todas las sesiones) o subir la época de esa persona (reseteo por admin) | — |
| Se necesita volver al cliente antiguo | Solo antes de la etapa 4 (Instant Rollback). Después, no es una vía habitual: ver sección 6 | — |

---

## 6. Reversión SQL: excepcional, con autorización aparte

`reversion.sql` existe y está probado, pero **reabre** lo que cada fase cierra. No es la vía habitual. Cada sección exige su propia **[AUT]**, con el riesgo aceptado por escrito:

| Sección | Qué reabre | Riesgo concreto |
|---|---|---|
| C → B | Lectura y escritura pública de `main` (Tareas) | Cualquiera lee o altera las Tareas |
| B → A | Lectura pública de `pins` y `usuarios` | Vuelven a exponerse los hashes. Si ya se aplicó el corte, quedan expuestos los PIN nuevos y se pierde su beneficio |
| A → D | Escritura pública de `pins` y `usuarios` | Vuelve la toma de cuentas: cualquiera se da admin o fija el PIN de otro |
| D → HOY | Borrado público (DELETE) y TRUNCATE de todas las filas de negocio | Cualquiera con la llave puede borrar `finanzas`, `nominas_*`, etc. |

Orden obligatorio si se autoriza: primero el SQL y después, si hace falta, desplegar el cliente antiguo. Recomendación: **no revertir nunca A → D ni D → HOY**. Revertir B solo ante una caída prolongada del servidor, y si el directorio prefiere disponibilidad sobre seguridad.

---

## 7. Riesgos que siguen abiertos (fuera de esta activación), por prioridad

1. **Endpoint de correo (`api/send-email.js`), relay abierto** [Seguro]:
   - acepta cualquier destinatario y HTML;
   - permite elegir entre 4 cuentas SMTP reales;
   - no exige autenticación, no limita envíos y su CORS deja llamarlo desde cualquier sitio.
   - Permite phishing desde las cuentas del grupo, incluso imitando el correo "Código provisorio", y puede llevar a que Microsoft bloquee esas cuentas.
   - **Cierre interino, independiente de main/pins** (no hay que esperar la cookie):
     - destinatarios solo del padrón, de los dominios propios y de los contratos Osiris;
     - sin HTML libre, salvo informes Osiris;
     - límite de envíos con la misma función de Postgres;
     - quitar el PIN del correo de bienvenida.
   - Definitivo: cookie obligatoria tras la etapa 3.
   - Es lo primero a preparar después de este plan, o en paralelo.
2. **Datos financieros con la llave pública** [Seguro]:
   - `finanzas` (créditos, bancos, flujo), `nominas_*`, `rendiciones` y `eeff`: lectura, escritura y borrado;
   - "Restaurar" se puede repetir desde fuera con la llave y sobrescribir muchas filas.
   - **El borrado ya está cubierto por la fase D** (primera del plan, independiente de la app): retira DELETE, TRUNCATE, REFERENCES y TRIGGER. Lo que sigue abierto después de D: **leer y modificar** esas filas con la llave.
   - D además cierra un hueco de Nóminas: hoy se puede borrar `nominas_<empresa>` y recrearla sin versión.
   - Leer y escribir esos datos solo con sesión es la migración E1.5: es un proyecto aparte.
3. **Storage** [Seguro/Suponiendo]:
   - `frisku-docs` se crea público: los respaldos de Rendiciones quedan con URL pública;
   - `nominas-docs` y `proc-docs` reciben subidas con la llave pública;
   - `osiris-fotos` es público;
   - `api/storage.js` no controla módulo ni ruta, y no valida inactividad ni huella.
   - Políticas por confirmar con M3.
4. **Realtime:** si publica `calendario_data`, difunde los cambios hasta la fase B (M2).
5. **`audit_log`:** se puede sobrescribir con la llave, y si su carga falla la app escribe `[]` encima (viola la regla 9).
6. **Límite de intentos (D4, implementado en local):** queda ~0,025% al año por cuenta de adivinación con un PIN al azar (130 intentos al año más 10 por cada verificación por correo). Un tercero puede exigir el código desde equipos nuevos de una persona (30 días, renovable), pero no bloquear sus equipos reconocidos ni agotar su código. Osiris dual (inactiva) necesita equipo reconocido o sesión de la app antes de activarse.
7. **`api/informe.js`** lee producción con la llave pública fija (solo datos públicos): en una Preview sigue leyendo producción.
8. **Sesiones de Frisku SharePoint y Osiris:** no se cierran con "Salir" de la app (cookies y sesiones propias).
9. **Tablas `contab_*`, `osi_*` y `rbac_*`:** rama de roles, pendiente de S1–S7.

---

## 8. Decisiones pendientes de Angelo

| # | Decisión |
|---|---|
| D1 | Administrador de respaldo (B6): **pendiente**, Angelo confirmará su identidad |
| D2 | DELETE/TRUNCATE primero: **decidido e implementado** (fase D, guardas adaptadas y probadas) |
| D3 | "Salir" cierra todas las sesiones, incluidas las copias: **decidido e implementado** (época en la base, probado entre dos procesos) |
| D4 | **Decidido e implementado en local:** contadores combinados; la recuperación propia no invalida el PIN; umbral por cuenta con verificación por correo (código de 60 bits) |
| D6 | **Decidido:** staging dedicado (crearlo requiere [AUT] y puede tener costo) |
| D7 | **Aprobado e implementado:** fuera de producción, sin `SUPABASE_URL` no hay destino, y un `SUPABASE_URL` de producción se rechaza; producción sin cambios |
| D5 | Corte de credenciales: **aceptado en el plan**, sujeto a verificar antes T4, T5 y T7. Su ejecución requiere [AUT] en la etapa 4 |

---

## 9. Pruebas locales ya realizadas (datos de prueba)

| Prueba | Resultado |
|---|---|
| `for f in api/*.test.mjs; do node "$f"; done` | Todas pasan (`_reglasLogin` 73, `_friskuSpAuth` 35, `frisku-sp` 107, …) |
| `POSTGREST_BIN=… node scripts/seguridad-main-pins/prueba-servidor.mjs` | 235/235: fases 0/D/A/B/C, reversión por secciones, DESCONOCIDO, copias reales de cookies en tiempo real |
| `POSTGREST_BIN=… node scripts/seguridad-main-pins/prueba-intentos.mjs` | 47/47 (D4): dos instancias, IP distintas, concurrencia, falsificación de la cookie de equipo, tercero que intenta bloquear, NAT, enumeración |
| `POSTGREST_BIN=… OUT_DIR=… node scripts/e2e/aislamiento-interfaz.mjs` | TODO OK: la interfaz completa no sale de los destinos autorizados; 6 controles positivos detectados |
| `POSTGREST_BIN=… node scripts/seguridad-main-pins/prueba-revocacion.mjs` | 29/29 con dos procesos, incluida la carrera FORZADA en ambos órdenes (falla si se quita la revalidación: comprobado) |
| `node api/_auth.test.mjs` · `node api/_destinos.test.mjs` | 10/10 · 37/37: aislamiento y guardia de destinos (inactiva en producción) |
| `node scripts/seguridad-main-pins/prueba-informe.mjs` | 7/7 en Chromium real, con control positivo |
| Dos instancias contra Postgres local (script del revisor, fuera del repositorio) | 8 permitidos de 16 alternados y 8 de 20 simultáneos |
| `scripts/e2e/seguridad-auth-servidor.mjs` (builds con flag prendido y apagado) | 35/35 |
| `scripts/e2e/regresion-empresas.mjs` con el flag apagado (commit 47c9d57; `src/` no cambió después) | 12.032 celdas, 0 diferencias; 0 peticiones a producción |

**No probado:**
- Vercel y Supabase reales;
- correo real;
- restauración de sesión en navegadores de escritorio (T9);
- el texto de las políticas tal como lo imprime producción.
