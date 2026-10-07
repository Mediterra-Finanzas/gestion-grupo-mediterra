#!/usr/bin/env bash
# Arma la ETAPA 1 de la integración en una carpeta aparte (git worktree), sin tocar
# la rama ni main: rama completa MENOS la política de TC de saldos (dos commits).
#   Etapa 1 = fechas/zona horaria, calendario semanal y motor único, InputNumero,
#             escrituras sin cambios, Respaldo/Restaurar v3, KPI de capital,
#             cuentas sin paridad visibles, documentos y pruebas.
#   Etapa 2 = la rama completa (agrega cab4009 + 0644207: conversión de saldos con maestro_tc).
# El prototipo (prototipo/) no entra al build en ninguna etapa y NO se propone integrarlo.
#
# Uso:  bash scripts/integracion/armar-etapa1.sh <carpeta-destino>
# Después: cd <carpeta>; ln -s <repo>/node_modules; CI=true npx react-scripts build; suite jest; e2e.
set -euo pipefail
DEST=${1:?carpeta destino}
BASE=$(git rev-parse HEAD)
git worktree add -q "$DEST" "$BASE" -b "etapa1-$(date +%s)"
cd "$DEST"
git revert --no-edit 0644207
if ! git revert --no-edit cab4009; then
  # Conflicto esperado y único: DetalleSaldoBancos (agregado después por 8b9ea06) depende
  # de la conversión de cab4009, así que se retira junto con ella.
  python3 - <<'EOF'
import re
p='src/FinanzasModule.jsx'; s=open(p).read()
s=re.sub(r"<<<<<<< HEAD\n.*?=======\n(.*?)>>>>>>> [^\n]*\n", r"\1", s, flags=re.S)
open(p,'w').write(s)
EOF
  # comparacion.mjs y su juego de datos son herramientas de prueba: se conservan.
  git checkout HEAD -- scripts/e2e/datos-comparacion.mjs
  git add scripts/e2e/comparacion.mjs src/FinanzasModule.jsx
  GIT_EDITOR=true git revert --continue
fi
git log --oneline -3
