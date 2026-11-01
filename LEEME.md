# La Mancha Online

Juego de la mancha para hasta 10 jugadores en tiempo real.

## Qué hay en esta carpeta

| Archivo | Qué es |
|---|---|
| `server.js` | El **servidor**: el árbitro del juego. Mueve a todos, decide quién atrapó a quién y reparte la información. |
| `public/index.html` | El **juego en el navegador**: dibuja el patio, lee tus teclas y muestra la pantalla negra. |
| `package.json` | La "lista de compras": dice qué librerías necesita el proyecto (express y socket.io). |

## Paso 1: Probarlo en tu compu

1. Instalá **Node.js** desde https://nodejs.org (la versión que dice "LTS").
2. Abrí esta carpeta en la terminal:
   - Windows: entrá a la carpeta, hacé clic en la barra de dirección, escribí `cmd` y apretá Enter.
   - Mac: clic derecho en la carpeta → "Nuevo Terminal en la carpeta".
3. Escribí `npm install` y Enter (descarga las librerías, se hace una sola vez).
4. Escribí `npm start` y Enter. Tiene que aparecer: *La mancha está corriendo en http://localhost:3000*
5. Abrí **http://localhost:3000** en el navegador. Abrí 2 o 3 pestañas para jugar contra vos mismo.
6. Para apagarlo: en la terminal, `Ctrl + C`.

## Paso 2: Subirlo a internet para jugar con amigos

1. Creá una cuenta en **https://github.com** y un repositorio nuevo (botón "New"). Subí ahí estos archivos arrastrándolos (**no** subas la carpeta `node_modules` si se creó).
2. Creá una cuenta en **https://render.com** (podés entrar con tu cuenta de GitHub).
3. En Render: **New → Web Service** → elegí tu repositorio.
4. Configuración:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: Free
5. Esperá unos minutos. Render te da un link (algo como `https://mancha-online.onrender.com`). ¡Mandáselo a tus amigos!

> En el plan gratis, si nadie juega por un rato el servidor "se duerme" y la primera vez que alguien entra tarda un poco en arrancar.

## Ideas para cambiar

En `server.js`, sección 1, están las reglas. Probá cambiar:
- `COMPLETAR_CON_BOTS_HASTA`: si hay pocas personas, se completa con bots hasta este número (0 = sin bots). Cuando entra alguien de verdad, sale un bot.
- `VELOCIDAD_BOTS`: qué tan rápidos son los bots (1 = igual que vos).
- `VISION_MANCHA`: hasta dónde ve la mancha (más chico = más difícil para la mancha).
- `ESPERA_SILBIDO_MS`: cada cuánto se puede silbar.
- `VELOCIDAD`: qué tan rápido se mueven todos.
- `VENTAJA_MANCHA`: cuánto más rápido va la mancha.
- `CONGELADO_MS`: cuánto dura la pantalla negra.
- `OBSTACULOS`: mové o agregá cosas sólidas del patio (rectángulos o círculos).
- `ESCONDITES`: mové o agregá lugares para esconderse.
- `DISTANCIA_REVISAR`, `REVELADO_MS`, `ESPERA_REVISAR_MS`: cómo funciona la linterna de la mancha.
