const nodemailer = require("nodemailer");
const crypto = require("crypto");
const { google } = require('googleapis');
require('dotenv').config();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;
const SENDER_EMAIL = process.env.SENDER_EMAIL;

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

async function sendMail(receiverEmail, code) {
  try {
    const accessToken = await oAuth2Client.getAccessToken();
    console.log(receiverEmail, code);

    const transport = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: SENDER_EMAIL,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        refreshToken: REFRESH_TOKEN,
        accessToken: accessToken.token,
      },
    });
    console.log(transport);

    const mailOptions = {
      from: `QuizLet App`,
      to: `${receiverEmail}`,
      subject: 'Verification Code',
      text: `Your verification code is ${code}`,
    };
    console.log(mailOptions);

    const result = await transport.sendMail(mailOptions);
    console.log('✅ Email sent:', result.response);
  } catch (error) {
    console.error('❌ Error sending email:', error);
  }
}

const createCodeForPasswordReset = () =>{
    return crypto.randomBytes(4).toString("hex");
}

module.exports = { createCodeForPasswordReset, sendMail };