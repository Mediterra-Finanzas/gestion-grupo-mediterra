import { useEffect, useState } from "react";
import { CORTE_MEDIA, CORTE_EXPANDIDA } from "./tokens";

// "compacta" (< 600 px: teléfono) · "media" (600–1023: tablet) · "expandida" (≥ 1024: laptop y computador)
export function claseDeAncho(ancho) {
  if (ancho < CORTE_MEDIA) return "compacta";
  if (ancho < CORTE_EXPANDIDA) return "media";
  return "expandida";
}

export function useClaseVentana() {
  const leer = () => claseDeAncho(typeof window === "undefined" ? CORTE_EXPANDIDA : window.innerWidth);
  const [clase, setClase] = useState(leer);
  useEffect(() => {
    const f = () => setClase(leer());
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return clase;
}
