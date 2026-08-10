/* eslint-disable */
// connectors/types.ts — contrato compartido entre todos los conectores F2-A.

export interface ConnectorResult {
  par:              string;         // e.g. "USD-CLP"
  valor:            number | null;  // null si error
  fechaEfectiva:    string | null;  // ISO date YYYY-MM-DD; null si error
  proveedor:        string;         // "mindicador" | "frankfurter" | "bcrp"
  connectorVersion: string;         // semver del conector
  httpStatus:       number | null;  // null si timeout antes de recibir respuesta
  latencyMs:        number;
  error:            string | null;  // mensaje normalizado; null si éxito
  hashRespuesta:    string | null;  // SHA-256 hex del cuerpo raw; null si error
}

// Resultado de coverage_gap por diseño (e.g. USD-PEN en BCRP stub).
// No genera retry ni alerta — es comportamiento esperado.
export interface CoverageGapResult extends ConnectorResult {
  valor:         null;
  fechaEfectiva: null;
  httpStatus:    null;
  error:         'coverage_gap';
  hashRespuesta: null;
}
