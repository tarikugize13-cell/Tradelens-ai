require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const path = require("path");

const app = express();

// Render proxy configuration
app.set("trust proxy", 1);

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

// GEMINI AI CONNECTION
async function gemini(contents, maxOutputTokens = 1500, systemInstruction) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const error = new Error(
      "AI is not connected. Add GEMINI_API_KEY in Render Environment Variables."
    );
    error.status = 503;
    throw error;
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const payload = {
    contents,
    generationConfig: {
      maxOutputTokens,
      temperature: 0.3
    }
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json"
  },
  body: JSON.stringify(payload)
});
