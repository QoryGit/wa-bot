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

// State untuk menyimpan permainan per pengguna
const gameState = {};

// Fungsi untuk menghasilkan angka acak
function generateRandomNumber() {
  return Math.floor(Math.random() * 100) + 1;
}

function generateRandomNumberHard() {
  return Math.floor(Math.random() * 1000) + 1;
}

// Endpoint untuk UptimeRobot
app.get("/", (req, res) => {
  res.send("Bot is running!");
});

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

    // Cegah looping: Abaikan pesan dari bot sendiri kecuali itu adalah perintah
    if (m.key.fromMe && !messageText.startsWith("!")) {
      return;
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
          .resize(512, 512, { fit: "fill" }) // Batasi ukuran gambar
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
!tagall - Tag semua anggota grup (khusus grup)
!quote - Tampilkan quote random
!kalkulator [ekspresi] - Hitung ekspresi matematika
!help - Tampilkan bantuan ini
!tebak angka [mode] - normal dan hard
!stiker - Kirim gambar sebagai stiker
____________________________________`;
      await sock.sendMessage(from, { text: help });
    } else if (messageText === "!pencipta") {
      await sock.sendMessage(from, {
        text: "Rizki",
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

    // Inisialisasi permainan tebak angka
    if (messageText === '!tebak angka normal') {

      // Inisialisasi permainan
      gameState[from] = {
        answer: generateRandomNumber(),
        isPlaying: true,
        range: 100,
        attempts: 5, // Tambahkan jumlah kesempatan
        startTime: Date.now(), // Catat waktu mulai
      };

      await sock.sendMessage(from, {
        text:
          `Permainan Tebak Angka dimulai!\n` +
          `Tebak angka antara 1 dan 100.\n` +
          `Kamu memiliki 5 kesempatan dan waktu 60 detik.\n` +
          `Ketik angka tebakanmu, atau "stop" untuk menyerah.`,
      });
      return;
    } else if (messageText === "!tebak angka hard") {
      // Inisialisasi permainan
      gameState[from] = {
        answer: generateRandomNumberHard(),
        isPlaying: true,
        range: 1000,
        attempts: 5, // Tambahkan jumlah kesempatan
        startTime: Date.now(), // Catat waktu mulai
      };

      await sock.sendMessage(from, {
        text:
          `Permainan Tebak Angka dimulai!\n` +
          `Tebak angka antara 1 dan 1000.\n` +
          `Kamu memiliki 5 kesempatan dan waktu 60 detik.\n` +
          `Ketik angka tebakanmu, atau "stop" untuk menyerah.`,
      });
      return;
    }

    // Tangani tebakan atau perintah stop
    if (gameState[from]?.isPlaying) {
      const currentTime = Date.now();
      const elapsedTime = (currentTime - gameState[from].startTime) / 1000; // Hitung waktu berlalu dalam detik

      // Periksa apakah waktu sudah habis
      if (elapsedTime > 60) {
        const { answer } = gameState[from];
        delete gameState[from];
        await sock.sendMessage(from, {
          text:
            `Waktu habis! Permainan dihentikan.\n` +
            `Angka yang benar adalah ${answer}.`,
        });
        return;
      }

      if (messageText === 'stop') {
        const { answer } = gameState[from];
        delete gameState[from];
        await sock.sendMessage(from, {
          text:
            `Permainan dihentikan.\n` +
            `Angka yang benar adalah ${answer}.`,
        });
        return;
      }

      const guess = parseInt(messageText);
      if (isNaN(guess) || guess < 1 || guess > gameState[from].range) {
        await sock.sendMessage(from, {
          text: 'Ketik angka antara 1 dan 100, atau "stop" untuk menyerah.',
        });
        return;
      }

      const { answer, attempts } = gameState[from];

      // Kurangi jumlah kesempatan
      gameState[from].attempts -= 1;

      if (guess === answer) {
        delete gameState[from];
        await sock.sendMessage(from, {
          text:
            `Selamat, kamu menang!\n` +
            `Angka yang benar adalah ${answer}.`,
        });
      } else if (gameState[from].attempts <= 0) {
        delete gameState[from];
        await sock.sendMessage(from, {
          text:
            `Kesempatan habis! Permainan dihentikan.\n` +
            `Angka yang benar adalah ${answer}.`,
        });
      } else if (guess > answer) {
        await sock.sendMessage(from, {
          text: `Tebakanmu terlalu tinggi! Coba lagi.\n` +
            `Kesempatan tersisa: ${gameState[from].attempts}.`,
        });
      } else {
        await sock.sendMessage(from, {
          text: `Tebakanmu terlalu rendah! Coba lagi.\n` +
            `Kesempatan tersisa: ${gameState[from].attempts}.`,
        });
      }
      return;
    }

    if (messageText === "!tagall" && isGroup) {
      try {
        const groupMetadata = await sock.groupMetadata(from);
        const participants = groupMetadata.participants.map(p => p.id);
        const mentionText = participants.map(id => `@${id.split("@")[0]}`).join(" ");
        await sock.sendMessage(from, {
          text: `Tag semua anggota:\n${mentionText}`,
          mentions: participants
        });
      } catch (err) {
        await sock.sendMessage(from, { text: "Gagal mengambil data grup atau tag anggota." });
      }
      return;
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

connectToWhatsApp();
