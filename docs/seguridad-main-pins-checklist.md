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
    - [Seguro] No tenemos evidencia de que alguien los descargara. Los registros de acceso de Supabase podrían mostrarlo dentro de su período de retención (P10).
    - Por eso se tratan como **potencialmente comprometidos**.
  - **Costo de romper uno** (medido, no supuesto):
    - Un intento PBKDF2-SHA256 con 100.000 iteraciones tarda ~16 ms en un núcleo de este entorno de pruebas.
    - Recorrer los 10^6 PIN de 6 dígitos toma ~4,5 h en un núcleo, y en promedio se acierta a la mitad.
    - Con más núcleos o GPU es menos. Eso no se midió.
- **Sesión.**
  - **Dónde se guarda el control:**
    - Se guarda **dentro de la cookie firmada** (`mediterra_sess`, HMAC con `SESSION_SECRET`): último uso `act`, vencimiento absoluto `exp` (12 h) y huella `fp` (PIN vigente + época).
    - No hay tabla de sesiones en el servidor.
    - El servidor relee en cada petición el padrón (fila `usuarios`) y `pins` para comparar la huella.
  - **Comprobado en local reenviando copias reales de cookies, sin falsificar y esperando en tiempo real:**
    - la inactividad rechaza la sesión;
    - una copia anterior a la última renovación vence por su propio último uso;
    - el cambio de PIN invalida todas las copias previas, incluida la de la sesión que lo cambió.
  - **Límites comprobados:**
    - **Navegador restaurado:** la cookie no tiene `Max-Age`, pero un navegador que "restaura la sesión" puede conservarla. Lo que realmente la corta es la inactividad del servidor (30 min) o las 12 h.
    - **"Salir" no revoca copias:** solo borra la cookie de ese navegador. Una copia hecha antes sigue valiendo hasta 30 min sin uso o 12 h (prueba "LIMITACIÓN COMPROBADA").
    - Opción mínima, **no implementada**: que "Salir" suba la época, lo que cierra todas las sesiones de esa persona. Decisión D3.
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
| B3 | Los scripts SQL de main/pins comparan la foto exacta de permisos. Si antes se quita DELETE/TRUNCATE (propuesta aparte), abortan, y viceversa | **Pendiente:** decidir el orden (sección 6) y adaptar las guardas antes de aplicar cualquiera de los dos |
| B4 | Personas que no podrían entrar por el servidor: sin `_h`, sin correo, correo o nombre repetido, código en texto plano sin vencimiento | **Pendiente:** M4 en producción; resolver cada caso antes de la etapa 3 |
| B5 | Recuperación verificada en entorno real: correo, dos administradores y SQL Editor | **Pendiente:** sección 3 (condición puesta por Angelo para el corte) |
| B6 | Administrador de respaldo | **Pendiente:** lo confirma Angelo |
| B7 | Infraestructura en producción: RPC del límite de intentos, tipo de las filas | **Pendiente:** M1 y M5 |

---

## 2. Consultas e información pendientes (todas de solo lectura)

| Código | Dónde | Para qué |
|---|---|---|
| M1–M5 | `supabase/seguridad_main_pins/consultas_previas.sql`, en el SQL Editor | Forma de las filas, Realtime, Storage, quién quedaría sin acceso, infraestructura |
| S1–S7 | Rama de roles, `supabase/seguridad_roles/consultas_lectura.sql` | Usuarios de Auth, claims, tablas abiertas, permisos por defecto |
| `verificacion.sql` | `supabase/seguridad_main_pins/` | Debe decir estado **HOY**. Si dice DESCONOCIDO, la foto de producción difiere de la probada |
| V8 completo | Ya enviado en forma parcial | JSON completo |
| P5, P6 | Consola → Authentication | Registro abierto o anónimo; hooks |
| P7 | Vercel | Commit desplegado y nombres de variables (sin valores) |
| P8 | Supabase → Edge Functions | Si osiris-auth corre en producción o en sandbox |
| P9 | Supabase → Database → Backups | Si hay respaldos diarios de la plataforma (tras la etapa 3, son el único respaldo de `pins`, `usuarios` y `main`) |
| P10 | Supabase → Logs (API) | Si la retención permite ver lecturas de `id=eq.pins` con la llave pública: confirma o descarta descargas |
| P11 | Supabase | Si existe el proyecto staging (`gestion-mediterra-staging`) y está aislado de producción |

---

## 3. Pruebas en el entorno real (antes de activar en producción)

Dónde se prueba:
- **Vercel Preview + Supabase staging**, con `SUPABASE_URL` apuntando a staging.
- **Cuidado:** el cliente lee y guarda los módulos de negocio con la URL de producción, que está fija en el código. En la Preview hay que probar con `curl` o con el navegador **sin abrir módulos de negocio**.

**[AUT]** Desplegar la Preview, cargar datos de prueba en staging y enviar correos reales a casillas de prueba.

| # | Prueba | Resultado esperado |
|---|---|---|
| T1 | `GET /api/auth/sesion` sin cookie | 401 |
| T2 | Login correcto, PIN incorrecto ×9 | 200; luego 401 y después 429 |
| T3 | Dos peticiones simultáneas de 8 intentos desde dos máquinas | 8 permitidos en total (contador compartido entre instancias) |
| T4 | "¿Olvidaste tu PIN?" con correo de prueba **real** | Llega el código; entra a crear PIN; el código no sirve dos veces |
| T5 | Admin 1 resetea a una persona; admin 2 resetea al admin 1 | Ambos funcionan; la sesión del reseteado se cierra |
| T6 | Recuperación por SQL Editor (bloque del documento técnico) en staging | Entra solo a crear PIN; el código vence en 2 h |
| T7 | Corte de credenciales en staging (`AUTH_CREDENCIALES_DESDE`) | PIN antiguo → "debe restablecerse por correo"; recuperación por correo → entra |
| T8 | Copia de la cookie: cambiar el PIN y reenviarla; esperar 31 min sin uso y reenviarla | 401 en ambos casos |
| T9 | Cerrar y restaurar el navegador (Chrome y Edge, "continuar donde lo dejaste") | Documentar si la sesión sigue. Esperado: sigue si no pasaron 30 min |
| T10 | `/api/informe?id=<script>…` y un informe real | Sin ejecución; el informe real se ve igual |
| T11 | Frisku SharePoint: 8 PIN incorrectos en la app y después 1 en Frisku | Frisku responde 429 |
| T12 | osiris-auth contra `/api/auth/verificar` | Sesión de Osiris solo con PIN vigente |
| T13 | Sin `SESSION_SECRET` (o con la función del límite caída) | 503 para todos: falla cerrado, nadie entra sin control |
| T14 | `consultas_previas.sql` y fases 0/A/B/C + `verificacion.sql` en staging, con políticas copiadas de producción | Cada fase pasa sus guardas; anon recibe 0 filas de `pins`/`usuarios` tras B |

---

## 4. Activación por etapas en producción

Cada etapa necesita su **[AUT]**, una ventana avisada y la anterior estable.

| Etapa | Prerrequisitos | Pasos | Verificación en producción | Si falla (sin reabrir) |
|---|---|---|---|---|
| 0 | — | Ejecutar M1–M5, S1–S7, `verificacion.sql` | Estado HOY; B4 y B7 resueltos | — |
| 1 | Etapa 0; B6 | `fase0_admins.sql` + alta de dos administradores | `select email, activo from seg_administradores` → 2 filas | Tabla nueva, sin efecto en usuarios |
| 2 | Etapa 1; variables de Vercel (incluida `AUTH_RATELIMIT_SECRET`); pruebas de la sección 3 | Desplegar el servidor con el flag **apagado**; después, osiris-auth | T1, T10, T11, T12 en producción con usuarios reales; la app sigue igual | Vercel "Instant Rollback" al despliegue anterior |
| 3 | Etapa 2 estable | Desplegar el cliente con `REACT_APP_AUTH_SERVER=true` | Login, cambio de PIN, recuperación, permisos y Tareas con 2–3 personas; los dos administradores entran | Instant Rollback al cliente anterior (todavía no se cerró nada en la base, así que no reabre nada) |
| 4 | Etapa 3 estable 1–2 días; **existe al menos un despliegue en modo servidor estable al cual volver**; B5 | `faseA` + `faseB` en la misma ventana. Con el corte aceptado: `AUTH_CREDENCIALES_DESDE` = hora de B, avisando antes a todos | `verificacion.sql` → B; anon recibe 0 filas; cada persona recupera por correo una vez; quien no tenga correo, por reseteo del admin | Sección 5. No se revierte SQL salvo la sección 6 |
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
| A → HOY | Escritura pública de `pins` y `usuarios` | Vuelve la toma de cuentas: cualquiera se da admin o fija el PIN de otro |

Orden obligatorio si se autoriza: primero el SQL y después, si hace falta, desplegar el cliente antiguo. Recomendación: **no revertir nunca A → HOY**. Revertir B solo ante una caída prolongada del servidor, y si el directorio prefiere disponibilidad sobre seguridad.

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
   - **Retirar DELETE, TRUNCATE, REFERENCES y TRIGGER se puede adelantar de forma independiente para la app:**
     - [Seguro] ni el cliente ni `api/` borran filas de `calendario_data`;
     - "Restaurar" usa upsert y no necesita DELETE;
     - la retención de respaldos está suspendida;
     - [Probable] TRUNCATE no se alcanza por la API REST.
   - **Requisitos antes de aplicarlo:**
     - B3: coordinar las guardas con los scripts de main/pins;
     - completar `docs/seguridad-quitar-delete-anon.md`, que no retira REFERENCES/TRIGGER, compara las políticas sin su condición y tiene D1, D4 y D5 pendientes.
   - Además cierra un hueco de Nóminas: hoy se puede borrar `nominas_<empresa>` y recrearla sin versión.
   - Leer y escribir esos datos solo con sesión es la migración E1.5: es un proyecto aparte.
3. **Storage** [Seguro/Suponiendo]:
   - `frisku-docs` se crea público: los respaldos de Rendiciones quedan con URL pública;
   - `nominas-docs` y `proc-docs` reciben subidas con la llave pública;
   - `osiris-fotos` es público;
   - `api/storage.js` no controla módulo ni ruta, y no valida inactividad ni huella.
   - Políticas por confirmar con M3.
4. **Realtime:** si publica `calendario_data`, difunde los cambios hasta la fase B (M2).
5. **`audit_log`:** se puede sobrescribir con la llave, y si su carga falla la app escribe `[]` encima (viola la regla 9).
6. **Cuentas bloqueables por terceros:** ~9 intentos cada 20 min desde cualquier IP. Además, "¿Olvidaste tu PIN?" inhabilita el PIN de quien no tenga celular registrado. Aceptar o ajustar: D4.
7. **Ritmo sostenido de intentos:** ~8 cada 15–20 min por cuenta, sin castigo progresivo. IPv6 se cuenta por dirección completa (/128), no por /64.
8. **Logout que no revoca copias de la cookie:** D3.
9. **Tablas `contab_*`, `osi_*` y `rbac_*`:** rama de roles, pendiente de S1–S7.

---

## 8. Decisiones pendientes de Angelo

| # | Decisión |
|---|---|
| D1 | Administrador de respaldo (B6) |
| D2 | Orden entre la propuesta DELETE/TRUNCATE y las fases main/pins (B3). Recomendación: DELETE/TRUNCATE primero, adaptando antes las guardas |
| D3 | Si "Salir" cierra todas las sesiones de la persona (sube la época) o se acepta el límite actual |
| D4 | Si se acepta que un tercero bloquee una cuenta 15 min, o se ajusta la regla |
| D5 | Corte de credenciales: **aceptado en el plan**, sujeto a verificar antes T4, T5 y T7. Su ejecución requiere [AUT] en la etapa 4 |

---

## 9. Pruebas locales ya realizadas (datos de prueba)

| Prueba | Resultado |
|---|---|
| `for f in api/*.test.mjs; do node "$f"; done` | Todas pasan (`_reglasLogin` 73, `_friskuSpAuth` 35, `frisku-sp` 107, …) |
| `POSTGREST_BIN=… node scripts/seguridad-main-pins/prueba-servidor.mjs` | 180/180, incluidas copias reales de cookies en tiempo real (~2 min de espera) |
| `node scripts/seguridad-main-pins/prueba-informe.mjs` | 7/7 en Chromium real, con control positivo |
| Dos instancias contra Postgres local (script del revisor, fuera del repositorio) | 8 permitidos de 16 alternados y 8 de 20 simultáneos |
| `scripts/e2e/seguridad-auth-servidor.mjs` (builds con flag prendido y apagado) | 35/35 |
| `scripts/e2e/regresion-empresas.mjs` con el flag apagado (commit 47c9d57; `src/` no cambió después) | 12.032 celdas, 0 diferencias; 0 peticiones a producción |

**No probado:**
- Vercel y Supabase reales;
- correo real;
- restauración de sesión en navegadores de escritorio (T9);
- el texto de las políticas tal como lo imprime producción.
