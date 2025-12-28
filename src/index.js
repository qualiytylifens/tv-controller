// ═══════════════════════════════════════════════════════════════════════════
// TV-CONTROLLER: TradingView Automation Engine
// Gives Claude AI direct control over TradingView
// ═══════════════════════════════════════════════════════════════════════════

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Use stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(express.json());

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  TV_USERNAME: process.env.TV_USERNAME,
  TV_PASSWORD: process.env.TV_PASSWORD,
  API_SECRET: process.env.API_SECRET || 'your-secret-key',
  BOT_WEBHOOK_URL: process.env.BOT_WEBHOOK_URL || 'https://coin-smart-bot.up.railway.app/webhook/beast',
  PORT: process.env.PORT || 3001,
  HEADLESS: process.env.HEADLESS !== 'false', // Default headless for Railway
  DELAY: 2000 // Delay between actions to avoid rate limiting
};

// ═══════════════════════════════════════════════════════════════════════════
// BROWSER STATE
// ═══════════════════════════════════════════════════════════════════════════

let browser = null;
let page = null;
let isLoggedIn = false;
let lastActivity = null;

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

function authenticate(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  if (apiKey !== CONFIG.API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ═══════════════════════════════════════════════════════════════════════════
// BROWSER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

async function initBrowser() {
  if (browser) return browser;
  
  console.log('🚀 Launching browser...');
  browser = await puppeteer.launch({
    headless: CONFIG.HEADLESS ? 'new' : false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080'
    ],
    defaultViewport: { width: 1920, height: 1080 }
  });
  
  page = await browser.newPage();
  
  // Set user agent to look like a real browser
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  console.log('✅ Browser ready');
  return browser;
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    page = null;
    isLoggedIn = false;
    console.log('🔒 Browser closed');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TRADINGVIEW LOGIN
// ═══════════════════════════════════════════════════════════════════════════

async function login() {
  if (isLoggedIn) {
    console.log('Already logged in');
    return true;
  }
  
  await initBrowser();
  
  console.log('🔐 Logging into TradingView...');
  
  try {
    // Go to TradingView
    await page.goto('https://www.tradingview.com/', { waitUntil: 'networkidle2' });
    await delay(CONFIG.DELAY);
    
    // Click sign in button
    const signInBtn = await page.$('button[data-name="header-user-menu-sign-in"]');
    if (signInBtn) {
      await signInBtn.click();
      await delay(CONFIG.DELAY);
    }
    
    // Click "Email" option
    const emailBtn = await page.$('button[name="Email"]');
    if (emailBtn) {
      await emailBtn.click();
      await delay(CONFIG.DELAY);
    }
    
    // Enter credentials
    await page.type('input[name="id_username"]', CONFIG.TV_USERNAME, { delay: 50 });
    await page.type('input[name="id_password"]', CONFIG.TV_PASSWORD, { delay: 50 });
    
    // Click sign in
    await page.click('button[type="submit"]');
    await delay(CONFIG.DELAY * 2);
    
    // Check if logged in
    const userMenu = await page.$('button[data-name="header-user-menu-button"]');
    if (userMenu) {
      isLoggedIn = true;
      lastActivity = new Date();
      console.log('✅ Logged into TradingView!');
      return true;
    }
    
    console.log('❌ Login failed - check credentials');
    return false;
    
  } catch (error) {
    console.error('Login error:', error.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForSelector(selector, timeout = 10000) {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

async function takeScreenshot(name = 'screenshot') {
  const path = `/tmp/${name}-${Date.now()}.png`;
  await page.screenshot({ path, fullPage: false });
  return path;
}

// ═══════════════════════════════════════════════════════════════════════════
// CHART OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

async function goToChart(chartUrl) {
  if (!isLoggedIn) await login();
  
  console.log(`📊 Navigating to chart: ${chartUrl}`);
  await page.goto(chartUrl, { waitUntil: 'networkidle2' });
  await delay(CONFIG.DELAY * 2);
  
  lastActivity = new Date();
  return true;
}

async function changeSymbol(symbol) {
  if (!isLoggedIn) await login();
  
  console.log(`🔄 Changing symbol to: ${symbol}`);
  
  // Click on symbol input
  await page.click('div[data-name="legend-source-title"]');
  await delay(500);
  
  // Type new symbol
  await page.keyboard.type(symbol, { delay: 50 });
  await delay(1000);
  
  // Press enter to select
  await page.keyboard.press('Enter');
  await delay(CONFIG.DELAY);
  
  lastActivity = new Date();
  return true;
}

async function changeTimeframe(timeframe) {
  if (!isLoggedIn) await login();
  
  console.log(`⏱️ Changing timeframe to: ${timeframe}`);
  
  // Click timeframe button
  await page.click('button[data-name="date-ranges-menu"]');
  await delay(500);
  
  // Find and click the timeframe
  const timeframes = {
    '1m': '1', '5m': '5', '15m': '15', '30m': '30',
    '1H': '60', '4H': '240', '1D': '1D', '1W': '1W'
  };
  
  const tf = timeframes[timeframe] || timeframe;
  await page.click(`div[data-value="${tf}"]`);
  await delay(CONFIG.DELAY);
  
  lastActivity = new Date();
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// ALERT OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

async function getAlerts() {
  if (!isLoggedIn) await login();
  
  console.log('📋 Getting alerts...');
  
  // Open alerts panel
  await page.click('button[data-name="alerts"]');
  await delay(CONFIG.DELAY);
  
  // Get all alerts
  const alerts = await page.evaluate(() => {
    const alertElements = document.querySelectorAll('div[data-name="alert-item"]');
    return Array.from(alertElements).map(el => ({
      id: el.getAttribute('data-id'),
      name: el.querySelector('.alert-name')?.textContent || 'Unnamed',
      symbol: el.querySelector('.alert-symbol')?.textContent || '',
      active: !el.classList.contains('inactive')
    }));
  });
  
  console.log(`Found ${alerts.length} alerts`);
  lastActivity = new Date();
  return alerts;
}

async function createAlert(config) {
  if (!isLoggedIn) await login();
  
  const { symbol, condition, webhook, message, name } = config;
  
  console.log(`🔔 Creating alert for ${symbol}...`);
  
  // First navigate to the symbol
  if (symbol) {
    await changeSymbol(symbol);
  }
  
  // Open alert creation dialog (Alt + A)
  await page.keyboard.down('Alt');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Alt');
  await delay(CONFIG.DELAY);
  
  // Wait for alert dialog
  const dialogOpened = await waitForSelector('div[data-name="alerts-create-edit-dialog"]');
  if (!dialogOpened) {
    console.log('❌ Failed to open alert dialog');
    return false;
  }
  
  // Select condition (THE BEAST)
  if (condition) {
    // Click condition dropdown
    await page.click('span[data-name="main-series-select"]');
    await delay(500);
    
    // Find and select the condition
    await page.evaluate((cond) => {
      const options = document.querySelectorAll('div[class*="item"]');
      for (const opt of options) {
        if (opt.textContent.includes(cond)) {
          opt.click();
          break;
        }
      }
    }, condition);
    await delay(500);
  }
  
  // Set webhook
  if (webhook) {
    // Click Notifications tab
    await page.click('div[data-name="alerts-create-edit-dialog-tabs"] button:nth-child(2)');
    await delay(500);
    
    // Enable webhook checkbox
    const webhookCheckbox = await page.$('input[name="webhook-toggle"]');
    if (webhookCheckbox) {
      const isChecked = await page.evaluate(el => el.checked, webhookCheckbox);
      if (!isChecked) await webhookCheckbox.click();
    }
    await delay(300);
    
    // Enter webhook URL
    await page.evaluate(() => {
      const urlInput = document.querySelector('input[name="webhook-url"]');
      if (urlInput) urlInput.value = '';
    });
    await page.type('input[name="webhook-url"]', webhook, { delay: 30 });
  }
  
  // Set alert message
  if (message) {
    await page.evaluate(() => {
      const msgInput = document.querySelector('textarea[name="description"]');
      if (msgInput) msgInput.value = '';
    });
    await page.type('textarea[name="description"]', message, { delay: 20 });
  }
  
  // Set alert name
  if (name) {
    await page.evaluate(() => {
      const nameInput = document.querySelector('input[name="alert-name"]');
      if (nameInput) nameInput.value = '';
    });
    await page.type('input[name="alert-name"]', name, { delay: 30 });
  }
  
  // Click Create button
  await page.click('button[data-name="submit"]');
  await delay(CONFIG.DELAY);
  
  console.log(`✅ Alert created for ${symbol}`);
  lastActivity = new Date();
  return true;
}

async function deleteAlert(alertId) {
  if (!isLoggedIn) await login();
  
  console.log(`🗑️ Deleting alert: ${alertId}`);
  
  // Open alerts panel
  await page.click('button[data-name="alerts"]');
  await delay(CONFIG.DELAY);
  
  // Find and click the alert
  await page.click(`div[data-id="${alertId}"]`);
  await delay(500);
  
  // Click delete button
  await page.click('button[data-name="delete"]');
  await delay(500);
  
  // Confirm deletion
  await page.click('button[data-name="confirm"]');
  await delay(CONFIG.DELAY);
  
  console.log('✅ Alert deleted');
  lastActivity = new Date();
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// PINE SCRIPT OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

async function openPineEditor() {
  if (!isLoggedIn) await login();
  
  console.log('📝 Opening Pine Editor...');
  
  // Click Pine Editor button
  await page.click('button[data-name="scripteditor"]');
  await delay(CONFIG.DELAY);
  
  return true;
}

async function createIndicator(name, code) {
  if (!isLoggedIn) await login();
  
  console.log(`📊 Creating indicator: ${name}`);
  
  await openPineEditor();
  
  // Click "Open" menu
  await page.click('button[data-name="open"]');
  await delay(500);
  
  // Click "New blank indicator"
  await page.click('div[data-name="new-blank-indicator"]');
  await delay(CONFIG.DELAY);
  
  // Clear existing code and paste new code
  await page.evaluate((newCode) => {
    const editor = document.querySelector('.monaco-editor textarea');
    if (editor) {
      editor.value = newCode;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, code);
  await delay(500);
  
  // Save the script (Ctrl+S)
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyS');
  await page.keyboard.up('Control');
  await delay(CONFIG.DELAY);
  
  // Enter script name
  await page.type('input[name="title"]', name, { delay: 30 });
  await page.click('button[data-name="save"]');
  await delay(CONFIG.DELAY);
  
  console.log(`✅ Indicator "${name}" created`);
  lastActivity = new Date();
  return true;
}

async function addIndicatorToChart(indicatorName) {
  if (!isLoggedIn) await login();
  
  console.log(`📈 Adding indicator to chart: ${indicatorName}`);
  
  // Open indicators dialog
  await page.click('button[data-name="insert-indicator"]');
  await delay(CONFIG.DELAY);
  
  // Search for indicator
  await page.type('input[data-name="search"]', indicatorName, { delay: 50 });
  await delay(1000);
  
  // Click the first result
  await page.click('div[data-name="indicator-item"]');
  await delay(CONFIG.DELAY);
  
  // Close dialog
  await page.keyboard.press('Escape');
  await delay(500);
  
  console.log(`✅ Indicator added to chart`);
  lastActivity = new Date();
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    browser: browser ? 'running' : 'stopped',
    loggedIn: isLoggedIn,
    lastActivity: lastActivity
  });
});

// Status (requires auth)
app.get('/status', authenticate, (req, res) => {
  res.json({
    browser: browser ? 'running' : 'stopped',
    loggedIn: isLoggedIn,
    lastActivity: lastActivity,
    config: {
      hasCredentials: !!(CONFIG.TV_USERNAME && CONFIG.TV_PASSWORD),
      webhookUrl: CONFIG.BOT_WEBHOOK_URL
    }
  });
});

// Login
app.post('/tv/login', authenticate, async (req, res) => {
  try {
    const success = await login();
    res.json({ success, loggedIn: isLoggedIn });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Logout / Close browser
app.post('/tv/logout', authenticate, async (req, res) => {
  try {
    await closeBrowser();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get alerts
app.get('/tv/alerts', authenticate, async (req, res) => {
  try {
    const alerts = await getAlerts();
    res.json({ alerts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create alert
app.post('/tv/alerts', authenticate, async (req, res) => {
  try {
    const success = await createAlert(req.body);
    res.json({ success });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete alert
app.delete('/tv/alerts/:id', authenticate, async (req, res) => {
  try {
    const success = await deleteAlert(req.params.id);
    res.json({ success });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk create alerts for all coins
app.post('/tv/alerts/bulk', authenticate, async (req, res) => {
  try {
    const { coins, condition, webhook, messageTemplate } = req.body;
    const results = [];
    
    for (const coin of coins) {
      const message = messageTemplate
        .replace('{{symbol}}', coin)
        .replace('{{coin}}', coin.replace('USDT', ''));
      
      const success = await createAlert({
        symbol: `BINANCE:${coin}`,
        condition,
        webhook,
        message,
        name: `BEAST - ${coin.replace('USDT', '')}`
      });
      
      results.push({ coin, success });
      await delay(CONFIG.DELAY); // Rate limiting
    }
    
    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Go to chart
app.post('/tv/chart/goto', authenticate, async (req, res) => {
  try {
    const success = await goToChart(req.body.url);
    res.json({ success });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Change symbol
app.post('/tv/chart/symbol', authenticate, async (req, res) => {
  try {
    const success = await changeSymbol(req.body.symbol);
    res.json({ success });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Change timeframe
app.post('/tv/chart/timeframe', authenticate, async (req, res) => {
  try {
    const success = await changeTimeframe(req.body.timeframe);
    res.json({ success });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Take screenshot
app.get('/tv/chart/screenshot', authenticate, async (req, res) => {
  try {
    if (!page) {
      return res.status(400).json({ error: 'No active page' });
    }
    const screenshot = await page.screenshot({ encoding: 'base64' });
    res.json({ image: screenshot });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create indicator
app.post('/tv/indicators', authenticate, async (req, res) => {
  try {
    const success = await createIndicator(req.body.name, req.body.code);
    res.json({ success });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add indicator to chart
app.post('/tv/indicators/add', authenticate, async (req, res) => {
  try {
    const success = await addIndicatorToChart(req.body.name);
    res.json({ success });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CLAUDE BRIDGE - Natural Language Commands
// ═══════════════════════════════════════════════════════════════════════════

app.post('/claude/command', authenticate, async (req, res) => {
  const { command } = req.body;
  const cmd = command.toLowerCase();
  
  try {
    // Parse natural language commands
    if (cmd.includes('login') || cmd.includes('sign in')) {
      const success = await login();
      return res.json({ response: success ? 'Logged into TradingView!' : 'Login failed', success });
    }
    
    if (cmd.includes('alert') && cmd.includes('create')) {
      // Extract coin from command
      const coinMatch = cmd.match(/for\s+(\w+)/i);
      const coin = coinMatch ? coinMatch[1].toUpperCase() : 'BTC';
      
      const success = await createAlert({
        symbol: `BINANCE:${coin}USDT`,
        condition: 'THE BEAST',
        webhook: CONFIG.BOT_WEBHOOK_URL,
        message: `${coin} | BEAST | Score: {{plot_0}} | Action: ALERT`,
        name: `BEAST - ${coin}`
      });
      
      return res.json({ response: `Created BEAST alert for ${coin}!`, success });
    }
    
    if (cmd.includes('screenshot') || cmd.includes('chart')) {
      if (!page) await login();
      const screenshot = await page.screenshot({ encoding: 'base64' });
      return res.json({ response: 'Here is the chart screenshot', image: screenshot, success: true });
    }
    
    if (cmd.includes('status') || cmd.includes('check')) {
      const alerts = await getAlerts();
      return res.json({ 
        response: `TradingView Status: ${isLoggedIn ? 'Logged In' : 'Logged Out'}, ${alerts.length} alerts active`,
        alerts: alerts.length,
        success: true
      });
    }
    
    return res.json({ response: "I didn't understand that command. Try: 'login', 'create alert for BTC', 'screenshot', 'status'", success: false });
    
  } catch (error) {
    res.status(500).json({ error: error.message, success: false });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════════════

app.listen(CONFIG.PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           TV-CONTROLLER - TradingView Automation              ║
║═══════════════════════════════════════════════════════════════║
║  🚀 Server running on port ${CONFIG.PORT}                            ║
║  📊 Ready to control TradingView                              ║
║  🔒 API Key required for all endpoints                        ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  await closeBrowser();
  process.exit(0);
});

module.exports = { app, login, createAlert, getAlerts };
