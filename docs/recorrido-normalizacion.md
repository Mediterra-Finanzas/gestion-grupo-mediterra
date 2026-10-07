# Recorrido único — comprobar la versión y ejecutar la normalización

Todos los pasos son de **solo lectura** salvo el paso 3, que es la normalización
autorizada: agrega los identificadores que faltan y no toca ninguna cifra
comercial. No se carga ningún movimiento.

Una sola pestaña abierta, y ningún otro equipo con la app abierta.

---

## 1 · Respaldo de referencia (solo lectura, fuera de Git)

Editor SQL de Supabase. Guarda la salida en un archivo local tuyo.

```sql
select jsonb_pretty(
         (case when jsonb_typeof(value) = 'string'
               then (value #>> '{}')::jsonb else value end) -> 'allegria_params')
from calendario_data where id = 'finanzas';
```

Solo trae `allegria_params`. No incluye credenciales, PIN, usuarios ni ningún
otro módulo o fila.

---

## 2 · Comprobar qué versión está corriendo tu pestaña (solo lectura)

En la app abierta, consola del navegador. Hace un GET de un archivo estático y
no escribe nada:

```js
const m = await (await fetch('/asset-manifest.json', {cache:'no-store'})).json();
const servidor = (m.files['main.js'] || '').split('/').pop();
const cargado = [...document.querySelectorAll('script[src]')]
  .map(s => s.src.split('/').pop()).find(n => /^main\./.test(n));
console.table([{ cargado, servidor, mismo: cargado === servidor }]);
```

- `mismo: true` → estás en el código que el servidor publica. Sigue al paso 3.
- `mismo: false` → tu pestaña corre un bundle viejo. Ctrl+Shift+R y repite.

---

## 3 · Normalización (el único paso que escribe)

Entra a **Finanzas**. No hace falta ir a Allegria ni a Parámetros: la
normalización corre al cargar el módulo y cubre las cinco temporadas y las tres
frutas.

Qué vas a ver, en este orden:

1. Un aviso arriba del flujo: **«29 registros guardados sin identificador
   propio»**, explicando que declarar una sustitución contra uno de ellos
   proyectaría el mismo monto dos veces.
2. El indicador de guardado abajo a la derecha: **«Guardando...»** y después
   **«Guardado»**.
3. El aviso desaparece. **Desaparece solo cuando el servidor confirmó**: si
   queda puesto, la normalización no se hizo y el botón «Normalizar y guardar
   los identificadores» la reintenta. Repetirlo no hace nada si ya está hecha.

Si en vez de «Guardado» aparece **«No se guardó»** o **«otra sesión cambió los
datos»**: no insistas. El aviso se queda, nada se escribió a medias, y las
sustituciones siguen bloqueadas a propósito. En el caso de conflicto el panel
ofrece las dos salidas y dice qué se pierde con cada una.

---

## 4 · Comprobar los 31 identificadores en el servidor (solo lectura)

Editor SQL. Es la misma consulta de siempre:

```sql
select t.key as temporada, f.key as fruta, l.lado, e.ord,
       (e.val ? 'id') as tiene_id, e.val->>'id' as id,
       e.val->>'mes' as mes, e.val->>'usd_kg' as usd_kg
from calendario_data cd,
     lateral (select case when jsonb_typeof(cd.value)='string'
                          then (cd.value #>> '{}')::jsonb else cd.value end as v) j,
     lateral jsonb_each(j.v->'allegria_params') t,
     lateral jsonb_each(t.value) f,
     lateral (values ('cliente','anticipos_cliente'),('productor','anticipos_productor')) l(lado,campo),
     lateral jsonb_array_elements(coalesce(f.value->l.campo,'[]'::jsonb)) with ordinality e(val,ord)
where cd.id = 'finanzas' order by 1,2,3,4;
```

Lo que **tiene** que haber cambiado:

- `tiene_id` en `true` en las **31** filas.
- Los dos que ya existían, **sin cambiar** y en su misma posición:
  `ant_muldwuaqacctd` en 2026-2027 / cerezas / cliente / 1, y
  `ant_mulfa0er8hedc` en 2026-2027 / cerezas / productor / 2.
- Los otros **29** con prefijo `mig_`, todos distintos.

Lo que **no** puede haber cambiado, comparando contra el archivo del paso 1:

- Ningún `mes`.
- Ningún `usd_kg`, incluidas las filas que están en 0.
- El orden (`ord`) de cada arreglo.
- Las cinco temporadas, no solo 2026-2027.

Si alguno de los dos identificadores existentes cambió, o si se movió un mes o
un monto, **detente y avísame**: no es el comportamiento esperado.

---

## 5 · Comprobar en pantalla (solo lectura)

Finanzas → Flujo Empresas → Allegria Foods → Parámetros → Temporada 2026-2027,
cerezas:

- E2 (Nov-26) y E3 (Dec-26) muestran **Acordado US$374.000** cada una
  (850.000 kg × 0,44).
- El campo para declarar la sustitución queda habilitado. **No lo toques.** Eso
  es carga comercial y va después de que apruebes su antes/después.

---

## Qué NO hace este recorrido

- No carga ningún movimiento comercial ni declara ninguna sustitución.
- No cambia kilos, FOB, descuentos, materiales, servicios ni meses de
  liquidación.
- No toca las temporadas 2027-2028 en adelante más allá de agregarles
  identificador.
- No modifica usuarios, permisos, PIN ni ninguna otra fila.
