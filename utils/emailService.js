const nodemailer = require('nodemailer');
require('dotenv').config();

// Create transporter (configure with your email service)
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 587,
  secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

/**
 * Send password reset email
 * @param {string} toEmail - Recipient email address
 * @param {string} resetUrl - Password reset URL with token
 * @returns {Promise} Promise that resolves when email is sent
 */
const sendResetEmail = async (toEmail, resetUrl) => {
  try {
    const mailOptions = {
      from: `"Money Log App" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: 'Password Reset Request',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset</h2>
          <p>You requested a password reset for your Money Log account.</p>
          <p>Please click the link below to reset your password. This link will expire in 1 hour.</p>
          <p style="margin: 25px 0;">
            <a href="${resetUrl}" 
               style="background-color: #4CAF50; color: white; padding: 10px 20px; 
                      text-decoration: none; border-radius: 5px; font-weight: bold;">
              Reset Password
            </a>
          </p>
          <p>If you didn't request this, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #777;">
            Money Log App - Your Personal Finance Tracker
          </p>
        </div>
      `,
      text: `You requested a password reset. Please visit this link to reset your password: ${resetUrl}\n\nThis link expires in 1 hour.`
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending reset email:', error);
    throw new Error('Failed to send reset email');
  }
};

module.exports = { sendResetEmail };