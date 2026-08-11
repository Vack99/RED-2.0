# Análisis de brechas — Términos de la Plataforma (iBookit ↔ Gimnasio)

> **Este documento NO contiene texto contractual.** Es una lista de elementos requeridos y su
> estado, para que el abogado redacte el documento único. No sustituye asesoría legal.

**Encargo al que sirve:** un solo documento **Términos de la Plataforma iBookit**, aceptado por el
gimnasio (persona moral o física con actividad empresarial) como cliente del SaaS, con las
obligaciones de encargado (DPA) **incorporadas**, no como anexo aparte. Sustituye al esquema
anterior (anexo autónomo aceptado por clic), eliminado del producto en esta sesión.

**Relación cubierta:** plataforma ↔ gimnasio, únicamente. Todo lo que hoy existe en el producto
(`/legal`, casillas de registro/activación, avisos de privacidad por gimnasio) rige la relación
**gimnasio ↔ miembro** y no es parte de este documento — verificado, no supuesto
(`docs/Context/2026-08-10-tos-surface-inventory.md`).

**Piso normativo:** LFPDPPP vigente (DOF 20-mar-2025) arts. 2-XII, 20, 35; **Reglamento 2011 arts.
50, 51 y 52**, que siguen siendo la fuente del contenido mínimo del encargo y que **admiten
expresamente condiciones generales de contratación (adhesión) para servicios en la nube** — no se
requiere anexo firmado ni click-wrap separado (`docs/Context/2026-08-10-dpa-legal-floor-mx.md`).
Norma de mercado: **11 de 11** plataformas revisadas incorporan el DPA por referencia a unos ToS
aceptados una sola vez; ninguna bloquea a un cliente ya autenticado
(`docs/Context/2026-08-10-dpa-acceptance-competitor-norms.md`).

## Leyenda

| Estado | Significado |
|---|---|
| **HAVE** | El **texto** ya existe en el producto hoy y sobrevive a esta sesión. |
| **BORRADOR** | Hay texto redactado en `docs/legal/gate0-borradores/anexo-tratamiento-datos.md` — reutilizable como insumo. Se cita la cláusula. |
| **MISSING** | No existe texto en ninguna parte. |

La columna **Producto** dice si el mecanismo real ya está implementado (Sí / Parcial / No), con
independencia de que exista o no el texto. Es el dato que evita prometer lo que el sistema no hace.

> **Advertencia de encabezado: HAVE = 0.** No existe hoy ningún texto contractual plataforma↔gimnasio
> en el producto. El único texto que nombraba a las dos partes era el borrador del anexo
> (`packages/domain/src/legal.ts`), en estado `0.1-borrador`, degradado a banner el 2026-08-10 y
> eliminado en esta sesión. Todo lo redactado queda como **BORRADOR** (insumo para el abogado),
> nunca como obligación vigente.

---

## Sección A — Contenido de encargado (Reglamento 2011 arts. 50–52)

| # | Elemento | Estado | Producto | Nota |
|---|---|---|---|---|
| A1 | Reparto de roles: gimnasio = responsable, iBookit = encargada (art. 2-XII) | BORRADOR | n/a | Cl. 1 §II incisos a)–c); reutilizable íntegro, sustituyendo "RED" por iBookit. |
| A2 | El encargo no constituye transferencia (arts. 2-XX / 35) | BORRADOR | n/a | Cl. 1 §II d) + nota al pie [^1]; sujeto a la pregunta 2 del brief (cadena de subencargo). |
| A3 | Objeto, alcance y contenido del tratamiento (art. 51) | BORRADOR | Sí | Cl. 3 + **Anexo A** (finalidad, duración, categorías de titulares y datos, ubicación) — la pieza que "acredita alcance y contenido"; contrastar Anexo A contra el esquema real antes de publicar. |
| A4 | Tratamiento solo conforme a instrucciones documentadas (art. 50) | BORRADOR | Parcial | Cl. 5 §1: define como instrucciones el propio documento, el uso de las funciones y las instrucciones escritas a un correo; el correo `{{red_email_privacidad}}` no existe todavía. |
| A5 | Prohibición de fines propios, cesión, comercialización y entrenamiento de IA | BORRADOR | n/a | Cl. 5 §2. **Ver bandera F3**: la redacción actual excluye incluso el uso agregado/anonimizado. |
| A6 | Deber de confidencialidad, extensivo a personal y subencargados, subsistente | BORRADOR | n/a | Cl. 7 (+ cl. 4 último párrafo: subsiste indefinidamente tras la terminación). |
| A7 | Medidas de seguridad administrativas, físicas y técnicas | BORRADOR | **Parcial** | Cl. 8 incisos a)–f). Cifrado, autenticación, control de acceso por rol y aislamiento: reales. **Respaldos/PITR y bitácora de auditoría: no acreditados — banderas F1 y F2.** |
| A8 | Aislamiento lógico por inquilino | BORRADOR | Sí | Cl. 6; implementado con RLS por `gym_id` en toda la base (ADR-0013), no es una promesa vacía. |
| A9 | Subencargados: autorización general, obligaciones equivalentes y **responsabilidad por sus actos** | BORRADOR | Parcial | Cl. 11.1–11.3 + **Anexo B**. Anexo B está incompleto — ver bandera F5. |
| A10 | Alojamiento fuera de territorio nacional (Supabase → AWS) | BORRADOR | Sí | Cl. 11.4; región efectiva sin confirmar (F5). Es el punto que la pregunta 2 del brief debe resolver. |
| A11 | Asistencia en derechos ARCO y no atención directa al titular | BORRADOR | Parcial | Cl. 9.1–9.4. La plataforma permite consultar, corregir y exportar; **la supresión por titular no tiene ruta de producto verificada**. Plazos ARCO 20/15 días hábiles confirmados vigentes (art. 31 nueva ley). |
| A12 | Notificación de vulneraciones de seguridad al responsable | BORRADOR | No verificado | Cl. 10; plazo `{{plazo_notificacion_vulneracion}}` sin fijar. La obligación de avisar a los titulares (art. 19) queda en el gimnasio — correcto. |
| A13 | Devolución y/o supresión de datos al término | BORRADOR | **Parcial** | Cl. 13; los plazos siguen sin fijar. El "formato estructurado y de uso común" hoy es un Excel operativo curado (ADR-0006), no una exportación completa — bandera F4. |
| A14 | Obligaciones y declaraciones del responsable (gimnasio) | BORRADOR | n/a | Cl. 14 incisos a)–e); base del escudo: consentimiento, licitud de instrucciones, exactitud de su identidad legal, gestión de credenciales. |
| A15 | Responsabilidad solidaria del art. 53 y derecho de repetición | BORRADOR | n/a | Cl. 15.1–15.3. **Cl. 15.4 remite el tope de responsabilidad a un contrato inexistente → ver B1.** |
| A16 | Derecho de información sobre medidas de seguridad (una vez al año, sin auditoría presencial) | BORRADOR | Parcial | Cl. 8 §2; sustituye la auditoría in situ. Requiere que exista documentación que entregar. |
| A17 | Prohibición de acceso de terceros salvo requerimiento de autoridad competente (art. 52) | BORRADOR (parcial) | n/a | Cubierto de forma indirecta por cl. 5 §4 + cl. 7 + cl. 11; el art. 52 lo pide expreso. |
| A18 | Mecanismo de aviso de cambios de política (art. 52) | BORRADOR | No | Cl. 17.2–17.3 (aviso previo + uso continuado). **No existe canal de aviso en producto**: ni correo a inquilinos ni banner de "términos actualizados". |
| A19 | Versionado, huella del texto y publicación del historial | BORRADOR | Sí | Cl. 17.1; la tabla `acuerdo_aceptacion` ya guarda versión + SHA-256 calculado en el servidor. Falta la URL pública canónica. |
| A20 | Aceptación electrónica y constancia probatoria | BORRADOR | Sí | Cl. 16.1–16.5 (equivalencia funcional, Cód. Com. 89 bis/90/93/97 — pendiente de verificación contra fuente primaria, ya encargado en el brief). Mecanismo listo: RPC `aceptar_acuerdo`, gated a `owner`, evidencia append-only que sobrevive al borrado de la cuenta. **Sin superficie que lo invoque** — hoy los gimnasios se dan de alta manualmente. |
| A21 | **La plataforma no reclama titularidad sobre los datos del gimnasio (art. 52)** | **MISSING** | n/a | El borrador prohíbe usos propios pero **nunca declara de quién son los datos**. El art. 52 lo enumera como condición para admitir términos de adhesión. Redactar junto con B11. |
| A22 | Idioma y ley aplicable al tratamiento | BORRADOR | n/a | Cl. 18.3 (leyes federales mexicanas, `{{jurisdiccion}}` sin fijar) — ver B19. |

## Sección B — Escudo comercial de SaaS que el anexo nunca cubrió

| # | Elemento | Estado | Producto | Nota |
|---|---|---|---|---|
| B1 | **Limitación de responsabilidad (tope cuantitativo)** | **MISSING** | n/a | Cl. 15.4 dice que aplicarán "los límites pactados en el Contrato de Prestación de Servicios, cuando exista" — ese contrato no existe, así que **hoy no hay tope alguno**. La brecha más cara de la lista. |
| B2 | Exclusión de daños indirectos, consecuenciales y lucro cesante | **MISSING** | n/a | Nada equivalente en el borrador. |
| B3 | Garantías, "tal cual", y descargo de idoneidad para un fin | **MISSING** | n/a | Nada equivalente. |
| B4 | Disponibilidad del servicio / nivel de servicio / ventanas de mantenimiento | **MISSING** | No | No existe compromiso de disponibilidad en ninguna parte, ni medición de uptime propia; la infraestructura es de terceros (Supabase/Vercel). Redactar sin SLA numérico salvo decisión contraria. |
| B5 | Soporte: canales, horario y tiempos de respuesta | **MISSING** | No | No hay mesa de ayuda ni canal contractual definido. |
| B6 | **Contraprestación: precio, facturación, IVA, mora, cambios de precio** | **MISSING** | No | No existe superficie de cobro, suscripción ni facturación en el producto (`apps/admin`: cero); los gimnasios se aprovisionan a mano. Es la otra mitad del contrato que falta por completo. |
| B7 | Vigencia, renovación y terminación (por conveniencia y por causa) | **MISSING** | No | Cl. 4 solo regula la vigencia del anexo, atada a la existencia de la cuenta; no hay término, aviso previo ni causales. |
| B8 | Suspensión del servicio (falta de pago, uso indebido, riesgo de seguridad) | **MISSING** (parcial) | No | Único antecedente: cl. 12.3, suspensión por introducir datos sensibles de forma reiterada. Falta el régimen general. |
| B9 | Uso aceptable y conductas prohibidas (reventa, ingeniería inversa, scraping, carga excesiva, uso por terceros) | **MISSING** | Parcial | Sin texto. En producto sí existen límites de hecho no contratados: cuotas compartidas de correo transaccional entre inquilinos (ADR-0014, Resend) — conviene una cláusula de uso razonable que las cubra. |
| B10 | Propiedad intelectual del software y de la marca **iBookit**; licencia de uso limitada, revocable y no exclusiva | **MISSING** | n/a | Sin texto. Incluye el uso de la marca del gimnasio por la plataforma (branding por inquilino) y viceversa (logos en material comercial). |
| B11 | Titularidad de los datos del gimnasio y licencia limitada a favor de la plataforma para operar el servicio | **MISSING** | n/a | Par obligado de A21. |
| B12 | Datos agregados / anonimizados para operación y mejora del producto | **MISSING** (hoy prohibido) | n/a | Ver bandera F3: la cl. 5 §2 del borrador lo prohíbe expresamente "ni siquiera en forma agregada". Decisión de negocio antes que de redacción. |
| B13 | Confidencialidad comercial recíproca (información del negocio, no datos personales) | **MISSING** | n/a | Cl. 7 solo cubre datos personales, y en un solo sentido. |
| B14 | Indemnización general (reclamaciones de miembros, contenido y uso ilícito por el gimnasio) | **MISSING** (parcial) | n/a | Solo existe la indemnidad acotada de cl. 12.4 (datos sensibles). |
| B15 | **Prohibición de datos sensibles y biométricos** | BORRADOR | No | Cl. 12.1–12.4 — la cláusula de escudo mejor redactada del borrador (prohibición, imputabilidad al gimnasio, supresión sin responsabilidad, suspensión y indemnidad). **Sin control técnico**: hay campos de texto libre y ninguna detección; el escudo es puramente contractual. |
| B16 | Caso fortuito y fuerza mayor (incluye fallas de proveedores de infraestructura) | **MISSING** | n/a | Relevante: la plataforma depende de Supabase/AWS/Vercel/Resend, y en 2026 hubo degradaciones prolongadas del plano de control de Supabase. |
| B17 | Cesión y cambio de control | **MISSING** | n/a | Importante dado que la persona moral aún no se constituye (Gate 1) y el servicio podría iniciar como persona física. |
| B18 | Notificaciones y domicilio electrónico de ambas partes | **MISSING** | Parcial | El borrador solo nombra un correo de privacidad. El producto ya guarda el correo del inquilino, que sería el canal. |
| B19 | Ley aplicable y jurisdicción | BORRADOR | n/a | Cl. 18.3: leyes federales mexicanas; falta fijar `{{jurisdiccion}}`. Extender a todo el documento, no solo a la materia de datos. |
| B20 | Acuerdo íntegro, divisibilidad, no renuncia, encabezados | BORRADOR (parcial) | n/a | Cl. 18.1–18.2, pero la integridad está acotada a "materia de protección de datos personales": debe reescribirse para el documento completo. |
| B21 | Idioma del contrato y jerarquía entre versiones/traducciones | **MISSING** | n/a | Trivial, pero hoy inexistente. |

## Sección C — Elementos que el producto implica y el borrador no cierra

| # | Elemento | Estado | Producto | Nota |
|---|---|---|---|---|
| C1 | El gimnasio es responsable frente a sus miembros y debe mantener su propio aviso de privacidad | BORRADOR | Sí | Cl. 9.1 + cl. 14 a)–c); el producto ya renderiza el aviso por inquilino y tiene editor de identidad legal. |
| C2 | Las plantillas de aviso se entregan como cortesía, sin asesoría legal ni garantía | BORRADOR | Sí | Cl. 9.5 — reutilizar tal cual; es escudo directo contra el riesgo de "nos dieron el texto". |
| C3 | **Aviso de privacidad propio de iBookit** para los Datos de la Cuenta | **MISSING** | **No** | Cl. 1 §II c) ya declara que la plataforma actúa como **responsable** de los datos de la cuenta, del personal usuario, de facturación y de las bitácoras, y remite a `{{red_url_aviso}}` — **ese aviso no existe ni está redactado**. Documento aparte, obligatorio por art. 15, no opcional. |
| C4 | Cuentas y accesos: quién puede ser titular de la cuenta, roles, revocación, responsabilidad por el personal usuario | **MISSING** (parcial) | Sí | Solo cl. 14 d) (gestión diligente de credenciales). El producto ya distingue `owner` / `staff`; la aceptación está gated a `owner`. Falta el régimen contractual. |
| C5 | Pagos miembro→gimnasio: la plataforma **no** cobra, no es agente de cobro y no almacena tarjetas | **MISSING** | Sí | Verificado: cero integración de pagos en el código (`stripe` solo aparece como nombre de un estilo). `registrar_venta` solo registra el método de pago. El Anexo A ya afirma que no se almacenan tarjetas. Redactar la exclusión de responsabilidad por precios, reembolsos y disputas con miembros; **no** mencionar Stripe/BYO-Stripe: no está construido. |
| C6 | Comunicaciones transaccionales enviadas con la marca del gimnasio (invitaciones, recibos, avisos) | **MISSING** | Sí | El correo sale con la identidad del gimnasio a través de un proveedor compartido; requiere licencia de marca (B10), límites de uso (B9) y atribución de responsabilidad por el contenido operativo. |
| C7 | Cuentas de demostración / periodos de prueba y su borrado | **MISSING** | Sí | Existen gimnasios demo por marca; el documento debe permitir eliminarlos y excluirlos de cualquier compromiso. |
| C8 | Conservación de la constancia de aceptación por N años | BORRADOR | Sí | Cl. 16.3; plazo sin fijar. La tabla `acuerdo_aceptacion` conserva usuario, correo snapshot, fecha, IP, versión y hash. |

---

## Banderas — promesas que el producto hoy no puede sostener

Estas no son brechas de texto: son cláusulas ya redactadas que afirman hechos operativos no
acreditados. Publicarlas tal cual convertiría una carencia técnica en un incumplimiento contractual.

- **F1 — Respaldos y recuperación a un punto en el tiempo (cl. 8 d).** La compra de PITR **no está
  confirmada**; la documentación interna registra que el nivel gratuito no tiene respaldos
  automáticos y que los parámetros observados en vivo sugieren que no se alcanza el cómputo mínimo
  que PITR exige (`docs/Context/2026-07-27-auth-structure-scale-audit.md`, `docs/gates/gates-0-to-5.md`).
  No prometer PITR hasta que esté pagado y probado con una restauración.
- **F2 — Bitácora de auditoría de accesos (cl. 8 e).** No existe ninguna tabla de auditoría en las
  migraciones (búsqueda: cero coincidencias). O se construye, o se retira la promesa.
- **F3 — Prohibición de uso agregado (cl. 5 §2).** Tal como está, cierra para siempre cualquier
  métrica comparativa, "benchmark" entre gimnasios o mejora del producto con datos agregados. Es
  una decisión de negocio del titular, no una exigencia legal: debe tomarse a conciencia.
- **F4 — Exportación "en formato estructurado y de uso común" (cl. 13).** Lo que existe es el
  respaldo mensual, un Excel operativo curado que ADR-0006 declara expresamente que **no** es un
  volcado ni un respaldo de recuperación. No satisface por sí solo el derecho de devolución.
- **F5 — Anexo B incompleto.** Faltan por nombrar el proveedor de alojamiento de las aplicaciones
  (Vercel) y el de correo transaccional (Resend, ADR-0014), y por confirmar la región efectiva de
  Supabase y su propia lista de subencargados.
- **F6 — Campos sin llenar.** Todo `{{red_*}}` depende de la constitución de la persona moral
  (Gate 1); además siguen abiertos `{{jurisdiccion}}` y todos los plazos (notificación de
  vulneración, aviso de subencargado y de nueva versión, elección de devolución, gracia de
  supresión, conservación de la constancia).

## Preguntas adicionales para el abogado (además de las cuatro del brief)

1. **¿Contrato de adhesión?** El gimnasio suele ser persona física con actividad empresarial. ¿Estos
   términos quedan fuera de la LFPC por ser B2B, o alguna hipótesis obliga a registro ante Profeco
   o limita cláusulas de exclusión de responsabilidad?
2. **Tope de responsabilidad frente al art. 53.** ¿Hasta dónde puede limitarse la responsabilidad
   contractual sin chocar con la solidaridad frente al titular que ya reconoce la cl. 15.2?
3. **Prestación inicial por persona física.** Si el servicio arranca antes de constituir la persona
   moral, ¿qué debe preverse hoy para que la cesión posterior al vehículo societario (B17) no exija
   re-aceptación de todos los gimnasios?

---

## Para el abogado — qué cambió en el encargo (5 líneas)

1. El entregable es **un solo documento**, "Términos de la Plataforma", plataforma↔gimnasio — ya no
   un anexo de datos autónomo más un futuro contrato de servicios por separado.
2. Las obligaciones de encargado **se incorporan dentro de ese documento**; el borrador del anexo
   pasa a ser insumo de redacción, no un documento que se publique.
3. La plataforma se llama **iBookit** (dominio `ibooki.lat`): sustitúyase "RED" en todo el borrador,
   que es el nombre de una marca de gimnasio cliente, no el de la plataforma.
4. La aceptación es **al alta del gimnasio y por uso continuado**, con aviso previo de cambios
   materiales — no una casilla dedicada ni una pantalla que bloquee al cliente ya autenticado
   (Reglamento 2011 arts. 51-52 lo permiten; 11 de 11 competidores lo hacen así).
5. Se elimina la superficie de aceptación separada del producto; se conserva la maquinaria de
   evidencia (usuario, fecha, IP, versión y huella SHA-256) para engancharla al alta cuando exista.

## Posición interina, dicha con honestidad (3 líneas)

1. Desde la eliminación del anexo y hasta que estos Términos entren en vigor, **no existe ningún
   acuerdo de encargado formalizado entre iBookit y sus gimnasios**.
2. El titular acepta esa brecha de forma consciente y deliberada: la mitigación es acelerar este
   documento, no reinventar una superficie de aceptación.
3. La única aceptación registrada (un gimnasio, versión `0.1-borrador`) nombra a una persona moral
   que no existe; se conserva únicamente como evidencia histórica y no se invoca como escudo.
