# Prueba E2E en navegador — anticipos de Allegria Foods

Corre la app REAL (el build de esta rama) en un navegador y comprueba que el
Excel sea un reflejo fiel del flujo que muestra la pantalla: carga los datos por
la interfaz, lee la tabla del flujo, descarga los Excel con los botones de la
app, los **recalcula de verdad** (borra los valores cacheados y los abre con
LibreOffice Calc) y compara mes por mes.

**Aislamiento**: toda llamada a `bywovqayuzodbzwsriet.supabase.co` se responde
desde un store en memoria (`fake.mjs`), que emula PostgREST con bloqueo
optimista por `updated_at`. La base de producción no se lee ni se escribe.
`aislamiento.mjs` lo verifica contando las peticiones que escapan (debe ser 0).
El PIN y su hash de `fake.mjs` son de ese store falso; no dan acceso a nada real.

## Requisitos

- `npm i --no-save playwright` (el navegador ya viene en la imagen; si no,
  `npx playwright install chromium`)
- LibreOffice **Calc** (`soffice`): sin Calc, el recálculo no funciona
  (`apt-get install -y --no-install-recommends libreoffice-calc`)

## Uso

```bash
CI=true npx react-scripts build
(cd build && python3 -m http.server 4173 --bind 127.0.0.1 &)

cd scripts/e2e
OUT_DIR=/tmp/e2e-anticipos node aislamiento.mjs    # 0 peticiones escapadas
OUT_DIR=/tmp/e2e-anticipos node e2e.mjs            # 6 fases, ~7 min
```

Deja en `OUT_DIR`: capturas por fase, los `.xlsx` descargados por la app,
`comparaciones.json` (una fila por celda comparada) y el store final.
Sale con código 1 si hay cualquier diferencia entre pantalla y Excel.

## Verificación con datos reales (copia aislada)

```bash
node scripts/e2e/snapshot.mjs /tmp/snapshot-real.json   # SOLO GET, no escribe
OUT_DIR=/tmp/e2e-real node scripts/e2e/real.mjs /tmp/snapshot-real.json
```

`snapshot.mjs` descarga en solo lectura las filas `finanzas`, `finanzas_bancos`
y `finanzas_esc_index`. `real.mjs` las carga en el store en memoria y corre la
app contra ESA COPIA: no registra realizaciones ni edita nada, solo lee
Parámetros y el Flujo, descarga los dos Excel y los recalcula. Informa además
los anticipos antiguos (sin realizaciones), los overrides existentes y las
fechas de cada cuenta bancaria. Si el snapshot no se puede descargar, sirve
igual el JSON del botón "💾 Respaldo" de la app.

## Regresión de todas las empresas

```bash
OUT_DIR=/tmp/e2e-empresas node scripts/e2e/regresion-empresas.mjs
# una sola: EMPRESAS="Allpa Farms" node scripts/e2e/regresion-empresas.mjs
```

Por cada empresa lee la tabla del flujo, descarga su Excel, lo recalcula y
compara mes a mes; después escribe un override manual en una celda calculada y
repite. Cubre los dos cambios que no son exclusivos de los anticipos (saldo
inicial en el mes en curso y override respetado) en las 8 empresas, incluidas
las 5 con hoja Parametros viva.

Hoy reporta 0 diferencias en 7 empresas. Allpa Farms sale con desvío en
"Costos Fijos / SG&A": es un bug **preexistente de la pantalla** (etiquetas de
línea repetidas entre categorías; ver CLAUDE.md), idéntico en `main`.

## Fases

1. Caso base: venta 600.000 / anticipo 100.000 / cobrado 60.000 y
   costo 422.000 / anticipo 100.000 / pagado 70.000.
2. Recarga de la app (persistencia de las realizaciones).
3. Anticipo cerrado parcialmente realizado.
4. Cambio de kilos (el realizado no se mueve).
5. Anulación de una realización (con motivo, queda en el historial).
6. Override manual sobre la línea de anticipos.
