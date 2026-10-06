# Plan por etapas: proteger `main` y `pins`

> **Estado (2026-10-06): PROPUESTA, nada aplicado ni desplegado.** Rama `claude/seguridad-main-pins`,
> separada del PR de Créditos/Nóminas y de la propuesta de roles. Detalle técnico:
> `docs/seguridad-main-pins-servidor.md`. SQL: `supabase/seguridad_main_pins/`.

## Qué significa "administrador"

Administrador = fila activa en `public.seg_administradores`. Esa tabla solo la escribe
`service_role` o el SQL Editor, y el servidor la relee en cada petición.

No cuentan como administrador:
- el `rol` de `main` o de `usuarios`;
- la cookie;
- `user_metadata`;
- nada que envíe el navegador.

El `rol` del padrón solo decide qué se muestra en pantalla.

## Hallazgos (comprobados en local con las políticas leídas en producción)

| # | Hallazgo | Corrige |
|---|---|---|
| 1 | Con la llave pública cualquiera escribe `pins[<admin>_temp]`, entra como admin y fija su PIN | Fase A (escritura) + servidor |
| 2 | Cualquiera lee `pins`: todos los hashes. Un PIN de 6 dígitos se rompe fuera de línea | Fase B (lectura) + corte de credenciales (etapa 4) |
| 3 | Cualquiera escribe `usuarios`/`main.usuarios` y se da rol admin o módulos | Fase A + admin del servidor |
| 4 | Restaurar la sesión desde `sessionStorage` da acceso sin PIN (solo con el nombre) | Cliente en modo servidor (cookie firmada) |
| 5 | `main` (Tareas) se lee y escribe con la llave pública; TRUNCATE otorgado a anon | Fases A y C |
| 6 | osiris-auth valida contra `main` con la llave pública (padrón desactualizado) | osiris-auth → `/api/auth/verificar` |
| 7 | frisku-sp aceptaba el PIN con un código pendiente o vencido | Reglas comunes (corregido) |

**Fuera de alcance (siguen accesibles con la llave aunque la interfaz los oculte):**
- todas las demás filas de `calendario_data` (finanzas, nominas_*, osiris, allegria, frisku_*, rendiciones, eeff…), en lectura, escritura y borrado;
- buckets de Storage firmados con la llave pública (M3);
- `api/send-email.js`, abierto con CORS `*`, que sirve para enviar correos de phishing desde la cuenta de Mediterra;
- Realtime, si publica `calendario_data` (M2);
- tablas `audit_log`, `proc_*` y `contab_*` (las de roles van en la otra rama).

Cerrar esto exige que todos los datos pasen por sesión (E1.5). Es un proyecto aparte.

## Etapas

Cada etapa se puede revertir y no avanza si la anterior no está verificada. Las fases SQL abortan solas si la foto de permisos no es la esperada.

| Etapa | Qué se hace | Requiere | Efecto en usuarios | Cómo se verifica |
|---|---|---|---|---|
| 0 | Lecturas: `consultas_previas.sql` (M1–M5), `verificacion.sql` (debe decir HOY) | — | Ninguno | Resultados enviados |
| 1 | `fase0_admins.sql` + alta de Angelo y un admin de respaldo | Etapa 0 | Ninguno | `select … from seg_administradores` |
| 2 | Variables en Vercel + despliegue del servidor con el flag **apagado**; luego osiris-auth con `PROD_APP_URL` y el secreto | Etapa 1, RPC del rate limit (M5) | Ninguno: la app sigue igual. frisku-sp lee la fila `usuarios` | `GET /api/auth/sesion` → 401; Osiris inicia sesión |
| 3 | Despliegue del cliente con `REACT_APP_AUTH_SERVER=true`, en una ventana avisada | Etapa 2 | Todos vuelven a ingresar (las sesiones de `sessionStorage` dejan de servir). Quien no tenga `_h` o tenga un correo repetido (M4) recupera por correo o con un reseteo del admin. Hay que recargar las pestañas abiertas | Login, cambio de PIN, recuperar, permisos y Tareas con 2–3 usuarios reales |
| 4 | **A y B en la misma ventana** + decidir el corte (`AUTH_CREDENCIALES_DESDE` = hora de B) | Etapa 3 estable 1–2 días | Sin corte: ninguno. Con corte: cada persona recibe un código por correo y crea un PIN nuevo una vez. Sin correo, el admin le da el código | `verificacion.sql` → B; anon recibe 0 filas de pins/usuarios |
| 5 | `faseC_cerrar_main.sql` | Etapa 4 estable; recuperación probada | Ninguno | `verificacion.sql` → C |

**Por qué A y B juntas.** Con A sola, la llave sigue leyendo `pins`. Cualquiera puede pedir un código para la cuenta del admin (es público) y romper su hash fuera de línea en minutos.

**Por qué el corte.** Los hashes ya estuvieron expuestos meses, y cambiar el PIN exige el PIN antiguo, que quien lo rompió conoce. El corte obliga a demostrar acceso al correo. Su costo: una recuperación por persona, y quien no tenga correo depende del admin.

## Recuperación de acceso (en cualquier etapa)

1. "¿Olvidaste tu PIN?" envía un código por correo.
2. Un admin de `seg_administradores` usa "Resetear PIN". El código le llega a él y por correo.
3. SQL Editor, con el bloque exacto de `docs/seguridad-main-pins-servidor.md`: código en texto plano con vencimiento de 2 h. Probado en local.
4. Si nadie entra porque el servidor da 503 (falta una variable o falla la RPC): corregir la variable y volver a desplegar. Si no se puede, revertir.

## Reversión (orden obligatorio)

1. **Primero el SQL:** `reversion.sql` completo vuelve a HOY desde cualquier fase. Es re-ejecutable y aborta si alguien cambió las políticas a mano.
2. **Después**, si se quiere, desplegar el cliente con el flag apagado. Al revés no funciona: con B aplicada, el cliente antiguo no puede iniciar sesión.
3. El cliente con el flag prendido funciona en cualquier fase. Para volver de C a B basta la sección C del archivo.

Las fases cambian permisos, no datos: revertir no repone ni borra filas.

## Respaldos

[Seguro, por código] El respaldo automático diario del navegador está suspendido desde el 2026-09-03 (hotfix A). Este plan no quita ningún respaldo que esté funcionando.

Con el flag prendido:
- "Respaldo" y "Restaurar" excluyen `pins`, `usuarios` y `main`;
- esas tres filas solo quedan en los respaldos de la plataforma Supabase (plan Pro, diarios **[Probable]**, confirmar P9);
- un respaldo server-side ("auto-v4") queda como pendiente aparte.

## Pruebas (datos de prueba, local)

| Prueba | Resultado |
|---|---|
| `api/*.test.mjs` (incluye `_reglasLogin` 73, `_friskuSpAuth` 35, `frisku-sp` 102) | Todas pasan |
| `scripts/seguridad-main-pins/prueba-servidor.mjs` | 169/169. Cubre vulnerabilidades de hoy, cada endpoint, fases 0/A/B/C, recuperación, reversión, osiris-auth, sesión, filas dañadas, corte y M1/M4/M5 |
| `scripts/e2e/seguridad-auth-servidor.mjs` (navegador, builds con flag prendido y apagado) | 35/35 |

**No probado:**
- contra Vercel ni Supabase reales;
- envío SMTP real;
- el texto de las políticas tal como lo imprime producción (si difiere, las guardas abortan);
- Realtime y Storage.
