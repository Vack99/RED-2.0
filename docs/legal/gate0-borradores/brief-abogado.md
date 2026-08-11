# BRIEF PARA ABOGADO — PROTECCIÓN DE DATOS PERSONALES (iBookit)

> **BORRADOR — PENDIENTE DE REVISIÓN POR ABOGADO MEXICANO. ESTE DOCUMENTO NO CONSTITUYE ASESORÍA LEGAL.**

## Contexto (2 líneas)

iBookit es un SaaS multi-inquilino de gestión de gimnasios (México): cada gimnasio es **responsable** de los datos de sus miembros y iBookit es **encargada**; iBookit se aloja en Supabase, Inc. sobre AWS (`{{region_supabase}}`) y **no** trata datos biométricos ni sensibles.
El objetivo es escalar a ~3,000 gimnasios con **trabajo legal marginal cero por gimnasio**: todo debe ejecutarse en línea —anexo de encargado aceptado por *click-wrap* al primer acceso y aviso de privacidad generado por gimnasio— sin papel ni firma autógrafa por cliente.

## Documentos adjuntos para revisión y corrección

1. `anexo-tratamiento-datos.md` — Acuerdo de Tratamiento de Datos Personales (anexo de encargado), redactado para aceptarse por clic hoy e incorporarse por referencia al futuro contrato de servicios.
2. `aviso-privacidad-integral-template.md` — plantilla del aviso integral por gimnasio (los seis elementos del art. 15).
3. `aviso-privacidad-simplificado-template.md` — modalidad simplificada del art. 16-II para los formularios electrónicos.

Base normativa utilizada: LFPDPPP reformada (DOF 20-mar-2025, en vigor 21-mar-2025), arts. 2 (fracs. XII y XX), 7, 8, 15, 16, 19, 35 y 53. **No se citó ningún otro artículo por no haberse verificado contra texto primario.**

---

## Preguntas

### 1. ¿Sobrevive el Reglamento de la LFPDPPP de 2011?

¿El Reglamento de la LFPDPPP publicado en el DOF el 21-dic-2011 —y los Lineamientos del Aviso de Privacidad— siguen aplicándose **en lo que no se oponga** a la Ley reformada, mientras no se publique el Reglamento de la nueva Ley? En particular: **¿subsiste la obligación de formalizar la relación responsable–encargado mediante contrato escrito (arts. 49 a 51 del Reglamento de 2011)?**

*Por qué importa:* la Ley reformada no impone en su texto ninguna obligación de forma escrita para el encargo; los transitorios son silentes sobre la continuidad del Reglamento anterior. Si la obligación subsiste, hay que determinar si la aceptación electrónica la satisface (ver encargo final).

### 2. Subencargo transfronterizo: ¿Supabase/AWS es "encargado" o "tercero"?

El art. 2-XX excluye de la definición de *transferencia* la comunicación hecha "a la persona encargada del tratamiento", expresamente "dentro o fuera del territorio mexicano". La cadena real es **gimnasio (responsable) → iBookit (encargada) → Supabase, Inc. (subencargada) → AWS (infraestructura)**.

**¿La exclusión del art. 2-XX cubre a los subencargados de iBookit, o Supabase debe reputarse "tercero" en términos del art. 35 —convirtiendo el alojamiento en una transferencia internacional con sus consecuencias de consentimiento y divulgación?** ¿Cambia la respuesta si la región de AWS es México (Querétaro) en lugar de Estados Unidos?

### 3. ¿Debe el aviso de privacidad divulgar transferencias y encargados?

El art. 15 enumera seis elementos obligatorios del aviso y **no incluye** la divulgación de transferencias; Greenberg Traurig sostiene que la reforma **eliminó** esa obligación. En sentido contrario circulan referencias a los arts. 59–60, que corresponden a la LGPDPPSO (ley del sector público, inaplicable a un SaaS privado).

**¿La Ley vigente exige divulgar transferencias y/o encargados en el aviso de privacidad?** El párrafo correspondiente está marcado como **OPCIONAL** en la plantilla integral, a la espera de esta opinión.

### 4. Vigilancia del Reglamento pendiente

El Reglamento de la Ley reformada está vencido desde ~jun-2025 (plazo transitorio de 90 días naturales) y no se ha publicado; la Secretaría Anticorrupción y Buen Gobierno anunció en ene-2026 el inicio de un proceso de actualización.

**¿Qué obligaciones de forma podría razonablemente añadir ese Reglamento al esquema de aceptación por clic, y qué debería dejarse previsto desde ahora para no rehacer 3,000 aceptaciones?** (p. ej. contenido mínimo del contrato de encargo, formato de la constancia, registro ante autoridad, conservación probatoria).

---

## Encargos adicionales

- **Revisar y corregir los tres borradores adjuntos**, en particular: el reparto de roles, la cláusula de subencargados con autorización general y aviso de cambio, la prohibición contractual de introducir datos sensibles/biométricos, y la cláusula de responsabilidad frente a la solidaridad del art. 53.
- **Verificar contra texto primario** (Cámara de Diputados / DOF) los artículos **89 bis, 90, 93 y 97 del Código de Comercio**, y **confirmar la validez del esquema de aceptación electrónica en relación B2B**: casilla de aceptación expresa desde cuenta autenticada, con conservación de identidad de la persona usuaria, fecha y hora, IP, versión del documento y huella SHA-256 del texto íntegro, accesible para ulterior consulta. ¿Basta la cláusula pactada de equivalencia ("la aceptación mediante clic surtirá los mismos efectos que la firma autógrafa") o conviene una constancia de conservación NOM-151-SCFI-2016 emitida por un PSC acreditado?
- **Confirmar los plazos ARCO** aplicables bajo la Ley vigente (respuesta y ejecución), marcados como pendientes en la plantilla integral.
- **Confirmar si los datos biométricos están enumerados como datos personales sensibles** en la definición del art. 2 de la Ley vigente (las fuentes secundarias se contradicen). iBookit no los trata y los prohíbe contractualmente; la respuesta solo afecta la redacción de la cláusula.
