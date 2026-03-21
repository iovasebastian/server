const nodemailer = require("nodemailer");
const crypto = require("crypto");
const { google } = require('googleapis');
require('dotenv').config();

const GMAIL_EMAIL = process.env.GMAIL_EMAIL
const GMAIL_PASSWORD = process.env.GMAIL_PASSWORD


async function sendMail(receiverEmail, code) {
  try {
    const transport = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: GMAIL_EMAIL,
        pass: GMAIL_PASSWORD
      },
    });

    const mailOptions = {
      from: `Quiz-Ez`,
      to: `${receiverEmail}`,
      subject: 'Verification Code',
      text: `Your verification code is ${code}`,
    };

    const result = await transport.sendMail(mailOptions);
  } catch (error) {
  }
}

const createCodeForPasswordReset = () =>{
    return crypto.randomBytes(4).toString("hex");
}

module.exports = { createCodeForPasswordReset, sendMail };