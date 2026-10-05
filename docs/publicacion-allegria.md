# Publicación del commit validado — `569dcb2`

Rama `claude/vigilant-cray-uf21ws`. **Sin merge y sin despliegue.** Este
documento es el procedimiento para cuando lo autorices.

Dos cosas que van por separado y no deben mezclarse en el mismo paso:

- **Publicación de la funcionalidad** (este documento). No carga ningún dato.
  Al desplegarse, la pantalla muestra lo mismo que hoy, porque sin programas,
  saldos ni montos informados cargados el cálculo es el histórico.
- **Incorporación de los datos** (WLH, Don Alberto, kilos y tarifas, Cerima /
  GFP / Ideal, saldo de apertura). Queda pendiente de tus definiciones y de la
  comprobación de `docs/verificacion-pagos-productor.md`. Se hace después, con
  la funcionalidad ya publicada y estable.

## Diferencial final

10 commits sobre `origin/main`, **+6.579 / −118** líneas en 19 archivos
(altas y bajas exactas por archivo, de `git diff origin/main --numstat`).
Parche completo del código para revisión: `allegria-569dcb2.patch` (383 KB),
adjunto aparte.

| Archivo | + | − | Qué cambia |
|---|---:|---:|---|
| `src/programas.js` | 1.115 | 0 | **Nuevo.** Modelo puro: programas por contraparte, cuotas, sustitución parcial, cubetas de fecha, cuadre por posición, saldos a favor, compensaciones, antecedentes |
| `src/ProgramasComerciales.jsx` | 1.488 | 0 | **Nuevo.** Pantalla del panel comercial, con formularios en línea (cero prompts) |
| `src/horizonte.js` | 32 | 0 | **Nuevo.** Fuente única del horizonte y del mes de corte |
| `src/flujoExportExcel.js` | 264 | 29 | Hoja Parametros: bloques por posición, compensaciones, sección de saldos por fórmula, columnas de movimiento de recuperación y devolución, informados como constante |
| `src/FinanzasModule.jsx` | 141 | 74 | `calcAllegria` con una sola vía de proyección por lado, dos líneas de flujo nuevas, panel embebido, anulación con formulario |
| `src/programas.test.mjs` | 915 | 0 | 166 checks del modelo puro |
| `src/__tests__/integracionSaldos.test.js` | 459 | 0 | 32 pruebas: posiciones, saldos, compatibilidad, solo lectura, antecedentes |
| `src/__tests__/programasFlujo.test.js` | 324 | 0 | 26 pruebas de flujo y Excel |
| `src/__tests__/saldosExcelRecalc.test.js` | 182 | 0 | **Nuevo.** Sección de saldos recalculada en LibreOffice, seis escenarios |
| `src/__tests__/compensacionConcurrencia.test.js` | 172 | 0 | **Nuevo.** Destino desde el cuadre, doble aplicación, conflicto entre sesiones |
| `src/__tests__/paramsFrutaAnticipos.test.js` | 30 | 9 | Rótulos actualizados |
| `scripts/e2e/programas-allegria.mjs` | 588 | 0 | **Nuevo.** 75 checks en navegador con Excel recalculado |
| `scripts/e2e/lib.mjs` · `README.md` | 14 | 2 | Apoyo del recorrido |
| `CLAUDE.md` | 83 | 4 | Reglas del modelo que no hay que romper |
| `docs/programas-allegria-carga.md` | 255 | 0 | Guía de carga |
| `docs/propuesta-carga-allegria.md` | 253 | 0 | Propuesta de carga, conciliación y pendientes |
| `docs/verificacion-pagos-productor.md` | 136 | 0 | Comprobación previa y saldo de apertura |
| `docs/publicacion-allegria.md` | 128 | 0 | Este documento |

Código de aplicación: **3.040 altas y 103 bajas** en 5 archivos. El resto son
pruebas (2.684 altas, 11 bajas) y documentación (855 altas, 4 bajas).

Las 103 bajas de código son reescritura de los bloques que este cambio
reemplaza (la vía de proyección de anticipos y el bloque de liquidación del
Excel), no borrado de funcionalidad ajena. `origin/main` no tiene ninguna
referencia a `programas`, `saldos_favor` ni `movimientos_sin_asignar`:
verificado con `grep` sobre el archivo de `main`, y es lo que hace limpia la
vuelta atrás.

**Dos líneas nuevas en el flujo de Allegria Foods**: *Recuperación de anticipos
a productores* (entrada, `ing_op`, marcada no-venta) y *Devolución de anticipos
a clientes* (salida, `egr_var`, marcada no-costo-de-fruta). Aparecen en cero
mientras no haya saldos a favor cargados.

**Empresas tocadas**: solo Allegria Foods. Las otras siete se verificaron por
regresión (12.032 celdas, 0 diferencias) justamente para probar que no cambian.

## Antes de publicar

En la rama, con el árbol limpio:

```bash
node src/programas.test.mjs                 # 166 checks del modelo
node src/anticipos.test.mjs                 # modelo de anticipos
CI=true npx react-scripts test --watchAll=false            # 1.474
RECALC=1 CI=true npx react-scripts test --watchAll=false \
  --testPathPattern saldosExcelRecalc       # +14, requiere LibreOffice
CI=true npm run build                       # los warnings escalan a error
```

Recorridos de navegador (build servido en local, Supabase interceptado, nunca
producción):

```bash
(cd build && python3 -m http.server 4173 --bind 127.0.0.1 &)
OUT_DIR=/tmp/e2e node scripts/e2e/programas-allegria.mjs    # 75 checks
OUT_DIR=/tmp/reg node scripts/e2e/regresion-empresas.mjs    # 12.032 celdas
```

Los cinco tienen que terminar en verde y los dos últimos deben reportar
`peticiones escapadas a producción: 0`.

## Publicación

1. **Respaldo del dato antes del deploy.** Confirmar que el respaldo diario de
   `calendario_data` del día corrió. El cambio no escribe ni migra nada, pero
   el respaldo es la red para cualquier deploy.
2. **Merge a `main`** desde la rama, sin reescribir historia:
   ```bash
   git checkout main && git pull origin main
   git merge --no-ff claude/vigilant-cray-uf21ws
   CI=true npm run build        # verificar el resultado COMBINADO
   git push origin main
   ```
   Si `main` avanzó mientras tanto, el merge se resuelve conservando el trabajo
   ajeno y se vuelve a correr la verificación completa de arriba sobre el
   resultado combinado.
3. **Deploy**: Vercel despliega automáticamente desde `main`. Esperar el build
   verde en Vercel; si falla, no hay nada desplegado y se corrige en rama.
4. **Comprobación en producción, solo lectura** (5 minutos):
   - Allegria Foods → Flujo de Caja: los totales mensuales son los mismos que
     antes del deploy. Las dos líneas nuevas aparecen en cero.
   - Allegria Foods → Parámetros → Cerezas: el panel comercial carga vacío, sin
     errores en consola.
   - Las otras siete empresas: abrir dos y comparar el flujo neto del mes en
     curso con el valor previo.
   - Descargar el Excel de Allegria Foods y de una empresa más, y comprobar que
     abren y cuadran con pantalla.
5. **Recién entonces**, la carga de datos, en el orden de
   `docs/propuesta-carga-allegria.md`: primero lo que no depende de
   definiciones (programas sin anticipos), después lo conciliado.

## Vuelta atrás

El cambio no migra datos, así que revertir el código es suficiente y no deja
datos huérfanos:

```bash
git revert -m 1 <sha-del-merge>     # devuelve main al estado anterior
git push origin main                # Vercel redespliega solo
```

Un registro ya cargado con la funcionalidad nueva (un programa, un saldo, un
monto informado) queda guardado en la fila `finanzas` y es ignorado por el
código anterior: no rompe el flujo viejo, y vuelve a estar visible al
redesplegar. Por eso conviene publicar la funcionalidad **antes** de cargar
datos: la vuelta atrás es limpia mientras no haya datos nuevos.

## Lo que esta publicación NO hace

- No carga ni modifica ningún dato real.
- No resuelve WLH: las cuotas quedan donde estén y los US$480.000 no se
  proyectan hasta que se carguen como vigentes.
- No descuenta los pagos de Don Alberto: eso requiere la comprobación y, si lo
  apruebas, el saldo de apertura, que todavía no está implementado.
- No toca Allpa Perú ni Allegria Service.
- No arregla los costos de ciruelas sin línea de flujo.
