# AVISO DE PRIVACIDAD SIMPLIFICADO — PLANTILLA POR GIMNASIO

> **BORRADOR — PENDIENTE DE REVISIÓN POR ABOGADO MEXICANO. ESTE DOCUMENTO NO CONSTITUYE ASESORÍA LEGAL.**

**Uso.** Modalidad simplificada prevista en el artículo 16, fracción II de la LFPDPPP, para cuando los datos personales se obtienen **por medios electrónicos**. Se renderiza **en línea, dentro del propio formulario**, antes del botón de envío, en los puntos de recolección de la Plataforma: activación de cuenta (`/activar`), registro de la persona miembro, formularios de alta y reserva. Debe **enlazar siempre** al aviso de privacidad integral.

---

## Texto (versión canónica)

> **Aviso de privacidad**
>
> `{{razon_social}}`, con domicilio en `{{domicilio}}`, es la responsable del tratamiento de sus datos personales. Utilizamos sus datos de identificación, contacto, asistencia y compra para registrarlo como persona cliente, administrar su membresía y el saldo de su paquete, controlar su acceso y asistencia, gestionar sus reservas de clase, procesar sus pagos y emitir su recibo, administrar su cuenta en la aplicación y enviarle comunicaciones operativas sobre su membresía. **No tratamos datos personales sensibles ni datos biométricos.**
>
> Puede consultar el aviso de privacidad integral, que incluye las finalidades que requieren su consentimiento y los medios para ejercer sus derechos ARCO, en [`{{url_aviso_integral}}`](`{{url_aviso_integral}}`).

## Texto (versión breve, para espacios reducidos)

> `{{razon_social}}` (`{{nombre_comercial}}`), con domicilio en `{{domicilio}}`, es responsable del tratamiento de sus datos personales y los utiliza para administrar su membresía, asistencia, reservas y pagos. No tratamos datos sensibles ni biométricos. Consulte el [aviso de privacidad integral](`{{url_aviso_integral}}`).

## Casilla de consentimiento para finalidades secundarias (opcional en el formulario)

> ☐ Acepto recibir promociones, novedades e invitaciones a eventos de `{{nombre_comercial}}` por WhatsApp o correo electrónico.

**Reglas de implementación:**
- La casilla se presenta **desmarcada por omisión** y es **opcional**: no puede condicionar el envío del formulario ni el alta.
- Su estado (aceptada / no aceptada), fecha, hora y versión del aviso se almacenan junto con el registro de la persona cliente.
- El aviso simplificado se muestra **siempre**; la casilla solo cuando el gimnasio tenga activadas finalidades secundarias.

## Campos de combinación

| Campo | Origen |
|---|---|
| `{{razon_social}}` | Alta del gimnasio |
| `{{nombre_comercial}}` | Fila `gym` / perfil |
| `{{domicilio}}` | Alta del gimnasio |
| `{{url_aviso_integral}}` | Generado por RED — URL estable por inquilino |
