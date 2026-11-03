require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const path = require("path");

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 4 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      return cb(new Error("Please upload image files only."));
    }
    cb(null, true);
  }
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.use("/api/", rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false
}));

const STRATEGIES = [
  "SMC / ICT",
  "Price Action",
  "Support & Resistance",
  "Trend Following",
  "Supply & Demand",
  "Breakout & Retest",
  "Moving Averages",
  "RSI / MACD",
  "Fibonacci",
  "Scalping",
  "Swing Trading",
  "Multi-strategy confluence"
];

async function openAI(messages, maxOutputTokens = 1500) {
  if (!process.env.OPENAI_API_KEY) {
    const e = new Error("AI is not connected. Add OPENAI_API_KEY.");
    e.status = 503;
    throw e;
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: messages,
      max_output_tokens: maxOutputTokens
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const e = new Error(data?.error?.message || "AI service error.");
    e.status = response.status;
    throw e;
  }

  return (data.output || [])
    .flatMap(x => x.content || [])
    .filter(x => x.type === "output_text")
    .map(x => x.text)
    .join("\n");
}

app.get("/api/status", (_req, res) => {
  res.json({
    aiReady: Boolean(process.env.OPENAI_API_KEY),
    marketDataReady: Boolean(process.env.TWELVE_DATA_API_KEY),
    strategies: STRATEGIES
  });
});

app.get("/api/quote", async (req, res) => {
  try {
    if (!process.env.TWELVE_DATA_API_KEY) {
      return res.status(503).json({
        error: "Add TWELVE_DATA_API_KEY on the server."
      });
    }

    const symbol = String(req.query.symbol || "EUR/USD")
      .replace(/[^A-Z/]/gi, "")
      .toUpperCase();

    if (!/^[A-Z]{3}\/[A-Z]{3}$/.test(symbol)) {
      return res.status(400).json({
        error: "Use a forex pair like EUR/USD."
      });
    }

    const url = new URL("https://api.twelvedata.com/quote");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("apikey", process.env.TWELVE_DATA_API_KEY);

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || data.status === "error" || !data.close) {
      return res.status(502).json({
        error: data.message || "Quote unavailable."
      });
    }

    res.json({
      symbol,
      price: data.close,
      change: data.change,
      percentChange: data.percent_change,
      timestamp: data.datetime,
      source: "Twelve Data"
    });

  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get("/api/candles", async (req, res) => {
  try {
    if (!process.env.TWELVE_DATA_API_KEY) {
      return res.status(503).json({
        error: "Add TWELVE_DATA_API_KEY."
      });
    }

    const symbol = String(req.query.symbol || "EUR/USD")
      .replace(/[^A-Z/]/gi, "")
      .toUpperCase();

    const interval = String(req.query.interval || "5min");

    const allowed = [
      "1min", "5min", "15min",
      "30min", "1h", "4h", "1day"
    ];

    if (!/^[A-Z]{3}\/[A-Z]{3}$/.test(symbol) ||
        !allowed.includes(interval)) {
      return res.status(400).json({
        error: "Invalid pair or timeframe."
      });
    }

    const url = new URL("https://api.twelvedata.com/time_series");

    for (const [key, value] of Object.entries({
      symbol,
      interval,
      outputsize: "40",
      apikey: process.env.TWELVE_DATA_API_KEY
    })) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || data.status === "error" || !data.values) {
      return res.status(502).json({
        error: data.message || "Candles unavailable."
      });
    }

    res.json({
      meta: data.meta,
      values: data.values,
      source: "Twelve Data"
    });

  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.post("/api/analyze", upload.array("charts", 4), async (req, res) => {
  try {
    const files = req.files || [];

    if (!files.length) {
      return res.status(400).json({
        error: "Upload at least one chart screenshot."
      });
    }

    const pair = String(req.body.pair || "EUR/USD").slice(0, 30);
    const timeframe = String(req.body.timeframe || "5m").slice(0, 20);
    const strategy = String(req.body.strategy || "Multi-strategy confluence").slice(0, 60);
    const notes = String(req.body.notes || "").slice(0, 2500);

    const prompt = `
You are TradeLens AI, an expert forex chart analyst and teacher.

Analyze the uploaded chart screenshots carefully.

Instrument: ${pair}
Timeframe: ${timeframe}
Strategy: ${strategy}
Extra information: ${notes || "None"}

Be direct, clear and honest.

Do not invent prices, indicators, BOS, FVG, order blocks,
liquidity sweeps or levels that are not visible.

Analyze relevant strategies:
- SMC / ICT
- BOS and CHOCH
- Liquidity sweep
- Order blocks
- Fair Value Gaps
- Price action
- Support and resistance
- Trend analysis
- Supply and demand
- Breakout and retest
- Moving averages
- RSI and MACD
- Fibonacci
- Scalping
- Swing trading

Do not force every strategy onto every chart.

Use these headings:

1. DECISION
Choose exactly one:
BUY BIAS / SELL BIAS / WAIT.

2. CHART READ
Explain trend, structure and momentum.

3. STRATEGY CHECK
Explain which strategies are confirmed
and which are not confirmed.

4. KEY LEVELS
Give only levels clearly visible in the chart.

5. ENTRY PLAN
Explain possible entry conditions,
stop loss idea and take profit areas.

6. RISK MANAGEMENT
Explain risk/reward and position risk.
Suggest risking only 0.5%-1% per trade.

7. LESSON
Teach the user why you reached this conclusion.

If the chart is unclear, choose WAIT.
Never guarantee profits.
Do not force a trade.
`;

    const content = [{ type: "input_text", text: prompt }];

    for (const file of files) {
      content.push({
        type: "input_image",
        image_url: `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
        detail: "high"
      });
    }

    const answer = await openAI([
      { role: "user", content }
    ], 1800);

    res.json({ answer });

  } catch (e) {
    res.status(e.status || 400).json({
      error: e.message || "Analysis failed."
    });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const message = String(req.body.message || "").slice(0, 5000);

    const history = Array.isArray(req.body.history)
      ? req.body.history.slice(-8)
      : [];

    if (!message.trim()) {
      return res.status(400).json({
        error: "Write a message first."
      });
    }

    const instructions = `
You are TradeLens AI, a patient forex tutor.

Teach forex, technical analysis, risk management,
SMC, ICT, FVG, order blocks, liquidity sweeps,
BOS, CHOCH, trading psychology and platform basics.

Answer clearly and simply.

Never promise profits.
Never encourage reckless leverage.
Never invent live market prices.

If a current readable chart is not provided,
do not guess BUY or SELL. Say WAIT.
`;

    const input = [
      { role: "system", content: instructions },

      ...history
        .filter(m => ["user", "assistant"].includes(m.role))
        .map(m => ({
          role: m.role,
          content: String(m.content).slice(0, 3000)
        })),

      { role: "user", content: message }
    ];

    const answer = await openAI(input, 1000);

    res.json({ answer });

  } catch (e) {
    res.status(e.status || 400).json({
      error: e.message || "Chat failed."
    });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`TradeLens AI listening on port ${PORT}`);
});
