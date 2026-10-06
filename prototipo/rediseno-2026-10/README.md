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

## Reglas de la app que el prototipo respeta

- Si hay semanas cargadas, la suma de semanas manda y la celda mensual va en cursiva (no editable).
- Una línea sin desglose semanal imputa el mes completo a S1. Es la regla actual de `getProySemana`, y se marca con un subrayado punteado.
- Las cuotas de préstamos se muestran calculadas desde Créditos, con su desglose por acreedor.
- La identidad de una línea es categoría + etiqueta. Allegria Service y Allpa Chile tienen "Electricidad" en dos categorías: la búsqueda muestra las dos por separado.
- Antes del mes en curso no se arrastra saldo.

## Verificación hecha

- Cuadre automático en los 24 meses: consolidado = Σ de las 6 sociedades línea a línea, y Σ semanas = mes. El resultado se muestra al pie de la tabla.
- Ejemplo verificado en pantalla: Allegria Foods, "Pago productores cerezas", Nov-26: 416.220 + 716.820 + 670.570 + 601.190 = 2.404.800.
- Playwright, 1440 / 1024 / 390 px, en las dos direcciones: 0 errores de consola y sin desborde horizontal de página.
- Contraste (WCAG AA): textos ≥ 4,5:1 sobre todos los fondos de la tabla y bordes de controles ≥ 3:1. Lo calculé con los hex de los tokens.

## Supuestos del prototipo (no son decisiones tomadas)

- El consolidado no aplica eliminaciones intercompany.
- Las JV (Allpa Chile 50%, Allpa Perú 26%) aparecen al 100% y aparte, sin sumar al consolidado.
- Cifras sin decimales, en US$; los negativos van entre paréntesis.

Informe completo de la revisión de diseño y accesibilidad: [`informe-ux.md`](informe-ux.md).
