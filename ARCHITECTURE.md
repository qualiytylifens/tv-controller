# TradingView Automation Engine
## For COIN-SMART TRADER

### Overview
This system gives Claude (AI) direct control over TradingView to:
- Monitor alerts and indicators
- Create/update/delete alerts
- Deploy Pine Script indicators
- Fix issues automatically
- Manage member access to premium tools

---

## System Components

### 1. TV-CONTROLLER (Puppeteer Service)
Runs as a separate service on Railway that:
- Maintains authenticated TradingView session
- Exposes REST API for Claude to control
- Executes browser automation commands

### 2. WEBHOOK RECEIVER (Already exists in bot)
- Receives alerts from TradingView
- Parses BEAST signals
- Notifies Claude of incoming data

### 3. CLAUDE BRIDGE
- Connects AI to TV-CONTROLLER
- Allows natural language commands like "update BEAST alert for BTC"

---

## TV-CONTROLLER API Endpoints

### Authentication
```
POST /tv/login
Body: { username, password }
Response: { success: true, session: "active" }
```

### Alerts Management
```
GET /tv/alerts
Response: { alerts: [...] }

POST /tv/alerts/create
Body: { 
  symbol: "BTCUSDT",
  condition: "THE BEAST",
  webhook: "https://your-bot.railway.app/webhook/beast",
  message: "BTC | BEAST | Score: {{score}} | Action: {{action}}"
}

DELETE /tv/alerts/:id
```

### Indicator Management
```
GET /tv/indicators
Response: { indicators: [...] }

POST /tv/indicators/create
Body: {
  name: "THE BEAST v2.1",
  code: "// Pine Script code here...",
  publish: false
}

PUT /tv/indicators/:id
Body: { code: "// Updated Pine Script..." }
```

### Chart Control
```
POST /tv/chart/symbol
Body: { symbol: "BINANCE:BTCUSDT" }

POST /tv/chart/timeframe  
Body: { timeframe: "1H" }

GET /tv/chart/screenshot
Response: { image: "base64..." }
```

---

## Membership System

### Tiers
1. **FREE** - Basic alerts, limited coins
2. **PRO ($29/mo)** - THE BEAST for all coins, webhook access
3. **ELITE ($99/mo)** - Custom indicators, AI analysis, priority signals

### Member Management
```
POST /members/create
Body: { email, tier, tradingview_username }

POST /members/grant-access
Body: { member_id, indicator_id }

POST /members/revoke-access
Body: { member_id, indicator_id }
```

---

## File Structure

```
tradingview-automation/
├── src/
│   ├── controller.js      # Main Puppeteer controller
│   ├── auth.js            # TradingView login handler
│   ├── alerts.js          # Alert CRUD operations
│   ├── indicators.js      # Indicator management
│   ├── charts.js          # Chart navigation
│   ├── api.js             # Express REST API
│   └── claude-bridge.js   # AI integration
├── scripts/
│   ├── pine/              # Pine Script templates
│   │   ├── beast-v2.pine
│   │   └── templates/
│   └── deploy.js          # Deployment helpers
├── config/
│   ├── coins.json         # Supported trading pairs
│   └── webhooks.json      # Webhook configurations
├── package.json
└── Dockerfile
```

---

## Security Considerations

1. **TradingView Credentials**
   - Stored as Railway environment variables
   - Never logged or exposed
   - Session tokens rotated regularly

2. **API Authentication**
   - Internal API protected by secret key
   - Only accessible from main bot service

3. **Rate Limiting**
   - TradingView has rate limits
   - Automation respects 2-3 second delays between actions
   - Max 100 alerts per account (Premium)

---

## Deployment

### Railway Setup
1. Create new service: `tv-controller`
2. Add environment variables:
   - TV_USERNAME
   - TV_PASSWORD
   - API_SECRET
   - BOT_WEBHOOK_URL

3. Deploy with Dockerfile

### Integration with Main Bot
Add to main bot's environment:
- TV_CONTROLLER_URL=https://tv-controller.railway.app
- TV_API_SECRET=your-secret-key

---

## Claude Commands (Natural Language)

When integrated, Claude can execute:

- "Check my TradingView alerts"
- "Create BEAST alert for SOL"
- "Update all BEAST alerts with new webhook"
- "Take screenshot of BTC 4H chart"
- "Deploy new version of THE BEAST"
- "Grant PRO access to user@email.com"
- "How many alerts fired today?"

---

## Next Steps

1. Build TV-Controller service
2. Test with your TradingView account
3. Integrate with main bot
4. Add membership management
5. Create sales page for indicator subscriptions
