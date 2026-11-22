# Telegram y el móvil

## El Telegram propio de cada agente

Cada agente puede tener su propio bot de Telegram: le hablas desde el móvil como a una persona y sus informes te llegan ahí.
1. En Telegram, habla con @BotFather, escribe /newbot y sigue los pasos: te da un token.
2. En la ficha del agente → Capacidades → «Su propio Telegram»: pega el token y «Conectar».
3. Escribe cualquier cosa a tu bot. El primer chat privado que le escribe queda como el tuyo; nadie más puede hablarle.
El token se guarda solo en tu ordenador. Funciona mientras la aplicación (o Fer Casa) esté abierta.

## El Telegram del edificio (aprobaciones)

Las aprobaciones (Enviar / Corregir / Rechazar) también pueden llegarte por Telegram, con el bot del edificio. Se configura en **Ajustes → Telegram: la bandeja en tu móvil** (en la app o en Fer Casa):
1. En Telegram, habla con @BotFather, envíale /newbot y sigue los pasos. Te da un token.
2. Pega el token en Ajustes y pulsa «Conectar».
3. Pulsa «Abrir @tu_bot» (o búscalo en Telegram) y envíale /start. El primer chat privado que le escriba queda como el tuyo; los demás no le mandan nada.

En Ajustes verás «Conectado» cuando llegue tu /start. Para quitarlo: «Desconectar». Usa un bot distinto del de cualquier agente. Órdenes: /bandeja (o /inbox: lo que espera tu sí), /pausa (para todo lo automático), /marcha (lo vuelve a poner). También sigue funcionando desde la Terminal: node fer-home.mjs telegram.

## Desde el móvil, sin Telegram

- En tu red de casa, con Fer Casa: abre su dirección en el navegador del móvil y pon el PIN.
- La web también funciona en el móvil, pero sin manos.
