require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const { execFile, execFileSync } = require("child_process");
const QRCode = require("qrcode");
const {
  default: makeWASocket,
  DisconnectReason,
  downloadMediaMessage,
  getContentType,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");

const execFileAsync = promisify(execFile);
const ROOT = __dirname;
const TEMP_DIR = path.join(ROOT, "temp");
const SESSION_DIR = path.resolve(ROOT, process.env.SESSION_DIR || "session");
const BOT_NAME = process.env.BOT_NAME || "Meu Bot";
const PREFIX = process.env.PREFIX || ".";
const SELF_CHAT = process.env.SELF_CHAT !== "false";
const MAX_INPUT_BYTES = 24 * 1024 * 1024;
const MAX_GIF_SECONDS = 8;
const FFMPEG_TIMEOUT_MS = 60000;
const QR_QUIET_ZONE = 4;

function renderQrInTerminal(value) {
  const { modules } = QRCode.create(value);
  const { data, size } = modules;
  const useAnsi = process.stdout.isTTY && process.env.NO_COLOR == null;
  const isDark = (x, y) =>
    x >= 0 && x < size && y >= 0 && y < size && data[y * size + x] === 1;
  const lines = [];

  if (useAnsi) {
    const black = "\u001b[40m ";
    const white = "\u001b[47m ";
    const blackOverWhite = "\u001b[30;47m▀";
    const whiteOverBlack = "\u001b[37;40m▀";

    // A terminal cell is usually about twice as tall as it is wide. The upper
    // half block stores two QR rows in one cell, keeping each module square.
    for (let y = -QR_QUIET_ZONE; y < size + QR_QUIET_ZONE; y += 2) {
      let line = "";
      for (let x = -QR_QUIET_ZONE; x < size + QR_QUIET_ZONE; x += 1) {
        const top = isDark(x, y);
        const bottom = isDark(x, y + 1);

        if (top && bottom) line += black;
        else if (!top && !bottom) line += white;
        else if (top) line += blackOverWhite;
        else line += whiteOverBlack;
      }
      lines.push(`${line}\u001b[0m`);
    }
  } else {
    // Keep the modules square in plain output by using two terminal columns
    // for each module. This also gives a usable fallback when ANSI is disabled.
    for (let y = -QR_QUIET_ZONE; y < size + QR_QUIET_ZONE; y += 1) {
      let line = "";
      for (let x = -QR_QUIET_ZONE; x < size + QR_QUIET_ZONE; x += 1) {
        line += isDark(x, y) ? "██" : "  ";
      }
      lines.push(line);
    }
  }

  return lines.join("\n");
}

function unwrapMessage(message = {}) {
  let current = message;
  for (let i = 0; i < 5; i += 1) {
    const type = getContentType(current);
    const wrapped = current[type]?.message;
    if (!wrapped) break;
    current = wrapped;
  }
  return current;
}

function getText(raw) {
  const message = unwrapMessage(raw.message);
  const type = getContentType(message);
  const content = message[type] || {};
  return message.conversation || content.text || content.caption || "";
}

function parseCommand(text) {
  if (!text.startsWith(PREFIX)) return null;
  const [command = "", ...args] = text.slice(PREFIX.length).trim().split(/\s+/);
  return { command: command.toLowerCase(), args: args.join(" ") };
}

function extractQuotedMessage(raw) {
  const message = unwrapMessage(raw.message);
  const type = getContentType(message);
  const context = message[type]?.contextInfo;
  if (!context?.quotedMessage) return null;

  return {
    key: {
      remoteJid: raw.key.remoteJid,
      id: context.stanzaId,
      participant: context.participant,
      fromMe: false,
    },
    message: context.quotedMessage,
  };
}

function mediaInfo(raw) {
  if (!raw?.message) return null;
  const message = unwrapMessage(raw.message);
  const type = getContentType(message);
  const content = message[type] || {};

  if (type === "imageMessage")
    return { type: "image", mime: content.mimetype || "image/jpeg" };
  if (type === "videoMessage")
    return { type: "video", mime: content.mimetype || "video/mp4" };
  if (type === "stickerMessage")
    return { type: "image", mime: content.mimetype || "image/webp" };
  return null;
}

async function getMediaSource(message) {
  const candidates = [message._raw, extractQuotedMessage(message._raw)];
  for (const raw of candidates) {
    const info = mediaInfo(raw);
    if (!info) continue;
    const buffer = await downloadMediaMessage(
      raw,
      "buffer",
      {},
      {
        logger: { trace() {}, debug() {}, info() {}, warn() {}, error() {} },
      },
    );
    if (buffer?.length) return { buffer, ...info };
  }
  return null;
}

function extensionFor(mime, type) {
  if (type === "video") return "mp4";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

function findFfmpeg() {
  const candidates = [process.env.FFMPEG_PATH, "ffmpeg"].filter(Boolean);
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["-version"], { stdio: "ignore", timeout: 4000 });
      return candidate;
    } catch (_) {
      /* Try the next executable. */
    }
  }
  return null;
}

async function convertToSticker(source, inputPath, outputPath, ffmpeg) {
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", inputPath];
  if (source.type === "video") args.push("-t", "5");
  args.push(
    "-vf",
    "fps=10,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
    "-vcodec",
    "libwebp",
    "-lossless",
    "0",
    "-q:v",
    source.type === "video" ? "55" : "65",
    "-compression_level",
    "6",
    "-loop",
    "0",
    "-an",
    outputPath,
  );
  await execFileAsync(ffmpeg, args, {
    timeout: FFMPEG_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  });
}

async function convertVideoToGifVideo(inputPath, outputPath, ffmpeg) {
  await execFileAsync(
    ffmpeg,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
      "-t",
      String(MAX_GIF_SECONDS),
      "-vf",
      "fps=12,scale=480:-2:flags=lanczos",
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outputPath,
    ],
    { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
  );
}

async function withMediaFile(source, action) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  const dir = fs.mkdtempSync(path.join(TEMP_DIR, "job-"));
  const inputPath = path.join(
    dir,
    `input.${extensionFor(source.mime, source.type)}`,
  );
  try {
    if (source.buffer.length > MAX_INPUT_BYTES) {
      throw new Error("O arquivo passa do limite de 24 MB.");
    }
    fs.writeFileSync(inputPath, source.buffer);
    await action(inputPath, dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function menuText() {
  return [
    `🦇 *${BOT_NAME}*`,
    "",
    `• ${PREFIX}menu — ver este menu`,
    `• ${PREFIX}s — criar figurinha de uma imagem ou vídeo`,
    `• ${PREFIX}v — transformar um vídeo em GIF`,
    "",
    "Anexe a mídia ao comando ou responda à mensagem com a mídia.",
  ].join("\n");
}

async function handleCommand(sock, raw) {
  const text = getText(raw).trim();
  const parsed = parseCommand(text);
  if (!parsed) return;

  const chatId = raw.key.remoteJid;
  const reply = (body) =>
    sock.sendMessage(chatId, { text: body }, { quoted: raw });

  if (parsed.command === "menu" || parsed.command === "ajuda") {
    await reply(menuText());
    return;
  }

  if (parsed.command !== "s" && parsed.command !== "v") {
    await reply(
      `Comando não reconhecido. Envie *${PREFIX}menu* para ver as opções.`,
    );
    return;
  }

  const source = await getMediaSource({ _raw: raw });
  if (!source) {
    await reply(
      parsed.command === "s"
        ? `Envie uma imagem ou vídeo com *${PREFIX}s*, ou responda a uma mensagem com mídia.`
        : `Envie um vídeo com *${PREFIX}v*, ou responda a uma mensagem com vídeo.`,
    );
    return;
  }

  if (parsed.command === "v" && source.type !== "video") {
    await reply("O comando .v precisa de um vídeo.");
    return;
  }

  if (source.buffer.length > MAX_INPUT_BYTES) {
    await reply("O arquivo passa do limite de 24 MB.");
    return;
  }

  const ffmpeg = findFfmpeg();
  if (!ffmpeg) {
    await reply("Não encontrei o ffmpeg. Instale-o e reinicie o bot.");
    return;
  }

  await reply(
    parsed.command === "s"
      ? "Criando sua figurinha..."
      : "Preparando o vídeo em formato GIF...",
  );

  await withMediaFile(source, async (inputPath, dir) => {
    if (parsed.command === "s") {
      const outputPath = path.join(dir, "sticker.webp");
      await convertToSticker(source, inputPath, outputPath, ffmpeg);
      await sock.sendMessage(chatId, { sticker: fs.readFileSync(outputPath) });
    } else {
      const outputPath = path.join(dir, "gif.mp4");
      await convertVideoToGifVideo(inputPath, outputPath, ffmpeg);
      await sock.sendMessage(chatId, {
        video: fs.readFileSync(outputPath),
        mimetype: "video/mp4",
        gifPlayback: true,
      });
    }
  });
}

let reconnectAttempts = 0;
let reconnectTimer = null;
let stopping = false;

async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      try {
        console.log(
          "\nEscaneie o QR Code abaixo pelo WhatsApp > Dispositivos conectados:\n",
        );
        console.log(renderQrInTerminal(qr));
      } catch (err) {
        console.error("Erro ao exibir o QR Code:", err.message);
      }
    }
    if (connection === "open") {
      reconnectAttempts = 0;
      console.log(`${BOT_NAME} conectado. Envie ${PREFIX}menu para começar.`);
    }
    if (connection === "close" && !stopping) {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        fs.rmSync(SESSION_DIR, { recursive: true, force: true });
        console.log("Sessão encerrada. Vou solicitar um novo QR.");
      }
      const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000);
      reconnectAttempts += 1;
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(
        () =>
          connect().catch((err) => {
            console.error("Falha ao reconectar:", err.message);
          }),
        delay,
      );
    }
  });

  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return;
    for (const raw of messages) {
      if (!raw.message || (!SELF_CHAT && raw.key.fromMe)) continue;
      handleCommand(sock, raw).catch(async (err) => {
        console.error("Falha ao processar mensagem:", err.message);
        try {
          await sock.sendMessage(
            raw.key.remoteJid,
            {
              text: `Não consegui processar isso. ${err.message}`,
            },
            { quoted: raw },
          );
        } catch (_) {
          /* The connection may already be down. */
        }
      });
    }
  });
}

process.once("SIGINT", () => {
  stopping = true;
  clearTimeout(reconnectTimer);
  process.exit(0);
});

connect().catch((err) => {
  console.error("Não foi possível iniciar o bot:", err.message);
  process.exitCode = 1;
});
