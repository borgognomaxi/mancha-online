// ==========================================================
// SERVIDOR DE LA MANCHA ONLINE
// Este programa corre en una compu en internet (el "servidor").
// Todos los jugadores se conectan acá. El servidor es el árbitro:
// decide dónde está cada uno y quién atrapó a quién.
// Así nadie puede hacer trampa cambiando su propio juego.
// ==========================================================

const path = require("path");
const express = require("express");      // para mandar la página del juego
const http = require("http");
const { Server } = require("socket.io"); // para la comunicación en tiempo real

const app = express();
const servidorWeb = http.createServer(app);
const io = new Server(servidorWeb);

// Cuando alguien entra al link, le mandamos los archivos de la carpeta "public"
app.use(express.static(path.join(__dirname, "public")));

// ----------------------------------------------------------
// 1. REGLAS DEL JUEGO (cambiá estos números para probar)
// ----------------------------------------------------------
const MAPA = { ancho: 1800, alto: 1100 };
const RADIO = 22;                 // tamaño de cada jugador
const VELOCIDAD = 230;            // píxeles por segundo
const VENTAJA_MANCHA = 1.08;      // la mancha va un 8% más rápido
const MAX_JUGADORES = 10;
const TICKS_POR_SEGUNDO = 30;     // cuántas veces por segundo se actualiza el juego
const CONGELADO_MS = 2000;        // la nueva mancha queda quieta 2 segundos (pantalla negra)
const INMUNE_MS = 3000;           // el que te pasó la mancha no puede ser tocado por 3 segundos

const VISION_MANCHA = 260;        // la mancha solo ve a esta distancia (en píxeles)
const ESPERA_SILBIDO_MS = 4000;   // cada jugador puede silbar una vez cada 4 segundos

// Bots: si hay pocas personas, se completa con bots hasta llegar a este número.
// Poné 0 para jugar sin bots.
const COMPLETAR_CON_BOTS_HASTA = 5;
const VELOCIDAD_BOTS = 0.92;      // los bots van un poco más lento que vos (1 = igual de rápido)
const NOMBRES_BOTS = ["Bot Lola", "Bot Tito", "Bot Pipa", "Bot Toto", "Bot Nina",
                      "Bot Coco", "Bot Lulú", "Bot Rulo", "Bot Mora"];

// Obstáculos del mapa: es un patio de recreo con canteros, bancos y juegos
const OBSTACULOS = [
  { x: 300,  y: 200, w: 220, h: 60,  tipo: "banco" },
  { x: 1280, y: 200, w: 220, h: 60,  tipo: "banco" },
  { x: 300,  y: 840, w: 220, h: 60,  tipo: "banco" },
  { x: 1280, y: 840, w: 220, h: 60,  tipo: "banco" },
  { x: 800,  y: 450, w: 200, h: 200, tipo: "fuente" },
  { x: 150,  y: 450, w: 70,  h: 200, tipo: "cantero" },
  { x: 1580, y: 450, w: 70,  h: 200, tipo: "cantero" },
  { x: 560,  y: 420, w: 60,  h: 260, tipo: "cantero" },
  { x: 1180, y: 420, w: 60,  h: 260, tipo: "cantero" },
  { x: 820,  y: 120, w: 160, h: 90,  tipo: "tobogan" },
  { x: 820,  y: 890, w: 160, h: 90,  tipo: "hamacas" }
];

const COLORES = ["#ffb703", "#8ecae6", "#90be6d", "#f28482", "#cdb4db",
                 "#f9c74f", "#43aa8b", "#f8961e", "#4cc9f0", "#b5e48c"];

// ----------------------------------------------------------
// 2. ESTADO DEL JUEGO: la "memoria" del servidor
// ----------------------------------------------------------
const jugadores = {};   // un objeto por jugador, guardado por su id
let manchaId = null;    // id del jugador que es la mancha

// ----------------------------------------------------------
// 3. FUNCIONES DE AYUDA
// ----------------------------------------------------------

// ¿Un círculo en (x, y) se superpone con algún obstáculo?
function chocaConObstaculo(x, y) {
  return OBSTACULOS.some(o => {
    // Buscamos el punto del rectángulo más cercano al centro del círculo
    const cercanoX = Math.max(o.x, Math.min(x, o.x + o.w));
    const cercanoY = Math.max(o.y, Math.min(y, o.y + o.h));
    const dx = x - cercanoX, dy = y - cercanoY;
    return dx * dx + dy * dy < RADIO * RADIO;
  });
}

// Busca un lugar al azar donde no haya obstáculos ni gente cerca
function lugarLibre() {
  for (let intento = 0; intento < 200; intento++) {
    const x = RADIO + Math.random() * (MAPA.ancho - RADIO * 2);
    const y = RADIO + Math.random() * (MAPA.alto - RADIO * 2);
    const lejosDeTodos = Object.values(jugadores).every(j => Math.hypot(j.x - x, j.y - y) > 200);
    if (!chocaConObstaculo(x, y) && lejosDeTodos) return { x, y };
  }
  return { x: 60, y: 60 };
}

function colorLibre() {
  const usados = Object.values(jugadores).map(j => j.color);
  return COLORES.find(c => !usados.includes(c)) || COLORES[0];
}

// Convierte a un jugador en la mancha
function hacerMancha(nuevoId, anteriorId) {
  const ahora = Date.now();
  manchaId = nuevoId;
  const nuevo = jugadores[nuevoId];
  if (!nuevo) return;
  nuevo.congeladoHasta = ahora + CONGELADO_MS;
  if (anteriorId && jugadores[anteriorId]) {
    jugadores[anteriorId].inmuneHasta = ahora + INMUNE_MS;
  }
  io.to(nuevoId).emit("sosLaMancha", { segundos: CONGELADO_MS / 1000 });
  io.emit("aviso", anteriorId && jugadores[anteriorId]
    ? `${jugadores[anteriorId].nombre} atrapó a ${nuevo.nombre}`
    : `${nuevo.nombre} es la mancha`);
}

// ----------------------------------------------------------
// 3b. LOS BOTS
// Un bot es un jugador más dentro del servidor, pero en vez de
// recibir la dirección de un teclado, la decide una función ("su cerebro").
// ----------------------------------------------------------
let contadorBots = 0;

function agregarBot() {
  const id = "bot-" + (++contadorBots);
  const usados = Object.values(jugadores).map(j => j.nombre);
  const nombre = NOMBRES_BOTS.find(n => !usados.includes(n)) || "Bot " + contadorBots;
  const lugar = lugarLibre();
  jugadores[id] = {
    id, nombre, color: colorLibre(), esBot: true,
    x: lugar.x, y: lugar.y, dir: { x: 0, y: 0 },
    congeladoHasta: 0, inmuneHasta: 0, segundosMancha: 0, ultimoSilbido: 0,
    // la "memoria" del bot para tomar decisiones
    cerebro: { ultimoX: lugar.x, ultimoY: lugar.y, trabado: 0, esquivarHasta: 0, esquivarDir: { x: 0, y: 0 }, paseoHasta: 0, paseoDir: { x: 0, y: 0 } }
  };
  if (!manchaId) hacerMancha(id, null);
}

function sacarBot() {
  // Preferimos sacar un bot que no sea la mancha
  const bots = Object.values(jugadores).filter(j => j.esBot);
  const bot = bots.find(j => j.id !== manchaId) || bots[0];
  if (!bot) return;
  delete jugadores[bot.id];
  if (manchaId === bot.id) elegirManchaAlAzar();
}

// Deja la cantidad justa de bots según cuántas personas hay
function ajustarBots() {
  const humanos = Object.values(jugadores).filter(j => !j.esBot).length;
  const bots = () => Object.values(jugadores).filter(j => j.esBot).length;
  const cuantosQuiero = humanos === 0 ? 0 : Math.max(0, Math.min(COMPLETAR_CON_BOTS_HASTA, MAX_JUGADORES) - humanos);
  while (bots() < cuantosQuiero) agregarBot();
  while (bots() > cuantosQuiero) sacarBot();
}

function direccionHacia(dx, dy) {
  const largo = Math.hypot(dx, dy);
  return largo === 0 ? { x: 0, y: 0 } : { x: dx / largo, y: dy / largo };
}
function direccionAlAzar() {
  const angulo = Math.random() * Math.PI * 2;
  return { x: Math.cos(angulo), y: Math.sin(angulo) };
}

// El cerebro del bot: se ejecuta 30 veces por segundo y decide hacia dónde ir
function pensarBot(bot, ahora) {
  const c = bot.cerebro;

  // ¿Quedó trabado contra un obstáculo? Si no se movió en un rato, prueba otra dirección
  const seMovio = Math.hypot(bot.x - c.ultimoX, bot.y - c.ultimoY) > 1;
  c.ultimoX = bot.x; c.ultimoY = bot.y;
  const quiereMoverse = bot.dir.x !== 0 || bot.dir.y !== 0;
  c.trabado = (!seMovio && quiereMoverse && bot.congeladoHasta <= ahora) ? c.trabado + 1 : 0;
  if (c.trabado > 6) {
    c.esquivarHasta = ahora + 600;
    c.esquivarDir = direccionAlAzar();
    c.trabado = 0;
  }
  if (c.esquivarHasta > ahora) { bot.dir = c.esquivarDir; return; }

  const mancha = jugadores[manchaId];

  if (bot.id === manchaId) {
    // SOY LA MANCHA: persigo al más cercano que se pueda tocar
    let objetivo = null, menorDistancia = Infinity;
    for (const j of Object.values(jugadores)) {
      if (j.id === bot.id || j.inmuneHasta > ahora) continue;
      const d = Math.hypot(j.x - bot.x, j.y - bot.y);
      if (d < menorDistancia) { menorDistancia = d; objetivo = j; }
    }
    bot.dir = objetivo ? direccionHacia(objetivo.x - bot.x, objetivo.y - bot.y) : { x: 0, y: 0 };
  } else if (mancha && Math.hypot(mancha.x - bot.x, mancha.y - bot.y) > 500 && Math.random() < 0.005) {
    // ESTOY LEJOS Y TRANQUI: a veces silbo para burlarme de la mancha
    silbar(bot);
  } else if (mancha && Math.hypot(mancha.x - bot.x, mancha.y - bot.y) < 380) {
    // LA MANCHA ESTÁ CERCA: escapo para el lado contrario...
    let x = bot.x - mancha.x, y = bot.y - mancha.y;
    // ...pero sin quedar acorralado contra las paredes
    if (bot.x < 120) x += 200; if (bot.x > MAPA.ancho - 120) x -= 200;
    if (bot.y < 120) y += 200; if (bot.y > MAPA.alto - 120) y -= 200;
    bot.dir = direccionHacia(x, y);
  } else {
    // TRANQUI: paseo y cada tanto cambio de rumbo o me quedo quieto
    if (ahora > c.paseoHasta) {
      c.paseoDir = Math.random() < 0.25 ? { x: 0, y: 0 } : direccionAlAzar();
      c.paseoHasta = ahora + 1000 + Math.random() * 2000;
    }
    bot.dir = c.paseoDir;
  }
}

// ----------------------------------------------------------
// 3c. SILBAR
// Le avisamos a todos dónde sonó el silbido. Así la mancha,
// aunque no vea, sabe más o menos dónde hay alguien.
// ----------------------------------------------------------
function silbar(j) {
  const ahora = Date.now();
  if (!j || j.id === manchaId) return;                       // la mancha no silba
  if (ahora - j.ultimoSilbido < ESPERA_SILBIDO_MS) return;   // hay que esperar entre silbidos
  j.ultimoSilbido = ahora;
  io.emit("silbido", { id: j.id, nombre: j.nombre, x: Math.round(j.x), y: Math.round(j.y) });
}

function elegirManchaAlAzar() {
  const ids = Object.keys(jugadores);
  if (ids.length === 0) { manchaId = null; return; }
  hacerMancha(ids[Math.floor(Math.random() * ids.length)], null);
}

// ----------------------------------------------------------
// 4. CUANDO SE CONECTA UN JUGADOR
// "socket" es la conexión con ESE jugador en particular.
// ----------------------------------------------------------
io.on("connection", socket => {

  socket.on("entrar", nombreRecibido => {
    if (jugadores[socket.id]) return;                     // ya estaba adentro
    // Los bots no cuentan para el límite: si entra una persona, sale un bot
    const humanos = Object.values(jugadores).filter(j => !j.esBot).length;
    if (humanos >= MAX_JUGADORES) {
      socket.emit("lleno", MAX_JUGADORES);
      return;
    }
    // Nunca confiamos en lo que manda el jugador: lo limpiamos
    const nombre = String(nombreRecibido || "").trim().slice(0, 14) || "Jugador";
    const lugar = lugarLibre();

    jugadores[socket.id] = {
      id: socket.id, nombre, color: colorLibre(),
      x: lugar.x, y: lugar.y,
      dir: { x: 0, y: 0 },
      congeladoHasta: 0, inmuneHasta: 0,
      segundosMancha: 0, ultimoSilbido: 0
    };

    socket.emit("bienvenida", { id: socket.id, mapa: MAPA, obstaculos: OBSTACULOS, radio: RADIO });
    io.emit("aviso", `${nombre} entró al juego`);

    if (!manchaId) hacerMancha(socket.id, null);
    ajustarBots();
  });

  // El jugador nos dice hacia dónde quiere ir (no su posición: eso lo calcula el servidor)
  socket.on("mover", dir => {
    const j = jugadores[socket.id];
    if (!j || !dir) return;
    let x = Number(dir.x) || 0, y = Number(dir.y) || 0;
    const largo = Math.hypot(x, y);
    if (largo > 1) { x /= largo; y /= largo; }  // nadie puede ir más rápido de lo permitido
    j.dir = { x, y };
  });

  socket.on("silbar", () => silbar(jugadores[socket.id]));

  socket.on("disconnect", () => {
    const j = jugadores[socket.id];
    if (!j) return;
    delete jugadores[socket.id];
    io.emit("aviso", `${j.nombre} se fue`);
    if (manchaId === socket.id) elegirManchaAlAzar();
    ajustarBots();
  });
});

// ----------------------------------------------------------
// 5. EL LOOP DEL JUEGO: corre 30 veces por segundo
// Mueve a todos, revisa si la mancha tocó a alguien y le
// manda a todos la foto actualizada del juego.
// ----------------------------------------------------------
setInterval(() => {
  const ahora = Date.now();
  const dt = 1 / TICKS_POR_SEGUNDO;

  // Mover a cada jugador
  for (const j of Object.values(jugadores)) {
    if (j.esBot) pensarBot(j, ahora);
    if (j.congeladoHasta > ahora) continue;
    const vel = VELOCIDAD * (j.id === manchaId ? VENTAJA_MANCHA : 1) * (j.esBot ? VELOCIDAD_BOTS : 1);

    // Movemos primero en X y después en Y por separado:
    // así, si chocás de costado contra una pared, te deslizás en vez de frenar en seco
    const nuevoX = Math.max(RADIO, Math.min(MAPA.ancho - RADIO, j.x + j.dir.x * vel * dt));
    if (!chocaConObstaculo(nuevoX, j.y)) j.x = nuevoX;
    const nuevoY = Math.max(RADIO, Math.min(MAPA.alto - RADIO, j.y + j.dir.y * vel * dt));
    if (!chocaConObstaculo(j.x, nuevoY)) j.y = nuevoY;
  }

  // ¿La mancha tocó a alguien?
  const mancha = jugadores[manchaId];
  if (mancha) {
    mancha.segundosMancha += dt;
    if (mancha.congeladoHasta <= ahora) {
      for (const j of Object.values(jugadores)) {
        if (j.id === manchaId || j.inmuneHasta > ahora) continue;
        if (Math.hypot(j.x - mancha.x, j.y - mancha.y) < RADIO * 2) {
          hacerMancha(j.id, mancha.id);
          break;
        }
      }
    }
  }

  // Armamos la "foto" del juego (solo los datos necesarios)
  const foto = Object.values(jugadores).map(j => ({
    id: j.id, nombre: j.nombre, color: j.color,
    x: Math.round(j.x), y: Math.round(j.y),
    congelado: j.congeladoHasta > ahora,
    inmune: j.inmuneHasta > ahora,
    segundosMancha: Math.round(j.segundosMancha),
    puedeSilbar: ahora - j.ultimoSilbido >= ESPERA_SILBIDO_MS
  }));

  // A cada persona le mandamos SU foto. A la mancha le sacamos a los que
  // están lejos: si el servidor no le manda esos datos, no hay forma de
  // hacer trampa para "ver en la oscuridad".
  const tabla = foto.map(j => ({ id: j.id, nombre: j.nombre, segundosMancha: j.segundosMancha }));
  for (const persona of Object.values(jugadores)) {
    if (persona.esBot) continue;
    let visibles = foto;
    if (persona.id === manchaId) {
      visibles = foto.filter(j => j.id === persona.id || Math.hypot(j.x - persona.x, j.y - persona.y) < VISION_MANCHA + RADIO);
    }
    io.to(persona.id).emit("estado", { manchaId, vision: VISION_MANCHA, jugadores: visibles, tabla });
  }
}, 1000 / TICKS_POR_SEGUNDO);

// ----------------------------------------------------------
// 6. PRENDER EL SERVIDOR
// En tu compu usa el puerto 3000. En internet, el servicio
// donde lo subas nos dice qué puerto usar (process.env.PORT).
// ----------------------------------------------------------
const PUERTO = process.env.PORT || 3000;
servidorWeb.listen(PUERTO, () => {
  console.log(`La mancha está corriendo en http://localhost:${PUERTO}`);
});
