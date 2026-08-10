/* eslint-disable */
// src/anf/anfClasificacion.js
// Re-exporta los clasificadores del Accounting Core.
//
// Este archivo mantiene compatibilidad con los imports existentes
// (AnfTab.jsx, anfKpis.js, anfParser.test.js, anfClasificacion.test.js)
// mientras la lógica vive en src/accounting/classification/classifier.js.
//
// Los nuevos módulos deben importar directamente desde:
//   import { clasificarSeccionEsf, ... } from '../../accounting';

export {
  obtenerSegmentosCodigo,
  clasificarSeccionEsf,
  clasificarGrupoEr,
} from '../accounting';
