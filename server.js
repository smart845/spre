import express from "express";
import { runScanner } from "./scanner.js";
// --- Telegram test message on startup ---
import fetch from "node-fetch";

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

if (TELEGRAM_TOKEN && CHAT_ID) {
  const testMessage = encodeURIComponent("✅ Bot connected successfully on Render!");
  fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${testMessage}`)
    .then(res => res.json())
    .then(data => {
      console.log("Telegram test message sent:", data);
    })
    .catch(err => {
      console.error("Failed to send Telegram message:", err);
    });
} else {
  console.log("⚠️ TELEGRAM_TOKEN or CHAT_ID not set in environment variables");
}
const app = express();

app.get("/", (req, res) => res.send("CEX–DEX Anomaly Scanner active"));
app.get("/scan", async (req, res) => {
  await runScanner();
  res.send("Scanner executed");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
