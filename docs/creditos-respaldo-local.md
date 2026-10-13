# Conciliar los créditos reales en la vista previa local (sin tocar producción)

> **Estado:** mecanismo probado con un **respaldo de PRUEBA**. La conciliación con el
> respaldo real y la verificación de la UF en vivo siguen **pendientes**. El PR #43 sigue
> en borrador, sin autorización de merge ni de escritura en producción.

## Qué hace y qué no hace

- **Sí:**
  - Carga un respaldo descargado de la app ("💾 Respaldo") en **tu navegador**, en la vista previa **local**.
  - Te deja trabajar Créditos con datos reales: registrar o anular pagos, confirmar impagas, desglosar, cargar saldos informados, definir coberturas, cambiar tolerancias.
  - Exporta el resultado y el detalle de los cambios.
- **No:**
  - No se conecta a producción, ni por HTTP ni por WebSocket de tiempo real.
  - No envía correos.
  - No modifica el archivo del respaldo: solo lo lee.
  - No carga los PIN reales: el ingreso es con el usuario de prueba.
  - La versión **Artifact** (enlace) **no** ofrece cargar respaldos, así que los datos reales nunca salen de tu equipo.

En el navegador quedan dos copias:

| Copia | Uso |
|---|---|
| **Original** | Texto exacto del archivo y su SHA-256. Nunca se modifica. Antes de exportar se verifica que el SHA-256 siga igual. |
| **Trabajo** | Sobre ella opera la app. |

## Aislamiento: comprobar antes de usar

**Incidente 2026-10-07.** En un equipo Windows la vista previa local abrió contra la base de **producción**:
el simulador no se activó, se ingresó con el PIN real y "Actualizar hoy" guardó tipos de cambio en `maestro_tc`.
Desde entonces la versión local lleva una política de contenido del navegador que bloquea toda conexión a la
base de producción (HTTP y WebSocket) aunque el simulador falle, y si el simulador no está activo la página
se cubre con "VISTA PREVIA NO AISLADA". Prueba: `scripts/e2e/vista-previa-aislamiento.mjs`.

Antes de usarla:
- el recuadro amarillo "VISTA PREVIA LOCAL" está **abajo a la izquierda** (rojo en modo respaldo);
- se entra con el usuario de prueba (`482913`). **Si tu PIN real funciona, estás en producción: cierra la pestaña.**

## Paso a paso

1. **Descargar el respaldo** desde la app en producción: botón **💾 Respaldo**, arriba a la derecha del inicio. Es solo lectura. Guarda el archivo `backup_mediterra_AAAA-MM-DD.json` en una carpeta segura.
   - El archivo contiene **todos** los datos de la app, incluidos los hashes de los PIN. No lo compartas.
2. **Abrir la vista previa local** en la rama del PR:
   ```bash
   git fetch origin && git checkout claude/laughing-dijkstra-8665xz && git pull
   npm install
   node scripts/vista-previa/armar.mjs --build
   node scripts/vista-previa/servir.mjs
   ```
   Abre http://localhost:4180.
3. En la barra amarilla, presiona **"Cargar respaldo real…"** y elige el archivo.
   - Revisa el cuadro de confirmación: nombre, tamaño, filas, fecha del respaldo y SHA-256.
   - Presiona **Aceptar**.
4. La barra se pone **roja**: "VISTA PREVIA LOCAL · RESPALDO REAL · archivo · fecha · SHA-256".
   - Ingresa con `ahuerta@grupomediterra.cl` y PIN `482913`.
   - Ve a Flujo de Caja → 💳 Créditos.
5. **Conciliar**, con la guía de la sección 6 de `docs/creditos-revision-pre-merge.md`:
   - cuotas por conciliar: pagada o "Confirmar impaga" con respaldo;
   - desgloses;
   - saldos informados por acreedor;
   - cobertura de los valores manuales;
   - decisiones sobre los valores manuales antiguos.
6. **Revisar y exportar**, desde la barra roja:
   - **Ver resumen de cambios:** cuántas operaciones de cada tipo hay.
   - **Exportar resultado (JSON):** `conciliacion_creditos_<fecha>.json`. Trae las operaciones, el SHA-256 del respaldo verificado, la fecha y versión de cada fila del respaldo, y como referencia el estado conciliado de Créditos.
   - **Exportar detalle (CSV):** `detalle_cambios_<fecha>.csv`, para Excel (separador `;`). Una línea por operación y una por cada diferencia.
     - Las diferencias que provoca el guardado automático de la app al abrir van con ámbito **"Otros (auto-guardado de la app)"**. **No** son operaciones a aplicar.
7. **Salir del modo respaldo** cuando termines y hayas exportado. Borra las dos copias del navegador; el archivo del disco no se toca.

Lo que hagas queda guardado en el navegador (IndexedDB) aunque cierres la pestaña, hasta que salgas del modo respaldo.

## Qué es una "operación"

El resultado **no** es una copia de la fila completa: es la lista de cambios atómicos que hiciste.

| Operación | Cuándo |
|---|---|
| `agregar_pago` / `anular_pago` | registrar o anular un pago (incluye los de nómina) |
| `agregar_prepago` / `anular_prepago` | prepago aplicado o anulado (evento de capital del calendario) |
| `agregar_conciliacion` / `anular_conciliacion` | "Confirmar impaga" o su anulación |
| `cambiar_campo` | desglose, condiciones, `control_desde`, anulación de un crédito… (con su valor "antes") |
| `agregar_historial` | entradas nuevas de la bitácora del crédito |
| `agregar_credito` | crédito nuevo |
| `agregar_saldo_informado` / `anular_saldo_informado` | certificado del acreedor |
| `cambiar_config_creditos` | tolerancias |
| `agregar_cobertura` / `anular_cobertura` | cobertura de un valor manual |
| `agregar_resolucion_credito`, `retirar_valor_manual`, `cambiar_valor_manual` | decisiones sobre los valores manuales de Pago Préstamos y Renovaciones |
| `vincular_linea_nomina` / `desvincular_linea_nomina` | vínculo de una línea de nómina |
| `agregar_tc` / `cambiar_tc` | tipo de cambio o UF agregados en Maestros |

- Cada operación lleva el crédito identificado por su **uid** y su **huella**: n, empresa, acreedor, moneda, monto, vencimiento, cuota y tipo.
  - Así se reconoce aunque en producción el crédito aún no tenga uid. Los registros antiguos reciben `cr-<n>-<posición>`, igual que en la app.
- Si algo **desaparece** de la copia de trabajo (la app nunca borra), sale como `QUITADO_…` con una **alerta**. Hay que revisarlo antes de aplicar.

## Verificar la UF en vivo (pendiente)

Se hace en la vista previa **local**: la descarga sí sale a internet, pero se guarda solo en el navegador.

1. En la vista local, con datos simulados o con el respaldo cargado, ve a Frisku Foods → **🗂️ Maestros + TC** → **📈 Tipo de Cambio** → **🔄 Actualizar hoy**.
2. En la tabla, busca la fila **UF-CLP** de **hoy** con fuente **mindicador**. Anota el **valor** y la **fecha**.
3. Compara con el Banco Central para la misma fecha (bcentral.cl → indicadores diarios):
   - el **valor** debe ser idéntico;
   - la **fecha** debe ser la del valor, no la de la descarga;
   - la **fuente** debe decir `mindicador`.
4. En 💳 Créditos → 🔎 Conciliación → panel **"UF utilizada"**, la misma UF debe aparecer con su fecha y su fuente.
5. Si todo coincide, avísame para dar por verificada la UF en vivo. Si difiere, anota los dos valores y la fecha.

Mientras tanto, el panel sigue mostrando "pendiente de prueba en vivo".

## Pruebas del mecanismo (datos de prueba, no reales)

| Prueba | Qué verifica | Resultado |
|---|---|---|
| `scripts/e2e/vista-previa-respaldo.mjs` con `scripts/vista-previa/respaldo-prueba.mjs` | archivo intacto (SHA-256 igual antes y después); PIN reales no cargados; abrir no genera operaciones; pago en crédito antiguo sin uid → `agregar_pago` con uid `cr-1-0` y huella; saldo informado; impaga confirmada; exportación JSON y CSV; 0 HTTP, 0 WebSocket, 0 correos y 0 `/api`; "Salir" borra las copias; el Artifact no ofrece cargar | 18/18 OK |
| `scripts/e2e/vista-previa-uf.mjs` | "Actualizar hoy" pide `/api/uf/dd-mm-aaaa` a mindicador. Respuesta **simulada** con el formato real: queda UF-CLP con fuente mindicador solo en el navegador, no pisa los valores manuales y aparece en "UF utilizada" con fecha y fuente | 7/7 OK. El valor real queda **pendiente** |
| `scripts/e2e/vista-previa-funcional.mjs` | la vista previa simulada sigue igual tras el cambio | 26/26 OK |
