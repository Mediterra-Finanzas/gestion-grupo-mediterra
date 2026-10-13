/* eslint-disable */
// Capital de Créditos en pantalla: número, «parcial» o «No determinable», y al lado los
// importes que faltan (sin desglose, por conciliar, sin TC) destacados y SIN sumar.
import React from 'react';
import { estadoCapital, textoCapital, NO_DETERMINABLE } from './capitalVisible.js';
import { montoCL } from './formatoCL.js';

const COLOR = { sd: '#b45309', pc: '#5b21b6', tc: '#c0392b', nd: '#b45309' };
// extras=false: solo el texto (número / «parcial» / «No determinable»), cuando la tabla ya muestra
// esos importes en columnas propias al lado.
export default function CeldaCapital({ capital = 0, sinDesglose = 0, porConciliar = 0, sinTC = [], fmt, color, grande = false, extras: conExtras = true, testid }) {
  const est = estadoCapital({ capital, sinDesglose, porConciliar, sinTC });
  const txt = textoCapital({ capital, sinDesglose, porConciliar, sinTC }, fmt);
  const extra = [];
  if (conExtras) {
  if (Math.abs(sinDesglose) > 0.005) extra.push(['sd', `sin desglose ${fmt(sinDesglose)}`]);
  if (Math.abs(porConciliar) > 0.005) extra.push(['pc', `por conciliar ${fmt(porConciliar)}`]);
  (Array.isArray(sinTC) ? sinTC : []).filter(x => x && Math.abs(x.monto) > 0.005)
    .forEach(x => extra.push(['tc', `sin TC ${montoCL(x.monto, x.moneda)}`]));
  }
  return (
    <span data-testid={testid} data-estado-capital={est} style={{ display: 'inline-block', textAlign: 'inherit' }}
      title={est === 'determinado' ? '' : 'Los importes de abajo no están incluidos en el capital ni se suman entre sí.'}>
      <span style={{ fontStyle: est === 'no_determinable' ? 'italic' : 'normal', color: est === 'no_determinable' ? COLOR.nd : color,
        fontSize: est === 'no_determinable' && grande ? '0.7em' : undefined }}>{txt}</span>
      {extra.length > 0 && <span style={{ display: 'block', fontSize: grande ? 10 : 9, fontWeight: 600, lineHeight: 1.35 }}>
        {extra.map(([k, t]) => <span key={k + t} style={{ display: 'block', color: COLOR[k], background: k === 'sd' ? '#fef3c7' : k === 'pc' ? '#ede9fe' : '#fdecea',
          borderRadius: 4, padding: '0 4px', marginTop: 2 }}>{t} · no sumado</span>)}
      </span>}
    </span>
  );
}
export { NO_DETERMINABLE };
