# Instalar Fer Agent

## En un Mac

1. Descarga el instalador para Mac (un archivo .zip que contiene Fer-Agent-mac.dmg). Sirve para cualquier Mac, con chip Apple o Intel.
2. Doble clic en el .zip y después en el .dmg.
3. Arrastra «Fer Agent» a la carpeta Aplicaciones. Si ya tenías una versión, elige «Reemplazar». No pierdes nada: tu edificio y tus claves se guardan aparte.
4. Abre Fer Agent desde Aplicaciones.

### Si el Mac dice que no puede verificar la aplicación

Mientras la aplicación no lleve la firma de Apple, la primera vez el Mac la bloquea. Dos formas de abrirla:
- **Sin Terminal**: abre Ajustes del Sistema → Privacidad y seguridad. Abajo verás «Fer Agent se ha bloqueado»: pulsa «Abrir igualmente».
- **Con Terminal** (si dice que la aplicación «está dañada»): abre Terminal, pega esto y pulsa Intro:
  xattr -dr com.apple.quarantine "/Applications/Fer Agent.app"
  Después ábrela normalmente.

### Permisos del Mac para «Tu ordenador como tú»

La primera vez que un agente use tu ordenador, el Mac pedirá dos permisos para Fer Agent: **Accesibilidad** (pulsar y escribir) y **Grabación de pantalla** (ver la pantalla). Se dan en Ajustes del Sistema → Privacidad y seguridad. Después, cierra y vuelve a abrir Fer Agent.

Mientras la app no esté firmada por Apple, el Mac trata cada versión nueva como una app distinta: el interruptor de Accesibilidad que encendiste era de la versión anterior y el aviso vuelve a salir. Arreglo: Ajustes del Sistema → Privacidad y seguridad → Accesibilidad → selecciona Fer Agent y pulsa «−»; pulsa «+», elige Fer Agent en Aplicaciones y enciéndelo; cierra Fer Agent del todo (Cmd+Q) y ábrelo otra vez.

Hay dos «autorizar» distintos: el de la **bandeja de Fer Agent** (tu permiso para que el agente haga algo concreto) y el de **Accesibilidad del Mac** (que el Mac deje a Fer Agent usar el teclado y el ratón). Abrir una app o pedirle algo con una orden directa (por ejemplo, crear una nota en Notas) no necesita Accesibilidad; pulsar y escribir, sí.

## En Windows

1. Descarga el instalador para Windows y ábrelo.
2. Si sale «Windows protegió tu PC»: pulsa «Más información» → «Ejecutar de todas formas».

## Actualizaciones

Desde la 9.4 la app busca versión nueva al abrirse y cada 6 horas. Si la hay, la descarga sola y se instala al cerrar la app (el sistema te avisa cuando está lista). En el Mac esto funciona cuando la app está firmada por Apple; hasta entonces, la versión nueva se instala a mano: descargas el instalador y arrastras Fer Agent a Aplicaciones.

## Dónde se guardan tus datos

- Mac: ~/Library/Application Support/Fer Agent/data
- Windows: %APPDATA%\Fer Agent\data

Ahí están tu edificio, tus claves (solo en este ordenador), los documentos que añades a los agentes, tus habilidades y el registro fer-agent.log, por si algo falla.

## Cerrar la aplicación

- En el Mac, cerrar la ventana no apaga el edificio: sigue en el Dock. Para salir del todo: Cmd+Q.
- En Windows, cerrar la ventana la cierra.

## Necesitas Google Chrome

Para «Internet como tú», los agentes usan el Google Chrome que tengas instalado, con su propio perfil (el Chrome de los agentes). Si no tienes Chrome, instálalo desde google.com/chrome.
