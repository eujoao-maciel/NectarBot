# NectarBot

Bot pequeno feito com Node.js e Baileys. Inclui menu, criação de figurinhas e envio de vídeos curtos no modo GIF do WhatsApp.

## Requisitos

- Node.js 18 ou superior
- `ffmpeg` e `ffprobe` instalados e disponíveis no `PATH`
- Um número de WhatsApp para vincular por QR

## Instalação

```bash
cd nectarbot
npm install
cp .env.example .env
npm start
```

No Windows, copie `.env.example` para `.env` manualmente. Ao iniciar, escaneie o QR em **WhatsApp → Dispositivos conectados → Conectar dispositivo**. A sessão fica salva na pasta `session/`.

## Comandos

- `.menu` — mostra os comandos
- `.s` — cria figurinha a partir de imagem ou vídeo
- `.sa` — cria figurinha animada com o áudio original do vídeo
- `.g` — converte os primeiros 8 segundos de um vídeo para um MP4 leve que o WhatsApp exibe como GIF (`.v` continua aceito como alias)

Anexe a mídia ao comando ou responda a uma mensagem que contenha a mídia. O limite de entrada é 24 MB.

O comando `.sa` exige um vídeo com áudio. A figurinha e o áudio usam o mesmo trecho em comum, com limite de 10 segundos. O áudio é anexado como Opus. A reprodução de figurinhas com áudio depende de suporte no WhatsApp de quem recebe.

O comando `.g` envia MP4 com a opção `gifPlayback` do WhatsApp. Isso permite a reprodução em loop como GIF, mantendo o envio mais leve e compatível com o WhatsApp.

## Desenvolvimento e testes

O código da aplicação fica em `src/`: `src/index.js` inicializa o servidor, `src/bot.js` gerencia a conexão com o WhatsApp, `src/commands/` contém o parser e roteamento dos comandos, `src/media/` processa mídia e `src/messaging/` trata mensagens e QR Code. O `index.js` na raiz mantém o comando `npm start` compatível.

Execute os testes com `npm test`. Para desativar a suíte, use `npm run test:off` ou defina `TESTS_ENABLED=false` ao executar `node --test`.

## Configuração

Edite `.env`:

- `BOT_NAME` — nome mostrado no menu
- `PREFIX` — prefixo dos comandos (padrão `.`)
- `SELF_CHAT=true` — permite testar comandos no chat “Mensagem para você”; use `false` para ignorar mensagens enviadas pelo próprio número
- `SESSION_DIR` — local onde as credenciais da sessão são armazenadas

Não compartilhe a pasta `session/`: ela dá acesso à sessão conectada do WhatsApp.
