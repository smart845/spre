import express from "express";
import { runScanner } from "./scanner.js";

const app = express();

app.get("/", (req, res) => res.send("CEX–DEX Anomaly Scanner active"));
app.get("/scan", async (req, res) => {
  await runScanner();
  res.send("Scanner executed");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
