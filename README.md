# Meu WhatsApp Bot

Bot pequeno feito com Node.js e Baileys. Inclui menu, criação de figurinhas e envio de vídeos curtos no modo GIF do WhatsApp.

## Requisitos

- Node.js 18 ou superior
- `ffmpeg` instalado e disponível no `PATH`
- Um número de WhatsApp para vincular por QR

## Instalação

```bash
cd meu-whatsapp-bot
npm install
cp .env.example .env
npm start
```

No Windows, copie `.env.example` para `.env` manualmente. Ao iniciar, escaneie o QR em **WhatsApp → Dispositivos conectados → Conectar dispositivo**. A sessão fica salva na pasta `session/`.

## Comandos

- `.menu` — mostra os comandos
- `.s` — cria figurinha a partir de imagem ou vídeo
- `.v` — converte os primeiros 8 segundos de um vídeo para um MP4 leve que o WhatsApp exibe como GIF

Anexe a mídia ao comando ou responda a uma mensagem que contenha a mídia. O limite de entrada é 24 MB.

O comando `.v` envia MP4 com a opção `gifPlayback` do WhatsApp. Isso permite a reprodução em loop como GIF, mantendo o envio mais leve e compatível com o WhatsApp.

## Configuração

Edite `.env`:

- `BOT_NAME` — nome mostrado no menu
- `PREFIX` — prefixo dos comandos (padrão `.`)
- `SELF_CHAT=true` — permite testar comandos no chat “Mensagem para você”; use `false` para ignorar mensagens enviadas pelo próprio número
- `SESSION_DIR` — local onde as credenciais da sessão são armazenadas

Não compartilhe a pasta `session/`: ela dá acesso à sessão conectada do WhatsApp.
