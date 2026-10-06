# Prototipo de rediseño — Hub + Flujo Empresas (oct-2026)

**Datos ficticios.** Las cifras salen de un generador determinístico con semilla fija. No vienen de Supabase ni son cifras de Grupo Mediterra. El aviso queda fijo en la parte superior de cada pantalla.

- Abrir: `prototipo/rediseno-2026-10/index.html` en el navegador (doble clic). Es un solo archivo, funciona sin red y no tiene dependencias.
- Está **fuera** de la app: CRA solo compila `src/` y `public/`, así que esto no llega al build ni a Vercel.
- No toca `src/`, permisos, persistencia ni la lógica de cálculo de la app.

## Qué se puede probar

| Pantalla | Qué evaluar |
|---|---|
| Inicio | Bandeja "Requiere tu atención" (severidad + motivo + acción), 5 KPI con su perímetro, tabla de empresas con caja mínima y tendencia, tareas del día. |
| Flujo Empresas | Selector Consolidado + 8 sociedades (Allpa con %, VPP aparte), rango (temporada / 12 / 24 meses), vista **Mensual / Semanal / 13 semanas**, búsqueda de línea, filtro por categoría, ocultar ceros, filtros activos como chips removibles, densidad compacta/cómoda, cabecera y primera columna fijas, total del rango fijo a la derecha, mes en curso destacado, meses reales marcados. |
| Celda | Clic o Enter: panel con origen y cálculo (valor manual con autor y fecha, suma de semanas, cuotas de Créditos por acreedor, subtotal por empresa). |
| Teclado | Una sola celda en el orden de Tab; flechas, Inicio/Fin entre celdas; Enter abre el detalle; Esc cierra. `Ctrl+K` abre la búsqueda global (empresas, módulos, tareas y líneas). |
| Dirección | El botón superior alterna **A · Libro mayor** (recomendada) y **B · Campo**. |

## Refinamiento (oct-2026, dirección A como base)

- **Cifras:** la tabla pasa a 13 px en densidad compacta y 14 px en cómoda (antes 12; la app actual usa 9–10). El alto de fila es de 30 px.
- **Contraste:** 114 pares de texto y control sobre todos los fondos cumplen WCAG AA (`pruebas/contraste.mjs`).
- **Contexto siempre visible:** una barra fija muestra empresa (y su participación o VPP), moneda, escenario, período, vista, y la fecha de corte real/proyección y del saldo inicial. En pantallas angostas se reduce a una línea: "Allegria Foods · US$ · Temp. 26-27 · Mensual · Base". La esquina de la tabla repite la empresa y la moneda.
- **Filas y columnas fijas:** la cabecera de meses, la columna de conceptos y el total del rango ya eran fijos; ahora también lo son **Flujo neto y Saldo acumulado**, que quedan visibles al recorrer las líneas.
- **Teclado:** un enlace "Saltar a la tabla" es el primer foco.
  - En la tabla: flechas, Inicio/Fin, RePág/AvPág (10 filas). Enter abre el detalle y Esc vuelve a la misma celda.
  - Los meses son botones enfocables: Enter abre o cierra sus semanas.
  - Atajos globales: `[` `]` cambian de empresa, `M`/`S`/`T` cambian la vista, `/` va al buscador, `?` muestra la ayuda y `Ctrl+K` abre la búsqueda global.
  - Los atajos se ignoran mientras se escribe en un campo.
- **Pruebas:** `pruebas/interaccion.mjs` corre 26 comprobaciones en 1440, 1024 y 390 px (desborde, tamaño de cifras, contexto, filas fijas y teclado) y da 26/26.

## Reglas de la app que el prototipo respeta

- Si hay semanas cargadas, la suma de semanas manda y la celda mensual va en cursiva (no editable).
- Una línea sin desglose semanal imputa el mes completo a S1. Es la regla actual de `getProySemana`, y se marca con un subrayado punteado.
- Las cuotas de préstamos se muestran calculadas desde Créditos, con su desglose por acreedor.
- La identidad de una línea es categoría + etiqueta. Allegria Service y Allpa Chile tienen "Electricidad" en dos categorías: la búsqueda muestra las dos por separado.
- Antes del mes en curso no se arrastra saldo.

## Verificación hecha

- Cuadre automático en los 24 meses: consolidado = Σ de las 6 sociedades línea a línea, y Σ semanas = mes. El resultado se muestra al pie de la tabla.
- Ejemplo verificado en pantalla: Allegria Foods, "Pago productores cerezas", Nov-26: 416.220 + 716.820 + 670.570 + 601.190 = 2.404.800.
- Playwright, 1440 / 1024 / 390 px, en las dos direcciones: 0 errores de consola y sin desborde horizontal de página (`pruebas/interaccion.mjs`).
- Contraste (WCAG AA): textos ≥ 4,5:1 sobre todos los fondos de la tabla y bordes de controles ≥ 3:1 (`pruebas/contraste.mjs`).

## Supuestos del prototipo (no son decisiones tomadas)

- El consolidado no aplica eliminaciones intercompany.
- Las JV (Allpa Chile 50%, Allpa Perú 26%) aparecen al 100% y aparte, sin sumar al consolidado.
- Cifras sin decimales, en US$; los negativos van entre paréntesis.

Informe completo de la revisión de diseño y accesibilidad: [`informe-ux.md`](informe-ux.md).
