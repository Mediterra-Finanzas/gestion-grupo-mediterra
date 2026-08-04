---
name: mediterra-export-excel
description: >
  Convenciones para generar Excel (.xlsx) en la app Gestión Grupo Mediterra.
  La app usa xlsx-js-style (NO el paquete 'xlsx' plano) para soportar estilos
  (celdas, colores, bordes, formato numérico) en las exportaciones. Úsalo cuando
  crees o modifiques exports a Excel: flujo de caja, rendiciones, reportes,
  EEFF, maestros Frisku. Triggers: exportar Excel, xlsx, xlsx-js-style,
  flujoExportExcel, hoja Parametros, SheetJS, estilos de celda, logos empresa,
  descargar planilla, workbook, worksheet.
---

# Export a Excel (xlsx-js-style)

## Regla de librería

- **Importar SIEMPRE `xlsx-js-style`, nunca `'xlsx'`** plano. El fork
  `xlsx-js-style` es el único que respeta `cell.s` (estilos). Usar `'xlsx'`
  rompería el formato de todas las planillas del grupo.

  ```javascript
  import * as XLSX from "xlsx-js-style";
  ```

- Archivos que ya lo usan (mantener consistencia con su estilo):
  `flujoExportExcel.js`, `eeffHelpers.js`, `FinanzasModule.jsx`,
  `ContabilidadModule.jsx`, `RendicionesModule.jsx`, `FriskuComercialModule.jsx`,
  `FriskuModule.jsx`.

## Estilos de celda

Los estilos van en `cell.s`:

```javascript
ws["A1"].s = {
  font: { bold: true, sz: 12, color: { rgb: "FFFFFF" } },
  fill: { fgColor: { rgb: "1F4E5F" } },        // teal de la paleta
  alignment: { horizontal: "center", vertical: "center" },
  border: { bottom: { style: "thin", color: { rgb: "CCCCCC" } } },
  numFmt: "#,##0",                              // miles sin decimales (CLP/USD)
};
```

- Montos: formato numérico con separador de miles. CLP sin decimales; USD según
  contexto.
- Mantener la paleta visual del módulo (objeto `C` con colores hex).

## Logos de empresa

Los exports de rendiciones (y PDFs) insertan el logo de la empresa desde
`public/`. El mapeo empresa→archivo está documentado en la memoria
`logos-empresas`. Respetar el aspecto natural del logo al colocarlo; no estirar.

## Hoja "Parametros" viva

Varios exports por empresa incluyen una hoja `Parametros` viva (ver commits
recientes de Allegria Foods, Allpa Farms, Integrity). Si agregas una empresa
nueva al export, replica esa hoja para mantener consistencia.

## Checklist

- [ ] Import es `xlsx-js-style`, no `'xlsx'`.
- [ ] Montos con `numFmt` correcto (miles; moneda correcta CLP/USD).
- [ ] Estilos vía `cell.s`, coherentes con la paleta del módulo.
- [ ] Logo de empresa (si aplica) con aspecto correcto.
- [ ] Build con `CI=true` pasa (sin warnings escalados a error).
