# Decisiones que necesitamos de Nicolás · informes técnicos

2026-09-24. El Excel de estados fenológicos y manejos está incorporado en una rama local, sin
publicar. Nada de lo que sigue está resuelto por nuestra cuenta: **no fusionamos ni omitimos ningún
elemento**. Los dos listados conviven en el código y se conservan tal cual hasta que decidas.

---

## 1 · Las dos hojas no dicen lo mismo

### 1.1 Los estados

| Hoja "Manejos por estado" (9) | Hoja "Hoja1" (8) |
|---|---|
| Establecimiento | 1. Establecimiento |
| Crecimiento vegetativo | 2- Crecimiento Vegetativo |
| Inducción de yemas | 3- Inducción de yemas |
| **Floración** | 4- Floración y cuajado |
| **Cuaja** | *(fusionada en la anterior)* |
| **Llenado de fruto** | 5- Crecimiento y Llenado del Fruto |
| Cosecha | 6- Cosecha |
| Post-cosecha | 7- Post-Cosecha y Acumulación de Reservas |
| Poda | 8- Poda |

**Decisión 1**: ¿el catálogo son 9 estados o 8? En concreto, ¿"Floración" y "Cuaja" son un solo
estado o dos? Hoy está cargado el listado de 8 (Hoja1) porque es el único que trae las opciones de
cada labor, y los 9 de la otra hoja quedaron registrados sin fusionarse.

### 1.2 Labores que existen en una hoja y no en la otra

**Solo en "Manejos por estado" (19)** — hoy no tienen opciones definidas:
Segregación de plantas por vigor · Amarre / tutoreo · Limpieza de maceta · Pinchado / despunte ·
Limpieza de cañas basales · Ajuste de carga · Deshoje · Control de Botrytis · Limpieza de cañas ·
Raleo de fruto · Malla / sombreo · Personal de cosecha · Limpieza de plantas · Descarte en campo ·
Poda post-cosecha · Manejo evergreen · Riego post-cosecha · Compensadores de frío ·
Preparación de riego

**Solo en "Hoja1" (16)** — estas sí traen opciones:
Uniformidad establecimiento · Revisión emisión de raíces · Revisión emisión de brotes ·
Revisión % de humedad del sustrato · Fertilización · CE · Pinchado · Poda limpieza de brotes débiles ·
Biometría · Revisión estado de raíces · Ajustes mediante aplicaciones foliares ·
Revisión firmeza, calibres y ajustes nutricionales · Revisión estado de las plantas ·
Ajuste fase nutricional · Número de tocones · Uso de tirasavia

**En las dos (10)**: Riego de establecimiento · Control de malezas · Monitoreo de plagas · Desflore ·
Polinización / colmenas · Frecuencia de pasadas · Cadena de frío en campo · Poda ·
Segregación de plantas · Limpieza de cuartel

**Decisión 2**: ¿las 19 labores que solo están en la primera hoja entran al catálogo? Si entran,
faltan sus opciones. Ninguna se descartó.

**Decisión 3**: hay pares que parecen la misma labor con dos nombres, y **no los unimos**:
"Pinchado" / "Pinchado / despunte", "Segregación de plantas" / "Segregación de plantas por vigor",
"Limpieza de cañas" / "Limpieza de cañas basales", "Poda" / "Poda post-cosecha". ¿Son lo mismo?

---

## 2 · Configuraciones dudosas dentro de "Hoja1"

**Decisión 4**: en "Floración y cuajado" y en "Crecimiento y Llenado del Fruto", la labor
**"Polinización / colmenas"** aparece con "Cuadro de cada Macronutriente para escribir manualmente
el valor". Parece copiado de Fertilización. ¿Qué debería pedir esa labor?

**Decisión 5**: **Fertilización** enumera N, P, K, Ca y Mg solo en Establecimiento. En los demás
estados dice "Cuadro de cada Macronutriente" sin listarlos. ¿Es el mismo juego en todos?

**Decisión 6**: **"Uniformidad establecimiento"** tiene como única opción
"Comentarios (Segregación de plantas por vigor)". ¿Es un campo de comentario libre, o debía tener
opciones?

**Decisión 7**: **Biometría** aparece solo con "Comentarios". ¿Qué se mide y con qué campos?

**Decisión 8**: los estados 5, 6 y 7 tienen menos labores que sus pares (el 5 no lleva Biometría ni
Ajustes foliares, que sí están en el 3 y el 4). ¿Es intencional?

**Decisión 9**: las labores de tipo Observación + Recomendación (Cadena de frío en campo, Revisión
firmeza, Revisión estado de las plantas) no traen "Comentarios" como el resto. ¿Se les agrega?

**Decisión 10**: "Fecha realizacion" acompaña a las labores Realizado/Pendiente/No aplica. ¿Es
obligatoria cuando se marca "Realizado"? Hoy quedó opcional.

**Decisión 11**: la columna **"Reemplazar por"** de la hoja "Manejos por estado" está vacía en las
55 filas. ¿Quedó pendiente de llenar?

---

## 3 · Unidades que faltan

**Decisión 12**: **CE** no trae unidad. ¿dS/m?

**Decisión 13**: **Frecuencia de pasadas** no dice sobre qué. ¿Pasadas por semana?

**Decisión 14**: **Número de tocones** no dice la base. ¿Por planta, por metro lineal, por cuartel?

Mientras no se definan, el sistema los guarda como número **sin unidad** y los muestra así. No
inventamos ninguna.

---

## 4 · Encabezado del informe

**Decisión 15 · Densidad de plantación**: ¿en qué unidad se declara? Proponemos plantas/ha, pero hoy
la unidad se escribe a mano y, si falta, el campo dice "sin definir". No se usa para ningún cálculo.

**Decisión 16 · Alcance evaluado**: ¿corresponde **al informe completo** o **a cada variedad**?
Ahora que un informe puede llevar varias variedades, con un solo alcance no se sabe cuánto le toca a
cada una. Hoy hay un alcance por informe.

**Decisión 17 · Estado fenológico predominante**: misma pregunta. ¿Un estado para todo el informe, o
uno por variedad? El nombre nuevo sugiere uno solo.

**Decisión 18 · Superficie histórica**: los informes anteriores tienen un campo
"Superficie evaluada (há)". **No lo estamos convirtiendo en el alcance nuevo**: se muestra aparte,
con la unidad que declaraba su rótulo, y el alcance queda "sin definir" hasta que alguien lo
declare. ¿Se migra, o se deja como dato histórico?

**Sistema productivo y sustrato** quedan como **texto libre** para esta revisión, como acordamos. No
armamos catálogos.

---

## 5 · Lo que ya está resuelto y no necesita decisión

- La frase de responsabilidad va en el correo, exacta, una sola vez.
- El alcance se muestra siempre con su unidad y **nunca** se convierte de hectáreas a plantas ni al
  revés, ni siquiera con la densidad cargada.
- Los valores históricos (estados fenológicos y labores antiguos, la variedad única, la superficie)
  se conservan tal como se guardaron. La pantalla avisa cuando un valor guardado no está en el
  catálogo nuevo.
- Selección múltiple de variedades, conservando el campo de variedad única para los informes ya
  emitidos.
