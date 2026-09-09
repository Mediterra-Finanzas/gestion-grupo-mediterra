import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

// ── ENTORNO AISLADO ──────────────────────────────────────────────────────────
// En este worktree `App` NO se monta nunca. La aplicacion real trae la URL de
// produccion incrustada en sus constantes, asi que levantar el servidor de
// desarrollo aca la hacia cargar y AUTO-GUARDAR contra produccion. Paso el
// 2026-09-09: se escribieron las filas `main` y `pins` productivas.
//
// El interruptor no es un parametro de la URL: un parametro se pierde en la
// primera navegacion y la aplicacion arranca igual. Es una variable de entorno
// del build, y sin ella esta pantalla no monta nada.
const SOLO_UX = process.env.REACT_APP_UX_SOLO === '1';
const root = ReactDOM.createRoot(document.getElementById('root'));

if (SOLO_UX) {
  import('./ux/HarnessStaging').then(({ default: HarnessStaging }) => {
    root.render(<HarnessStaging />);
  });
} else {
  root.render(
    <div style={{ maxWidth: 640, margin: '48px auto', padding: 20, fontFamily: 'system-ui, sans-serif',
                  border: '1px solid #d33', borderLeft: '4px solid #d33', borderRadius: 6 }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 16, color: '#8c2318' }}>Worktree de respaldo · la aplicacion no se monta aca</h1>
      <p style={{ fontSize: 13, color: '#5b6b7f', lineHeight: 1.6, margin: 0 }}>
        Este arbol es solo para el carril de respaldo y el harness de diseno.
        Defini <code>REACT_APP_UX_SOLO=1</code> en <code>.env.local</code> para ver el harness,
        que lee unicamente staging. La aplicacion real se levanta desde el arbol principal.
      </p>
    </div>
  );
}
