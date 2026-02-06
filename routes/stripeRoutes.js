const express = require('express');
const conn = require('../config/db');
const stripe = require('../config/stripe');
const authenticate = require('../middleware/auth');

const router = express.Router();

router.post('/api/items/create-checkout-session', authenticate, async (req, res) => {
  try {
    const { setId, setName } = req.body;
    const buyerUserId = req.user.userId;

    // 1) Fetch product + merchant from DB
    const [rows] = await conn.execute(
      "SELECT price, stripeMerchantId FROM publicSets WHERE publicSetId = ?",
      [setId]
    );

    if (!rows.length) {
      return res.status(400).json({ error: 'Invalid product' });
    }

    const product = rows[0];
    const currency = "eur";
    const merchantStripeId = product.stripeMerchantId;

    if (!merchantStripeId) {
      return res.status(400).json({ error: "Seller does not have a Stripe account" });
    }

    // Price in cents
    const priceInCents = Math.round(product.price * 100);

    // Your 10% cut (never more than 10%: use floor)
    const platformFee = Math.floor(priceInCents * 0.10);

    console.log("Price:", priceInCents, "Platform fee:", platformFee);

    // 2) Create Checkout Session as a DIRECT CHARGE on the connected account
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency,
              unit_amount: priceInCents,
              product_data: {
                name: setName,
              },
            },
            quantity: 1,
          },
        ],

        // Direct charge with application fee:
        // - Charge is on the CONNECTED ACCOUNT
        // - Stripe fees are taken from the connected account
        // - `application_fee_amount` is sent to YOUR platform
        payment_intent_data: {
          application_fee_amount: platformFee,
        },

        success_url: `http://localhost:3001/#/marketplace/success`,
        cancel_url: `http://localhost:3001/#/marketplace/cancel`,
        metadata: {   
          publicSetId: String(setId),
          buyerUserId: String(buyerUserId),
        },
      },
      {
        // 👇 THIS makes it a direct charge
        stripeAccount: merchantStripeId,
      }
    );

    return res.json({ url: session.url });

  } catch (error) {
    console.error("Checkout Error:", error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});



router.get('/api/items/getStripeId', authenticate, async (req, res) => {
  try {
    userId = req.user.userId;
    const [result] = await conn.execute("SELECT stripeId FROM users WHERE userId = ?",[userId])
    res.status(200).json(result)

  }catch(e){
    console.error(e);
    res.status(500).json({error: 'Internal server error'})
  }
})

router.post("/api/items/createDashboardLink", async (req, res) => {
    const { stripeId } = req.body;

    try {
        const loginLink = await stripe.accounts.createLoginLink(stripeId);
        res.json({ url: loginLink.url });
        console.log(loginLink)
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Unable to create login link" });
    }
});

router.post("/api/items/startStripeOnboarding", authenticate, async (req, res) => {
  const userId = req.user.userId;
  const { country } = req.body;
  try { 
    const [rows] = await conn.execute(
      "SELECT stripeId FROM users WHERE userId = ?",
      [userId]
    );

    let stripeId = rows[0]?.stripeId || null;

    if (!stripeId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: country, 
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
        },
      });

      stripeId = account.id;

      await conn.execute(
        "UPDATE users SET stripeId = ? WHERE userId = ?",
        [stripeId, userId]
      );
    }

    const accountLink = await stripe.accountLinks.create({
      account: stripeId,
      refresh_url: "http://localhost:3001/#/profile?onboarding=refresh",
      return_url: "http://localhost:3001/#/profile?onboarding=return",
      type: "account_onboarding",
    });

    return res.json({ url: accountLink.url });
  } catch (error) {
    console.error("Error in /startStripeOnboarding:", error);
    return res.status(500).json({ error: "Unable to start Stripe onboarding" });
  }
});

router.get("/api/items/checkStripeOnboarding", authenticate, async (req, res) => {
  const userId = req.user.userId;
  console.log('enteredddd');
  try {
    const [rows] = await conn.execute(
      "SELECT stripeId, onboardedStripe FROM users WHERE userId = ?",
      [userId]
    );

    if (!rows.length || !rows[0].stripeId) {
      console.log('returned')
      return res.json({ onboarded: false, value: rows });
    }

    const stripeId = rows[0].stripeId;

    const account = await stripe.accounts.retrieve(stripeId);
    console.log('account', account)

    const isOnboarded =
      account.charges_enabled && account.details_submitted;
    console.log('accounte changes', account.charges_enabled, 'details', account.details_submitted)

    if (isOnboarded && !rows[0].onboardedStripe) {
      await conn.execute(
        "UPDATE users SET onboardedStripe = 1 WHERE userId = ?",
        [userId]
      );
    }

    res.json({ onboarded: isOnboarded, value: rows });
  } catch (error) {
    console.error("Error in /checkStripeOnboarding:", error);
    res.status(500).json({ error: "Failed to check onboarding" });
  }
});


module.exports = router;