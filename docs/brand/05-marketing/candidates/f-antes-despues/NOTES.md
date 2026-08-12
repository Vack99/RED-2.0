# Candidato F — "Antes / después"

## Intención (3 líneas)
El fold cuenta la historia sin leer: a la izquierda los artefactos del caos real (cuaderno rayado con nombres tachados, Excel apretado con "Mariana" triplicada, burbujas verdes de WhatsApp), a la derecha un solo panel de agenda en calma con la reserva en ciruela. La misma clienta —Mariana— aparece tachada en el cuaderno, duplicada en el Excel, preguntando en WhatsApp, y resuelta en el panel: reservada, pagada, recibo enviado. El H1 cae debajo como pie de foto de lo que ya sentiste.

## Qué mirar al juzgar
- El primer segundo: ¿el ojo viaja caos → orden sin leer nada? Las etiquetas "antes/después" son refuerzo, no la historia.
- El hilo de Mariana entre los cuatro artefactos (cuaderno → Excel → WhatsApp → panel).
- La entrada orquestada: caos cae primero (escalonado, 20–260 ms), el panel sube al final (320–770 ms). Total < 800 ms. `prefers-reduced-motion` la elimina y fija "negocio" en el H1.
- En móvil la composición apila: pila de caos arriba, el panel la cubre parcialmente ("voy tarde" queda medio sepultada bajo el panel — intencional).
- El giro rotativo del H1 en ciruela conecta el titular con el color del "después".

## Medidas (verificadas en Chromium)
- Fold 1280×800: micro-línea de de-risk termina en y=700 (CTA en y=670) → pitch completo + visual dentro del fold con 100 px de aire.
- Fold 375×667: CTA termina en y=611, micro en y=639 → todo dentro con 28 px de aire. Panel termina exactamente en el borde del stage (y=368), H1 arranca en y=378.
- Altura total de página @1280: 1845 px = 2.31 viewports (límite 2.5).
- Overflow horizontal: ninguno en 320 / 375 / 768 / 1280 / 1440 / 1920 (scrollWidth == clientWidth en todos).
- 320 px: stage crece a 342 px porque la fila reservada envuelve más alto; el panel queda dentro y el H1 libre.
- Reduced motion: CSS anula todas las animaciones (estado final instantáneo); JS verificado con shim de matchMedia → el giro queda estático en "negocio".

## Decisiones / pendientes
- Colores de depicción fuera de la paleta de marca, a propósito: margen rojo tenue del cuaderno y amarillo Excel del duplicado. Son señas del objeto retratado (sin ellas el cuaderno es "una tarjeta" y el duplicado no se ve). Si se juzga que violan la regla, se pueden bajar a gris — pierde lectura instantánea.
- Caveat (Google Fonts) para el garabato del cuaderno; Arial del sistema para el Excel — depicción, no marca.
- `WHATSAPP = ""` en la constante del script → todos los CTA caen a mailto:hola@ibooki.lat con asunto prellenado. Poner el número con lada activa wa.me con mensaje prellenado.
- El rotador de giros reusa la lista de 10 nichos de la página vieja; 2.6 s por palabra, fundido de 450 ms.
- Nota de verificación: el resize del preview no respondía (factor de escala 1.44 del panel), así que las medidas se tomaron dentro de iframes del tamaño exacto en CSS px, con animaciones desactivadas para medir el estado asentado. Servido en localhost:8741 (puerto propio de este agente).
