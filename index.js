
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const P = require("pino");
const qrcode = require("qrcode-terminal");

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  
  const sock = makeWASocket({
    printQRInTerminal: true,
    auth: state,
    logger: P({ level: "silent" })
  });

  // Listen for messages
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0];
    if (!m.message) return;
    
    const messageText = m.message?.conversation || m.message?.extendedTextMessage?.text || "";
    const from = m.key.remoteJid;

    if (messageText === "!ping") {
      await sock.sendMessage(from, { text: "Pong!" });
    }
    else if (messageText === "!hello") {
      await sock.sendMessage(from, { text: "Hi!" });
    }
  });

  // Listen for connection updates
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    console.log('Connection update:', update);
    
    if (connection === "close") {
      if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
        console.log('Reconnecting...');
        connectToWhatsApp();
      }
    } else if (connection === "open") {
      console.log('Connected successfully!');
    }
  });

  // Listen for creds update
  sock.ev.on("creds.update", saveCreds);
}

connectToWhatsApp();
