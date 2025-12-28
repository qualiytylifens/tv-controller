// ═══════════════════════════════════════════════════════════════════════════
// TV-CLIENT: Connect main bot to TV-Controller
// Add this to your main index.js to give Claude control over TradingView
// ═══════════════════════════════════════════════════════════════════════════

const fetch = require('node-fetch');

// Configuration
const TV_CONTROLLER_URL = process.env.TV_CONTROLLER_URL || 'http://localhost:3001';
const TV_API_SECRET = process.env.TV_API_SECRET || 'your-secret-key';

// ═══════════════════════════════════════════════════════════════════════════
// TV CONTROLLER CLIENT
// ═══════════════════════════════════════════════════════════════════════════

const tvController = {
  // Make API request to TV Controller
  async request(endpoint, method = 'GET', body = null) {
    try {
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': TV_API_SECRET
        }
      };
      
      if (body) {
        options.body = JSON.stringify(body);
      }
      
      const response = await fetch(`${TV_CONTROLLER_URL}${endpoint}`, options);
      return await response.json();
    } catch (error) {
      console.error(`TV Controller error: ${error.message}`);
      return { error: error.message, success: false };
    }
  },
  
  // Check if TV Controller is running
  async isOnline() {
    try {
      const result = await this.request('/health');
      return result.status === 'ok';
    } catch {
      return false;
    }
  },
  
  // Get status
  async getStatus() {
    return this.request('/status');
  },
  
  // Login to TradingView
  async login() {
    return this.request('/tv/login', 'POST');
  },
  
  // Get all alerts
  async getAlerts() {
    return this.request('/tv/alerts');
  },
  
  // Create single alert
  async createAlert(config) {
    return this.request('/tv/alerts', 'POST', config);
  },
  
  // Create alerts for multiple coins
  async createBulkAlerts(coins, condition = 'THE BEAST', messageTemplate = null) {
    const template = messageTemplate || '{{coin}} | BEAST | Score: {{plot_0}} | Action: ALERT';
    return this.request('/tv/alerts/bulk', 'POST', {
      coins,
      condition,
      webhook: process.env.BOT_WEBHOOK_URL || 'https://coin-smart-bot.up.railway.app/webhook/beast',
      messageTemplate: template
    });
  },
  
  // Delete alert
  async deleteAlert(alertId) {
    return this.request(`/tv/alerts/${alertId}`, 'DELETE');
  },
  
  // Change chart symbol
  async setSymbol(symbol) {
    return this.request('/tv/chart/symbol', 'POST', { symbol });
  },
  
  // Change timeframe
  async setTimeframe(timeframe) {
    return this.request('/tv/chart/timeframe', 'POST', { timeframe });
  },
  
  // Take screenshot
  async screenshot() {
    return this.request('/tv/chart/screenshot');
  },
  
  // Create indicator
  async createIndicator(name, code) {
    return this.request('/tv/indicators', 'POST', { name, code });
  },
  
  // Natural language command (for Claude)
  async executeCommand(command) {
    return this.request('/claude/command', 'POST', { command });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CLAUDE INTEGRATION - Add these capabilities to Claude's context
// ═══════════════════════════════════════════════════════════════════════════

const tvCapabilities = `
🔧 TRADINGVIEW CONTROL:
You have access to control TradingView through the TV-Controller service.

AVAILABLE ACTIONS:
- tvController.login() - Log into TradingView
- tvController.getAlerts() - List all alerts
- tvController.createAlert({ symbol, condition, webhook, message, name }) - Create alert
- tvController.createBulkAlerts(['BTCUSDT', 'ETHUSDT', ...]) - Create alerts for multiple coins
- tvController.deleteAlert(alertId) - Delete an alert
- tvController.setSymbol('BINANCE:BTCUSDT') - Change chart symbol
- tvController.setTimeframe('4H') - Change timeframe
- tvController.screenshot() - Take chart screenshot
- tvController.createIndicator(name, pineCode) - Create Pine Script indicator
- tvController.executeCommand('natural language') - Execute natural language command

EXAMPLE USAGE:
- "Create BEAST alert for BTC" → tvController.createAlert({ symbol: 'BINANCE:BTCUSDT', condition: 'THE BEAST', ... })
- "Set up all 11 coins" → tvController.createBulkAlerts(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', ...])
- "Check my alerts" → tvController.getAlerts()
- "Show me the BTC chart" → tvController.setSymbol('BINANCE:BTCUSDT') then tvController.screenshot()
`;

// ═══════════════════════════════════════════════════════════════════════════
// BOT COMMANDS FOR TV CONTROL
// ═══════════════════════════════════════════════════════════════════════════

// These can be added to your main bot's command handlers

const tvBotCommands = {
  // /tv_status - Check TV Controller status
  async status(bot, chatId) {
    const online = await tvController.isOnline();
    if (!online) {
      return bot.sendMessage(chatId, '❌ TV Controller is offline');
    }
    
    const status = await tvController.getStatus();
    bot.sendMessage(chatId, `
📺 *TRADINGVIEW CONTROLLER*
━━━━━━━━━━━━━━━━━━━━━━
🌐 Status: ${online ? '🟢 Online' : '🔴 Offline'}
🔐 Logged In: ${status.loggedIn ? 'Yes' : 'No'}
🖥️ Browser: ${status.browser}
⏱️ Last Activity: ${status.lastActivity || 'Never'}
    `, { parse_mode: 'Markdown' });
  },
  
  // /tv_login - Login to TradingView
  async login(bot, chatId) {
    bot.sendMessage(chatId, '🔐 Logging into TradingView...');
    const result = await tvController.login();
    bot.sendMessage(chatId, result.success ? '✅ Logged in!' : '❌ Login failed');
  },
  
  // /tv_alerts - List alerts
  async alerts(bot, chatId) {
    const result = await tvController.getAlerts();
    if (result.error) {
      return bot.sendMessage(chatId, `❌ Error: ${result.error}`);
    }
    
    let msg = `📋 *TRADINGVIEW ALERTS* (${result.alerts?.length || 0})\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    for (const alert of result.alerts || []) {
      msg += `${alert.active ? '🟢' : '🔴'} ${alert.name} - ${alert.symbol}\n`;
    }
    bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  },
  
  // /tv_create [coin] - Create BEAST alert
  async createAlert(bot, chatId, coin) {
    bot.sendMessage(chatId, `🔔 Creating BEAST alert for ${coin}...`);
    
    const result = await tvController.createAlert({
      symbol: `BINANCE:${coin}USDT`,
      condition: 'THE BEAST',
      webhook: process.env.BOT_WEBHOOK_URL,
      message: `${coin} | BEAST | Score: {{plot_0}} | Grade: {{plot_1}}`,
      name: `BEAST - ${coin}`
    });
    
    bot.sendMessage(chatId, result.success ? `✅ Alert created for ${coin}!` : `❌ Failed: ${result.error}`);
  },
  
  // /tv_setup_all - Create alerts for all 11 coins
  async setupAll(bot, chatId) {
    const coins = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT', 'ADAUSDT', 'PEPEUSDT', 'SUIUSDT'];
    
    bot.sendMessage(chatId, `🔧 Setting up BEAST alerts for all ${coins.length} coins...\nThis may take a few minutes.`);
    
    const result = await tvController.createBulkAlerts(coins);
    
    if (result.error) {
      return bot.sendMessage(chatId, `❌ Error: ${result.error}`);
    }
    
    const success = result.results?.filter(r => r.success).length || 0;
    const failed = result.results?.filter(r => !r.success).length || 0;
    
    bot.sendMessage(chatId, `
✅ *BEAST ALERTS SETUP COMPLETE*
━━━━━━━━━━━━━━━━━━━━━━
✅ Success: ${success}
❌ Failed: ${failed}
📊 Total: ${coins.length}
    `, { parse_mode: 'Markdown' });
  },
  
  // /tv_screenshot [symbol] - Take chart screenshot
  async screenshot(bot, chatId, symbol = 'BTCUSDT') {
    bot.sendMessage(chatId, `📸 Taking screenshot of ${symbol}...`);
    
    await tvController.setSymbol(`BINANCE:${symbol}`);
    const result = await tvController.screenshot();
    
    if (result.image) {
      const buffer = Buffer.from(result.image, 'base64');
      await bot.sendPhoto(chatId, buffer, { caption: `📊 ${symbol} Chart` });
    } else {
      bot.sendMessage(chatId, `❌ Failed to take screenshot: ${result.error}`);
    }
  }
};

module.exports = { tvController, tvCapabilities, tvBotCommands };
