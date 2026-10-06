// Auditoría de contraste WCAG de los tokens de la dirección A (prototipo).
import fs from 'fs';
const css = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bloque = /:root, \[data-dir="libro"\] \{([\s\S]*?)\}/.exec(css)[1];
const T = Object.fromEntries([...bloque.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map(m => [m[1], m[2]]));
const L = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const cr = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const textos = ['text', 'text-2', 'text-3', 'neg', 'pos', 'warn', 'info', 'brand', 'accent'];
const fondos = ['surface', 'surface-2', 'sunken', 'col-now', 'col-past', 'cat-row', 'brand-soft', 'neg-soft', 'warn-soft', 'info-soft', 'accent-soft', 'row-hover'];
let fallas = 0, n = 0;
for (const f of fondos) for (const t of textos) { if (!T[f] || !T[t]) continue; n++; const r = cr(T[t], T[f]); if (r < 4.5) { fallas++; console.log(`texto ${t} sobre ${f}: ${r.toFixed(2)} < 4,5`); } }
const ui = [['border-input', 'surface'], ['border-input', 'surface-2'], ['focus', 'surface'], ['focus', 'col-now'], ['brand', 'surface']];
for (const [a, b] of ui) { n++; const r = cr(T[a], T[b]); if (r < 3) { fallas++; console.log(`UI ${a} sobre ${b}: ${r.toFixed(2)} < 3`); } }
n++; if (cr('#ffffff', T.brand) < 4.5) { fallas++; console.log('brand-ink sobre brand < 4,5'); }
console.log(`${n} pares revisados, ${fallas} bajo el mínimo WCAG AA`);
