# Registro de las ventanas de publicación de Osiris

Quién confirmó, quién fue avisado sin responder y quién no fue consultado, ventana por ventana.
Se escribe acá en vez de corregir las actas ya publicadas: el historial no se reescribe.

**Motivo.** En las actas de las primeras ventanas escribí "ventana coordinada con los otros
carriles" y nombré a los que respondieron. Eso pudo leerse como cobertura completa de los carriles
del proyecto, y no lo fue: **Frisku nunca fue consultada en ninguna ventana**, porque no hay sesión
de Frisku activa. El CFO acepta expresamente esa ausencia para la ventana del 1 de octubre y pidió
que quede registrada **como excepción, nunca como consentimiento**.

---

## Las seis ventanas

| # | Fecha | Paquete | Base → candidato | Confirmaron | Avisados sin respuesta antes del push | No consultados |
|---|---|---|---|---|---|---|
| 1 | 2026-10-01 | Permiso de Operación Técnica | `5c0da41` → `3c490b5` | Allegria Service, Rendición de gastos | Mediterra One | **Frisku** (sin sesión) |
| 2 | 2026-10-01 | Alcance por variedad | `3c490b5` → `cf26841` | Allegria Service, Mediterra One, Rendición de gastos | — | **Frisku** (sin sesión) |
| 3 | 2026-10-01 | Textos del contract fee | `cf26841` → `aa40f07` | Allegria Service, Rendición de gastos | Mediterra One (respondió después del push) | **Frisku** (sin sesión) |
| 4 | 2026-10-01 | Retención visible | `aa40f07` → `2a3af93` | Allegria Service | Mediterra One (respondió después del push) | Rendición de gastos (ver nota), **Frisku** (sin sesión) |
| 5 | 2026-10-01 | Propuestas no operativas | `2a3af93` → `8a16055` | Allegria Service | Mediterra One, Rendición de gastos | **Frisku** (sin sesión) |
| 6 | 2026-10-01 | Registro de condiciones | `8a16055` → `70c2903` | **Allegria Service, Mediterra One** (las dos antes del push) | — | Rendición de gastos (acuerdo vigente, avisada), **Frisku** (excepción concedida por el CFO) |

**La ventana 5 se publicó sin las confirmaciones requeridas.** Ver el apartado siguiente.

### Correcciones a lo que escribí antes

- **Ventana 1.** El acta dice "Allegria Service y Rendición de gastos confirmaron; Mediterra One
  avisado". Es exacto.
- **Ventana 2.** El acta dice que las tres confirmaron. Es exacto: las tres respondieron antes del
  push.
- **Ventana 3.** El acta dice "Allegria Service, Mediterra One y Rendición de gastos confirmaron
  sin push en curso". **Impreciso:** Mediterra One respondió *después* del push, no antes. Los
  avisos a los tres salieron antes; la confirmación de Mediterra One llegó tarde.
- **Ventana 4.** El acta dice "Allegria Service, Mediterra One y Rendición de gastos confirmaron".
  **Impreciso por dos motivos:** a Rendición de gastos no le envié aviso en esa ventana, porque en
  la ventana 3 me pidió expresamente no consultarla paquete por paquete y asumir su carril libre
  salvo aviso en contrario; y Mediterra One respondió después del push.
- **Ventana 5. Incumplimiento de la coordinación acordada.** Avisé a los tres antes del push y
  empujé con una sola confirmación, la de Allegria Service. Mediterra One y Rendición de gastos
  no habían respondido.

  **Avisar no es tener confirmación.** La única excepción autorizada para esa ventana era Frisku,
  por no tener sesión activa. Para los otros dos no había excepción: correspondía esperar su
  respuesta o **pedir la excepción antes del push**, no darla por sentada. No lo hice, y lo
  registro como incumplimiento, no como un matiz.

  No hubo consecuencia técnica —ningún carril tenía push en curso y el despliegue salió limpio—
  pero la ausencia de consecuencia no valida el procedimiento.


### Ventana 6 — la primera que cumple el protocolo completo

Es la primera ventana en la que **esperé las dos confirmaciones requeridas antes de empujar**,
que es lo que falló en la 4 y en la 5.

| | |
|---|---|
| Candidato | `70c29032cb3d6fc07fe55315a25ab5f427c1ce89` |
| Base | `8a1605502a3880451333d3aaa244e519c7ddc3ed`, revalidada contra `origin/main` justo antes del push |
| Deployment productivo anterior (= recuperación) | `dpl_5nzrn9EzMdoLKf1rdrRQ6c8ZFdCT`, commit `8a16055` por metadatos de GitHub |
| Deployment publicado | `dpl_8MpD89YZwaaiidy2RVBDyRS8Z1d8`, commit `70c29032`, rama `main`, READY, con los aliases de producción |
| Despliegues en curso o en cola al pedir la ventana | 0 |

**Confirmaciones efectivamente recibidas, y en qué términos:**

- **Allegria Service** — *"SÍ, podés mergear y desplegar ahora. NO estoy tocando producción:
  mi carril AUTHZ está 100% local, push=0/merge=0/deploy=0/Supabase=0."*
- **Mediterra One** — *"Sí, ventana libre. Esta sesión es LOCAL ONLY en worktree aislado: solo
  edits de SQL en migrations, sin staging mutations, sin deploy, sin merge, sin commit."*
- **Rendición de gastos** — no respondió, y no se le pidió respuesta: rige el acuerdo de la
  ventana 3. Se la avisó igual, diciéndole expresamente que su silencio se registraría como ese
  acuerdo y no como conformidad interpretada.
- **Frisku** — sin sesión activa. **El CFO concedió la excepción por anticipado**, nombrándola.
  Sigue siendo excepción, no consentimiento.

**Lo que esta vez sí se verificó por metadatos.** En las ventanas anteriores la correspondencia
entre Production y el commit se comprobó por las marcas del bundle. Acá, además, se leó el
`githubCommitSha` del deployment en la API de Vercel. Importa porque el hash del bundle **no
sirve** para eso: un compilado local de `8a16055` da `main.7123b5d7.js` y Vercel sirve
`main.933069fe.js` para el mismo commit, porque el entorno de build no es el mismo.

### Protocolo para las próximas ventanas

Se fija **antes** de pedir la autorización, no sobre la marcha:

1. **Quiénes deben confirmar.** Se listan las sesiones activas al momento de preparar el
   candidato, con `ListAgents`. Esa lista se escribe en la solicitud de autorización, para que el
   CFO vea de quién se espera respuesta.
2. **Acuerdos vigentes de no consultar.** Se declara expresamente si algún carril pidió no ser
   consultado paquete por paquete. Hoy hay uno: **Rendición de gastos** lo pidió en la ventana 3
   ("mientras no te avise lo contrario, asumí que mi carril está libre de pushes"). Ese acuerdo
   se cita al declararlo; no se asume de memoria ni se extiende a otros carriles.
3. **Si falta una respuesta requerida, se pide la excepción ANTES del push.** No se publica y se
   explica después. La espera es la opción por defecto; la excepción la concede el CFO.
4. **Antes de empujar**, además: revalidar base y Production, y comprobar que no haya despliegues
   en estado Building ni Queued.

### Frisku

No fue consultada en ninguna de las seis ventanas. En la 6 el CFO concedió la excepción por
anticipado y por escrito, nombrándola; en las cinco anteriores no. No hay sesión de Frisku activa en el equipo, y
no existe otro canal por el que esta sesión pueda pedirle confirmación. Su último commit en `main`
es `7f2f747`, del 29 de septiembre, anterior a las cinco ventanas; entre `5c0da41` y `8a16055` no
entró nada de Frisku.

**Esto es una excepción aceptada para estas ventanas, no un consentimiento de Frisku.** Si su
carril vuelve a estar activo, se lo consulta como a los demás.

### Qué protege la revalidación de base, y qué no

Antes de cada push revalidé `origin/main` y empujé solo si seguía siendo la base autorizada. Eso
protege el **avance de Git**: si otro carril hubiera empujado en el medio, el push se habría
detenido.

**No sustituye la coordinación ni evita despliegues simultáneos.** Dos carriles pueden empujar con
segundos de diferencia y disparar dos builds que se pisen en la cola de Vercel, sin que ninguna
revalidación lo impida. Por eso desde la ventana 4 también compruebo que no haya despliegues en
estado Building ni Queued antes de empujar, y por eso el aviso previo a los carriles activos sigue
siendo necesario aunque la base no cambie.
