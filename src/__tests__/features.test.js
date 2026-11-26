const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseCommand, menuText } = require("../commands/parser");
const {
  getText,
  mediaInfo,
  extractQuotedMessage,
} = require("../messaging/messages");
const { handleCommand } = require("../commands/handler");
const { stickerVideoFilter, gifVideoFilter } = require("../media/processor");

const options = { skip: process.env.TESTS_ENABLED === "false" };

test("parser reconhece comandos, argumentos e prefixo", options, () => {
  assert.deepEqual(parseCommand(".s texto de exemplo"), {
    command: "s",
    args: "texto de exemplo",
  });
  assert.equal(parseCommand("olá"), null);
  assert.deepEqual(parseCommand(".MENU"), { command: "menu", args: "" });
});

test("menu lista as funcionalidades disponíveis", options, () => {
  assert.match(menuText(), /\.menu/);
  assert.match(menuText(), /\.s/);
  assert.match(menuText(), /\.v/);
});

test(
  "figurinha preenche o quadro quadrado cortando o excesso sem distorcer",
  options,
  () => {
    const filter = stickerVideoFilter();
    assert.match(filter, /scale=512:512:force_original_aspect_ratio=increase/);
    assert.match(filter, /crop=512:512/);
    assert.doesNotMatch(filter, /pad=/);
  },
);

test("vídeo em formato GIF preenche o quadro quadrado sem barras", options, () => {
  const filter = gifVideoFilter();
  assert.match(filter, /scale=480:480:force_original_aspect_ratio=increase/);
  assert.match(filter, /crop=480:480/);
  assert.doesNotMatch(filter, /pad=/);
});

test("mensagens extraem texto de conversa e legenda", options, () => {
  assert.equal(getText({ message: { conversation: ".menu" } }), ".menu");
  assert.equal(getText({ message: { imageMessage: { caption: ".s" } } }), ".s");
});

test("mídias suportadas são identificadas pelo tipo e MIME", options, () => {
  assert.deepEqual(mediaInfo({ message: { imageMessage: {} } }), {
    type: "image",
    mime: "image/jpeg",
  });
  assert.deepEqual(
    mediaInfo({ message: { videoMessage: { mimetype: "video/webm" } } }),
    { type: "video", mime: "video/webm" },
  );
  assert.equal(mediaInfo({ message: { conversation: "oi" } }), null);
});

test(
  "mídia citada é recuperada com o identificador da mensagem",
  options,
  () => {
    const raw = {
      key: { remoteJid: "chat" },
      message: {
        extendedTextMessage: {
          contextInfo: {
            stanzaId: "id-1",
            quotedMessage: { imageMessage: {} },
          },
        },
      },
    };
    assert.deepEqual(extractQuotedMessage(raw), {
      key: {
        remoteJid: "chat",
        id: "id-1",
        participant: undefined,
        fromMe: false,
      },
      message: { imageMessage: {} },
    });
  },
);

test("roteamento responde ao menu sem processar mídia", options, async () => {
  const sent = [];
  await handleCommand(
    { sendMessage: async (...args) => sent.push(args) },
    { key: { remoteJid: "chat" }, message: { conversation: ".menu" } },
  );
  assert.match(sent[0][1].text, /\.s/);
  assert.match(sent[0][1].text, /\.v/);
});

test("roteamento informa comandos desconhecidos", options, async () => {
  const sent = [];
  await handleCommand(
    { sendMessage: async (...args) => sent.push(args) },
    { key: { remoteJid: "chat" }, message: { conversation: ".xyz" } },
  );
  assert.match(sent[0][1].text, /não reconhecido/i);
});

test("roteamento ignora mensagens sem comando", options, async () => {
  let calls = 0;
  await handleCommand(
    {
      sendMessage: async () => {
        calls += 1;
      },
    },
    { key: { remoteJid: "chat" }, message: { conversation: "olá" } },
  );
  assert.equal(calls, 0);
});
