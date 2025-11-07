import fetch from "node-fetch";

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const MIN_SPREAD = 0.7;
const MIN_VOLUME = 100000;

const CHAINS = { ethereum:1, bsc:56, polygon:137, arbitrum:42161, optimism:10, base:8453 };

let cache = { cex: {}, dex: {}, lastScan: 0 };

const CEX_APIS = {
  binance: {
    tickers: async () => {
      const res = await fetch("https://api.binance.com/api/v3/ticker/24hr");
      const data = await res.json();
      return data
        .filter(t => t.symbol.endsWith("USDT") && parseFloat(t.quoteVolume) > MIN_VOLUME)
        .map(t => ({ ex: "binance", symbol: t.symbol, price: parseFloat(t.lastPrice), volume: parseFloat(t.quoteVolume) }));
    }
  },
  bybit: {
    tickers: async () => {
      const res = await fetch("https://api.bybit.com/v5/market/tickers?category=spot");
      const { result } = await res.json();
      return result.list
        .filter(t => t.symbol.endsWith("USDT") && parseFloat(t.turnover24h) > MIN_VOLUME)
        .map(t => ({ ex: "bybit", symbol: t.symbol, price: parseFloat(t.lastPrice), volume: parseFloat(t.turnover24h) }));
    }
  },
  okx: {
    tickers: async () => {
      const res = await fetch("https://www.okx.com/api/v5/market/tickers?instType=SPOT");
      const { data } = await res.json();
      return data
        .filter(t => t.instId.endsWith("-USDT") && parseFloat(t.volCcy24h) > MIN_VOLUME)
        .map(t => ({
          ex: "okx",
          symbol: t.instId.replace("-", ""),
          price: parseFloat(t.last),
          volume: parseFloat(t.volCcy24h)
        }));
    }
  },
  kucoin: {
    tickers: async () => {
      const res = await fetch("https://api.kucoin.com/api/v1/market/allTickers");
      const { data } = await res.json();
      return data.ticker
        .filter(t => t.symbol.endsWith("-USDT") && parseFloat(t.volValue) > MIN_VOLUME)
        .map(t => ({
          ex: "kucoin",
          symbol: t.symbol.replace("-", ""),
          price: parseFloat(t.last),
          volume: parseFloat(t.volValue)
        }));
    }
  },
  gate: {
    tickers: async () => {
      const res = await fetch("https://api.gate.io/api2/1/tickers");
      const data = await res.json();
      return Object.entries(data)
        .filter(([s, v]) => s.endsWith("_usdt") && parseFloat(v.quoteVolume) > MIN_VOLUME)
        .map(([s, v]) => ({
          ex: "gate",
          symbol: s.replace("_", "").toUpperCase(),
          price: parseFloat(v.last),
          volume: parseFloat(v.quoteVolume)
        }));
    }
  },
  bitget: {
    tickers: async () => {
      const res = await fetch("https://api.bitget.com/api/v2/spot/market/tickers");
      const { data } = await res.json();
      return data
        .filter(t => t.symbol.endsWith("USDT") && parseFloat(t.usdtVol) > MIN_VOLUME)
        .map(t => ({
          ex: "bitget",
          symbol: t.symbol,
          price: parseFloat(t.close),
          volume: parseFloat(t.usdtVol)
        }));
    }
  }
};

export async function runScanner() {
  const now = Date.now();
  if (now - cache.lastScan < 5000) {
    console.log("Skip: scanner still running");
    return;
  }
  cache.lastScan = now;
  cache.cex = {};
  cache.dex = {};

  try {
    // --- CEX ---
    for (const [ex, api] of Object.entries(CEX_APIS)) {
      try {
        const tickers = await api.tickers();
        for (const t of tickers) cache.cex[`${ex}_${t.symbol}`] = t;
        console.log(`Loaded ${tickers.length} from ${ex}`);
      } catch (err) {
        console.log(`❌ ${ex}: ${err.message}`);
      }
    }

    // --- DEX ---
    for (const [chain, id] of Object.entries(CHAINS)) {
      try {
        const tokensRes = await fetch(`https://api.1inch.io/v5.2/${id}/tokens`);
        const tokens = (await tokensRes.json()).tokens;
        const usdtAddr = Object.values(tokens).find(t => t.symbol === "USDT")?.address;
        if (!usdtAddr) continue;

        for (const [addr, token] of Object.entries(tokens)) {
          if (addr.toLowerCase() === usdtAddr.toLowerCase()) continue;
          try {
            const quote = await fetch(
              `https://api.1inch.io/v5.2/${id}/quote?fromTokenAddress=${addr}&toTokenAddress=${usdtAddr}&amount=1000000000000000000`
            );
            if (!quote.ok) continue;
            const q = await quote.json();
            const price = parseInt(q.toTokenAmount) / 1e6;
            cache.dex[`${chain}_${token.symbol}/USDT`] = { price };
          } catch {}
        }
      } catch {}
    }

    // --- Сравнение ---
    for (const [cexKey, cexData] of Object.entries(cache.cex)) {
      const [ex, symbol] = cexKey.split("_");
      const base = symbol.replace("USDT", "").replace("-", "");
      for (const [dexKey, dexData] of Object.entries(cache.dex)) {
        if (!dexKey.includes(base)) continue;
        const spread = Math.abs(dexData.price - cexData.price) / cexData.price * 100;
        if (spread >= MIN_SPREAD) {
          const direction = cexData.price < dexData.price ? "BUY CEX → SELL DEX" : "BUY DEX → SELL CEX";
          const msg = `
*АНОМАЛИЯ!*
\`${symbol}\`
\`${ex.toUpperCase()}\` → \`${cexData.price.toFixed(6)}\`
\`${dexKey.split("_")[0].toUpperCase()}\` → \`${dexData.price.toFixed(6)}\`
*Спред:* ${spread.toFixed(2)}%
*Объём:* $${cexData.volume.toLocaleString()}
*${direction}*
          `.trim();

          console.log("🚨 Аномалия:", msg);
          await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: CHAT_ID, text: msg, parse_mode: "Markdown" })
          });
        }
      }
    }

    console.log("✅ Scanner done:", {
      cex: Object.keys(cache.cex).length,
      dex: Object.keys(cache.dex).length
    });
  } catch (e) {
    console.error("❌ Scanner failed:", e);
  }
}
