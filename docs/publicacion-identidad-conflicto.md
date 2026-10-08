# Publicación y normalización controlada — oct-2026

Qué se publica, en qué orden, cómo se comprueba y cómo se revierte. Preparado
para autorizar; **nada de esto se ejecutó**.

- Rama: `claude/vigilant-cray-uf21ws`
- Commit validado: `994158b`
- Producción al momento de preparar: `8df9862`
- Punto de reversión: `8df9862`

## 1. Por qué el orden importa

La normalización de identificadores escribe 29 identidades nuevas en la fila
`finanzas`, que es exactamente la fila-blob donde estaba el defecto de conflicto
de guardado. Si dos sesiones estuvieran abiertas durante esa migración, el estado
obsoleto de una podía sobrescribir las identidades recién asignadas y devolver
éxito. Por eso **el arreglo del conflicto va publicado antes de correr la
normalización**, y van en el mismo commit: no hay una ventana en la que exista la
migración sin la protección.

## 2. Publicación

1. Confirmar que `origin/main` sigue en `8df9862`. Si avanzó, no publicar:
   rebasar y volver a correr la verificación completa.
2. Merge de `claude/vigilant-cray-uf21ws` a `main`. Vercel despliega solo.
3. Esperar el deployment de producción y comprobar que la versión servida
   corresponde al merge.

## 3. Normalización controlada (después del deploy, antes de cargar nada)

**Una sola persona con una sola pestaña abierta.** La migración es idempotente,
pero correrla desde dos sesiones a la vez provoca el conflicto que el propio
cambio detecta, y hay que resolverlo a mano sin necesidad.

1. Antes de abrir la app, guardar un extracto de respaldo de lo que se va a
   tocar, con la consulta reducida (solo `allegria_params`, sin credenciales ni
   otros módulos):

   ```sql
   select jsonb_pretty(
            (case when jsonb_typeof(value) = 'string'
                  then (value #>> '{}')::jsonb else value end) -> 'allegria_params')
   from calendario_data where id = 'finanzas';
   ```

   Guardar la salida en un archivo local. **No se versiona en el repositorio.**

2. Abrir Finanzas → Flujo Empresas → Allegria Foods → Parámetros.
3. Arriba aparece el aviso con la cuenta de registros sin identificador. La
   migración se dispara sola una vez tras la carga; el aviso desaparece solo
   cuando el servidor confirma. Si quedó en error o en conflicto, el botón
   «Normalizar y guardar los identificadores» lo reintenta.
4. Comprobar con la misma consulta de arriba que las 31 estimaciones tienen `id`
   y que los dos que ya existían (`ant_muldwuaqacctd`, `ant_mulfa0er8hedc`) no
   cambiaron. Si alguno cambió, **detenerse**: no es el comportamiento esperado.
5. Comprobar que ningún mes ni ningún US$/kg se movió, incluidas las temporadas
   2027-2028 a 2030-2031 (que no se tocan en esta entrega).

## 4. Qué comprobar en pantalla

- El indicador de guardado pasa por «Guardando...» y llega a «Guardado» al
  registrar cualquier dato. Si queda en «No se guardó», el cambio sigue en
  pantalla y no se escribió: no insistir, leer el aviso.
- En las estimaciones de cerezas 2026-2027 ya se puede escribir el monto que
  sustituye. Antes de normalizar, ese campo aparece bloqueado con el motivo.
- Al declarar las dos sustituciones de US$374.000 (Nov-26 y Dec-26), los
  pendientes del lado cliente deben quedar en **748.000**, no en 1.122.000 ni en
  1.496.000, y la liquidación de Mar-27 en **3.077.000** (= 850.000 × 4,5 − 748.000).
- Descargar el Excel de Allegria Foods y comparar esos tres números con la
  pantalla.

## 5. Reversión

Volver `main` a `8df9862` y dejar que Vercel despliegue.

Lo que hay que tener en cuenta al revertir, y que no es simétrico:

- **Las identidades ya escritas quedan en la fila.** El código anterior las
  ignora: sus normalizadores vuelven a acuñar un id en cada render para los
  registros que no lo traen, pero estos ya lo traen, así que los respeta. No hay
  que borrarlas.
- **Las sustituciones declaradas después de normalizar sí cambian de
  comportamiento**: el código anterior las sigue leyendo (apuntan a ids que
  existen), así que se conservan. Lo que vuelve es el defecto, no la pérdida del
  dato.
- **El conflicto pendiente desaparece como protección.** Si se revierte con una
  fila en conflicto, el auto-save del código anterior vuelve a poder sobrescribir.
  Antes de revertir, cerrar las demás sesiones.
- Revertir puede **subir o bajar** la proyección según qué se haya cargado; no se
  puede anticipar el signo. Hay que comparar el flujo antes y después, no
  suponerlo.

## 6. Lo que queda fuera de esta publicación

- Las salidas del conflicto pendiente no están conectadas en `App.jsx` (fila
  `main`, Tareas) ni en `AllegriaModule.jsx`: ahí el aviso llega y nada se pisa,
  pero la fila queda bloqueada hasta recargar la página.
- Abrir Finanzas sigue produciendo una escritura de la fila con el mismo
  contenido lógico, porque `applyData` re-defaultea el blob. No es pérdida de
  datos; sacarlo exige mover esa normalización por defaults a una capa de vista.
- RLS y el guardia del servidor siguen pendientes: la autorización que se agregó
  vive en el cliente y cierra la vía accidental, no la deliberada.
- Las estimaciones de las temporadas futuras (2027-2028 en adelante) no se
  modifican: solo reciben identidad.
