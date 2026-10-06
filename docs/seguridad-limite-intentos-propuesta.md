# Propuesta: límite de intentos por cuenta y origen, sin bloqueos indefinidos (D4)

> **Estado: PROPUESTA, no implementada.** Requiere aprobación de Angelo antes de programarla. Es un bloqueante de la activación (B8 del checklist): el límite actual permite que un tercero bloquee una cuenta una y otra vez.

## Problema actual (comprobado en local)

Hoy los contadores son dos:

- **Por IP:** 30 intentos cada 5 minutos.
- **Por cuenta (`login:<email>`):** 8 intentos cada 5 minutos, con 15 minutos de bloqueo.

El contador por cuenta no distingue quién intenta. Por eso:

1. Cualquiera, desde cualquier IP, bloquea una cuenta (también la del administrador) con unos 9 intentos cada ~20 minutos, y puede repetirlo sin fin.
2. "¿Olvidaste tu PIN?" crea un código pendiente que **inhabilita el PIN** si la cuenta no tiene celular registrado. Un tercero puede dejar a alguien sin su PIN pidiendo códigos a su nombre.

## Propuesta

Tres contadores, todos en Postgres y compartidos por todas las instancias.

Reglas comunes:

- Solo cuentan los **intentos fallidos**.
- Un ingreso correcto **reinicia** los contadores de su origen.
- Todo bloqueo tiene un **tope**: nunca es indefinido.

| Contador | Clave | Regla | Qué protege | A quién afecta un bloqueo |
|---|---|---|---|---|
| K1 cuenta + origen | email + IP (IPv6 agrupada por /64) | 5 fallos gratis. Después, demoras de 1, 2, 4, 8, 16, 32 y 60 min (tope). El escalón vuelve a 0 tras 24 h sin fallos | Adivinar el PIN de una cuenta desde un origen | Solo a ese origen con esa cuenta |
| K2 origen | IP o /64 | 30 fallos en 15 min (cualquier cuenta) → demora progresiva de 5 a 60 min | Rociar PINs comunes sobre muchas cuentas | Solo a ese origen |
| K3 cuenta, todos los orígenes | email | Más de 10 fallos en 1 h → durante esa hora, el **PIN deja de aceptarse desde equipos no reconocidos**. Sigue funcionando el ingreso con código enviado por correo y desde un equipo reconocido | Ataque distribuido desde muchas IP | Ventana móvil de 1 h; no hay bloqueo de la cuenta |

**Equipo reconocido.** Al ingresar bien se entrega una cookie aparte:
- se llama `mediterra_disp`;
- va firmada, es `HttpOnly` y `SameSite=Strict`, y dura 90 días;
- queda ligada al correo y a la época de la persona.

Desde un equipo reconocido, K3 no aplica; solo K1 sobre ese equipo. La cookie se invalida con "Salir", con el reseteo del administrador y con el cambio de PIN, porque todos suben la época. La idea es la recomendación de OWASP contra el bloqueo de cuentas por terceros ("device cookies").

**"¿Olvidaste tu PIN?" deja de inhabilitar el PIN.** El código pedido por la propia persona convive con su PIN hasta que lo usa: el que se use primero sirve, y el código obliga a crear un PIN nuevo. Solo el **reseteo del administrador** inhabilita el PIN anterior, como hoy.

Esto cambia la regla del login acordada en el commit 8d7116f para la recuperación propia. Requiere tu aprobación.

## Recuperación controlada

| Situación | Cómo se recupera | Quién |
|---|---|---|
| La persona quedó con demora en su equipo (K1) | Espera, con un máximo de 60 min; desde otro equipo reconocido entra normal | Ella misma |
| Ataque distribuido en curso sobre su cuenta (K3) | Entra desde un equipo reconocido, o con un código por correo | Ella misma |
| Necesita entrar ya | "Desbloquear": el reseteo del administrador además borra los contadores K1/K3 de esa cuenta. El servidor calcula sus claves, porque no aparecen en claro en la base | Un administrador de `seg_administradores` |
| Ningún administrador disponible | SQL Editor: borrar los contadores de identidad (bloque escrito en el runbook) | Con [AUT] |

**Aviso:** cuando se activa K3 en una cuenta, se envía un correo a esa persona y a los administradores, como máximo uno por hora por cuenta. Sirve para detectar un ataque en curso; no se presenta como una barrera.

## Riesgo residual

- **Adivinación distribuida:** un atacante con muchas IP puede sostener, como máximo, ~10 fallos por hora por cuenta (K3), es decir ~240 por día.
  - Con PIN de 6 dígitos al azar son 10^6 combinaciones, así que la probabilidad de acertar en un año es ~8,8%. El cálculo: 240 × 365 / 10^6.
  - Un PIN elegido por la persona (fechas, patrones) es más fácil. La política actual ya rechaza repetidos y secuencias, nada más.
  - Bajarlo exige un umbral K3 menor, que molesta más a los usuarios legítimos en equipos nuevos, o un segundo factor, que sería una funcionalidad nueva.
- **Molestia en un equipo nuevo durante un ataque:** quien no tenga un equipo reconocido debe usar el código por correo.
- **NAT compartido:** con una IP de oficina compartida, K2 podría demorar a toda la oficina si se acumulan 30 fallos en 15 min. Es poco probable con uso normal.
- **IPv6:** se agrupa por /64. Un atacante con muchos /64 queda acotado por K3.
- **Cookie de equipo robada:** solo evita K3. El PIN se sigue exigiendo, con K1.

## Implementación (cuando se apruebe)

- **Base de datos:** una función nueva en Postgres que cuente solo fallos, lleve el escalón y lo reinicie al ingresar bien. Es SQL nuevo y requiere [AUT] para staging y producción. Alternativa sin SQL nuevo: escalones fijos con la función actual (5/15 min → 5 min, 10/1 h → 30 min, 20/24 h → 60 min), menos precisa porque cuenta también los ingresos correctos.
- **Servidor:**
  - `api/_segServidor.js` (contadores y equipo reconocido);
  - `api/_reglasLogin.js` (código propio que no inhabilita el PIN);
  - `api/auth/[op].js` (login, verificar, recuperar y "desbloquear" dentro de `admin-reset-pin`).
  - `api/frisku-sp.js` y `osiris-auth` usarían las mismas claves.
- **Pruebas:**
  - escalones de K1 con tiempo real acortado;
  - K2 con IP rotativas;
  - K3 con dos instancias;
  - equipo reconocido contra no reconocido;
  - que el código propio no inhabilite el PIN;
  - "desbloquear" del administrador;
  - que nunca haya un bloqueo sin tope.
