require("dotenv").config();

const { createBot } = require("./bot");

const bot = createBot();
process.once("SIGINT", () => {
  bot.stop();
  process.exit(0);
});

bot.connect().catch((err) => {
  console.error("Não foi possível iniciar o bot:", err.message);
  process.exitCode = 1;
});
