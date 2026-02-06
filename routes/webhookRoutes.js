const express = require('express');
const stripe = require('../config/stripe');
const conn = require('../config/db');
const { model } = require('mongoose');

const router = express.Router();

router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.LOCALHOST_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('❌ Webhook signature verification failed.', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;

          if (session.payment_status === 'paid') {
            console.log('✅ checkout.session.completed:', session.id);
            console.log('session.metadata:', session.metadata);

            const publicSetId = session.metadata?.publicSetId;
            const buyerUserId = session.metadata?.buyerUserId;

            console.log('publicSetId:', publicSetId);
            console.log('buyerUserId:', buyerUserId);

            if (!publicSetId || !buyerUserId) {
              console.warn('⚠ Missing publicSetId or buyerUserId, skipping DB update');
              break;
            }

            // --- THIS IS BASICALLY /getPublicSet LOGIC ---

            // 1) Get title from publicSets
            const [[publicSet]] = await conn.execute(
              "SELECT title FROM publicSets WHERE publicSetId = ?",
              [publicSetId]
            );

            if (!publicSet) {
              console.warn('⚠ Public set not found in DB:', publicSetId);
              break;
            }

            const title = publicSet.title;

            // 2) Insert into questionSets for this user
            const [insertion] = await conn.execute(
              "INSERT INTO questionSets (userId, title, public, publicSetId, visibility) VALUES (?, ?, 1, ?, 'visible')",
              [buyerUserId, title, publicSetId]
            );
            const insertedId = insertion.insertId;

            // 3) Copy questions from publicSetsQuestions → questions
            await conn.execute(
              `INSERT INTO questions (questionSetId, questionText, answerText)
               SELECT ?, pq.questionText, pq.answerText
               FROM publicSetsQuestions pq
               WHERE pq.publicSetId = ?`,
              [insertedId, publicSetId]
            );

            console.log('✅ DB updated: copied set', publicSetId, 'for user', buyerUserId);
          }

          console.log('session.completed');
          break;
        }

        case 'payment_intent.succeeded': {
          const pi = event.data.object;
          console.log('session.intent.succeeded', pi.id);
          break;
        }

        case 'charge.refunded':
          console.log('refund');
        case 'charge.dispute.created': {
          break;
        }

        default:
          console.log('default');
          break;
      }

      res.json({ received: true });
    } catch (err) {
      console.error('❌ Webhook handler error:', err);
      res.status(500).send('Webhook handler failed');
    }
  }
);


module.exports = router;
