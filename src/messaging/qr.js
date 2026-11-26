const QRCode = require("qrcode");
const { QR_QUIET_ZONE } = require("../config");

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

module.exports = { renderQrInTerminal };
