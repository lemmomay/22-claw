# Project Structure

```
/root/clawd/demo/api-test-site/
├── README.md           # User documentation
├── package.json        # Dependencies and scripts
├── server.js           # Node.js Express backend
└── public/
    └── index.html      # Frontend UI
```

## What Was Built

✅ **Minimal API testing web app** with:
- Node.js Express backend (server.js)
- Single-page frontend (public/index.html)
- Zero external dependencies beyond Express
- In-memory only (no persistence)

## Features Implemented

1. **Connectivity Test** - Check API endpoints without authentication
2. **Model Discovery** - Fetch available models with API key
3. **Chat Test** - Send test messages to verify API functionality
4. **Auto-detect** - Automatically detect OpenAI vs Anthropic API style
5. **Custom Paths** - Override default endpoints if needed

## API Styles Supported

- **OpenAI**: `/v1/models` + `/v1/chat/completions` with `Authorization: Bearer` header
- **Anthropic**: `/v1/models` + `/v1/messages` with `x-api-key` header

## How to Use

```bash
cd /root/clawd/demo/api-test-site
npm start
```

Then open http://localhost:3000 in your browser.

## Self-Check Results

✅ Syntax check passed
✅ Server starts successfully on port 3000
✅ All files created
✅ Dependencies installed (Express)
