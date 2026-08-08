/**
 * The Anexo de Tratamiento de Datos — issue #254 (Gate 0.1 click-wrap gate) and the shared
 * document/version constants #255/#256/#257 build on top of. Lives in @gym/domain (the pure,
 * import-nothing-internal leaf — ADR-0011 §4/§6) because both apps consume it: the admin app
 * renders it for the owner acceptance gate (#254) and will need it again for the CUENTA legal
 * editor preview (#255); the client app's per-tenant aviso (#256) is a SEPARATE document, not
 * this one.
 *
 * The text below is a byte-for-byte copy of docs/legal/gate0-borradores/anexo-tratamiento-datos.md
 * as authored 2026-08-08 (commit 7aedec7) — status "BORRADOR, pendiente de revisión por abogado
 * mexicano" per its own banner, INCLUDING the drafting notes and unresolved `{{merge_field}}`
 * placeholders (razón social, domicilio, etc. are filled by #255's gym_legal editor in a later
 * slice — no interpolation happens here). Rendering the raw borrador, unedited, is deliberate: the
 * evidentiary hash `aceptar_acuerdo` stores must match EXACTLY what the accepting owner was shown,
 * so this file is never hand-edited independently of its source .md — bump the version and copy
 * the new text together whenever the document changes (a version bump keeps a prior acceptance
 * from silently satisfying a changed document — AC3).
 *
 * The version is deliberately NOT "1.0": that number is reserved for the abogado-reviewed version
 * (the owner's #258 rollout call). Demo-twin gyms may accept this borrador text under a pre-1.0
 * version tag; the day the reviewed text ships as "1.0", the unique (gym, documento, version)
 * constraint makes every existing acceptance stale and the gate re-opens automatically — no
 * migration, no manual reset.
 */
export const ANEXO_TRATAMIENTO_DATOS_DOCUMENTO = "anexo_tratamiento_datos";

export const ANEXO_TRATAMIENTO_DATOS_VERSION = "0.1-borrador";

export const ANEXO_TRATAMIENTO_DATOS_TEXTO = `
# ACUERDO DE TRATAMIENTO DE DATOS PERSONALES
## (Anexo de Encargado al Contrato de Prestación de Servicios de la Plataforma RED)

> **BORRADOR — PENDIENTE DE REVISIÓN POR ABOGADO MEXICANO. ESTE DOCUMENTO NO CONSTITUYE ASESORÍA LEGAL.**

**Notas de redacción (eliminar antes de publicar):**

1. **Identidad legal de RED pendiente.** A la fecha de este borrador el titular del proyecto no ha constituido la persona moral que prestará el servicio. Todos los campos \`{{red_*}}\` deben llenarse una vez constituida la entidad (dependencia de Gate 1). Si el servicio se prestara inicialmente por persona física con actividad empresarial, sustitúyanse "razón social" y "representante legal" por nombre y firma del propio titular.
2. **Autosuficiencia.** Este Anexo está redactado para ser aceptable de forma autónoma (por clic, hoy) **y** para incorporarse por referencia al futuro Contrato de Prestación de Servicios (Gate 2). Al existir dicho Contrato, la Cláusula Tercera (Objeto) y la Décima Octava (Ley aplicable) se subordinan a él sin necesidad de re-aceptación.
3. **Vigilancia normativa.** El Reglamento de la LFPDPPP reformada no ha sido publicado. Ver Cláusula Décima Séptima (versiones) y la nota al pie [^2].

| Campo | Valor |
|---|---|
| Versión del documento | \`{{version_documento}}\` |
| Fecha de la versión | \`{{fecha_version}}\` |
| Huella (SHA-256) del texto | \`{{hash_documento}}\` |
| URL canónica | \`{{url_anexo}}\` |

---

## CLÁUSULA PRIMERA — PARTES Y CARÁCTER CON QUE INTERVIENEN

Celebran el presente Acuerdo de Tratamiento de Datos Personales (el "**Anexo**"):

**I. EL RESPONSABLE.** \`{{razon_social}}\`, que opera comercialmente como \`{{nombre_comercial}}\`, con Registro Federal de Contribuyentes \`{{rfc}}\` y domicilio en \`{{domicilio}}\`, representada en este acto por \`{{representante_legal}}\` (el "**Responsable**" o el "**Gimnasio**").

**II. LA ENCARGADA.** \`{{red_razon_social}}\`, con Registro Federal de Contribuyentes \`{{red_rfc}}\` y domicilio en \`{{red_domicilio}}\`, representada por \`{{red_representante_legal}}\`, titular y operadora de la plataforma de gestión de gimnasios "RED" (la "**Plataforma**"; en lo sucesivo, la "**Encargada**" o "**RED**").

Conjuntamente, las "**Partes**".

**Reparto de roles.** Las Partes reconocen expresamente que:

- **a)** Respecto de los datos personales de las personas clientes, prospectos, personal y demás titulares que el Gimnasio recabe, cargue o genere a través de la Plataforma (los "**Datos del Gimnasio**"), **el Gimnasio es el responsable** y **RED es persona encargada del tratamiento** en términos del artículo 2, fracción XII de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (la "**LFPDPPP**"), es decir, persona jurídica que trata datos personales **por cuenta del Responsable**.
- **b)** RED **no** determina las finalidades ni los medios esenciales del tratamiento de los Datos del Gimnasio, y no los tratará para finalidades propias.
- **c)** Respecto de los datos que RED recaba **para sí misma** —datos de la cuenta administrativa del Gimnasio, datos de contacto de su personal usuario, datos de facturación, registros de uso, bitácoras técnicas y el registro de aceptación de este Anexo (los "**Datos de la Cuenta**")— **RED actúa como responsable**, con su propio aviso de privacidad publicado en \`{{red_url_aviso}}\`.
- **d)** La comunicación de los Datos del Gimnasio del Responsable a la Encargada no constituye **transferencia**, por así excluirlo el artículo 2, fracción XX de la LFPDPPP, que define transferencia como toda comunicación de datos realizada "a persona distinta de la titular, del responsable **o de la persona encargada del tratamiento**", dentro o fuera del territorio mexicano.[^1]

## CLÁUSULA SEGUNDA — DEFINICIONES

Los términos "datos personales", "datos personales sensibles", "titular", "responsable", "persona encargada", "tratamiento", "transferencia", "aviso de privacidad" y "derechos ARCO" tienen el significado que les atribuye la LFPDPPP. "**Vulneración de seguridad**" significa cualquier pérdida, destrucción, robo, extravío, copia, uso, acceso o divulgación no autorizados de los Datos del Gimnasio.

## CLÁUSULA TERCERA — OBJETO

Este Anexo regula el tratamiento que RED realiza de los Datos del Gimnasio con el único fin de prestar los servicios de la Plataforma, y establece las obligaciones, garantías e instrucciones aplicables a dicho tratamiento. Su contenido se detalla en el **Anexo A** (descripción del tratamiento).

## CLÁUSULA CUARTA — VIGENCIA

Este Anexo entra en vigor en la fecha de su aceptación conforme a la Cláusula Décima Sexta y permanece vigente mientras RED trate Datos del Gimnasio por cuenta del Responsable, es decir, mientras subsista la cuenta del Gimnasio en la Plataforma y durante el periodo de conservación posterior previsto en la Cláusula Décima Tercera. Su terminación no libera a RED de las obligaciones de confidencialidad, que subsisten indefinidamente.

## CLÁUSULA QUINTA — TRATAMIENTO CONFORME A INSTRUCCIONES

RED tratará los Datos del Gimnasio **únicamente conforme a las instrucciones documentadas del Responsable**. Constituyen instrucciones documentadas: (i) este Anexo y su Anexo A; (ii) el uso que el Responsable y sus personas usuarias autorizadas hagan de las funciones de la Plataforma; y (iii) cualquier instrucción adicional que el Responsable comunique por escrito o por medios electrónicos a \`{{red_email_privacidad}}\` y que sea técnicamente ejecutable en la Plataforma.

RED no tratará los Datos del Gimnasio para finalidades propias, no los cederá ni comercializará, y no los usará para entrenar modelos de inteligencia artificial ni para elaborar productos de datos, ni siquiera en forma agregada, salvo autorización expresa y por separado del Responsable.

Si RED considera que una instrucción del Responsable infringe la normativa aplicable, lo notificará al Responsable y podrá suspender su ejecución hasta que aquél la confirme o modifique.

RED tratará los Datos del Gimnasio en cumplimiento de un requerimiento de autoridad competente cuando esté legalmente obligada a ello, y en tal caso informará previamente al Responsable, salvo que la ley se lo prohíba.

## CLÁUSULA SEXTA — AISLAMIENTO POR INQUILINO

RED mantendrá los Datos del Gimnasio lógicamente aislados de los datos de los demás gimnasios usuarios de la Plataforma mediante controles de acceso a nivel de registro asociados a la membresía de cada persona usuaria. Ningún personal del Responsable podrá acceder a datos de otro gimnasio, ni viceversa.

## CLÁUSULA SÉPTIMA — CONFIDENCIALIDAD

RED guardará confidencialidad respecto de los Datos del Gimnasio y garantizará que toda persona autorizada para tratarlos —empleados, prestadores de servicios y subencargados— quede sujeta a un deber de confidencialidad de alcance equivalente, subsistente aun después de terminada su relación con RED. RED limitará el acceso a los Datos del Gimnasio al personal que lo requiera para prestar el servicio o atender un incidente.

## CLÁUSULA OCTAVA — MEDIDAS DE SEGURIDAD

RED mantendrá medidas de seguridad administrativas, físicas y técnicas razonables y apropiadas al riesgo, que incluirán al menos:

- **a)** cifrado de los datos en tránsito (TLS) y en reposo;
- **b)** autenticación de personas usuarias y control de acceso por rol y por gimnasio;
- **c)** aislamiento lógico de los datos de cada gimnasio a nivel de base de datos;
- **d)** respaldos periódicos y capacidad de restauración a un punto en el tiempo;
- **e)** registro de auditoría de accesos y operaciones relevantes;
- **f)** gestión de vulnerabilidades y actualización del software de terceros que integra la Plataforma.

RED podrá modificar estas medidas siempre que el nivel de seguridad resultante no disminuya. A solicitud razonable y no más de una vez por año, RED proporcionará al Responsable la información documental de que disponga sobre sus medidas de seguridad y las de sus subencargados. Las Partes acuerdan que este derecho de información sustituye cualquier auditoría presencial en las instalaciones o infraestructura de RED o de sus subencargados.

## CLÁUSULA NOVENA — ASISTENCIA EN DERECHOS ARCO, REVOCACIÓN Y AVISO DE PRIVACIDAD

**9.1.** El Responsable es el único obligado frente a los titulares a poner a disposición el aviso de privacidad, obtener el consentimiento cuando proceda y atender el ejercicio de los derechos de acceso, rectificación, cancelación y oposición, así como la revocación del consentimiento y la limitación del uso o divulgación.

**9.2.** RED pondrá a disposición del Responsable, dentro de la propia Plataforma, las funciones técnicas necesarias para consultar, corregir, suprimir y exportar los Datos del Gimnasio, de modo que el Responsable pueda atender por sí mismo las solicitudes ARCO.

**9.3.** Cuando una solicitud ARCO no pueda atenderse con dichas funciones, RED prestará al Responsable asistencia razonable dentro de los \`{{plazo_asistencia_arco}}\` días hábiles siguientes a su requerimiento.

**9.4.** Si un titular dirige una solicitud ARCO directamente a RED, ésta se abstendrá de atenderla, la remitirá al Responsable sin dilación y le informará de dicha remisión.

**9.5.** RED pone a disposición del Responsable, como cortesía y sin que ello implique asesoría legal, plantillas de aviso de privacidad integral y simplificado. El Responsable es el único autor y responsable del contenido del aviso de privacidad que adopte, incluida la exactitud de su identidad, domicilio, finalidades y mecanismos ARCO.

## CLÁUSULA DÉCIMA — VULNERACIONES DE SEGURIDAD

RED notificará al Responsable **sin dilación indebida y en todo caso dentro de las \`{{plazo_notificacion_vulneracion}}\` horas** siguientes a que tenga conocimiento de una vulneración de seguridad que afecte a los Datos del Gimnasio, al correo de contacto que el Responsable mantenga registrado en la Plataforma.

La notificación incluirá, en la medida en que RED disponga de ello: la naturaleza del incidente, las categorías y el volumen aproximado de datos y titulares afectados, las consecuencias probables, las medidas adoptadas o propuestas para atenderlo y mitigarlo, y un punto de contacto. Si la información no está disponible de inmediato, RED la proporcionará por etapas.

**El Responsable conserva la obligación de comunicar la vulneración a los titulares afectados**, en términos del artículo 19 de la LFPDPPP, así como a la autoridad competente cuando proceda. RED cooperará razonablemente con el Responsable para ello.

## CLÁUSULA DÉCIMA PRIMERA — SUBENCARGADOS

**11.1. Autorización general.** El Responsable **autoriza de forma general** a RED para apoyarse en subencargados en la prestación del servicio. Los subencargados vigentes a la fecha de esta versión son los listados en el **Anexo B**.

**11.2. Condiciones.** RED impondrá a cada subencargado, por contrato o por sus términos de servicio aplicables, obligaciones de protección de datos sustancialmente equivalentes a las de este Anexo, y **responderá frente al Responsable de los actos y omisiones de sus subencargados como si fueran propios**.

**11.3. Aviso de cambio y objeción.** RED notificará al Responsable la incorporación o sustitución de un subencargado con al menos **\`{{plazo_aviso_subencargado}}\` días naturales de anticipación**, mediante correo electrónico a la dirección registrada y publicación en \`{{url_subencargados}}\`. El Responsable podrá objetar por motivos razonables y fundados en protección de datos dentro de los \`{{plazo_objecion_subencargado}}\` días naturales siguientes al aviso; de no alcanzarse una solución, el Responsable podrá dar por terminado el servicio sin penalidad, siendo ésta su única vía de reparación por dicho cambio.

**11.4. Alojamiento.** El Responsable reconoce y acepta que la Plataforma se aloja en la infraestructura de **Supabase, Inc.**, la cual a su vez se ejecuta sobre **Amazon Web Services, Inc.** en la región \`{{region_supabase}}\`, y que por lo tanto los Datos del Gimnasio se almacenan y procesan **fuera del territorio nacional**. Las Partes reconocen que, conforme al artículo 2, fracción XX de la LFPDPPP, la comunicación de datos a la persona encargada no constituye transferencia "dentro o fuera del territorio mexicano".[^1]

## CLÁUSULA DÉCIMA SEGUNDA — PROHIBICIÓN DE DATOS SENSIBLES Y BIOMÉTRICOS

**12.1.** La Plataforma **no está diseñada ni autorizada para el tratamiento de datos personales sensibles**. RED no recaba, almacena ni procesa datos biométricos de ningún tipo.

**12.2.** El Responsable se obliga a **abstenerse de introducir en la Plataforma** —por captura, carga de archivos, importación, integración con terceros o por cualquier otro medio, incluidos los campos de texto libre— datos personales sensibles, entendiendo comprendidos de manera enunciativa y no limitativa: **datos biométricos** (huella dactilar, geometría facial, iris, voz), datos de salud, información médica o de lesiones, origen racial o étnico, creencias religiosas, filosóficas o morales, afiliación sindical, opiniones políticas y preferencia sexual.

**12.3.** El incumplimiento de esta cláusula es imputable exclusivamente al Responsable. RED podrá suprimir dicha información sin responsabilidad y, en caso de incumplimiento reiterado, suspender o terminar el servicio.

**12.4.** El Responsable mantendrá a RED en paz y a salvo de cualquier reclamación, sanción o indemnización derivada de la introducción de datos sensibles en la Plataforma en contravención de esta cláusula.

## CLÁUSULA DÉCIMA TERCERA — DEVOLUCIÓN Y SUPRESIÓN AL TÉRMINO

Al terminar la prestación del servicio, RED, a elección del Responsable manifestada dentro de los \`{{plazo_eleccion_devolucion}}\` días naturales siguientes a la terminación: (i) pondrá a disposición del Responsable los Datos del Gimnasio en un formato estructurado y de uso común, mediante la función de exportación de la Plataforma; y/o (ii) los suprimirá.

Transcurrido dicho plazo sin manifestación del Responsable, RED conservará los Datos del Gimnasio durante un periodo de gracia de \`{{plazo_gracia_supresion}}\` días naturales y, vencido éste, procederá a su supresión, incluidas las copias de respaldo conforme al ciclo de rotación de éstas, salvo que la conservación sea exigida por una disposición legal, en cuyo caso subsistirán las obligaciones de confidencialidad y seguridad de este Anexo respecto de los datos conservados.

## CLÁUSULA DÉCIMA CUARTA — OBLIGACIONES DEL RESPONSABLE

El Responsable declara y garantiza que:

- **a)** recaba los Datos del Gimnasio conforme a la LFPDPPP, poniendo a disposición de los titulares el aviso de privacidad y obteniendo el consentimiento cuando la ley lo exija;
- **b)** sus instrucciones a RED no infringen la normativa aplicable;
- **c)** es exacta y está actualizada la información de identidad, domicilio, finalidades y contacto ARCO que proporcione para la generación de sus avisos de privacidad;
- **d)** administra con diligencia las cuentas y credenciales de su personal usuario, y notificará a RED sin dilación cualquier acceso no autorizado que detecte del lado del Responsable;
- **e)** no introducirá datos personales sensibles en la Plataforma, conforme a la Cláusula Décima Segunda.

## CLÁUSULA DÉCIMA QUINTA — RESPONSABILIDAD

**15.1.** Cada Parte responde del incumplimiento de las obligaciones que este Anexo le atribuye.

**15.2.** Las Partes reconocen que, conforme al **artículo 53 de la LFPDPPP**, el responsable y la persona encargada pueden resultar **solidariamente obligados frente al titular** al pago de la indemnización que corresponda. En consecuencia, la Parte que haya pagado una indemnización derivada de una conducta imputable a la otra podrá **repetir** contra ésta por el importe pagado, incluidos gastos y costas razonablemente erogados, previa notificación oportuna de la reclamación y oportunidad de defensa.

**15.3.** El reparto interno de responsabilidad pactado en esta cláusula **no es oponible al titular ni a la autoridad**, y no limita en forma alguna los derechos de aquél.

**15.4.** Los límites de responsabilidad pactados en el Contrato de Prestación de Servicios, cuando exista, aplicarán a este Anexo, salvo respecto de las obligaciones de confidencialidad, el dolo y la mala fe.

## CLÁUSULA DÉCIMA SEXTA — ACEPTACIÓN ELECTRÓNICA

**16.1.** El Responsable acepta este Anexo marcando la casilla de aceptación expresa que se le presenta en la aplicación administrativa de la Plataforma, junto con el texto íntegro del presente documento, al momento de su primer acceso o cuando se publique una nueva versión.

**16.2.** **Las Partes convienen expresamente que la aceptación mediante clic en dicha casilla, realizada desde una cuenta autenticada del Responsable, surtirá los mismos efectos jurídicos que la firma autógrafa** y bastará para tener por celebrado y perfeccionado el presente Anexo, sin que se requiera contrafirma, ejemplar impreso ni acto posterior alguno.[^3]

**16.3.** Al momento de la aceptación, RED conservará como constancia, cuando menos: la identificación de la cuenta y de la persona usuaria aceptante, la fecha y hora, la dirección IP de origen, la versión del documento y la huella criptográfica (SHA-256) de su texto íntegro. RED conservará dicha constancia y el texto aceptado de forma íntegra, inalterada y accesible para su ulterior consulta durante toda la vigencia de este Anexo y por \`{{plazo_conservacion_constancia}}\` años posteriores, y la pondrá a disposición del Responsable a solicitud de éste.

**16.4.** Las Partes reconocen que el mensaje de datos así generado es atribuible al Responsable por haberse emitido mediante los medios de identificación (credenciales) de su cuenta.[^3]

**16.5.** Cuando este Anexo se incorpore por referencia a un Contrato de Prestación de Servicios celebrado entre las Partes, se tendrá por aceptado con la celebración de dicho Contrato, sin perjuicio de la constancia electrónica descrita en esta cláusula.

## CLÁUSULA DÉCIMA SÉPTIMA — VERSIONES Y MODIFICACIONES

**17.1.** Este Anexo se identifica por número de versión, fecha y huella criptográfica de su texto, conforme al encabezado del documento. La versión vigente se publica permanentemente en \`{{url_anexo}}\` junto con el historial de versiones anteriores y sus respectivas huellas.

**17.2.** RED podrá modificar este Anexo cuando lo exija un cambio normativo, la incorporación de un subencargado o una modificación material del servicio. RED notificará la nueva versión con al menos **\`{{plazo_aviso_version}}\` días naturales de anticipación**, mediante correo electrónico a la dirección registrada del Responsable y aviso dentro de la aplicación administrativa.

**17.3.** Transcurrido dicho plazo, la nueva versión se tendrá por aceptada mediante la aceptación expresa del Responsable en la aplicación o, en su defecto, por el uso continuado del servicio. El Responsable que no esté conforme podrá dar por terminado el servicio sin penalidad antes de la fecha de entrada en vigor de la nueva versión.

**17.4.** Ninguna modificación reducirá el nivel de protección de los Datos del Gimnasio por debajo del previsto en la versión aceptada por el Responsable.

## CLÁUSULA DÉCIMA OCTAVA — DISPOSICIONES FINALES

**18.1. Integridad.** Este Anexo, junto con sus Anexos A y B, constituye el acuerdo íntegro de las Partes en materia de protección de datos personales y prevalece sobre cualquier estipulación contraria del Contrato de Prestación de Servicios o de los términos y condiciones de la Plataforma.

**18.2. Divisibilidad.** La nulidad de alguna cláusula no afectará la validez de las restantes.

**18.3. Ley aplicable y jurisdicción.** Este Anexo se rige por las leyes federales de los Estados Unidos Mexicanos. Para su interpretación y cumplimiento, las Partes se someten a la jurisdicción de los tribunales competentes de \`{{jurisdiccion}}\`, renunciando a cualquier otro fuero.

**18.4. Reglamento.** En caso de que la autoridad o los tribunales determinen que el Reglamento de la LFPDPPP publicado en el Diario Oficial de la Federación el 21 de diciembre de 2011 continúa aplicándose en lo que no se oponga a la Ley vigente, las Partes reconocen que el presente Anexo tiene por objeto satisfacer las obligaciones de formalización de la relación responsable–encargado ahí previstas, y se obligan a suscribir cualquier documento adicional que resulte necesario para ello.[^2]

---

## ANEXO A — DESCRIPCIÓN DEL TRATAMIENTO

| Concepto | Contenido |
|---|---|
| **Objeto** | Prestación del servicio de software de gestión de gimnasios RED (alta y directorio de personas clientes, venta y renovación de paquetes, control de asistencia, agenda y reserva de clases, recibos, comunicaciones operativas y aplicación para la persona miembro). |
| **Duración** | La vigencia del servicio, más los plazos de la Cláusula Décima Tercera. |
| **Naturaleza y finalidad** | Almacenamiento, consulta, organización, modificación, supresión y comunicación de los Datos del Gimnasio, por cuenta y bajo instrucciones del Responsable, con el fin exclusivo de operar la Plataforma. |
| **Categorías de titulares** | Personas clientes y prospectos del Gimnasio; personal del Gimnasio con cuenta de usuario. |
| **Categorías de datos** | Identificación (nombre); contacto (teléfono, correo electrónico); fecha de nacimiento (opcional); datos de cuenta y credenciales de acceso a la aplicación; registros de asistencia, visitas y reservas de clase; registros de compra, membresía y saldo (paquete, importe, método de pago, vigencia, clases restantes). **No se tratan datos personales sensibles ni datos biométricos** (Cláusula Décima Segunda). **No se almacenan números de tarjeta ni credenciales bancarias de los titulares.** |
| **Ubicación del tratamiento** | Estados Unidos de América / \`{{region_supabase}}\` (ver Anexo B). |

## ANEXO B — SUBENCARGADOS AUTORIZADOS

| Subencargado | Función | Ubicación del tratamiento |
|---|---|---|
| **Supabase, Inc.** | Base de datos, autenticación, almacenamiento y funciones de servidor de la Plataforma | \`{{region_supabase}}\` (infraestructura de Amazon Web Services, Inc.) |
| **Amazon Web Services, Inc.** | Infraestructura de cómputo y almacenamiento subyacente a Supabase | \`{{region_supabase}}\` |
| \`{{subencargado_hosting_apps}}\` | Alojamiento y entrega de las aplicaciones web | \`{{region_hosting_apps}}\` |
| \`{{subencargado_email}}\` | Envío de correo electrónico transaccional (invitaciones, recibos, avisos) | \`{{region_email}}\` |

> **[PENDIENTE — completar antes de publicar]** Confirmar la región efectiva del proyecto de Supabase, y verificar la lista de subencargados de Supabase (publicada como PDF versionado en su portal legal) para determinar si alguno adicional debe reflejarse en esta tabla.

---

## NOTAS AL PIE

[^1]: LFPDPPP (reformada, DOF 20-mar-2025, en vigor 21-mar-2025), artículo 2, fracción XX. Nota para el abogado revisor: **no está resuelto** si la cadena de subencargo RED → Supabase → AWS queda igualmente comprendida en esta exclusión, o si Supabase debe reputarse "tercero" (artículo 35) y por tanto su intervención constituir una transferencia. Ver pregunta 2 del brief.

[^2]: La supervivencia del Reglamento de la LFPDPPP de 2011 —y con él la obligación de contrato escrito responsable–encargado de sus artículos 49 a 51— frente a la reforma de marzo de 2025 es una cuestión abierta: la Ley vigente no contiene cláusula de continuidad ni de abrogación al respecto, y el Reglamento de la nueva Ley no ha sido publicado. Este Anexo se redacta para cumplir con esa obligación en caso de que subsista, sin reconocer que exista. Ver pregunta 1 del brief.

[^3]: Referencias de apoyo: Código de Comercio, artículos 89 bis (no negación de efectos jurídicos por constar en mensaje de datos), 90 (atribución del mensaje emitido mediante claves o contraseñas del emisor), 93 (equivalencia funcional de forma escrita y de firma, condicionada a que la información se mantenga íntegra y accesible para ulterior consulta) y 97 (fiabilidad de la firma electrónica como estándar de idoneidad, no de validez). **Pendiente de verificación contra el texto primario publicado por la Cámara de Diputados**: el texto de estos artículos utilizado en la investigación previa proviene de agregadores secundarios y no fue confirmado contra fuente primaria. Ver el encargo final del brief.
`;

/**
 * The two aviso de privacidad templates — issue #255 (Gate 0.1 CUENTA legal-identity editor).
 * Same home and same byte-for-byte-copy discipline as the Anexo above: each constant mirrors its
 * source .md under `docs/legal/gate0-borradores/` exactly (guarded by
 * tools/guards/aviso-legal-drift.test.ts, the same idiom as anexo-legal-drift.test.ts), INCLUDING
 * the drafting notes and every unresolved `{{merge_field}}` placeholder. Unlike the Anexo, these
 * documents carry no acceptance/version-uniqueness concept (nobody clicks to accept an aviso) —
 * the value they add here is a live PREVIEW of what a gym's members would see, built by
 * `mergeAvisoTemplate` below. Member-facing serving is #256's slice, not this one.
 */
export const AVISO_PRIVACIDAD_INTEGRAL_TEXTO = `
# AVISO DE PRIVACIDAD INTEGRAL — PLANTILLA POR GIMNASIO

> **BORRADOR — PENDIENTE DE REVISIÓN POR ABOGADO MEXICANO. ESTE DOCUMENTO NO CONSTITUYE ASESORÍA LEGAL.**

**Notas de redacción (eliminar antes de publicar):**

1. **Titularidad del documento.** El aviso resultante es documento **del gimnasio**, no de RED. RED únicamente lo genera con los datos que el gimnasio proporciona y lo publica en una URL estable de la Plataforma. Al momento de generarlo, la aplicación debe mostrar el descargo: *"Esta plantilla no constituye asesoría legal. El gimnasio es el único responsable del contenido de su aviso de privacidad y debe revisarlo con su propio abogado."*
2. **Alcance.** El cuerpo cubre **exactamente los seis elementos** del artículo 15 de la LFPDPPP vigente. Todo lo que exceda esos seis va en párrafos marcados como **opcionales**, para que el abogado revisor decida si se incluyen.
3. **Las categorías de datos enumeradas son las que RED realmente trata.** Si el gimnasio recaba datos por fuera de la Plataforma (formatos en papel, videovigilancia, control de acceso de terceros), debe añadirlos por su cuenta — RED no puede conocerlos.

---

# AVISO DE PRIVACIDAD

**\`{{nombre_comercial}}\`**
Última actualización: \`{{fecha_actualizacion}}\`
Versión: \`{{version_aviso}}\`

## 1. Identidad y domicilio del responsable

\`{{razon_social}}\`, que opera comercialmente como **\`{{nombre_comercial}}\`**, con domicilio en \`{{domicilio}}\`, es la **responsable** del tratamiento de sus datos personales, en términos de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (la "**Ley**").

Puede contactarnos en \`{{email_contacto}}\` o al teléfono \`{{telefono_contacto}}\`.

## 2. Datos personales que tratamos

Para las finalidades señaladas en este aviso tratamos las siguientes categorías de datos personales:

- **Datos de identificación:** nombre completo y, cuando usted lo proporcione, fecha de nacimiento.
- **Datos de contacto:** número de teléfono celular y correo electrónico.
- **Datos de su cuenta:** correo electrónico verificado y credenciales de acceso a nuestra aplicación para personas miembros, cuando usted decida activarla.
- **Registros de asistencia y actividad:** fecha y hora de sus visitas al gimnasio, reservas de clase, asistencias y cancelaciones.
- **Registros de compra y membresía:** paquete adquirido, importe pagado, método de pago (efectivo, transferencia o tarjeta), fecha de compra, vigencia y clases restantes.

**No tratamos datos personales sensibles.** En particular, **no recabamos datos biométricos** (huella dactilar, reconocimiento facial, iris o voz), datos de salud, información médica o de lesiones, ni ninguna otra categoría de datos personales sensibles.

**No almacenamos números de tarjeta bancaria ni credenciales de banca en línea.** Del pago únicamente conservamos el registro del método utilizado y el importe.

\`{{parrafo_datos_adicionales}}\`
> *[OPCIONAL — incluir solo si el gimnasio recaba datos fuera de la plataforma: videovigilancia, contacto de emergencia, formatos en papel, etc. Redacción a cargo del gimnasio.]*

## 3. Finalidades del tratamiento

**Finalidades primarias.** Son necesarias para la relación jurídica que tenemos con usted; sin ellas no podríamos prestarle el servicio:

- **a)** registrarlo como persona cliente y administrar su membresía;
- **b)** venderle, renovar y controlar la vigencia de sus paquetes de clases, y llevar su saldo de clases;
- **c)** controlar el acceso a las instalaciones y registrar su asistencia;
- **d)** gestionar la reserva de clases y su lugar en cada sesión;
- **e)** procesar sus pagos y emitir el comprobante o recibo correspondiente;
- **f)** crear y administrar su cuenta en nuestra aplicación para personas miembros;
- **g)** enviarle comunicaciones operativas sobre su membresía: confirmaciones de compra, recibos, invitación para activar su cuenta, avisos de vencimiento de su paquete, cambios o cancelaciones de clases;
- **h)** atender sus dudas, quejas y solicitudes;
- **i)** cumplir con las obligaciones legales, fiscales y contables a nuestro cargo.

**Finalidades secundarias.** No son necesarias para la relación jurídica y **requieren su consentimiento**:

- **j)** enviarle promociones, descuentos, novedades y publicidad de nuestros servicios por WhatsApp, correo electrónico o mensaje de texto;
- **k)** invitarlo a eventos, retos y actividades del gimnasio;
- **l)** aplicarle encuestas de satisfacción y realizar estadísticas internas para mejorar nuestro servicio.

**Si usted no desea que sus datos se traten para las finalidades secundarias (incisos j, k y l), puede manifestarlo desde ahora enviando un correo a \`{{email_arco}}\` con la leyenda "NO FINALIDADES SECUNDARIAS". Su negativa no será motivo para negarle el servicio ni afectará su membresía.**

## 4. Medios para limitar el uso o divulgación de sus datos

Usted puede limitar el uso o divulgación de sus datos personales por cualquiera de estos medios:

- **a)** enviando su solicitud a \`{{email_arco}}\`;
- **b)** respondiendo con la palabra **BAJA** a cualquier mensaje promocional que reciba por WhatsApp o mensaje de texto, o usando el enlace de cancelación de suscripción de nuestros correos promocionales;
- **c)** solicitándolo directamente en la recepción de \`{{domicilio}}\`.

Atenderemos su solicitud y lo incorporaremos a nuestro listado de exclusión, dejando de enviarle comunicaciones promocionales. Seguirá recibiendo las comunicaciones operativas del inciso (g) de la sección 3, por ser necesarias para su membresía.

\`{{parrafo_registro_publicidad}}\`
> *[OPCIONAL — mención del Registro Público para Evitar Publicidad (PROFECO); confirmar con el abogado si procede incluirlo.]*

## 5. Medios para ejercer los derechos ARCO

Usted tiene derecho a **acceder** a sus datos personales, a **rectificarlos** cuando sean inexactos o incompletos, a **cancelarlos** cuando considere que no se requieren para alguna de las finalidades de este aviso, y a **oponerse** a su tratamiento para fines específicos (derechos ARCO). También puede **revocar** el consentimiento que nos haya otorgado.

Para ejercerlos, envíe su solicitud a **\`{{email_arco}}\`**, dirigida a \`{{area_datos_personales}}\`, o preséntela por escrito en \`{{domicilio}}\`, incluyendo:

- **a)** su nombre y un medio para comunicarle la respuesta (correo electrónico o teléfono);
- **b)** copia de una identificación oficial vigente que acredite su identidad, o del instrumento que acredite la representación legal, en su caso;
- **c)** la descripción clara y precisa de los datos respecto de los que ejerce el derecho y del derecho que desea ejercer;
- **d)** cualquier documento que facilite la localización de sus datos;
- **e)** tratándose de rectificación, la corrección solicitada y la documentación que la sustente.

Le responderemos en un plazo de \`{{plazo_respuesta_arco}}\` días hábiles contados a partir de la recepción de su solicitud, y de resultar procedente la haremos efectiva dentro de los \`{{plazo_ejecucion_arco}}\` días hábiles siguientes.

> **[PENDIENTE — verificar los plazos ARCO contra el texto vigente de la LFPDPPP reformada antes de publicar. Los plazos del régimen anterior (20 y 15 días hábiles) no deben asumirse vigentes sin confirmación.]**

El ejercicio de los derechos ARCO es gratuito; solo deberá cubrir los gastos justificados de envío o reproducción, en su caso.

Si considera que su derecho a la protección de datos personales ha sido lesionado, puede acudir ante la autoridad competente en materia de protección de datos personales.

## 6. Cambios al aviso de privacidad

Este aviso puede sufrir modificaciones derivadas de nuevos requerimientos legales, de nuestras propias necesidades, de cambios en nuestro modelo de negocio o de nuestras prácticas de privacidad.

**Le comunicaremos cualquier cambio mediante la publicación de la versión actualizada en \`{{url_aviso_integral}}\`**, indicando en el encabezado la fecha de la última actualización, y adicionalmente \`{{canal_aviso_cambios}}\` *(por ejemplo: aviso visible en la recepción del gimnasio, notificación dentro de la aplicación y/o correo electrónico a la dirección que tengamos registrada)*. Le recomendamos consultar periódicamente dicha dirección.

---

## PÁRRAFO OPCIONAL — ALOJAMIENTO Y ENCARGADOS

> **[PÁRRAFO OPCIONAL — PENDIENTE DE OPINIÓN DEL ABOGADO SOBRE DIVULGACIÓN DE TRANSFERENCIAS.]**
>
> El artículo 15 de la LFPDPPP vigente **no enumera** la divulgación de transferencias ni de encargados entre los seis elementos obligatorios del aviso de privacidad, y existe opinión de firma (Greenberg Traurig) en el sentido de que la reforma de marzo de 2025 **eliminó** esa obligación. Al no estar resuelto contra texto primario, este párrafo se ofrece como divulgación **voluntaria** —útil también como argumento de transparencia frente al titular— para que el abogado decida incluirlo, modificarlo o suprimirlo. Ver preguntas 2 y 3 del brief.
>
> **Texto propuesto:**
>
> ### Encargados del tratamiento
>
> Para operar el gimnasio nos apoyamos en proveedores tecnológicos que tratan sus datos personales **por nuestra cuenta y bajo nuestras instrucciones**, en calidad de **encargados**, sin utilizarlos para finalidades propias y sujetos a obligaciones contractuales de confidencialidad y seguridad. Utilizamos la plataforma de gestión de gimnasios **RED**, operada por \`{{red_razon_social}}\`, la cual se aloja en la infraestructura de **Supabase, Inc.** sobre servidores de **Amazon Web Services, Inc.** ubicados en \`{{region_supabase}}\`, por lo que sus datos se almacenan **fuera del territorio nacional**. Conforme al artículo 2, fracción XX de la Ley, la comunicación de datos personales a una persona encargada del tratamiento **no constituye una transferencia**. No vendemos, cedemos ni comercializamos sus datos personales con terceros.

---

## CAMPOS DE COMBINACIÓN

| Campo | Origen | Ejemplo |
|---|---|---|
| \`{{razon_social}}\` | Alta del gimnasio | Gimnasio Forge, S.A. de C.V. |
| \`{{nombre_comercial}}\` | Fila \`gym\` / perfil | FORGE |
| \`{{domicilio}}\` | Alta del gimnasio | Calle, número, colonia, C.P., ciudad, estado |
| \`{{email_contacto}}\` | Perfil del gimnasio | hola@ejemplo.mx |
| \`{{telefono_contacto}}\` | Perfil del gimnasio | +52 55 0000 0000 |
| \`{{email_arco}}\` | Alta del gimnasio | datos@ejemplo.mx |
| \`{{area_datos_personales}}\` | Alta del gimnasio | "Departamento de Datos Personales" o el nombre de la persona designada |
| \`{{url_aviso_integral}}\` | Generado por RED | https://\`{{host_gimnasio}}\`/aviso-de-privacidad |
| \`{{fecha_actualizacion}}\` | Generado por RED | 07 de agosto de 2026 |
| \`{{version_aviso}}\` | Generado por RED | 1.0 |
| \`{{plazo_respuesta_arco}}\` / \`{{plazo_ejecucion_arco}}\` | Constante — **pendiente de verificación legal** | — |
| \`{{canal_aviso_cambios}}\` | Alta del gimnasio | — |
| \`{{region_supabase}}\` | Constante de plataforma | — |
| \`{{red_razon_social}}\` | Constante de plataforma — **pendiente de Gate 1** | — |
| \`{{parrafo_datos_adicionales}}\`, \`{{parrafo_registro_publicidad}}\` | Texto libre opcional del gimnasio | — |
`;

export const AVISO_PRIVACIDAD_SIMPLIFICADO_TEXTO = `
# AVISO DE PRIVACIDAD SIMPLIFICADO — PLANTILLA POR GIMNASIO

> **BORRADOR — PENDIENTE DE REVISIÓN POR ABOGADO MEXICANO. ESTE DOCUMENTO NO CONSTITUYE ASESORÍA LEGAL.**

**Uso.** Modalidad simplificada prevista en el artículo 16, fracción II de la LFPDPPP, para cuando los datos personales se obtienen **por medios electrónicos**. Se renderiza **en línea, dentro del propio formulario**, antes del botón de envío, en los puntos de recolección de la Plataforma: activación de cuenta (\`/activar\`), registro de la persona miembro, formularios de alta y reserva. Debe **enlazar siempre** al aviso de privacidad integral.

---

## Texto (versión canónica)

> **Aviso de privacidad**
>
> \`{{razon_social}}\`, con domicilio en \`{{domicilio}}\`, es la responsable del tratamiento de sus datos personales. Utilizamos sus datos de identificación, contacto, asistencia y compra para registrarlo como persona cliente, administrar su membresía y el saldo de su paquete, controlar su acceso y asistencia, gestionar sus reservas de clase, procesar sus pagos y emitir su recibo, administrar su cuenta en la aplicación y enviarle comunicaciones operativas sobre su membresía. **No tratamos datos personales sensibles ni datos biométricos.**
>
> Puede consultar el aviso de privacidad integral, que incluye las finalidades que requieren su consentimiento y los medios para ejercer sus derechos ARCO, en [\`{{url_aviso_integral}}\`](\`{{url_aviso_integral}}\`).

## Texto (versión breve, para espacios reducidos)

> \`{{razon_social}}\` (\`{{nombre_comercial}}\`), con domicilio en \`{{domicilio}}\`, es responsable del tratamiento de sus datos personales y los utiliza para administrar su membresía, asistencia, reservas y pagos. No tratamos datos sensibles ni biométricos. Consulte el [aviso de privacidad integral](\`{{url_aviso_integral}}\`).

## Casilla de consentimiento para finalidades secundarias (opcional en el formulario)

> ☐ Acepto recibir promociones, novedades e invitaciones a eventos de \`{{nombre_comercial}}\` por WhatsApp o correo electrónico.

**Reglas de implementación:**
- La casilla se presenta **desmarcada por omisión** y es **opcional**: no puede condicionar el envío del formulario ni el alta.
- Su estado (aceptada / no aceptada), fecha, hora y versión del aviso se almacenan junto con el registro de la persona cliente.
- El aviso simplificado se muestra **siempre**; la casilla solo cuando el gimnasio tenga activadas finalidades secundarias.

## Campos de combinación

| Campo | Origen |
|---|---|
| \`{{razon_social}}\` | Alta del gimnasio |
| \`{{nombre_comercial}}\` | Fila \`gym\` / perfil |
| \`{{domicilio}}\` | Alta del gimnasio |
| \`{{url_aviso_integral}}\` | Generado por RED — URL estable por inquilino |
`;

/** The gym's legal identity as the aviso templates need it: `razonSocial` (gym.legal_name, staff
 *  writable since #255), `nombreComercial` (gym.brand_name — already public, always present),
 *  and the `gym_legal` satellite's three columns (#253). Every field but `nombreComercial` is
 *  nullable — a gym starts with none of it filled in. */
export interface IdentidadLegalGym {
  razonSocial: string | null;
  nombreComercial: string;
  domicilio: string | null;
  emailArco: string | null;
  areaDatosPersonales: string | null;
}

/** The four staff-editable fields the aviso cannot go out without — `nombreComercial` is excluded
 *  (gym.brand_name is never null, set at gym creation). Order matches the CUENTA editor's form. */
const CAMPOS_REQUERIDOS: ReadonlyArray<{ campo: keyof IdentidadLegalGym; etiqueta: string }> = [
  { campo: "razonSocial", etiqueta: "razón social" },
  { campo: "domicilio", etiqueta: "domicilio" },
  { campo: "emailArco", etiqueta: "correo de contacto ARCO" },
  { campo: "areaDatosPersonales", etiqueta: "área o persona responsable de datos personales" },
];

/** Whether every field the aviso templates need from the gym is filled in (fallback ruling, Gate
 *  0.1): an incomplete identity keeps the generic/unresolved template rather than a half-merged
 *  one, so the CUENTA preview gates on this before rendering. */
export function identidadLegalCompleta(identidad: IdentidadLegalGym): boolean {
  return CAMPOS_REQUERIDOS.every(({ campo }) => !!identidad[campo]?.trim());
}

/** The human labels of whatever's still missing, in form order — what the CUENTA empty state lists
 *  to explain why the members' aviso isn't ready yet. Empty when `identidadLegalCompleta`. */
export function camposFaltantesIdentidadLegal(identidad: IdentidadLegalGym): string[] {
  return CAMPOS_REQUERIDOS.filter(({ campo }) => !identidad[campo]?.trim()).map((c) => c.etiqueta);
}

/** Substitute \`{{snake_case}}\` merge fields in an aviso template with known values. A field absent
 *  from `valores`, or whose value is blank, is left VISIBLE as the literal `{{token}}` — the
 *  deliberate choice (Gate 0.1 fallback ruling) over silently stripping it: a preview must show
 *  staff exactly what is still unresolved (platform-generated fields like `{{url_aviso_integral}}`
 *  included — those are #256's job, not this one), never fabricate blank prose that reads as
 *  finished copy. Pure — no I/O, no document identity, just string substitution. */
export function mergeAvisoTemplate(
  texto: string,
  valores: Readonly<Record<string, string | null | undefined>>,
): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (token, campo: string) => {
    const valor = valores[campo];
    return valor && valor.trim().length > 0 ? valor : token;
  });
}

function valoresDesdeIdentidad(identidad: IdentidadLegalGym): Record<string, string | null> {
  return {
    razon_social: identidad.razonSocial,
    nombre_comercial: identidad.nombreComercial,
    domicilio: identidad.domicilio,
    email_arco: identidad.emailArco,
    area_datos_personales: identidad.areaDatosPersonales,
  };
}

/** The integral aviso, merged with the gym's current legal identity — the CUENTA preview's main
 *  view. Renders regardless of completeness (`identidadLegalCompleta` is the caller's gate for
 *  whether to show this or the empty state); unresolved fields stay visible per
 *  `mergeAvisoTemplate`'s contract. */
export function renderAvisoIntegral(identidad: IdentidadLegalGym): string {
  return mergeAvisoTemplate(AVISO_PRIVACIDAD_INTEGRAL_TEXTO, valoresDesdeIdentidad(identidad));
}

/** The simplificado aviso, merged the same way — the CUENTA preview's second tab. */
export function renderAvisoSimplificado(identidad: IdentidadLegalGym): string {
  return mergeAvisoTemplate(AVISO_PRIVACIDAD_SIMPLIFICADO_TEXTO, valoresDesdeIdentidad(identidad));
}
