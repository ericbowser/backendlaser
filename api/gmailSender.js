const nodemailer = require('nodemailer');
const {GMAIL_APP_PASSWORD} = require('../env.json');

async function sendEmailWithAttachment(from, recipient, subject, message) {
    const transporter = await nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        auth: {
            user: 'ericryanbowser@gmail.com',
            pass: GMAIL_APP_PASSWORD,
        },
    });
    const info = await transporter.sendMail({
        from: from,
        to: recipient,
        subject: subject,
        text: message,
        html: `<p>${message}</p>`
    });
    console.log("Message sent: %s", info?.messageId);
    return info?.messageId;
}

module.exports = sendEmailWithAttachment;
