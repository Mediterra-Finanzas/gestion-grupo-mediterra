# Impacto del cambio de renovaciones sobre un respaldo (solo lectura, local)

Compara, crédito por crédito, el cálculo de Créditos que corre hoy (`origin/main`) con
el de la rama, sobre un respaldo descargado con **💾 Respaldo**. No se conecta a ninguna
base ni modifica el archivo. El informe queda fuera del repositorio (lleva datos reales).

```bash
git fetch origin main
HOY=2026-10-15 node scripts/impacto/renovaciones.mjs /ruta/backup_mediterra_AAAA-MM-DD.json /ruta/salida
```

Entrega `impacto-renovaciones.md` y `.json` con:

- **Renovaciones cuyo cálculo cambia**: empresa, crédito, moneda, clase (antigua o
  modalidad), vencimiento original, mes de ingreso, fechas de cuotas, capital e interés
  antes → después y diferencia.
- **Efecto mensual en el flujo (US$)** por crédito: Pago Préstamos - Total,
  Renovaciones, Ingreso Renovación e Ingresos Financiamiento, mes a mes.
- **Antiguas conservadas con observación**: sin modalidad, conservan el cálculo anterior
  (incluidos sus defectos: ingreso en otra moneda sin convertir, crédito anulado con
  ingreso proyectado) hasta clasificarlas.
- **Control por empresa** con todos los créditos juntos.

Reglas que el informe comprueba:

- Una renovación **antigua** (sin modalidad ni estado) se calcula exactamente como en
  `main`: no debe aparecer en "cálculo que cambia".
- Clasificar o anular una antigua en el formulario muestra la diferencia mes a mes en el
  flujo y **exige confirmación** antes de guardar (cancelar no escribe nada).

Contraprueba (respaldo sintético con casos conocidos): `node scripts/impacto/prueba.mjs`.
