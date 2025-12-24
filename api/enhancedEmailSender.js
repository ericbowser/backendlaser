const nodemailer = require('nodemailer');
const { generateOrderConfirmationEmail } = require('../templates/orderConfirmationEmail');
const {GMAIL_APP_PASSWORD} = require('../env.json');

// Enhanced email sender with HTML template support
async function sendEnhancedEmail(emailConfig) {
  const {
    from = 'ericryanbowser@gmail.com',
    to,
    subject,
    html,
    text,
    attachments = []
  } = emailConfig;

  try {
    const transporter = await nodemailer.createTransporter({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: 'ericryanbowser@gmail.com',
        pass: GMAIL_APP_PASSWORD,
      },
    });

    const mailOptions = {
      from: `Execute & Engrave LLC <${from}>`,
      to: to || 'laser@new-collar.space',
      subject: subject,
      html: html,
      text: text,
      attachments: attachments
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Enhanced email sent: %s", info?.messageId);
    return {
      success: true,
      messageId: info?.messageId,
      response: info?.response
    };
  } catch (error) {
    console.error("Error sending enhanced email:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Send order confirmation email to customer
async function sendOrderConfirmationToCustomer(order, contact) {
  try {
    const { html, text } = generateOrderConfirmationEmail(order, contact, {
      name: "Execute & Engrave LLC",
      supportEmail: "support@executeengrave.com",
      website: "https://executeengrave.com"
    });

    const result = await sendEnhancedEmail({
      to: contact.email || 'customer@example.com', // You'll need to add email field to contact
      subject: `Order Confirmation #${order.id} - Your Custom Pet Tag is Being Made!`,
      html: html,
      text: text
    });

    return result;
  } catch (error) {
    console.error("Error sending customer confirmation email:", error);
    return { success: false, error: error.message };
  }
}

// Send internal order notification email (your existing format, but enhanced)
async function sendInternalOrderNotification(order, contact) {
  try {
    const orderAmount = (order.amount / 100).toFixed(2);
    
    const subject = `🚨 NEW ORDER #${order.id} - $${orderAmount}`;
    
    const html = `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 20px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">🚨 NEW ORDER ALERT</h1>
      </div>
      
      <!-- Order Details -->
      <div style="padding: 30px;">
        <div style="background-color: #fee2e2; border: 1px solid #fca5a5; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
          <h2 style="color: #991b1b; margin: 0 0 16px 0;">Order #${order.id}</h2>
          <p><strong>Amount:</strong> $${orderAmount} ${order.currency.toUpperCase()}</p>
          <p><strong>Status:</strong> ${order.status}</p>
          <p><strong>Payment Intent:</strong> ${order.stripe_payment_intent_id || 'Pending'}</p>
        </div>
        
        <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
          <h3 style="color: #1f2937; margin: 0 0 12px 0;">Tag Information</h3>
          <p><strong>Line 1:</strong> ${order.tag_text_line_1 || 'N/A'}</p>
          <p><strong>Line 2:</strong> ${order.tag_text_line_2 || 'N/A'}</p>
          <p><strong>Line 3:</strong> ${order.tag_text_line_3 || 'N/A'}</p>
          <p><strong>Has QR Code:</strong> ${order.has_qr_code ? '✅ Yes' : '❌ No'}</p>
        </div>
        
        <div style="background-color: #ecfdf5; border: 1px solid #6ee7b7; border-radius: 8px; padding: 20px;">
          <h3 style="color: #065f46; margin: 0 0 12px 0;">Customer Information</h3>
          <p><strong>Name:</strong> ${contact.firstname || ''} ${contact.lastname || ''}</p>
          <p><strong>Pet Name:</strong> ${contact.petname || 'N/A'}</p>
          <p><strong>Phone:</strong> ${contact.phone || 'N/A'}</p>
          <p><strong>Address Line 1:</strong> ${contact.address_line_1 || 'N/A'}</p>
          <p><strong>Address Line 2:</strong> ${contact.address_line_2 || 'N/A'}</p>
          <p><strong>Address Line 3:</strong> ${contact.address_line_3 || 'N/A'}</p>
        </div>
        
        <div style="text-align: center; margin-top: 30px; padding: 20px; background-color: #1f2937; border-radius: 8px;">
          <p style="color: #ffffff; margin: 0; font-size: 16px; font-weight: 600;">
            🏷️ Time to start laser engraving this custom pet tag!
          </p>
        </div>
      </div>
    </div>`;

    const text = `NEW ORDER #${order.id}

Order Details:
- Order ID: ${order.id}
- Amount: $${orderAmount} ${order.currency.toUpperCase()}
- Status: ${order.status}
- Payment Intent ID: ${order.stripe_payment_intent_id || 'Pending'}

Tag Information:
- Line 1: ${order.tag_text_line_1 || 'N/A'}
- Line 2: ${order.tag_text_line_2 || 'N/A'}
- Line 3: ${order.tag_text_line_3 || 'N/A'}
- Has QR Code: ${order.has_qr_code ? 'Yes' : 'No'}

Customer Information:
- Name: ${contact.firstname || ''} ${contact.lastname || ''}
- Pet Name: ${contact.petname || 'N/A'}
- Phone: ${contact.phone || 'N/A'}
- Address Line 1: ${contact.address_line_1 || 'N/A'}
- Address Line 2: ${contact.address_line_2 || 'N/A'}
- Address Line 3: ${contact.address_line_3 || 'N/A'}

Please process this order and begin crafting the laser tag.`;

    const result = await sendEnhancedEmail({
      to: 'laser@new-collar.space',
      subject: subject,
      html: html,
      text: text
    });

    return result;
  } catch (error) {
    console.error("Error sending internal order notification:", error);
    return { success: false, error: error.message };
  }
}

// Legacy function for backward compatibility
async function sendEmailWithAttachment(from, recipient, subject, message) {
  try {
    const result = await sendEnhancedEmail({
      from: from,
      to: recipient,
      subject: subject,
      text: message,
      html: `<p>${message}</p>`
    });
    
    return result.success ? result.messageId : null;
  } catch (error) {
    console.error("Error in legacy email function:", error);
    return null;
  }
}

module.exports = {
  sendEnhancedEmail,
  sendOrderConfirmationToCustomer,
  sendInternalOrderNotification,
  sendEmailWithAttachment // Keep for backward compatibility
};
