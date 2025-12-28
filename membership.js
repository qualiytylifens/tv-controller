// ═══════════════════════════════════════════════════════════════════════════
// MEMBERSHIP SYSTEM - Sell THE BEAST and other indicators
// ═══════════════════════════════════════════════════════════════════════════

// Membership Tiers
const TIERS = {
  FREE: {
    id: 'free',
    name: 'Free',
    price: 0,
    features: [
      'Basic signals for BTC/ETH',
      'Daily market report',
      'Community access'
    ],
    limits: {
      coins: 2,
      alertsPerDay: 5,
      webhooks: false
    }
  },
  PRO: {
    id: 'pro',
    name: 'Pro Trader',
    price: 29,
    features: [
      'THE BEAST indicator for ALL coins',
      'Webhook integration',
      'Real-time alerts',
      '8 Pillars analysis',
      'Whale tracking',
      'Email support'
    ],
    limits: {
      coins: 11,
      alertsPerDay: 100,
      webhooks: true
    }
  },
  ELITE: {
    id: 'elite',
    name: 'Elite Trader',
    price: 99,
    features: [
      'Everything in Pro',
      'Custom indicator creation',
      'AI analysis (Claude)',
      'Auto-trading enabled',
      'Priority signals',
      'Private Discord',
      '1-on-1 support'
    ],
    limits: {
      coins: 'unlimited',
      alertsPerDay: 'unlimited',
      webhooks: true,
      autoTrade: true,
      customIndicators: true
    }
  },
  LIFETIME: {
    id: 'lifetime',
    name: 'Lifetime Access',
    price: 499,
    oneTime: true,
    features: [
      'Everything in Elite',
      'Lifetime updates',
      'Future indicators included',
      'Source code access',
      'Commercial license'
    ],
    limits: {
      coins: 'unlimited',
      alertsPerDay: 'unlimited',
      webhooks: true,
      autoTrade: true,
      customIndicators: true,
      sourceCode: true
    }
  }
};

// Member database (would be Supabase in production)
const members = new Map();

// ═══════════════════════════════════════════════════════════════════════════
// MEMBER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

class MembershipManager {
  constructor(supabase) {
    this.supabase = supabase;
  }
  
  // Create new member
  async createMember(data) {
    const member = {
      id: `mem_${Date.now()}`,
      email: data.email,
      name: data.name,
      tier: data.tier || 'free',
      tradingViewUsername: data.tradingViewUsername,
      telegramChatId: data.telegramChatId,
      createdAt: new Date().toISOString(),
      expiresAt: this.calculateExpiry(data.tier),
      status: 'active',
      indicators: [],
      payments: []
    };
    
    // Save to Supabase
    if (this.supabase) {
      const { data: saved, error } = await this.supabase
        .from('members')
        .insert([member])
        .select();
      
      if (error) throw error;
      return saved[0];
    }
    
    members.set(member.id, member);
    return member;
  }
  
  // Calculate subscription expiry
  calculateExpiry(tier) {
    if (TIERS[tier.toUpperCase()]?.oneTime) {
      return null; // Lifetime
    }
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + 1);
    return expiry.toISOString();
  }
  
  // Get member by email
  async getMemberByEmail(email) {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('members')
        .select('*')
        .eq('email', email)
        .single();
      
      return data;
    }
    
    for (const member of members.values()) {
      if (member.email === email) return member;
    }
    return null;
  }
  
  // Get member by Telegram chat ID
  async getMemberByChatId(chatId) {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('members')
        .select('*')
        .eq('telegramChatId', chatId)
        .single();
      
      return data;
    }
    
    for (const member of members.values()) {
      if (member.telegramChatId === chatId) return member;
    }
    return null;
  }
  
  // Upgrade member tier
  async upgradeTier(memberId, newTier, paymentInfo) {
    const member = members.get(memberId) || await this.getMember(memberId);
    if (!member) throw new Error('Member not found');
    
    member.tier = newTier;
    member.expiresAt = this.calculateExpiry(newTier);
    member.payments.push({
      date: new Date().toISOString(),
      amount: TIERS[newTier.toUpperCase()].price,
      tier: newTier,
      ...paymentInfo
    });
    
    if (this.supabase) {
      await this.supabase
        .from('members')
        .update(member)
        .eq('id', memberId);
    }
    
    return member;
  }
  
  // Grant access to indicator
  async grantIndicatorAccess(memberId, indicatorId) {
    const member = members.get(memberId);
    if (!member) throw new Error('Member not found');
    
    if (!member.indicators.includes(indicatorId)) {
      member.indicators.push(indicatorId);
    }
    
    return member;
  }
  
  // Check if member has access
  hasAccess(member, feature) {
    if (!member) return false;
    
    const tier = TIERS[member.tier.toUpperCase()];
    if (!tier) return false;
    
    // Check expiry
    if (member.expiresAt && new Date(member.expiresAt) < new Date()) {
      return false;
    }
    
    return tier.limits[feature] === true || tier.limits[feature] === 'unlimited';
  }
  
  // Check coin limit
  canAccessCoin(member, coinIndex) {
    if (!member) return false;
    
    const tier = TIERS[member.tier.toUpperCase()];
    if (!tier) return false;
    
    if (tier.limits.coins === 'unlimited') return true;
    return coinIndex < tier.limits.coins;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STRIPE PAYMENT INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

const paymentHandler = {
  // Create checkout session
  async createCheckoutSession(tier, customerEmail) {
    if (!stripe) throw new Error('Stripe not configured');
    
    const tierConfig = TIERS[tier.toUpperCase()];
    if (!tierConfig) throw new Error('Invalid tier');
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `COIN-SMART: ${tierConfig.name}`,
            description: tierConfig.features.join(', ')
          },
          unit_amount: tierConfig.price * 100,
          recurring: tierConfig.oneTime ? undefined : { interval: 'month' }
        },
        quantity: 1
      }],
      mode: tierConfig.oneTime ? 'payment' : 'subscription',
      success_url: `${process.env.BASE_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL}/payment/cancel`,
      customer_email: customerEmail,
      metadata: {
        tier: tier.toLowerCase()
      }
    });
    
    return session;
  },
  
  // Handle webhook from Stripe
  async handleWebhook(event) {
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        // Upgrade member
        console.log(`Payment successful for ${session.customer_email}, tier: ${session.metadata.tier}`);
        break;
        
      case 'customer.subscription.deleted':
        // Downgrade member to free
        console.log('Subscription cancelled');
        break;
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// TELEGRAM BOT COMMANDS FOR MEMBERSHIP
// ═══════════════════════════════════════════════════════════════════════════

const membershipCommands = {
  // /subscribe - Show subscription options
  subscribe(bot, chatId) {
    const keyboard = {
      inline_keyboard: [
        [{ text: '🆓 Free - $0', callback_data: 'tier_free' }],
        [{ text: '⭐ Pro - $29/mo', callback_data: 'tier_pro' }],
        [{ text: '👑 Elite - $99/mo', callback_data: 'tier_elite' }],
        [{ text: '💎 Lifetime - $499', callback_data: 'tier_lifetime' }]
      ]
    };
    
    bot.sendMessage(chatId, `
💰 *COIN-SMART MEMBERSHIP*
━━━━━━━━━━━━━━━━━━━━━━

🆓 *FREE* - $0
├─ BTC & ETH signals
├─ Daily market report
└─ Community access

⭐ *PRO* - $29/month
├─ THE BEAST for ALL 11 coins
├─ Webhook integration
├─ Real-time alerts
├─ 8 Pillars analysis
└─ Whale tracking

👑 *ELITE* - $99/month
├─ Everything in Pro
├─ Custom indicators
├─ AI analysis (Claude)
├─ Auto-trading
└─ 1-on-1 support

💎 *LIFETIME* - $499 one-time
├─ Everything forever
├─ Future indicators included
└─ Source code access

Choose your plan:
    `, { parse_mode: 'Markdown', reply_markup: keyboard });
  },
  
  // /mystatus - Check membership status
  async myStatus(bot, chatId, memberManager) {
    const member = await memberManager.getMemberByChatId(chatId);
    
    if (!member) {
      return bot.sendMessage(chatId, '❌ No membership found. Use /subscribe to join!');
    }
    
    const tier = TIERS[member.tier.toUpperCase()];
    
    bot.sendMessage(chatId, `
👤 *YOUR MEMBERSHIP*
━━━━━━━━━━━━━━━━━━━━━━

📧 Email: ${member.email}
🏷️ Tier: ${tier.name}
📅 Since: ${new Date(member.createdAt).toLocaleDateString()}
${member.expiresAt ? `⏰ Expires: ${new Date(member.expiresAt).toLocaleDateString()}` : '♾️ Lifetime Access'}

✅ *YOUR FEATURES:*
${tier.features.map(f => `├─ ${f}`).join('\n')}

📊 Coins: ${tier.limits.coins}
🔔 Alerts/day: ${tier.limits.alertsPerDay}
🔗 Webhooks: ${tier.limits.webhooks ? 'Yes' : 'No'}
    `, { parse_mode: 'Markdown' });
  },
  
  // Handle tier selection callback
  async handleTierSelection(bot, chatId, tier) {
    const tierConfig = TIERS[tier.toUpperCase()];
    
    if (tier === 'free') {
      bot.sendMessage(chatId, '✅ You have Free access! Use /subscribe to upgrade anytime.');
      return;
    }
    
    // Create payment link
    try {
      const session = await paymentHandler.createCheckoutSession(tier, null);
      
      bot.sendMessage(chatId, `
💳 *UPGRADE TO ${tierConfig.name.toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━━━

💰 Price: $${tierConfig.price}${tierConfig.oneTime ? ' one-time' : '/month'}

Click below to complete payment:
      `, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '💳 Pay Now', url: session.url }
          ]]
        }
      });
    } catch (error) {
      bot.sendMessage(chatId, `❌ Error creating payment: ${error.message}\n\nContact support for manual payment.`);
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ACCESS CONTROL MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

function requireTier(minimumTier) {
  const tierOrder = ['free', 'pro', 'elite', 'lifetime'];
  const minIndex = tierOrder.indexOf(minimumTier.toLowerCase());
  
  return async (req, res, next) => {
    const member = req.member; // Set by auth middleware
    
    if (!member) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const memberIndex = tierOrder.indexOf(member.tier.toLowerCase());
    
    if (memberIndex < minIndex) {
      return res.status(403).json({ 
        error: 'Upgrade required',
        currentTier: member.tier,
        requiredTier: minimumTier,
        upgradeUrl: '/subscribe'
      });
    }
    
    next();
  };
}

module.exports = {
  TIERS,
  MembershipManager,
  paymentHandler,
  membershipCommands,
  requireTier
};
