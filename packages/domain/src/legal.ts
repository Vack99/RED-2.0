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

1. **Titularidad del documento.** El aviso resultante es documento **del gimnasio**, no de iBookit. iBookit únicamente lo genera con los datos que el gimnasio proporciona y lo publica en una URL estable de la Plataforma. Al momento de generarlo, la aplicación debe mostrar el descargo: *"Esta plantilla no constituye asesoría legal. El gimnasio es el único responsable del contenido de su aviso de privacidad y debe revisarlo con su propio abogado."*
2. **Alcance.** El cuerpo cubre **exactamente los seis elementos** del artículo 15 de la LFPDPPP vigente. Todo lo que exceda esos seis va en párrafos marcados como **opcionales**, para que el abogado revisor decida si se incluyen.
3. **Las categorías de datos enumeradas son las que iBookit realmente trata.** Si el gimnasio recaba datos por fuera de la Plataforma (formatos en papel, videovigilancia, control de acceso de terceros), debe añadirlos por su cuenta — iBookit no puede conocerlos.

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
> Para operar el gimnasio nos apoyamos en proveedores tecnológicos que tratan sus datos personales **por nuestra cuenta y bajo nuestras instrucciones**, en calidad de **encargados**, sin utilizarlos para finalidades propias y sujetos a obligaciones contractuales de confidencialidad y seguridad. Utilizamos la plataforma de gestión de gimnasios **iBookit**, operada por \`{{red_razon_social}}\`, la cual se aloja en la infraestructura de **Supabase, Inc.** sobre servidores de **Amazon Web Services, Inc.** ubicados en \`{{region_supabase}}\`, por lo que sus datos se almacenan **fuera del territorio nacional**. Conforme al artículo 2, fracción XX de la Ley, la comunicación de datos personales a una persona encargada del tratamiento **no constituye una transferencia**. No vendemos, cedemos ni comercializamos sus datos personales con terceros.

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
| \`{{url_aviso_integral}}\` | Generado por iBookit | https://\`{{host_gimnasio}}\`/aviso-de-privacidad |
| \`{{fecha_actualizacion}}\` | Generado por iBookit | 07 de agosto de 2026 |
| \`{{version_aviso}}\` | Generado por iBookit | 1.0 |
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
| \`{{url_aviso_integral}}\` | Generado por iBookit — URL estable por inquilino |
`;

/** The gym's legal identity as the aviso templates need it: `razonSocial` (gym.legal_name, staff
 *  writable since #255), `nombreComercial` (gym.brand_name — already public, always present),
 *  the `gym_legal` satellite's three columns (#253). Every field but `nombreComercial` is
 *  nullable — a gym starts with none of it filled in.
 *
 *  `telefonoContacto`/`emailContacto` (#256 correction): the template's own CAMPOS DE COMBINACIÓN
 *  table names "Perfil del gimnasio" as their source, which #255 wired as `perfil.tel` — but
 *  `perfil` is a row per OPERATOR, not per gym (a gym with several staff has several `perfil.tel`
 *  values, none of them "the gym's" phone), and it is never anon-readable by design (it is not
 *  gym-scoped data), so a member reading the public aviso could NEVER see a resolved phone that
 *  way. `gym_contact` (domicilio/whatsapp/email, #53) is the gym-scoped, already-public
 *  equivalent — this is now that column's job, sourced by the caller (packages/data/src/server/
 *  marketing.ts's `getContacto`), not perfil's.
 *
 *  `urlAvisoIntegral` (#256): the aviso's own stable public URL — "Generado por iBookit" per the
 *  template's CAMPOS table, so the caller supplies it (the client app derives it from the current
 *  request's origin; the admin preview resolves the gym's mapped client host). */
export interface IdentidadLegalGym {
  razonSocial: string | null;
  nombreComercial: string;
  domicilio: string | null;
  emailArco: string | null;
  areaDatosPersonales: string | null;
  telefonoContacto: string | null;
  emailContacto: string | null;
  urlAvisoIntegral: string | null;
}

/** Assemble the `IdentidadLegalGym` the aviso needs from its sources: the gym_legal-backed DTO
 *  (razón social + gym_legal's three columns), the gym's brand name, and the platform/gym_contact
 *  values (#256) the caller resolved separately. Every CUENTA/client call site needs the exact
 *  same shape — the CUENTA AJUSTES status line, the editor sheet's live preview, and the client
 *  app's /legal + registro + activar renders — so none of them re-assembles the object by hand
 *  (review finding 8, extended by #256). */
export function identidadDesde(
  dto: {
    razonSocial: string | null;
    domicilio: string | null;
    emailArco: string | null;
    areaDatosPersonales: string | null;
  },
  nombreComercial: string,
  telefonoContacto: string | null,
  emailContacto: string | null,
  urlAvisoIntegral: string | null,
): IdentidadLegalGym {
  return {
    razonSocial: dto.razonSocial,
    nombreComercial,
    domicilio: dto.domicilio,
    emailArco: dto.emailArco,
    areaDatosPersonales: dto.areaDatosPersonales,
    telefonoContacto,
    emailContacto,
    urlAvisoIntegral,
  };
}

/** Substitute \`{{snake_case}}\` merge fields in an aviso template with known values. A field absent
 *  from `valores`, or whose value is blank, is left VISIBLE as the literal `{{token}}` — the
 *  deliberate choice (Gate 0.1 fallback ruling) over silently stripping it: a preview must show
 *  staff exactly what is still unresolved, never fabricate blank prose that reads as finished
 *  copy. Pure — no I/O, no document identity, just string substitution. */
export function mergeAvisoTemplate(
  texto: string,
  valores: Readonly<Record<string, string | null | undefined>>,
): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (token, campo: string) => {
    const valor = valores[campo];
    return valor && valor.trim().length > 0 ? valor : token;
  });
}

/** Platform-owned merge fields the templates' own CAMPOS DE COMBINACIÓN table marks "Generado por
 *  iBookit" — supplied truthfully (review finding 3) rather than left as raw tokens. `FECHA_ACTUALIZACION`
 *  is the templates' real authoring date (commit dbbe722, 2026-08-07 — the table's own example row
 *  even uses this exact value), not a placeholder; bump both together whenever the TEXTO constants'
 *  substance changes, same discipline as `ANEXO_TRATAMIENTO_DATOS_VERSION`. "0.1-borrador" is
 *  reserved the same way: "1.0" is for the abogado-reviewed text (#258). */
export const AVISO_PRIVACIDAD_VERSION = "0.1-borrador";
export const AVISO_PRIVACIDAD_FECHA_ACTUALIZACION = "07 de agosto de 2026";

/** The ARCO response/execution windows the template's own CAMPOS DE COMBINACIÓN table marks
 *  "Constante — pendiente de verificación legal" (#256): the design already calls for a platform
 *  constant here, just not yet a legally-confirmed one. Values are the template's OWN drafting
 *  note ("Los plazos del régimen anterior (20 y 15 días hábiles) no deben asumirse vigentes sin
 *  confirmación") — the best available placeholder it names, not an invented number — carrying the
 *  same "borrador, pending review" posture as `AVISO_PRIVACIDAD_VERSION`. Bump alongside a real
 *  legal ruling, same discipline as every other version-pinned constant in this file. */
export const AVISO_PLAZO_RESPUESTA_ARCO_DIAS = "20";
export const AVISO_PLAZO_EJECUCION_ARCO_DIAS = "15";

/** The "additional channel" §6 promises alongside the URL+date header (#256): the template's own
 *  CAMPOS table marks this "Alta del gimnasio" (a future per-gym field with no schema/UI home yet
 *  — flagged in the #256 report as follow-up work), so until that exists this is a platform-wide
 *  default rather than an invented per-gym claim.
 *
 *  Review finding 4 (fix round): the FIRST value shipped here was "correo electrónico a la
 *  dirección de contacto que tengamos registrada" — a promise the product cannot keep, since no
 *  change-notification email mechanism exists anywhere in the codebase. Ruling: never email, never
 *  an in-app push — the only channel that is actually true today is publication/signage, so this
 *  now names the template's OWN "aviso visible en la recepción del gimnasio" example instead.
 *  `AVISO_PLAZO_*_ARCO_DIAS` (20/15) ride as-is until #258's abogado review; the in-document
 *  PENDIENTE marker that used to flag that gap to members is stripped from the member-facing render
 *  (review finding 1) — this comment is now the only honesty marker left for it. */
export const AVISO_CANAL_CAMBIOS_ADICIONAL = "aviso visible en la recepción del gimnasio";

/** The aviso integral's stable public URL from a gym's client origin (review finding 5): both call
 *  sites — the client app's own request origin (`apps/client/src/lib/aviso-legal.ts`) and the
 *  admin CUENTA preview's resolved client host (`apps/admin/.../cuenta/page.tsx`) — independently
 *  built `${origin}/legal`. Now the one place that string lives; `origin` already carries its own
 *  protocol (the caller's job — a request's own `x-forwarded-proto`/`host`, or a hardcoded
 *  `https://` for the admin preview's mapped domain), this only appends the route. */
export function urlAvisoIntegralDesde(origin: string): string {
  return `${origin}/legal`;
}

function valoresDesdeIdentidad(identidad: IdentidadLegalGym): Record<string, string | null> {
  return {
    razon_social: identidad.razonSocial,
    nombre_comercial: identidad.nombreComercial,
    domicilio: identidad.domicilio,
    email_arco: identidad.emailArco,
    area_datos_personales: identidad.areaDatosPersonales,
    telefono_contacto: identidad.telefonoContacto,
    email_contacto: identidad.emailContacto,
    url_aviso_integral: identidad.urlAvisoIntegral,
    version_aviso: AVISO_PRIVACIDAD_VERSION,
    fecha_actualizacion: AVISO_PRIVACIDAD_FECHA_ACTUALIZACION,
    plazo_respuesta_arco: AVISO_PLAZO_RESPUESTA_ARCO_DIAS,
    plazo_ejecucion_arco: AVISO_PLAZO_EJECUCION_ARCO_DIAS,
    canal_aviso_cambios: AVISO_CANAL_CAMBIOS_ADICIONAL,
  };
}

/** The two inline "optional paragraph" draft blocks §2 and §4 of the integral template embed —
 *  each a `{{token}}` line immediately followed by an italic "> *[OPCIONAL — …]*" instructional
 *  note aimed at the abogado/owner filling the CUENTA form, never at a member (#256 fix: the
 *  slice boundary in `cuerpoMiembroIntegral` below only ever excluded the TRAILING optional block
 *  — "PÁRRAFO OPCIONAL — ALOJAMIENTO Y ENCARGADOS" — sitting AFTER §6; these two sit INSIDE §2/§4,
 *  so they rode through unstripped, both the raw token and the staff-facing note). Neither field
 *  has a per-gym source anywhere in the product today (no schema column, no admin form), so the
 *  right member-facing behavior is not "raw {{token}}" but NOTHING — the whole two-line block
 *  disappears, the same as any other admin form field left blank. */
const BLOQUES_OPCIONALES_INTEGRAL: readonly string[] = [
  "`{{parrafo_datos_adicionales}}`\n> *[OPCIONAL — incluir solo si el gimnasio recaba datos fuera de la plataforma: videovigilancia, contacto de emergencia, formatos en papel, etc. Redacción a cargo del gimnasio.]*\n\n",
  "`{{parrafo_registro_publicidad}}`\n> *[OPCIONAL — mención del Registro Público para Evitar Publicidad (PROFECO); confirmar con el abogado si procede incluirlo.]*\n\n",
];

/** Drafting SCAFFOLDING inside the member-facing span that must strip unconditionally, independent
 *  of any per-gym field — a different failure mode than the optional blocks above (review finding
 *  1, #256 fix round): (1) §5's PENDIENTE aside, which tells the reader the template's own ARCO
 *  deadlines "must not be assumed in force", published directly beneath the sentence that STATES
 *  those same deadlines as the gym's commitment to the member reading it — a finished aviso was
 *  contradicting its own promise; and (2) the drafting-note parenthetical after §6's
 *  `{{canal_aviso_cambios}}` token, whose examples duplicate whatever the token itself resolves to
 *  — unstripped, a member read the channel once as the real value and again as the template
 *  author's own illustrative example. Neither is legal content the gym authors; both are notes
 *  aimed at whoever fills in the template, never at a member. */
const NOTAS_REDACCION_INTEGRAL: readonly string[] = [
  "> **[PENDIENTE — verificar los plazos ARCO contra el texto vigente de la LFPDPPP reformada antes de publicar. Los plazos del régimen anterior (20 y 15 días hábiles) no deben asumirse vigentes sin confirmación.]**\n\n",
  " *(por ejemplo: aviso visible en la recepción del gimnasio, notificación dentro de la aplicación y/o correo electrónico a la dirección que tengamos registrada)*",
];

function despojarBloques(cuerpo: string, bloques: readonly string[]): string {
  return bloques.reduce((texto, bloque) => {
    if (!texto.includes(bloque)) {
      throw new Error(`AVISO_PRIVACIDAD_INTEGRAL_TEXTO: strip-block marker not found: ${bloque.slice(0, 40)}…`);
    }
    return texto.replace(bloque, "");
  }, cuerpo);
}

/** The member-facing span of the integral aviso: the real "AVISO DE PRIVACIDAD" heading (§1
 *  through §6) — never the file's own "... INTEGRAL — PLANTILLA POR GIMNASIO" title above it.
 *  Excludes the BORRADOR banner, the drafting notes, the trailing optional-paragraph draft block,
 *  the two INLINE optional-paragraph blocks inside §2/§4, the two drafting-note asides inside §5/§6
 *  (`NOTAS_REDACCION_INTEGRAL`, review finding 1, #256 fix round), and the CAMPOS DE COMBINACIÓN
 *  reference table: lawyer/staff-facing scaffolding a member must never see (review finding 2 —
 *  "the owner sees exactly what members will see" means the body span, not the whole draft file).
 *  Pure slicing over the byte-for-byte TEXTO constant; the constant and its drift guard
 *  (tools/guards/aviso-legal-drift.test.ts) stay untouched — only the render path changes. */
function cuerpoMiembroIntegral(texto: string): string {
  const inicio = texto.indexOf("\n# AVISO DE PRIVACIDAD\n");
  const fin = texto.indexOf("\n\n---\n\n## PÁRRAFO OPCIONAL — ALOJAMIENTO Y ENCARGADOS");
  if (inicio === -1 || fin === -1 || fin <= inicio) {
    throw new Error("AVISO_PRIVACIDAD_INTEGRAL_TEXTO: member-facing body markers not found");
  }
  const cuerpo = despojarBloques(texto.slice(inicio + 1, fin).trim(), BLOQUES_OPCIONALES_INTEGRAL);
  return despojarBloques(cuerpo, NOTAS_REDACCION_INTEGRAL);
}

/** The member-facing span of the simplificado aviso: EXACTLY the canonical "Texto" variant — never
 *  the BORRADOR banner, the "Uso." implementation note, the "## Texto (versión breve...)" alternate
 *  wording, the "## Casilla de consentimiento..." block, the "Reglas de implementación" bullets, or
 *  the Campos de combinación table — and (final review round, finding 6) never the trailing
 *  "Puede consultar..." paragraph either, since its own [texto](url) link to the integral aviso is
 *  what that paragraph exists for.
 *
 *  Review finding 2 (fix round): the previous slice spanned ALL THREE of canónica + breve + casilla
 *  in one blob, so a member read two differently-worded copies of the same aviso back to back, plus
 *  a literal "☐ Acepto recibir promociones..." checkbox glyph that did nothing — on the one screen
 *  whose entire purpose is capturing real consent. The casilla is #257's capture slice (a real
 *  `<input type=checkbox>` with a stamp), never a static-text render; the canonical variant is the
 *  default per the template's own "Uso." note (electronic collection at /activar, registro, alta,
 *  reserva forms — no case there is scoped to "espacios reducidos", the ONLY condition the breve
 *  variant's own heading names for itself), so canónica is what ships. The leading "## Texto
 *  (versión canónica)" heading itself is excluded too (finding 3 — no literal `#`/`##` reaches a
 *  member). Same discipline as `cuerpoMiembroIntegral` above.
 *
 *  Review finding 6 (final round): `depurarMarkdown` collapses a `[texto](url)` link to bare text —
 *  correct for every OTHER markdown construct in these templates, but it means the canonical body's
 *  own link to the integral aviso rendered as inert plain text inside `white-space: pre-wrap`, never
 *  clickable (only the caller's brand-neutral FALLBACK text had a real `<Link>`). Rather than teach
 *  `depurarMarkdown` a special case for exactly one link (it would still need to hand a URL to
 *  something that can render an anchor, which a plain string cannot do — this module stays pure, no
 *  JSX), the body now stops BEFORE that paragraph; the calling component renders a real `<Link>` in
 *  its place (`aviso-simplificado-inline.tsx`). Everything up to that point is still the pinned
 *  template prose verbatim — only the link's own paragraph moves out of the string. */
function cuerpoMiembroSimplificado(texto: string): string {
  const marcaInicio = "## Texto (versión canónica)\n\n";
  const inicio = texto.indexOf(marcaInicio);
  const variante = texto.indexOf("## Texto (versión breve");
  const enlace = texto.indexOf("\n>\n> Puede consultar el aviso de privacidad integral");
  if (inicio === -1 || variante === -1 || enlace === -1 || variante <= inicio || enlace <= inicio) {
    throw new Error("AVISO_PRIVACIDAD_SIMPLIFICADO_TEXTO: member-facing body markers not found");
  }
  return texto.slice(inicio + marcaInicio.length, enlace).trim();
}

/** Strip literal Markdown syntax characters from an already-sliced-and-merged aviso body before it
 *  reaches a member (review finding 3, #256 fix round). Every render site — `/legal`,
 *  `aviso-simplificado-inline.tsx`, and the admin CUENTA preview — paints this string as plain
 *  `white-space: pre-wrap` text; none of them parses Markdown, so a member was reading literal `#`/
 *  `##` headings, `**bold**` asterisks, `> ` blockquote markers, and every merge value wrapped in
 *  backticks (`` `Gimnasio Forge, S.A. de C.V.` ``, plazo de `` `20` `` días) as raw punctuation.
 *
 *  This is deliberately NOT a Markdown renderer — the templates use one small, fixed vocabulary
 *  (headings, bold, blockquotes, inline code, one `[text](url)` link shape where text and url are
 *  always identical), so five targeted, order-dependent replacements meet the bar with the least
 *  machinery: collapse the markdown link to its bare text/URL FIRST (its brackets/parens would
 *  otherwise be untouched by the rest), then heading/blockquote LINE markers, then inline `**`/`` ` ``
 *  emphasis last (so a value that happened to end a heading or blockquote line still loses its own
 *  wrapping). Horizontal-whitespace-only (`[ \t]`, never `\s`) after `#`/`>` so a marker at the start
 *  of one line can never eat into a following blank line. */
function depurarMarkdown(texto: string): string {
  return texto
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}[ \t]+/gm, "")
    .replace(/^>[ \t]?/gm, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "");
}

/** The integral aviso, sliced to its member-facing body, merged with the gym's current legal
 *  identity, and stripped of literal Markdown syntax (`depurarMarkdown`, finding 3) — the CUENTA
 *  preview's main tab, and (#256) the client app's `/legal` page (gated on `identidadLegalCompleta`
 *  there; an incomplete identity never reaches this call). Renders unconditionally; unresolved
 *  fields stay visible as a bare `{{token}}` per `mergeAvisoTemplate`'s contract (untouched by the
 *  strip — it only removes Markdown punctuation, never curly braces), and `identidadLegalCompleta`
 *  below is the honest read of whether any remain. */
export function renderAvisoIntegral(identidad: IdentidadLegalGym): string {
  return depurarMarkdown(
    mergeAvisoTemplate(cuerpoMiembroIntegral(AVISO_PRIVACIDAD_INTEGRAL_TEXTO), valoresDesdeIdentidad(identidad)),
  );
}

/** The simplificado aviso, sliced, merged and stripped the same way — the CUENTA preview's second
 *  tab, and (#256) the inline consent-point render on `/registro` and `/activar/contrasena`. */
export function renderAvisoSimplificado(identidad: IdentidadLegalGym): string {
  return depurarMarkdown(
    mergeAvisoTemplate(cuerpoMiembroSimplificado(AVISO_PRIVACIDAD_SIMPLIFICADO_TEXTO), valoresDesdeIdentidad(identidad)),
  );
}

/** Every merge-field token name still unresolved (a literal `{{campo}}`) in an ALREADY-RENDERED
 *  aviso body, de-duplicated, in first-seen order. Pure string scanning — works on any text, so
 *  it's unit-testable on small literal templates without touching the real legal prose. */
export function tokensSinResolver(cuerpoRenderizado: string): string[] {
  const vistos = new Set<string>();
  for (const m of cuerpoRenderizado.matchAll(/\{\{(\w+)\}\}/g)) vistos.add(m[1]);
  return [...vistos];
}

/** Human label for a merge-field token — used only to translate an unresolved `{{token}}` into UI
 *  copy for `camposFaltantesIdentidadLegal`, NOT a completeness list (see that function's own
 *  comment for why one hand-maintained list caused review finding 3 in the first place). An
 *  unrecognized token (a template edit added a field this map doesn't know yet) falls back to the
 *  raw token name, so a gap here can never hide a real unresolved field. */
const ETIQUETAS_CAMPOS: Readonly<Record<string, string>> = {
  razon_social: "razón social",
  nombre_comercial: "nombre comercial",
  domicilio: "domicilio",
  email_arco: "correo de contacto ARCO",
  area_datos_personales: "área o persona responsable de datos personales",
  telefono_contacto: "teléfono de contacto",
  email_contacto: "correo de contacto general",
  fecha_actualizacion: "fecha de la última actualización",
  version_aviso: "versión del aviso",
  url_aviso_integral: "URL pública del aviso",
  canal_aviso_cambios: "canal adicional de aviso de cambios",
  plazo_respuesta_arco: "plazo de respuesta ARCO (pendiente de verificación legal)",
  plazo_ejecucion_arco: "plazo de ejecución ARCO (pendiente de verificación legal)",
  // parrafo_datos_adicionales / parrafo_registro_publicidad carry NO label: despojarBloquesOpcionales
  // strips both from the rendered body before tokensSinResolver ever runs (#256), so neither token can
  // reach this map — a label here would be dead code pretending a case that can't happen still can.
};

/** The human labels of every merge field still unresolved across BOTH rendered aviso bodies,
 *  deduplicated — what the CUENTA empty state and the AJUSTES status line list. Some are
 *  staff-editable right now (the CUENTA form above); others are resolved by the CALLER supplying
 *  platform/gym_contact context (#256's `identidadDesde` params) — a caller that omits one (e.g.
 *  an unmapped client host, or a gym with no gym_contact row yet) still lists it here rather than
 *  silently reading as "listo". Listed either way, undifferentiated, because in both cases the
 *  document is not yet what a member would actually see. Empty exactly when
 *  `identidadLegalCompleta`. */
export function camposFaltantesIdentidadLegal(identidad: IdentidadLegalGym): string[] {
  const tokens = new Set([
    ...tokensSinResolver(renderAvisoIntegral(identidad)),
    ...tokensSinResolver(renderAvisoSimplificado(identidad)),
  ]);
  return [...tokens].map((t) => ETIQUETAS_CAMPOS[t] ?? t);
}

/** Whether the gym's aviso de privacidad is actually ready to show as final: zero unresolved
 *  merge-field tokens across both rendered bodies. Review finding 3: the previous version checked
 *  a hand-maintained 4-field list and claimed "listo" over a document that still had roughly 15
 *  raw `{{tokens}}` in it (contact email, ARCO response windows, the aviso's own future URL, …) —
 *  fields the list had never heard of. This derives the answer from the rendered text itself, so
 *  it cannot go stale that way again: a template edit that adds a new merge field is caught
 *  automatically, with no second list to keep in sync.
 *
 *  #256 closed the last of those gaps (url_aviso_integral, email/telefono_contacto via
 *  gym_contact, the ARCO plazos, canal_aviso_cambios), so this can now genuinely be `true`: a gym
 *  with its CUENTA legal identity filled in (#255) AND a gym_contact row (#53's schema — no admin
 *  editor for it yet, a follow-up gap noted in the #256 report) reaches "listo". */
export function identidadLegalCompleta(identidad: IdentidadLegalGym): boolean {
  return camposFaltantesIdentidadLegal(identidad).length === 0;
}
