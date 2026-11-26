const fs = require("node:fs");
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");
const { SESSION_DIR, BOT_NAME, PREFIX, SELF_CHAT } = require("./config");
const { renderQrInTerminal } = require("./messaging/qr");
const { handleCommand } = require("./commands/handler");

function createBot({
  socketFactory = makeWASocket,
  authState = useMultiFileAuthState,
} = {}) {
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let stopping = false;

  async function connect() {
    const { state, saveCreds } = await authState(SESSION_DIR);
    const sock = socketFactory({
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
            connect().catch((err) =>
              console.error("Falha ao reconectar:", err.message),
            ),
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
              { text: `Não consegui processar isso. ${err.message}` },
              { quoted: raw },
            );
          } catch (_) {
            /* Conexão indisponível. */
          }
        });
      }
    });
    return sock;
  }

  function stop() {
    stopping = true;
    clearTimeout(reconnectTimer);
  }

  return { connect, stop };
}

module.exports = { createBot };
