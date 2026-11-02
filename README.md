# TradeLens AI — full website project

This is a complete mobile-friendly Node.js website project with:
- Chart screenshot upload and AI visual analysis (up to 4 images)
- BUY BIAS / SELL BIAS / WAIT decision framework with conditional trade plans
- Strategy focus selector and strategy learning library
- AI forex tutor chat
- Browser speech-to-text input and text-to-speech readout where supported
- Live forex quote and candle endpoints via Twelve Data
- API keys stored server-side only

## Required external credentials
The website source is complete, but real AI and live market data cannot work until the site owner supplies valid provider credentials:
- `OPENAI_API_KEY` — required for AI chart analysis and chat
- `TWELVE_DATA_API_KEY` — required for live quotes and candles

ChatGPT subscriptions do not automatically include API usage credits. API billing/limits are controlled separately by the provider. Do not put keys in public frontend files or send them in chat.

## Run locally
1. Install Node.js 18 or newer.
2. Extract this ZIP.
3. In this folder run `npm install`.
4. Copy `.env.example` to `.env`.
5. Add the two API keys to `.env`.
6. Run `npm start`.
7. Open `http://localhost:3000`.

## Deploy
Deploy this project to any Node.js hosting provider that supports environment variables. Set the start command to `npm start`, use Node 18+, and add `OPENAI_API_KEY`, `OPENAI_MODEL` (optional), and `TWELVE_DATA_API_KEY` in the provider's private environment-variable settings. The project is not published to a public URL by generating this ZIP; deployment requires an account and authorization on a hosting provider.

## Notes
- Live quote/candle availability, delays, rate limits and supported symbols depend on your Twelve Data plan.
- The chart report analyzes screenshots; it is not a broker connection and does not place trades.
- No model can guarantee a BUY/SELL outcome. It should return WAIT when evidence is unclear.
- XAU/USD may be treated as a commodity symbol by the data provider and may require a plan that supports it.
