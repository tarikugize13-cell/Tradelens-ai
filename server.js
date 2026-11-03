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

const data = await response.json();

if (!response.ok) {
  throw new Error(data.error?.message || "Gemini API request failed");
}

return data;
}// AI STATUS
app.get("/api/status", (req, res) => {
  res.json({
    aiReady: Boolean(process.env.GEMINI_API_KEY),
    aiProvider: "Gemini",
    marketDataReady: Boolean(process.env.TWELVE_DATA_API_KEY),
    strategies: STRATEGIES
  });
});

// CHART ANALYSIS
app.post("/api/analyze", upload.array("charts", 4), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: "Please upload at least one chart image."
      });
    }

    const question = req.body.question ||
      "Analyze this forex chart using technical analysis, SMC and ICT concepts.";

    const parts = [
      {
        text: `
You are TradeLens AI, a professional forex chart analysis assistant.

Analyze the uploaded chart carefully.

User question: ${question}

Use these strategies where relevant:
${STRATEGIES.join(", ")}

Give your answer in this format:

1. MARKET DIRECTION: Bullish, Bearish, or Sideways.
2. TRADE DECISION: BUY, SELL, or WAIT.
3. ENTRY ZONE: Give a clear price zone if visible.
4. STOP LOSS: Explain the logical invalidation level.
5. TAKE PROFIT: TP1, TP2 and TP3 if identifiable.
6. MARKET STRUCTURE: Explain BOS or CHoCH.
7. LIQUIDITY: Identify possible liquidity sweeps.
8. FVG / ORDER BLOCK: Identify them if visible.
9. REASON: Explain the evidence from the chart.
10. RISK WARNING: Explain what could invalidate the setup.

Do not invent prices that cannot be read from the chart.
If the chart is unclear, say so.
Never guarantee profits.
`
      }
    ];

    for (const file of req.files) {
      parts.push({
        inlineData: {
          mimeType: file.mimetype,
          data: file.buffer.toString("base64")
        }
      });
    }

    const result = await gemini(
      [{ role: "user", parts }],
      2500
    );

    const answer =
      result.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("\n") || "No analysis was returned.";

    res.json({
      success: true,
      answer,
      analysis: answer
    });

  } catch (error) {
    console.error("Analysis error:", error);
    res.status(error.status || 500).json({
      error: error.message || "Chart analysis failed."
    });
  }
});

// AI CHAT
app.post("/api/chat", async (req, res) => {
  try {
    const message = req.body.message;

    if (!message) {
      return res.status(400).json({
        error: "Please enter a message."
      });
    }

    const result = await gemini(
      [{
        role: "user",
        parts: [{ text: message }]
      }],
      1500
    );

    const reply =
      result.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("\n") || "No response received.";

    res.json({
      success: true,
      reply,
      answer: reply
    });

  } catch (error) {
    console.error("Chat error:", error);
    res.status(error.status || 500).json({
      error: error.message || "Chat failed."
    });
  }
});

// ERROR HANDLER
app.use((error, req, res, next) => {
  console.error("Server error:", error);

  res.status(error.status || 500).json({
    error: error.message || "Something went wrong."
  });
});

// START SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`TradeLens AI listening on port ${PORT}`);
});
