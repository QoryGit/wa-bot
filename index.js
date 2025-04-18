const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");
const { format } = require("path");
const P = require("pino");
const qrcode = require("qrcode-terminal");

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");

  const sock = makeWASocket({
    printQRInTerminal: true,
    auth: state,
    logger: P({ level: "silent" }),
  });

  // Listen for messages
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0];
    if (!m.message) return;

    const messageText =
      m.message?.conversation || m.message?.extendedTextMessage?.text || "";
    const from = m.key.remoteJid;
    const isGroup = from.endsWith("@g.us");

    if (messageText === "!ping") {
      await sock.sendMessage(from, { text: "Pong!" });
    } else if (messageText === "!hello") {
      await sock.sendMessage(from, { text: "Hi!" });
    } else if (messageText === "!info" && isGroup) {
      const groupMetadata = await sock.groupMetadata(from);
      const info = `Nama Grup: ${groupMetadata.subject}\nTotal Member: ${groupMetadata.participants.length}`;
      await sock.sendMessage(from, { text: info });
    } else if (messageText === "!help") {
      const help = `Daftar Command Bot:
!ping - Test bot
!hello - Sapa bot
!pencipta - Pencipta bot
!info - Info grup (khusus grup)
!time - Lihat waktu saat ini
!quote - Tampilkan quote random
!cuaca [kota] - Cek cuaca di kota tertentu
!kalkulator [ekspresi] - Hitung ekspresi matematika
!help - Tampilkan bantuan ini`;
      await sock.sendMessage(from, { text: help });
    } else if (messageText === "!time") {
      const time = new Date().toLocaleString("id-ID");
      await sock.sendMessage(from, { text: `Waktu saat ini: ${time}` });
    } else if (messageText === "!pencipta") {
      await sock.sendMessage(from, {
        text: "Sudah spamnya????",
      });
    } else if (messageText === "!quote") {
      try {
        // const fetch = (await import("node-fetch")).default;
        // const response = await fetch("https://api.api-ninjas.com/v1/quotes");
        // const data = await response.json();
        // await sock.sendMessage(from, {
        //   text: `"${data.quote}"\n\n- ${data.author}`,
        // });
        const axios = require("axios");

        // console.log(response.data.content); // quote
        // console.log(response.data.author);  // penulis
        const res = await          axios.get("https://api.quotable.io/random");
        const quote = `"${res.data.content}"\n— $    {res.data.author}`;

        sock.sendMessage(msg.key.remoteJid, { text: quote });
      } catch (error) {
        console.error("Quote error:", error);
        await sock.sendMessage(from, {
          text: "Maaf, tidak bisa mengambil quote saat ini.",
        });
      }
    } else if (messageText.startsWith("!kalkulator ")) {
      const expression = messageText.slice(11);
      try {
        const result = require("mathjs").evaluate(expression);
        await sock.sendMessage(from, { text: `Hasil: ${result}` });
      } catch (error) {
        await sock.sendMessage(from, {
          text: "Maaf, ekspresi matematika tidak valid.",
        });
      }
    } else if (messageText.startsWith("!cuaca ")) {
      const city = messageText.slice(7);
      try {
        const response = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=YOUR_API_KEY&units=metric`,
        );
        const data = await response.json();
        const weather = `Cuaca di ${city}:\nSuhu: ${data.main.temp}°C\nKelembaban: ${data.main.humidity}%\nKondisi: ${data.weather[0].description}`;
        await sock.sendMessage(from, { text: weather });
      } catch (error) {
        await sock.sendMessage(from, {
          text: "Maaf, tidak bisa mengambil info cuaca saat ini.",
        });
      }
    }
  });

  // Listen for connection updates
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    console.log("Connection update:", update);

    if (connection === "close") {
      if (
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      ) {
        console.log("Reconnecting...");
        connectToWhatsApp();
      }
    } else if (connection === "open") {
      console.log("Connected successfully!");
    }
  });

  // Listen for creds update
  sock.ev.on("creds.update", saveCreds);
}

connectToWhatsApp();
