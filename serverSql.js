const express = require('express');
const cors = require('cors');

//imports after refactoring
const authRoutes = require('./routes/authRoutes');
const passwordResetRoutes = require('./routes/passwordResetRoutes');
const questionSetRoutes = require('./routes/questionSetsRoutes');
const statsRoutes = require('./routes/statsRoutes');
const adminRoutes = require('./routes/adminRoutes');
const geminiRoutes = require('./routes/geminiRoutes');
const stripeRoutes = require('./routes/stripeRoutes');
const webhookRoutes = require('./routes/webhookRoutes');

const app = express();

app.use(cors({
  origin: '*',
  credentials: true,
}));

app.use('/', webhookRoutes);
//add after webhooks
app.use(express.json({limit: '1mb'}));

//use the routes
app.use('/', authRoutes);
app.use('/', passwordResetRoutes);
app.use('/', questionSetRoutes);
app.use('/', statsRoutes);
app.use('/', adminRoutes);
app.use('/', geminiRoutes);
app.use('/', stripeRoutes);

const PORT = process.env.PORT || 3000; // Use the provided port or default to 3000
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
