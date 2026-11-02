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
    if (!file.mimetype || !file.mimetype.startsWith("image/")) return cb(new Error("Please upload image files only."));
    cb(null, true);
  }
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/api/", rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }));

const STRATEGIES = [
  "SMC / ICT", "Price Action", "Support & Resistance", "Trend Following",
  "Supply & Demand", "Breakout & Retest", "Moving Averages", "RSI / MACD",
  "Fibonacci", "Scalping", "Swing Trading", "Multi-strategy confluence"
];

async function openAI(messages, maxOutputTokens = 1500) {
  if (!process.env.OPENAI_API_KEY) {
    const e = new Error("AI is not connected yet. The site owner must add OPENAI_API_KEY in the hosting environment.");
    e.status = 503; throw e;
  }
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4.1-mini", input: messages, max_output_tokens: maxOutputTokens })
  });
  const data = await r.json();
  if (!r.ok) { const e = new Error(data?.error?.message || "AI service error."); e.status = r.status; throw e; }
  return (data.output || []).flatMap(x => x.content || []).filter(x => x.type === "output_text").map(x => x.text).join("\n");
}

app.get("/api/status", (_req, res) => res.json({
  aiReady: Boolean(process.env.OPENAI_API_KEY),
  marketDataReady: Boolean(process.env.TWELVE_DATA_API_KEY),
  strategies: STRATEGIES
}));

app.get("/api/quote", async (req, res) => {
  try {
    if (!process.env.TWELVE_DATA_API_KEY) return res.status(503).json({ error: "Live data is not connected. Add TWELVE_DATA_API_KEY on the server." });
    const symbol = String(req.query.symbol || "EUR/USD").replace(/[^A-Z/]/gi, "").toUpperCase();
    if (!/^[A-Z]{3}\\/[A-Z]{3}$/.test(symbol)) return res.status(400).json({ error: "Use a forex pair like EUR/USD." });
    const url = new URL("https://api.twelvedata.com/quote");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("apikey", process.env.TWELVE_DATA_API_KEY);
    const r = await fetch(url);
    const data = await r.json();
    if (!r.ok || data.status === "error" || !data.close) return res.status(502).json({ error: data.message || "Quote unavailable from market-data provider." });
    res.json({ symbol, price: data.close, change: data.change, percentChange: data.percent_change, timestamp: data.datetime, source: "Twelve Data" });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get("/api/candles", async (req, res) => {
  try {
    if (!process.env.TWELVE_DATA_API_KEY) return res.status(503).json({ error: "Live candles need a TWELVE_DATA_API_KEY." });
    const symbol = String(req.query.symbol || "EUR/USD").replace(/[^A-Z/]/gi, "").toUpperCase();
    const interval = String(req.query.interval || "5min");
    const allowed = ["1min","5min","15min","30min","1h","4h","1day"];
    if (!/^[A-Z]{3}\\/[A-Z]{3}$/.test(symbol) || !allowed.includes(interval)) return res.status(400).json({ error: "Invalid pair or timeframe." });
    const url = new URL("https://api.twelvedata.com/time_series");
    for (const [k,v] of Object.entries({symbol, interval, outputsize:"40", apikey:process.env.TWELVE_DATA_API_KEY})) url.searchParams.set(k,v);
    const r = await fetch(url); const data = await r.json();
    if (!r.ok || data.status === "error" || !data.values) return res.status(502).json({ error: data.message || "Candles unavailable." });
    res.json({ meta: data.meta, values: data.values, source: "Twelve Data" });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.post("/api/analyze", upload.array("charts", 4), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: "Upload at least one chart screenshot." });
    const pair = String(req.body.pair || "EUR/USD").slice(0,30);
    const timeframe = String(req.body.timeframe || "5m").slice(0,20);
    const strategy = String(req.body.strategy || "Multi-strategy confluence").slice(0,60);
    const notes = String(req.body.notes || "").slice(0,2500);
    const prompt = `You are TradeLens AI, a forex chart analyst and teacher. Analyze ONLY what is visible in the screenshots and user-provided context. Instrument: ${pair}; timeframe: ${timeframe}; requested strategy: ${strategy}; extra context: ${notes || "None"}.
Be direct but honest. Do not invent live prices, candle closes, indicators, BOS, FVG, order blocks, liquidity sweeps, or exact levels. If labels conflict or are unreadable, flag it. A screenshot is not live data.
Cover all relevant approaches from this library where appropriate: SMC/ICT (BOS, CHOCH, liquidity, OB, FVG), price action, support/resistance, trend, supply/demand, breakout/retest, moving averages, RSI/MACD, Fibonacci, scalping and swing context. Do not force every strategy onto every chart.
Use these headings:
DECISION — exactly one: BUY BIAS / SELL BIAS / WAIT.
CHART READ — trend, structure, momentum, visible volume.
STRATEGY CHECK — evidence and what is NOT CONFIRMED.
KEY LEVELS — only readable levels.
CONDITIONAL TRADE PLAN — entry trigger, invalidation/SL idea, target areas; if unsupported say NO TRADE, do not fabricate.
RISK — explain risk/reward; remind user to risk only a small amount (e.g. 0.5%-1%) and that leveraged forex can lose money quickly.
LESSON — explain the reasoning in simple language.
No guaranteed wins, no certainty claims. Prefer WAIT to a forced trade.`;
    const content = [{type:"input_text", text:prompt}];
    for (const f of files) content.push({type:"input_image", image_url:`data:${f.mimetype};base64,${f.buffer.toString("base64")}`, detail:"high"});
    const answer = await openAI([{role:"user", content}], 1800);
    res.json({ answer });
  } catch (e) { res.status(e.status || 400).json({ error: e.message || "Analysis failed." }); }
});

app.post("/api/chat", async (req, res) => {
  try {
    const message = String(req.body.message || "").slice(0,5000);
    const history = Array.isArray(req.body.history) ? req.body.history.slice(-8) : [];
    if (!message.trim()) return res.status(400).json({ error: "Write a message first." });
    const instructions = `You are TradeLens AI, a patient forex tutor and trading assistant. Answer clearly and simply. Teach forex, technical analysis, risk management, strategy concepts and platform basics. Never promise profits or encourage reckless leverage. For requests for a live price, explain that the Live Market panel is the source; do not invent a quote. If asked for BUY/SELL without a current readable chart and context, say WAIT rather than guessing.`;
    const input = [{role:"system", content:instructions}, ...history.filter(m => ["user","assistant"].includes(m.role)).map(m => ({role:m.role, content:String(m.content).slice(0,3000)})), {role:"user", content:message}];
    const answer = await openAI(input, 1000);
    res.json({ answer });
  } catch (e) { res.status(e.status || 400).json({ error: e.message || "Chat failed." }); }
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`TradeLens AI listening on port ${port}`));