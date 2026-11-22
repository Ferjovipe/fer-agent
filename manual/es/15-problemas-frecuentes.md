# Problemas frecuentes

**El Mac no deja abrir la aplicación.** Ajustes del Sistema → Privacidad y seguridad → «Abrir igualmente». Si dice que está dañada: en Terminal, xattr -dr com.apple.quarantine "/Applications/Fer Agent.app".

**El agente no hace nada solo.** Mira si el edificio está en pausa (el corazón, arriba) y si el agente está en «Solo cuando se lo piden» o apagado (Trabajo → Cuándo trabaja).

**Dice que no tiene saldo o que la clave no vale.** Revisa la clave de OpenRouter en Ajustes y el saldo en openrouter.ai/credits.

**Un cerebro gratis falla mucho.** Los gratis se saturan a menudo («demasiadas peticiones»): el agente lo reintenta solo en dos minutos. Si falla siempre, elige otro o uno barato de pago.

**El agente no puede navegar ni usar sus capacidades.** Su cerebro tiene que «usar herramientas»: búscalo con el filtro «Usa herramientas». Y la capacidad tiene que estar marcada en su ficha.

**No entra en mi correo o en mi web.** Abre Ajustes → «Tus webs, en el Chrome de los agentes» y entra tú una vez en esa web.

**No puede controlar mis apps en el Mac.** Dale a Fer Agent los permisos de Accesibilidad y Grabación de pantalla (Ajustes del Sistema → Privacidad y seguridad) y vuelve a abrir la aplicación.

**Ya di el permiso de Accesibilidad y el aviso sigue saliendo.** Pasa al instalar una versión nueva mientras la app no está firmada por Apple: para el Mac es otra app. En Accesibilidad, quita Fer Agent con «−», añádelo otra vez con «+» desde Aplicaciones, enciéndelo y vuelve a abrir Fer Agent (Cmd+Q y abrir). Pulsar «Denegar» en el aviso no lo arregla: pulsa «Abrir Ajustes del Sistema».

**No encuentra algo en sus documentos.** Mira en su ficha que el documento aparezca como leído (un PDF escaneado no tiene texto). Pregunta con palabras que estén en el documento.

**Se ha gastado más de lo que pensaba.** Revisa los topes en Ajustes y la Actividad: cada gasto dice quién, en qué y cuánto.

**Algo falla y no sé qué.** El registro está en la carpeta de datos (fer-agent.log). Mac: ~/Library/Application Support/Fer Agent/data. Windows: %APPDATA%\Fer Agent\data.
