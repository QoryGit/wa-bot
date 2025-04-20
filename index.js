global.crypto = require("crypto");
require("dotenv").config(); // Tambahkan dotenv untuk variabel lingkungan
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  downloadMediaMessage, // Tambahkan ini di bagian atas
} = require("@whiskeysockets/baileys");
const express = require("express");
const fetch = require("node-fetch"); // Pastikan node-fetch terinstal
const app = express();
const fs = require("fs");
const sharp = require("sharp");

// Modifikasi state di bagian atas file
const gameState = {};
const processedMessages = new Set();
const lastProcessedGuess = new Map();

// Fungsi untuk menghasilkan angka acak
function generateRandomNumber() {
  return Math.floor(Math.random() * 100) + 1;
}

// Endpoint untuk UptimeRobot
app.get("/", (req, res) => {
  res.send("Bot is running!");
});

// Aktifkan server Express
// app.listen(3000, () => {
//   console.log("Server running on port 3000");

//   // Multiple keepalive strategies
//   setInterval(() => {
//     console.log("Keepalive: Primary check");
//     fetch("https://YOUR-REPL-NAME.repl.co").catch(console.error);
//   }, 4 * 60 * 1000);

//   setInterval(() => {
//     console.log("Keepalive: Connection check");
//     if (sock?.user) {
//       console.log("Bot status: Connected as", sock.user.id);
//     }
//   }, 5 * 60 * 1000);
// });

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

  // Tambahkan state untuk menyimpan ID pesan yang sudah diproses
  // const processedMessages = new Set();

  // Listen for messages
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    const m = messages[0];

    if (!m.message) return;

    const messageText = (
      m.message?.conversation ||
      m.message?.extendedTextMessage?.text ||
      m.message?.imageMessage?.caption ||
      ""
    )
      .trim()
      .toLowerCase();

    const from = m.key.remoteJid;

    // Cegah looping dengan pengecekan ganda
    if (processedMessages.has(m.key.id) || botResponses.has(m.key.id)) {
      return;
    }
    processedMessages.add(m.key.id);

    // Khusus untuk pesan dari bot sendiri
    if (m.key.fromMe) {
      // Hanya proses jika ini adalah bagian dari permainan yang sedang berlangsung
      if (!gameState[from]?.isPlaying && !messageText.startsWith('!')) {
        return;
      }
      botResponses.add(m.key.id);
    }

    const isGroup = from.endsWith("@g.us");
    const sender = isGroup ? m.key.participant : m.key.remoteJid;

    // Fitur membuat stiker
    if (messageText === '!stiker' && m.message.imageMessage) {
      console.log("Pesan gambar diterima.");

      try {
        // Unduh gambar menggunakan fungsi downloadMediaMessage
        const buffer = await downloadMediaMessage(m, "buffer", {}, { logger: P({ level: "silent" }) });
        console.log("Gambar berhasil diunduh:", buffer ? "Ya" : "Tidak");

        if (!buffer) {
          await sock.sendMessage(from, {
            text: "Maaf, terjadi kesalahan saat mengunduh gambar.",
          });
          return;
        }

        console.time("Proses gambar");
        const stickerBuffer = await sharp(buffer)
          .resize(512, 512, { fit: "contain" }) // Batasi ukuran gambar
          .webp({ quality: 50 }) // Kurangi kualitas untuk mempercepat proses
          .toBuffer();
        console.timeEnd("Proses gambar");

        await sock.sendMessage(from, { sticker: stickerBuffer });
        console.log("Stiker berhasil dikirim.");
      } catch (error) {
        console.error("Error membuat stiker:", error);
        await sock.sendMessage(from, {
          text: "Maaf, terjadi kesalahan saat membuat stiker.",
        });
      }
      return;
    }

    if (messageText === "!help") {
      const help =
        `____________________________________
Daftar Command Bot:
!pencipta - Pencipta bot
!info - Info grup (khusus grup)
!quote - Tampilkan quote random
!kalkulator [ekspresi] - Hitung ekspresi matematika
!help - Tampilkan bantuan ini
!tebak angka - tebak angka (1-100)
!stiker - Kirim gambar sebagai stiker
______________________________________`;
      await sock.sendMessage(from, { text: help });
    } else if (messageText === "!pencipta") {
      await sock.sendMessage(from, {
        text: "rizki",
      });
    } else if (messageText === "!quote") {
      try {
        const axios = require("axios");
        const res = await axios.get(
          "https://api.gameofthronesquotes.xyz/v1/random",
          {
            timeout: 2000,
          },
        );
        const quote = `"${res.data.sentence}"\n— ${res.data.character.name}`;
        await sock.sendMessage(from, { text: quote });
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
    }
    // Modifikasi bagian handler permainan tebak angka
    else if (messageText === '!tebak angka') {
      // Cek apakah sudah ada permainan yang berlangsung
      if (gameState[from]) {
        await sock.sendMessage(from, {
          text: "Permainan sedang berlangsung. Gunakan 'stop' untuk menghentikan permainan saat ini."
        });
        return;
      }

      // Reset tracking untuk chat ini
      lastProcessedGuess.delete(from);

      // Inisialisasi permainan baru
      gameState[from] = {
        answer: generateRandomNumber(),
        isPlaying: true,
        attempts: 5,
        startTime: Date.now(),
        lastMessageId: null,
        lastGuess: null
      };

      const response = await sock.sendMessage(from, {
        text: `Permainan Tebak Angka dimulai!\nTebak angka antara 1 dan 100.\nKamu memiliki 5 kesempatan dan waktu 60 detik.\nKetik angka tebakanmu, atau "stop" untuk menyerah.`
      });

      // Tandai pesan bot
      botResponses.add(response.key.id);
      return;
    }

    // Modifikasi bagian handler tebakan
    if (gameState[from]?.isPlaying) {
      // Skip jika pesan adalah dari bot atau sudah diproses
      if (botResponses.has(m.key.id) || processedMessages.has(m.key.id)) {
        return;
      }

      // Cek duplikasi tebakan
      if (gameState[from].lastGuess === messageText) {
        return;
      }

      // Update tracking
      gameState[from].lastGuess = messageText;
      processedMessages.add(m.key.id);

      const currentTime = Date.now();
      const elapsedTime = (currentTime - gameState[from].startTime) / 1000;

      // ... rest of your existing game logic ...

      // Tandai respon bot
      const response = await sock.sendMessage(from, {
        text: "Tebakanmu telah diterima. Lanjutkan permainan!"
      });
      botResponses.add(response.key.id);
    }
  });

  // Listen for connection updates
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    console.log("Connection update:", update);

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log("Koneksi terputus, mencoba menghubungkan kembali...");
        setTimeout(() => {
          connectToWhatsApp();
        }, 3000);
      }
    } else if (connection === "open") {
      console.log("Bot berhasil terhubung!");
    }
  });

  // Handle errors
  process.on("uncaughtException", (err) => {
    console.log("Uncaught Exception:", err);
  });

  process.on("unhandledRejection", (err) => {
    console.log("Unhandled Rejection:", err);
  });

  // Listen for creds update
  sock.ev.on("creds.update", saveCreds);
}

// Tambahkan pembersihan cache yang lebih agresif
setInterval(() => {
  processedMessages.clear();
  botResponses.clear();
  lastProcessedGuess.clear();
}, 60 * 1000); // Bersihkan setiap 1 menit

connectToWhatsApp();
