# Plan de ejecución — Términos de la Plataforma iBookit (de hoy a "blindado")

> **Este documento no contiene texto contractual ni sustituye asesoría legal.** Es el plan de
> ejecución: cómo se arma el documento, cómo se acepta en ESTE producto, y en qué orden.
> Continúa `docs/Context/2026-08-10-tos-gap-analysis.md` (51 elementos, HAVE = 0).

**Entregable:** UN documento, `Términos de la Plataforma iBookit`, plataforma↔gimnasio, con las
obligaciones de encargado (DPA) incorporadas — la forma que usan 11 de 11 competidores revisados.

**Población real hoy (medida en vivo, 2026-08-10, no supuesta):** cuatro gimnasios —`forge`,
`red` (inquilinos reales, dueños externos distintos) y `forge-demo`, `red-demo` (gemelos de
prueba)— **un `owner` cada uno**. La única constancia de aceptación existente es la de `forge`
sobre el anexo `0.1-borrador` eliminado, que no se invoca como escudo. **El universo a notificar
son dos personas.** Ese número gobierna todo el apartado 2: nada de canales masivos, colas ni
plantillas transaccionales para N=2.

---

## 1. Mapa de ensamble del texto

Estructura propuesta del documento único y de dónde sale cada parte. `BORRADOR cl. N` =
`docs/legal/gate0-borradores/anexo-tratamiento-datos.md`, reutilizable como insumo (sustituyendo
"RED"→iBookit y depurando las notas de redacción).

| § | Título | Fuente | Elementos |
|---|---|---|---|
| 1 | Partes y carácter con que intervienen | BORRADOR cl. 1 §I–II (con la sustitución a persona física, ver §3 de este plan) | A1 |
| 2 | Definiciones | BORRADOR cl. 2, ampliado (Servicio, Cuenta, Personas Usuarias, Datos de la Cuenta) | — |
| 3 | Objeto y descripción del Servicio | BORRADOR cl. 3 + Anexo A; **NUEVO**: descripción comercial del servicio | A3 |
| 4 | Cuentas, personas usuarias y accesos | **NUEVO** + BORRADOR cl. 14 d) | C4 |
| 5 | Uso aceptable y conductas prohibidas | **NUEVO** (incluye la cuota compartida de correo, ADR-0014) | B9, C6 |
| 6 | Disponibilidad, mantenimiento y soporte | **NUEVO**, sin SLA numérico | B4, B5 |
| 7 | Contraprestación | **NUEVO** — decisión del titular antes que redacción | B6 |
| 8 | Vigencia, suspensión y terminación | **NUEVO** + BORRADOR cl. 12.3 (antecedente) | B7, B8, C7 |
| 9 | Protección de datos personales (encargo) | BORRADOR cl. 5–11, 13, 14 íntegro — el bloque más grande y el que ya está escrito | A2, A4–A20 |
| 10 | Titularidad de datos, propiedad intelectual y licencias | **NUEVO** | A21, B10, B11, B12 |
| 11 | Confidencialidad comercial recíproca | **NUEVO** (la cl. 7 cubre solo datos personales y en un sentido) | B13 |
| 12 | Responsabilidad, garantías e indemnización | BORRADOR cl. 15.1–15.3 + **NUEVO** | B1, B2, B3, B14, B16, C5 |
| 13 | Datos sensibles y biométricos | BORRADOR cl. 12 íntegro — la mejor cláusula del borrador | B15 |
| 14 | Cambios al documento, versiones y aviso | BORRADOR cl. 17 | A18, A19 |
| 15 | **Cesión y cambio de control** | **NUEVO** — cláusula crítica de v1.0, ver §3 | B17 |
| 16 | Aceptación electrónica y constancia | BORRADOR cl. 16, reescribiendo 16.1 (alta y uso continuado, no "primer acceso") | A20, C8 |
| 17 | Notificaciones y domicilio electrónico | **NUEVO** | B18 |
| 18 | Disposiciones finales | BORRADOR cl. 18, ampliado a todo el documento | A22, B19, B20, B21 |
| Anexo A | Descripción del tratamiento | BORRADOR Anexo A — contrastar contra el esquema real | A3 |
| Anexo B | Subencargados | BORRADOR Anexo B — completar (F5) | A9, A10 |
| — | **Aviso de privacidad de iBookit** | **DOCUMENTO APARTE**, obligatorio por art. 15 | C3 |

**Los 24 MISSING, clasificados:**

- **Boilerplate adaptable (18)** — se redactan ya, con formularios estándar de SaaS B2B, y el
  abogado los revisa después: A21, B2, B3, B4, B5, B7, B8, B9, B10, B11, B13, B16, B18, B21,
  C4, C5, C6, C7. Ninguno depende de una opinión: son forma, no criterio. (B20 no entra aquí: es
  BORRADOR parcial — la cl. 18.1 existe, solo hay que ampliarla a todo el documento.)
- **Criterio jurídico real (3)** — se redactan en versión conservadora y se marcan para el abogado,
  **sin bloquear la publicación**:
  - **B1 — tope de responsabilidad.** Choca con la solidaridad del art. 53 que la propia cl. 15.2
    reconoce (pregunta 2 del brief). Redactar tope generoso (p. ej. lo pagado en 12 meses) con
    excepciones expresas por dolo, mala fe y confidencialidad; que el abogado lo apriete o lo afloje.
  - **B14 — indemnización general.** Su amplitud depende de si estos términos son contrato de
    adhesión bajo la LFPC (pregunta adicional 1). Redactar acotada a reclamaciones de miembros y
    a contenido/uso ilícito del gimnasio.
  - **B17 — cesión.** Ver §3: es la cláusula que decide si el re-papeleo a la persona moral exige
    volver a aceptar. Criterio jurídico **y** condición de arquitectura del plan.
- **Decisión del titular, no del abogado (2)** — nadie puede redactarlas antes de que él elija:
  - **B6 — contraprestación.** No existe superficie de cobro. Recomendación: cláusula mínima
    ("el precio y la periodicidad se pactan por escrito fuera de la Plataforma"), no un régimen de
    facturación completo para un producto que no factura. Se amplía cuando exista el épico de cobro.
  - **B12 — datos agregados.** Ver F3.
- **C3** no es un MISSING del documento: es **otro documento** (el aviso de privacidad propio de
  iBookit para los Datos de la Cuenta). Se redacta con la misma plantilla del art. 15 que ya existe
  en `@gym/domain/legal`, con iBookit como responsable. Ticket propio (T11).

### Las 6 banderas — recomendación por bandera

Las seis se resuelven **corrigiendo el texto (a)**, no construyendo capacidad (b). Ninguna promesa
del borrador vale el costo de construir el hecho que la sostendría, hoy.

| # | Recomendación | Qué se hace exactamente |
|---|---|---|
| **F1** PITR | **(a) texto** | Borrar "capacidad de restauración a un punto en el tiempo" de la cl. 8 d). El titular confirma primero qué da el plan de Supabase contratado; el texto describe **solo eso**. Si el plan no da respaldos automáticos, la cl. 8 d) se elimina entera, no se suaviza. (b) es una compra de infraestructura, no una tarea de redacción. |
| **F2** bitácora de auditoría | **(a) texto** | Retirar la cl. 8 e). Ningún gimnasio la ha pedido y el derecho de información anual (cl. 8 §2, A16) cubre la necesidad real. Construir una tabla de auditoría por una frase de un contrato es la cola moviendo al perro. |
| **F3** uso agregado | **(a) texto + decisión del titular** | Reescribir la cl. 5 §2 conservando la prohibición de fines propios, cesión, comercialización y entrenamiento de IA, pero **reservando expresamente el uso de datos estadísticos agregados y anonimizados** para operar y mejorar el servicio. Motivo: prohibirlo hoy es irreversible sin volver a aceptar el documento; reservarlo y no usarlo no cuesta nada. |
| **F4** exportación | **(a) texto** | La cl. 13 deja de prometer "formato estructurado y de uso común" y nombra lo que existe: el respaldo mensual (ADR-0006) y las funciones de exportación de la Plataforma. (b) —un volcado real— es el mismo trabajo que la portabilidad ARCO y merece su propio ticket, después. |
| **F5** Anexo B | **(a) llenar** | Agregar **Vercel** (alojamiento de las apps) y **Resend** (correo transaccional, ADR-0014); confirmar la región efectiva del proyecto de Supabase en el panel y revisar su propia lista de subencargados. Es un dato, no una decisión. |
| **F6** campos vacíos | **(a) llenar** | Datos de persona física (§3) + plazos. Defaults recomendados para que el abogado edite en vez de inventar: vulneración **72 h**; asistencia ARCO **5 días hábiles** (para que el gimnasio alcance sus 20); aviso de subencargado **30 días naturales**, objeción **15**; aviso de nueva versión **30 días naturales**; elección de devolución **30**; gracia de supresión **30**; conservación de la constancia **5 años**. `{{jurisdiccion}}` = ciudad del titular (input suyo). |

---

## 2. Cableado de la aceptación para ESTE producto

Hechos del producto que mandan sobre el diseño: no existe superficie de alta de gimnasios
(`apps/admin` no tiene onboarding ni signup); la app admin es una columna ancho-teléfono con
`TabBar` y **sin footer**; `decideRedirect` (`apps/admin/src/lib/auth.ts`) manda a `/login`
**toda** ruta no autenticada salvo `/icon`; y la maquinaria de evidencia (`aceptar_acuerdo`,
`acuerdo_aceptacion`, `packages/data/src/server/legal.ts`) está viva pero **sin ningún llamador**.

1. **Página pública `/terminos` — en `apps/admin`, no en el app cliente.** El app cliente es
   superficie miembro↔gimnasio, con marca del gimnasio: publicar ahí los términos de la plataforma
   mezcla justo las dos relaciones que el análisis de brechas separa. No existe sitio de marketing
   de la plataforma en el repo. Requiere una línea en `decideRedirect` (`if (pathname ===
   "/terminos") return null;`) más su caso en `auth.test.ts`. La página renderiza la versión
   vigente **y el historial** (versión, fecha, huella SHA-256) — eso es lo que cumple la cl. 17.1
   (A19), hoy sin URL canónica.
2. **Constantes en `@gym/domain/legal`**: `TERMINOS_PLATAFORMA_TEXTO` / `_VERSION` (`"1.0"`) /
   `_FECHA`. Misma forma que las constantes del anexo eliminado; la diferencia es que **nada las
   presenta como muro**. La versión vive en un solo lugar: la página la muestra y el sello la hashea.
3. **Host canónico**: apuntar un hostname de plataforma (p. ej. `ibooki.lat`) al proyecto Vercel de
   admin. Un host no mapeado no resuelve inquilino y cae en chrome de marca por defecto — cero
   código. Ojo: ese default hoy es el fixture morado retenido a propósito (#35); o se acepta, o se
   mapea el host a una marca neutra. Acción del titular, no de ingeniería.
4. **Enlace en la app admin**: no hay footer y no se inventa uno. El enlace va como una fila en
   **CUENTA** (`/cuenta`), junto a la identidad legal que ya se edita ahí: "Términos de la
   Plataforma v1.0 — vigentes desde …".
5. **Aviso a los gimnasios existentes = dos correos escritos a mano** desde el buzón del titular,
   nombrando la URL, la fecha de entrada en vigor y la cláusula de uso continuado. No se construye
   canal de aviso: no hay cola ni ruta de correo masivo en el producto y no debe haberla para N=2.
   **Pedir respuesta de conformidad ("de acuerdo") y archivar los correos enviados y recibidos** —
   ver el riesgo del apartado 4: a esta escala convertir silencio en aceptación expresa cuesta un
   renglón del correo.
6. **Banner "términos actualizados": diferido, no cancelado.** Está permitido por el titular, pero
   con dos inquilinos es redundante con dos correos. Es el mecanismo correcto para el **cambio de
   versión a escala**, y ahí se saca del cajón (T10). Cuando exista: informativo, descartable,
   dentro de `apps/admin/src/app/(app)/layout.tsx`, con el descarte en `localStorage` — no es
   evidencia, es cortesía.
7. **Sello de aceptación.** Hoy no puede sellarse por los gimnasios existentes aunque quisiéramos:
   `aceptar_acuerdo` exige `has_role(gym,'owner')` sobre la sesión autenticada del propio dueño —
   no hay ruta de back-office que no sea suplantación. Dos caminos, ambos válidos:
   - **Ahora (opcional, T9):** un botón **no bloqueante** "Confirmar lectura" en CUENTA que llama
     `aceptarAcuerdo` con `documento: "terminos-plataforma"`. Es un botón en una pantalla de
     ajustes, no un muro; genera la fila de evidencia real cuando el dueño entra por su cuenta.
   - **Futuro (T12):** la casilla en la superficie de alta, cuando esa superficie exista, conectada
     a la misma DAL. `contenido` sale de la constante del servidor; `ip`/`userAgent`, de las
     cabeceras reales — nunca del navegador.

### Qué distingue el muro odiado del patrón normal (para no volver a litigarlo)

| Eje | Muro del anexo (rechazado, 2026-08-10) | Patrón competidor-normal (este plan) |
|---|---|---|
| Acceso | Ruta bloqueada / pantalla previa al producto | **Nunca bloquea**: la app entera funciona sin abrir el documento |
| Ubicación | Interstitial a pantalla completa tras el login | Una fila en CUENTA + una URL pública que el cliente puede no abrir jamás |
| Estado del texto | `0.1-borrador` con "PENDIENTE DE REVISIÓN POR ABOGADO" y notas de redacción a la vista del cliente | v1.0 limpio: sin notas, sin banderas de borrador, sin advertencias internas |
| Nombre de la parte | "RED" — la marca de un gimnasio cliente, presentada como la plataforma | **iBookit** |
| Forma del consentimiento | Clic forzado como condición de acceso | Casilla al alta (gimnasios nuevos) + aviso y uso continuado (existentes) |
| Extensión en pantalla | Biblia con scroll dentro de un modal | Página web normal, con historial de versiones |
| A quién interrumpe | Al operador que ya pagó y ya entró, a media jornada | A nadie |

La línea es simple: **publicar y enlazar no es interrumpir.** Lo que se eliminó fue la
interrupción, no la formalización.

---

## 3. Entidad y nombre

**Publicar hoy como persona física con actividad empresarial: sí, el piso legal lo sostiene.**
El art. 2-XII de la LFPDPPP vigente define a la persona encargada como "persona física o jurídica";
el art. 49 del Reglamento 2011 dice lo mismo; el art. 51 deja la elección del instrumento al
responsable y el 52 admite expresamente condiciones generales de contratación para servicios en la
nube. **Nada exige que la contraparte sea persona moral.** La nota de redacción 1 del propio
borrador ya prevé la sustitución: donde dice razón social y representante legal, van nombre, RFC y
domicilio fiscal del titular.

**La cláusula de cesión (§15, B17) es la pieza que decide si el re-papeleo cuesta caro.** Debe ir
en v1.0 con esta postura: el titular puede ceder el contrato, total o parcialmente, a una sociedad
de la que sea socio mayoritario o a la entidad resultante de una reorganización o cambio de control,
**sin consentimiento previo** del gimnasio, bastando aviso al correo registrado, y **sin que la
cesión altere los términos ni requiera nueva aceptación**. Es de las tres cláusulas de criterio
jurídico (pregunta adicional 3 del análisis), pero la decisión de arquitectura no admite duda:

> **Si v1.0 sale sin cláusula de cesión, constituir la persona moral obliga a volver a recabar la
> aceptación de todos los gimnasios.** Es la única cláusula del documento que no se puede recortar.

**Versionado.** El documento se identifica por versión + fecha + huella SHA-256, publicadas junto
con el historial en `/terminos` (cl. 17.1). `0.1-borrador` queda quemada para siempre por el anexo
eliminado; la primera publicada es **`1.0`**. El re-papeleo a la persona moral es un **`1.1`** que
solo cambia el bloque de partes: se publica, se notifica con el plazo de la cl. 17.2 y se acepta por
uso continuado bajo la cláusula de cambios — **no se vuelve a aceptar**, precisamente porque la
cesión ya estaba pactada en 1.0. Los comentarios del abogado entran por la misma puerta: `1.1`, no
un rehacer.

---

## 4. Tickets, en orden

| # | Ticket | Superficie | Tamaño | Depende de |
|---|---|---|---|---|
| **T1** | **Decisiones del titular**: datos de persona física, `{{jurisdiccion}}`, los ocho plazos (defaults en F6), postura B6 (contraprestación) y B12/F3 (agregados) | doc | S | — |
| **T2** | **Verificación de hechos** (F1, F2, F4, F5): plan y respaldos reales de Supabase, región efectiva, lista de subencargados propia de Supabase, alcance real del respaldo mensual | `docs/legal/` | S | — |
| **T3** | **Ensamble de v1.0**: el documento único según el mapa del §1, con los 18 boilerplate redactados y los 3 de criterio en versión conservadora | `docs/legal/terminos-plataforma/v1.0.md` | L | T1, T2 |
| **T4** | **Revisión por abogado — EN PARALELO, NO ES COMPUERTA**: enviar v1.0 + las 4 preguntas del brief + las 3 adicionales + B1/B14/B17 | externo | — | T3 |
| **T5** | Constantes `TERMINOS_PLATAFORMA_*` + página pública `/terminos` (con historial) + una línea en `decideRedirect` + su prueba | `packages/domain`, `apps/admin` | M | T3 |
| **T6** | Fila de enlace en CUENTA con versión y fecha | `apps/admin/(app)/cuenta` | S | T5 |
| **T7** | Host canónico de plataforma → proyecto Vercel de admin; decidir el chrome del host no mapeado | Vercel/DNS | S | T5 |
| **T8** | **Aviso a los dos dueños** por correo manual, pidiendo respuesta de conformidad; archivar enviados y recibidos | buzón del titular | S | T5, T7 |
| **T9** | *(opcional)* Botón no bloqueante "Confirmar lectura" en CUENTA → `aceptarAcuerdo` | `apps/admin` + DAL existente | S | T5 |
| **T10** | *(diferido)* Banner de "términos actualizados", descartable, para el cambio de versión a escala | `apps/admin/(app)/layout.tsx` | S | T5 |
| **T11** | **Aviso de privacidad de iBookit** (C3, art. 15) + publicación en la misma ruta pública | doc + `apps/admin` | M | T1 |
| **T12** | *(diferido)* Casilla de aceptación en la superficie de alta de gimnasios | no existe aún | S | épico de alta/cobro |

**Esta semana:** T1, T2 (paralelos, un rato del titular), T3, y arrancar T4. **La semana siguiente:**
T5–T8 → estado "blindado" operativo: documento publicado, enlazado, notificado y con evidencia
archivada. T9/T10/T11 detrás; T12 cuando exista superficie de alta.

### Sobre el abogado: paralelo, no compuerta — y por qué es honesto decirlo

Nada de lo leído convierte la revisión legal en requisito previo. El Reglamento 2011 arts. 51–52
exige **contenido e instrumento**, no consejo profesional; ningún criterio de INAI/SABG ni sanción
publicada localizada exige más. El único punto donde la falta de revisión sí puede morder es el
tope de responsabilidad (B1) frente a la solidaridad del art. 53, y la hipótesis de contrato de
adhesión bajo la LFPC — y ambos argumentan por revisar **el texto final**, no por seguir un día más
con **cero términos**, que es el estado de hoy.

Regla de higiene, no negociable: lo que se publique en v1.0 va **limpio**. Sin banner de "PENDIENTE
DE REVISIÓN", sin notas de redacción, sin `{{tokens}}` sin resolver. Que el abogado aún no lo haya
visto es información interna, no un aviso al cliente. Ese fue exactamente el defecto del muro del
anexo, y no se repite.

### El supuesto más riesgoso de todo el plan

**Que el uso continuado forme un contrato donde nunca hubo uno.** La norma de los 11 competidores
funciona porque su cláusula de uso continuado **modifica** un acuerdo que el cliente ya aceptó al
darse de alta. Con `forge` y `red` no existe ningún acuerdo previo: estaríamos formando el **primer**
contrato por aviso y silencio, que es un terreno bastante más débil que el que el estudio de mercado
respalda. Mitigación, y por eso está dentro de T8: con **dos** contrapartes, una respuesta de correo
que diga "de acuerdo" convierte el silencio en aceptación expresa por el costo de un renglón. Si
solo se puede rescatar una cosa de este plan, que sea esa respuesta.
