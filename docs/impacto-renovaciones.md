# Impacto del cambio de renovaciones sobre un respaldo (solo lectura, local)

Compara, crédito por crédito, el cálculo de Créditos que corre hoy (`origin/main`) con
el de la rama, sobre un respaldo descargado con **💾 Respaldo**. No se conecta a ninguna
base ni modifica el archivo. El informe queda fuera del repositorio (lleva datos reales).

## Paso a paso en tu equipo (Windows, PowerShell)

No hace falta `npm install` ni abrir la app: solo `git` y `node`.

1. En la app de producción, **💾 Respaldo** (arriba a la derecha del inicio). Guarda el archivo
   **fuera de la carpeta del repositorio**, por ejemplo `C:\Respaldos\backup_mediterra_2026-10-15.json`.
   El archivo trae los PIN hasheados: no lo compartas ni lo copies dentro del repositorio
   (igual `.gitignore` ignora `backup_mediterra_*.json`).
2. En la carpeta del repositorio:
   ```powershell
   git fetch origin main claude/laughing-dijkstra-8665xz
   git checkout claude/laughing-dijkstra-8665xz
   git pull origin claude/laughing-dijkstra-8665xz
   $env:HOY = "2026-10-15"
   node scripts/impacto/renovaciones.mjs C:\Respaldos\backup_mediterra_2026-10-15.json C:\Respaldos\impacto
   ```
3. Abre `C:\Respaldos\impacto\impacto-renovaciones.md`. Si quieres que lo revise, comparte **solo
   ese archivo** (o su texto): trae empresas, acreedores y montos de créditos, nunca PIN, hashes,
   usuarios ni nóminas, porque el script lee únicamente `finanzas.creditos_data`.

En bash: `HOY=2026-10-15 node scripts/impacto/renovaciones.mjs /ruta/backup.json /ruta/salida`.

Entrega `impacto-renovaciones.md` y `.json` con:

- **Renovaciones cuyo cálculo cambia**: empresa, crédito, moneda, clase (antigua o
  modalidad), vencimiento original, mes de ingreso, fechas de cuotas, capital e interés
  antes → después y diferencia.
- **Efecto mensual en el flujo (US$)** por crédito: Pago Préstamos - Total,
  Renovaciones, Ingreso Renovación e Ingresos Financiamiento, mes a mes.
- **Antiguas conservadas con observación**: sin modalidad, conservan el cálculo anterior
  (incluidos sus defectos: ingreso en otra moneda sin convertir, crédito anulado con
  ingreso proyectado) hasta clasificarlas.
- **Casos pendientes de decisión** (sin cambio de comportamiento, solo medidos):
  1. créditos ANULADOS cuya renovación antigua sigue proyectando ingreso (monto por mes y
     total, equivalente en US$, si el mes ya pasó, motivo de anulación);
  2. renovaciones antiguas con mes o año de ingreso ilegible (no entran al flujo; solo cambia
     la tarjeta del «Timeline de Pagos por Acreedor»);
  3. créditos con «renovable» desmarcado que guardan renovaciones.
- **Control por empresa** con todos los créditos juntos.

Reglas que el informe comprueba:

- Una renovación **antigua** (sin modalidad ni estado) se calcula exactamente como en
  `main`: no debe aparecer en "cálculo que cambia".
- Clasificar o anular una antigua en el formulario muestra la diferencia mes a mes en el
  flujo y **exige confirmación** antes de guardar (cancelar no escribe nada).

Contraprueba (respaldo sintético con casos conocidos): `node scripts/impacto/prueba.mjs`.
