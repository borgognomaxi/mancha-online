// ==========================================================
// SERVIDOR DE LA MANCHA ONLINE
// Este programa corre en una compu en internet (el "servidor").
// Todos los jugadores se conectan acá. El servidor es el árbitro:
// decide dónde está cada uno, quién está escondido y quién
// atrapó a quién. Así nadie puede hacer trampa.
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

// Una dirección para "golpear la puerta": el juego la visita cada tanto
// para que Render no apague el servidor mientras alguien está jugando
app.get("/ping", (req, res) => res.send("ok"));

// ----------------------------------------------------------
// 1. REGLAS DEL JUEGO (cambiá estos números para probar)
// ----------------------------------------------------------
const MAPA = { ancho: 2600, alto: 1600 };
const RADIO = 22;                 // tamaño de cada jugador
const VELOCIDAD = 240;            // píxeles por segundo
const VENTAJA_MANCHA = 1.08;      // la mancha va un 8% más rápido
const MAX_JUGADORES = 10;
const TICKS_POR_SEGUNDO = 30;     // cuántas veces por segundo se actualiza el juego
const CONGELADO_MS = 2000;        // la nueva mancha queda quieta 2 segundos (pantalla negra)
const INMUNE_MS = 3000;           // el que te pasó la mancha no puede ser tocado por 3 segundos
const VISION_MANCHA = 260;        // la mancha solo ve a esta distancia (en píxeles)
const ESPERA_SILBIDO_MS = 4000;   // cada jugador puede silbar una vez cada 4 segundos

// Escondites
const DISTANCIA_REVISAR = 110;    // qué tan cerca tiene que estar la mancha para revisar
const REVELADO_MS = 2500;         // cuánto tiempo quedan a la vista los que estaban escondidos
const ESPERA_REVISAR_MS = 5000;   // cada cuánto puede revisar la mancha
const QUIETA_AL_REVISAR_MS = 500; // la mancha se frena un toque mientras revisa

// Bots: si hay pocas personas, se completa con bots hasta llegar a este número.
// Poné 0 para jugar sin bots.
const COMPLETAR_CON_BOTS_HASTA = 5;
const VELOCIDAD_BOTS = 0.92;      // los bots van un poco más lento que vos (1 = igual de rápido)
const NOMBRES_BOTS = ["Bot Lola", "Bot Tito", "Bot Pipa", "Bot Toto", "Bot Nina",
                      "Bot Coco", "Bot Lulú", "Bot Rulo", "Bot Mora"];

// ----------------------------------------------------------
// 2. EL MAPA: un patio de escuela
// Hay dos tipos de cosas:
//  - OBSTÁCULOS: no los podés atravesar (paredes, árboles, juegos)
//  - ESCONDITES: los podés atravesar, y si estás adentro la mancha no te ve
// Cada cosa es un rectángulo (x, y, ancho, alto) o un círculo (x, y, radio).
// ----------------------------------------------------------
const OBSTACULOS = [
  // Edificio de la escuela y kiosco
  { tipo: "escuela", forma: "rect", x: 60, y: 60, w: 640, h: 300 },
  { tipo: "kiosco", forma: "rect", x: 800, y: 90, w: 170, h: 110 },
  // Paredes bajas que arman pasillos
  { tipo: "pared", forma: "rect", x: 60, y: 520, w: 420, h: 26 },
  { tipo: "pared", forma: "rect", x: 1640, y: 720, w: 26, h: 380 },
  { tipo: "pared", forma: "rect", x: 2080, y: 1260, w: 460, h: 26 },
  // Fuente central y bancos alrededor
  { tipo: "fuente", forma: "circulo", x: 1300, y: 680, r: 110 },
  { tipo: "banco", forma: "rect", x: 1220, y: 470, w: 160, h: 40 },
  { tipo: "banco", forma: "rect", x: 1220, y: 850, w: 160, h: 40 },
  { tipo: "banco", forma: "rect", x: 1060, y: 600, w: 40, h: 160 },
  { tipo: "banco", forma: "rect", x: 1500, y: 600, w: 40, h: 160 },
  // Juegos de la plaza (en el arenero de abajo)
  { tipo: "tobogan", forma: "rect", x: 980, y: 1100, w: 80, h: 220 },
  { tipo: "hamacas", forma: "rect", x: 1180, y: 1060, w: 240, h: 30 },
  { tipo: "calesita", forma: "circulo", x: 1530, y: 1300, r: 85 },
  // Mesa de ping-pong
  { tipo: "pingpong", forma: "rect", x: 640, y: 760, w: 200, h: 110 },
  // Arcos de la cancha de fútbol
  { tipo: "arco", forma: "rect", x: 1760, y: 290, w: 24, h: 140 },
  { tipo: "arco", forma: "rect", x: 2476, y: 290, w: 24, h: 140 },
  // Árboles (el tronco es lo que choca)
  { tipo: "arbol", forma: "circulo", x: 880, y: 470, r: 30 },
  { tipo: "arbol", forma: "circulo", x: 160, y: 900, r: 30 },
  { tipo: "arbol", forma: "circulo", x: 520, y: 1150, r: 30 },
  { tipo: "arbol", forma: "circulo", x: 1880, y: 860, r: 30 },
  { tipo: "arbol", forma: "circulo", x: 2420, y: 700, r: 30 },
  { tipo: "arbol", forma: "circulo", x: 1780, y: 1480, r: 30 },
  { tipo: "arbol", forma: "circulo", x: 260, y: 1460, r: 30 }
];

const ESCONDITES = [
  { id: "arbustos-oeste", tipo: "arbustos", nombre: "los arbustos", forma: "circulo", x: 320, y: 720, r: 110 },
  { id: "arbustos-este", tipo: "arbustos", nombre: "los arbustos", forma: "circulo", x: 2300, y: 980, r: 115 },
  { id: "arbustos-sur", tipo: "arbustos", nombre: "los arbustos", forma: "circulo", x: 720, y: 1400, r: 100 },
  { id: "arbustos-cancha", tipo: "arbustos", nombre: "los arbustos", forma: "circulo", x: 2000, y: 640, r: 90 },
  { id: "casita", tipo: "casita", nombre: "la casita", forma: "rect", x: 1240, y: 1180, w: 150, h: 120 },
  { id: "tunel", tipo: "tunel", nombre: "el túnel", forma: "rect", x: 1100, y: 1430, w: 260, h: 80 },
  { id: "pasto", tipo: "pasto", nombre: "el pasto alto", forma: "rect", x: 2120, y: 1310, w: 360, h: 220 },
  { id: "detras-kiosco", tipo: "arbustos", nombre: "los arbustos del kiosco", forma: "circulo", x: 1080, y: 150, r: 85 }
];

const COLORES = ["#ffb703", "#8ecae6", "#90be6d", "#f28482", "#cdb4db",
                 "#f9c74f", "#43aa8b", "#f8961e", "#4cc9f0", "#b5e48c"];

// ----------------------------------------------------------
// 3. ESTADO DEL JUEGO: la "memoria" del servidor
// ----------------------------------------------------------
const jugadores = {};   // un objeto por jugador, guardado por su id
let manchaId = null;    // id del jugador que es la mancha
const revelados = {};   // escondites revisados: { idEscondite: hasta cuándo se ve adentro }

// ----------------------------------------------------------
// 4. GEOMETRÍA: ¿choca?, ¿está adentro?, ¿qué tan lejos?
// ----------------------------------------------------------

// Distancia desde un punto hasta el borde de una forma (0 si está adentro)
function distanciaAForma(x, y, f) {
  if (f.forma === "circulo") return Math.max(0, Math.hypot(x - f.x, y - f.y) - f.r);
  const cx = Math.max(f.x, Math.min(x, f.x + f.w));
  const cy = Math.max(f.y, Math.min(y, f.y + f.h));
  return Math.hypot(x - cx, y - cy);
}

// ¿Un jugador en (x, y) se superpone con algún obstáculo?
function chocaConObstaculo(x, y) {
  return OBSTACULOS.some(o => distanciaAForma(x, y, o) < RADIO);
}

// ¿En qué escondite está el centro del jugador? (o null)
function esconditeEn(x, y) {
  const e = ESCONDITES.find(e => distanciaAForma(x, y, e) === 0);
  return e ? e.id : null;
}

function centroDe(f) {
  return f.forma === "circulo" ? { x: f.x, y: f.y } : { x: f.x + f.w / 2, y: f.y + f.h / 2 };
}

// Busca un lugar al azar donde no haya obstáculos ni gente cerca
function lugarLibre() {
  for (let intento = 0; intento < 300; intento++) {
    const x = RADIO + Math.random() * (MAPA.ancho - RADIO * 2);
    const y = RADIO + Math.random() * (MAPA.alto - RADIO * 2);
    const lejosDeTodos = Object.values(jugadores).every(j => Math.hypot(j.x - x, j.y - y) > 250);
    if (!chocaConObstaculo(x, y) && !esconditeEn(x, y) && lejosDeTodos) return { x, y };
  }
  return { x: 800, y: 420 };
}

function colorLibre() {
  const usados = Object.values(jugadores).map(j => j.color);
  return COLORES.find(c => !usados.includes(c)) || COLORES[0];
}

function nuevoJugador(id, nombre, esBot) {
  const lugar = lugarLibre();
  return {
    id, nombre, esBot, color: colorLibre(),
    x: lugar.x, y: lugar.y, dir: { x: 0, y: 0 },
    escondite: null,
    congeladoHasta: 0, inmuneHasta: 0, segundosMancha: 0,
    ultimoSilbido: 0, ultimaRevision: 0,
    // la "memoria" de los bots para tomar decisiones
    cerebro: { ultimoX: lugar.x, ultimoY: lugar.y, trabado: 0, esquivarHasta: 0, esquivarDir: { x: 0, y: 0 },
               paseoHasta: 0, paseoDir: { x: 0, y: 0 }, metaEscondite: null }
  };
}

// ----------------------------------------------------------
// 5. ACCIONES: hacer mancha, silbar, revisar
// ----------------------------------------------------------
function hacerMancha(nuevoId, anteriorId) {
  const ahora = Date.now();
  manchaId = nuevoId;
  const nuevo = jugadores[nuevoId];
  if (!nuevo) return;
  nuevo.congeladoHasta = ahora + CONGELADO_MS;
  nuevo.ultimaRevision = 0;
  // Recordamos quién te la pasó: los bots no se la devuelven enseguida
  nuevo.meLaPaso = anteriorId;
  nuevo.noDevolverHasta = ahora + 8000;
  if (anteriorId && jugadores[anteriorId]) jugadores[anteriorId].inmuneHasta = ahora + INMUNE_MS;
  io.to(nuevoId).emit("sosLaMancha", { segundos: CONGELADO_MS / 1000 });
  io.emit("aviso", anteriorId && jugadores[anteriorId]
    ? `${jugadores[anteriorId].nombre} atrapó a ${nuevo.nombre}`
    : `${nuevo.nombre} es la mancha`);
}

function elegirManchaAlAzar() {
  const ids = Object.keys(jugadores);
  if (ids.length === 0) { manchaId = null; return; }
  hacerMancha(ids[Math.floor(Math.random() * ids.length)], null);
}

// Silbar: le avisamos a todos dónde sonó. Así la mancha, aunque no vea,
// sabe más o menos dónde hay alguien (¡aunque esté escondido!)
function silbar(j) {
  const ahora = Date.now();
  if (!j || j.id === manchaId) return;
  if (ahora - j.ultimoSilbido < ESPERA_SILBIDO_MS) return;
  j.ultimoSilbido = ahora;
  io.emit("silbido", { id: j.id, nombre: j.nombre, x: Math.round(j.x), y: Math.round(j.y) });
}

// El escondite más cercano a la mancha que esté al alcance para revisar
function esconditeParaRevisar(m) {
  let mejor = null, menor = Infinity;
  for (const e of ESCONDITES) {
    const d = distanciaAForma(m.x, m.y, e);
    if (d <= DISTANCIA_REVISAR && d < menor) { menor = d; mejor = e; }
  }
  return mejor;
}

// Revisar: la mancha alumbra un escondite y ve a los que están adentro
function revisar(m) {
  const ahora = Date.now();
  if (!m || m.id !== manchaId || m.congeladoHasta > ahora) return;
  if (ahora - m.ultimaRevision < ESPERA_REVISAR_MS) return;
  const e = esconditeParaRevisar(m);
  if (!e) return;
  m.ultimaRevision = ahora;
  m.congeladoHasta = ahora + QUIETA_AL_REVISAR_MS;
  revelados[e.id] = ahora + REVELADO_MS;
  const cuantos = Object.values(jugadores).filter(j => j.id !== m.id && j.escondite === e.id).length;
  io.emit("revision", { escondite: e.id, hasta: REVELADO_MS });
  io.emit("aviso", cuantos > 0
    ? `${m.nombre} revisó ${e.nombre}… ¡había ${cuantos}!`
    : `${m.nombre} revisó ${e.nombre}… no había nadie`);
}

// ----------------------------------------------------------
// 6. LOS BOTS
// Un bot es un jugador más, pero en vez de un teclado tiene
// una función ("su cerebro") que decide hacia dónde ir.
// ----------------------------------------------------------
let contadorBots = 0;

function agregarBot() {
  const id = "bot-" + (++contadorBots);
  const usados = Object.values(jugadores).map(j => j.nombre);
  const nombre = NOMBRES_BOTS.find(n => !usados.includes(n)) || "Bot " + contadorBots;
  jugadores[id] = nuevoJugador(id, nombre, true);
  if (!manchaId) hacerMancha(id, null);
}

function sacarBot() {
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

const direccionHacia = (dx, dy) => { const l = Math.hypot(dx, dy); return l < 1 ? { x: 0, y: 0 } : { x: dx / l, y: dy / l }; };
const direccionAlAzar = () => { const a = Math.random() * Math.PI * 2; return { x: Math.cos(a), y: Math.sin(a) }; };
const estaRevelado = (idEscondite, ahora) => (revelados[idEscondite] || 0) > ahora;

// ¿La mancha puede "ver" a este jugador? (lo usan los bots para ser justos)
function esVisibleParaMancha(j, ahora) {
  return !j.escondite || estaRevelado(j.escondite, ahora);
}

// El cerebro del bot: se ejecuta 30 veces por segundo
function pensarBot(bot, ahora) {
  const c = bot.cerebro;

  // ¿Quedó trabado contra algo? Si no se movió en un rato, prueba otra dirección
  const seMovio = Math.hypot(bot.x - c.ultimoX, bot.y - c.ultimoY) > 1;
  c.ultimoX = bot.x; c.ultimoY = bot.y;
  const quiereMoverse = bot.dir.x !== 0 || bot.dir.y !== 0;
  c.trabado = (!seMovio && quiereMoverse && bot.congeladoHasta <= ahora) ? c.trabado + 1 : 0;
  if (c.trabado > 6) {
    c.esquivarHasta = ahora + 600; c.esquivarDir = direccionAlAzar(); c.trabado = 0; c.metaEscondite = null;
  }
  if (c.esquivarHasta > ahora) { bot.dir = c.esquivarDir; return; }

  const mancha = jugadores[manchaId];

  // ---- SOY LA MANCHA ----
  if (bot.id === manchaId) {
    // Persigo al más cercano que se vea y se pueda tocar
    let objetivo = null, menor = Infinity;
    for (const j of Object.values(jugadores)) {
      if (j.id === bot.id || j.inmuneHasta > ahora || !esVisibleParaMancha(j, ahora)) continue;
      let d = Math.hypot(j.x - bot.x, j.y - bot.y);
      // "No vale devolverla": al que me la pasó lo persigo solo si no hay nadie más
      if (j.id === bot.meLaPaso && ahora < bot.noDevolverHasta) d *= 4;
      if (d < menor) { menor = d; objetivo = j; }
    }
    if (objetivo && menor < 900) {
      bot.dir = direccionHacia(objetivo.x - bot.x, objetivo.y - bot.y);
      return;
    }
    // No veo a nadie: voy a revisar el escondite más cercano que no revisé hace poco
    if (esconditeParaRevisar(bot) && Math.random() < 0.08) revisar(bot);
    if (!c.metaEscondite || estaRevelado(c.metaEscondite, ahora)) {
      const opciones = ESCONDITES.filter(e => !estaRevelado(e.id, ahora));
      const e = opciones[Math.floor(Math.random() * opciones.length)];
      c.metaEscondite = e ? e.id : null;
    }
    const meta = ESCONDITES.find(e => e.id === c.metaEscondite);
    if (meta) {
      const p = centroDe(meta);
      bot.dir = direccionHacia(p.x - bot.x, p.y - bot.y);
      if (distanciaAForma(bot.x, bot.y, meta) < 40) c.metaEscondite = null;
    }
    return;
  }

  const distMancha = mancha ? Math.hypot(mancha.x - bot.x, mancha.y - bot.y) : Infinity;
  const meVe = mancha && esVisibleParaMancha(bot, ahora);

  // ---- LA MANCHA ESTÁ CERCA ----
  if (distMancha < 380) {
    // Si estoy escondido y no me descubrieron, me quedo quieto (y cruzo los dedos)
    if (bot.escondite && !meVe && distMancha > 70) { bot.dir = { x: 0, y: 0 }; return; }
    // Si no, escapo para el lado contrario sin quedar acorralado
    let x = bot.x - mancha.x, y = bot.y - mancha.y;
    if (bot.x < 150) x += 220; if (bot.x > MAPA.ancho - 150) x -= 220;
    if (bot.y < 150) y += 220; if (bot.y > MAPA.alto - 150) y -= 220;
    bot.dir = direccionHacia(x, y);
    c.metaEscondite = null;
    return;
  }

  // ---- TRANQUI ----
  // Estoy lejos: a veces silbo para burlarme
  if (distMancha > 600 && Math.random() < 0.004) silbar(bot);

  // A veces decido ir a esconderme al escondite más cercano
  if (!c.metaEscondite && !bot.escondite && Math.random() < 0.01) {
    let mejor = null, menor = Infinity;
    for (const e of ESCONDITES) {
      const d = distanciaAForma(bot.x, bot.y, e);
      if (d < menor) { menor = d; mejor = e; }
    }
    if (mejor && menor < 700) c.metaEscondite = mejor.id;
  }
  if (c.metaEscondite) {
    const meta = ESCONDITES.find(e => e.id === c.metaEscondite);
    const p = centroDe(meta);
    if (Math.hypot(p.x - bot.x, p.y - bot.y) < 30) { bot.dir = { x: 0, y: 0 }; }
    else bot.dir = direccionHacia(p.x - bot.x, p.y - bot.y);
    // Cada tanto me aburro y salgo a pasear
    if (Math.random() < 0.002) c.metaEscondite = null;
    return;
  }

  // Paseo y cada tanto cambio de rumbo o me quedo quieto
  if (ahora > c.paseoHasta) {
    c.paseoDir = Math.random() < 0.25 ? { x: 0, y: 0 } : direccionAlAzar();
    c.paseoHasta = ahora + 1000 + Math.random() * 2000;
  }
  bot.dir = c.paseoDir;
}

// ----------------------------------------------------------
// 7. CUANDO SE CONECTA UN JUGADOR
// "socket" es la conexión con ESE jugador en particular.
// ----------------------------------------------------------
io.on("connection", socket => {

  socket.on("entrar", nombreRecibido => {
    if (jugadores[socket.id]) return;
    // Los bots no cuentan para el límite: si entra una persona, sale un bot
    const humanos = Object.values(jugadores).filter(j => !j.esBot).length;
    if (humanos >= MAX_JUGADORES) { socket.emit("lleno", MAX_JUGADORES); return; }

    // Nunca confiamos en lo que manda el jugador: lo limpiamos
    const nombre = String(nombreRecibido || "").trim().slice(0, 14) || "Jugador";
    jugadores[socket.id] = nuevoJugador(socket.id, nombre, false);

    socket.emit("bienvenida", {
      id: socket.id, mapa: MAPA, radio: RADIO,
      obstaculos: OBSTACULOS, escondites: ESCONDITES, distanciaRevisar: DISTANCIA_REVISAR
    });
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
  socket.on("revisar", () => revisar(jugadores[socket.id]));

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
// 8. EL LOOP DEL JUEGO: corre 30 veces por segundo
// ----------------------------------------------------------
setInterval(() => {
  const ahora = Date.now();
  const dt = 1 / TICKS_POR_SEGUNDO;

  // Mover a cada jugador
  for (const j of Object.values(jugadores)) {
    if (j.esBot) pensarBot(j, ahora);
    if (j.congeladoHasta > ahora) continue;
    const vel = VELOCIDAD * (j.id === manchaId ? VENTAJA_MANCHA : 1) * (j.esBot ? VELOCIDAD_BOTS : 1);
    // Movemos en X y en Y por separado: así te deslizás por las paredes en vez de frenar en seco
    const nuevoX = Math.max(RADIO, Math.min(MAPA.ancho - RADIO, j.x + j.dir.x * vel * dt));
    if (!chocaConObstaculo(nuevoX, j.y)) j.x = nuevoX;
    const nuevoY = Math.max(RADIO, Math.min(MAPA.alto - RADIO, j.y + j.dir.y * vel * dt));
    if (!chocaConObstaculo(j.x, nuevoY)) j.y = nuevoY;
    j.escondite = esconditeEn(j.x, j.y);
  }

  // ¿La mancha tocó a alguien? (escondido o no: si lo toca, lo atrapa)
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

  // Armamos la "foto" del juego
  const foto = Object.values(jugadores).map(j => ({
    id: j.id, nombre: j.nombre, color: j.color,
    x: Math.round(j.x), y: Math.round(j.y),
    dx: Math.round(j.dir.x * 10) / 10, dy: Math.round(j.dir.y * 10) / 10,
    congelado: j.congeladoHasta > ahora,
    inmune: j.inmuneHasta > ahora,
    escondite: j.escondite,
    segundosMancha: Math.round(j.segundosMancha),
    puedeSilbar: ahora - j.ultimoSilbido >= ESPERA_SILBIDO_MS
  }));
  const tabla = foto.map(j => ({ id: j.id, nombre: j.nombre, segundosMancha: j.segundosMancha }));
  const reveladosAhora = Object.keys(revelados).filter(id => revelados[id] > ahora);

  // A cada persona le mandamos SU foto. A la mancha le sacamos a los que
  // están lejos o escondidos: si el servidor no le manda esos datos,
  // no hay forma de hacer trampa para "ver" a través de los arbustos.
  for (const persona of Object.values(jugadores)) {
    if (persona.esBot) continue;
    let visibles = foto;
    const extra = {};
    if (persona.id === manchaId) {
      visibles = foto.filter(j => {
        if (j.id === persona.id) return true;
        const d = Math.hypot(j.x - persona.x, j.y - persona.y);
        if (d > VISION_MANCHA + RADIO) return false;
        if (j.escondite && !reveladosAhora.includes(j.escondite) && d > RADIO * 3) return false;
        return true;
      });
      extra.puedeRevisar = ahora - persona.ultimaRevision >= ESPERA_REVISAR_MS && !!esconditeParaRevisar(persona);
      extra.esperaRevisar = Math.max(0, ESPERA_REVISAR_MS - (ahora - persona.ultimaRevision));
    }
    io.to(persona.id).emit("estado", {
      manchaId, vision: VISION_MANCHA, jugadores: visibles, tabla, revelados: reveladosAhora, ...extra
    });
  }
}, 1000 / TICKS_POR_SEGUNDO);

// ----------------------------------------------------------
// 9. PRENDER EL SERVIDOR
// En tu compu usa el puerto 3000. En internet, el servicio
// donde lo subas nos dice qué puerto usar (process.env.PORT).
// ----------------------------------------------------------
const PUERTO = process.env.PORT || 3000;
servidorWeb.listen(PUERTO, () => {
  console.log(`La mancha está corriendo en http://localhost:${PUERTO}`);
});
