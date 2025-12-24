const generateOrderConfirmationEmail = (order, contact, companyInfo = {}) => {
  const orderAmount = (order.amount / 100).toFixed(2);
  const companyName = companyInfo.name || "Execute & Engrave LLC";
  const supportEmail = companyInfo.supportEmail || "support@executeengrave.com";
  const website = companyInfo.website || "https://executeengrave.com";
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Order Confirmation #${order.id}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #1f2937;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">${companyName}</h1>
            <p style="color: #e0e7ff; margin: 8px 0 0 0; font-size: 16px;">Premium Laser Engraved Pet Tags</p>
        </div>
        
        <!-- Order Confirmation -->
        <div style="padding: 40px 30px 30px;">
            <div style="text-align: center; margin-bottom: 30px;">
                <div style="display: inline-block; background-color: #10b981; color: white; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 600;">
                    ✓ ORDER CONFIRMED
                </div>
            </div>
            
            <h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 24px; text-align: center;">Thank You, ${contact.firstname || 'Valued Customer'}!</h2>
            <p style="color: #6b7280; font-size: 16px; line-height: 1.5; text-align: center; margin: 0 0 30px 0;">
                Your order has been received and we're already working on crafting your custom pet tag for <strong>${contact.petname || 'your pet'}</strong>.
            </p>
            
            <!-- Order Details Card -->
            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; margin: 30px 0;">
                <h3 style="color: #1f2937; margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">Order Details</h3>
                
                <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                    <span style="color: #6b7280; font-weight: 500;">Order Number:</span>
                    <span style="color: #1f2937; font-weight: 600;">#${order.id}</span>
                </div>
                
                <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                    <span style="color: #6b7280; font-weight: 500;">Amount:</span>
                    <span style="color: #1f2937; font-weight: 600;">$${orderAmount} ${order.currency.toUpperCase()}</span>
                </div>
                
                <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                    <span style="color: #6b7280; font-weight: 500;">Status:</span>
                    <span style="background-color: #10b981; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase;">${order.status}</span>
                </div>
                
                <div style="display: flex; justify-content: space-between; padding: 12px 0;">
                    <span style="color: #6b7280; font-weight: 500;">Pet Name:</span>
                    <span style="color: #1f2937; font-weight: 600;">${contact.petname || 'Not specified'}</span>
                </div>
            </div>
            
            <!-- Tag Information -->
            <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 12px; padding: 24px; margin: 30px 0;">
                <h3 style="color: #92400e; margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">🏷️ Your Custom Tag</h3>
                
                ${order.has_qr_code ? `
                <div style="background-color: #ffffff; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                    <h4 style="color: #92400e; margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">QR Code Tag</h4>
                    <p style="color: #78350f; margin: 0; font-size: 14px;">This tag includes a QR code that links to your contact information, making it easy for anyone to reach you if ${contact.petname || 'your pet'} gets lost.</p>
                </div>
                ` : ''}
                
                ${order.tag_text_line_1 || order.tag_text_line_2 || order.tag_text_line_3 ? `
                <div style="background-color: #ffffff; border-radius: 8px; padding: 16px;">
                    <h4 style="color: #92400e; margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">Engraved Text</h4>
                    ${order.tag_text_line_1 ? `<p style="color: #78350f; margin: 4px 0; font-size: 14px; font-family: monospace;"><strong>Line 1:</strong> ${order.tag_text_line_1}</p>` : ''}
                    ${order.tag_text_line_2 ? `<p style="color: #78350f; margin: 4px 0; font-size: 14px; font-family: monospace;"><strong>Line 2:</strong> ${order.tag_text_line_2}</p>` : ''}
                    ${order.tag_text_line_3 ? `<p style="color: #78350f; margin: 4px 0; font-size: 14px; font-family: monospace;"><strong>Line 3:</strong> ${order.tag_text_line_3}</p>` : ''}
                </div>
                ` : ''}
            </div>
            
            <!-- Timeline -->
            <div style="background-color: #eff6ff; border: 1px solid #3b82f6; border-radius: 12px; padding: 24px; margin: 30px 0;">
                <h3 style="color: #1e40af; margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">📦 What's Next?</h3>
                
                <div style="margin-bottom: 12px;">
                    <div style="display: flex; align-items: center; margin-bottom: 8px;">
                        <span style="background-color: #10b981; color: white; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; margin-right: 12px;">✓</span>
                        <span style="color: #1e40af; font-weight: 600;">Order Received</span>
                    </div>
                    <p style="color: #3730a3; margin: 0 0 0 32px; font-size: 14px;">Your order has been confirmed and payment processed.</p>
                </div>
                
                <div style="margin-bottom: 12px;">
                    <div style="display: flex; align-items: center; margin-bottom: 8px;">
                        <span style="background-color: #f59e0b; color: white; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; margin-right: 12px;">2</span>
                        <span style="color: #1e40af; font-weight: 600;">Laser Engraving (1-2 business days)</span>
                    </div>
                    <p style="color: #3730a3; margin: 0 0 0 32px; font-size: 14px;">Our craftsmen will precisely laser engrave your custom design.</p>
                </div>
                
                <div>
                    <div style="display: flex; align-items: center; margin-bottom: 8px;">
                        <span style="background-color: #6b7280; color: white; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; margin-right: 12px;">3</span>
                        <span style="color: #1e40af; font-weight: 600;">Shipping (3-5 business days)</span>
                    </div>
                    <p style="color: #3730a3; margin: 0 0 0 32px; font-size: 14px;">Your finished tag will be carefully packaged and shipped to you.</p>
                </div>
            </div>
            
            <!-- Contact Information -->
            <div style="text-align: center; padding: 30px 0; border-top: 1px solid #e5e7eb; margin-top: 30px;">
                <h3 style="color: #1f2937; margin: 0 0 16px 0; font-size: 18px;">Questions?</h3>
                <p style="color: #6b7280; margin: 0 0 16px 0; font-size: 14px;">
                    We're here to help! Contact us anytime:
                </p>
                <p style="margin: 8px 0;">
                    <a href="mailto:${supportEmail}" style="color: #3b82f6; text-decoration: none; font-weight: 600;">${supportEmail}</a>
                </p>
                <p style="margin: 8px 0;">
                    <a href="${website}" style="color: #3b82f6; text-decoration: none; font-weight: 600;">${website}</a>
                </p>
            </div>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #1f2937; padding: 30px; text-align: center;">
            <p style="color: #9ca3af; margin: 0; font-size: 14px;">
                © 2024 ${companyName}. All rights reserved.
            </p>
            <p style="color: #6b7280; margin: 8px 0 0 0; font-size: 12px;">
                Crafting quality pet identification solutions with precision and care.
            </p>
        </div>
    </div>
</body>
</html>`;

  const textVersion = `
Order Confirmation #${order.id}

Thank you, ${contact.firstname || 'Valued Customer'}!

Your order has been received and we're already working on crafting your custom pet tag for ${contact.petname || 'your pet'}.

ORDER DETAILS:
- Order Number: #${order.id}
- Amount: $${orderAmount} ${order.currency.toUpperCase()}
- Status: ${order.status}
- Pet Name: ${contact.petname || 'Not specified'}

WHAT'S NEXT:
1. Order Received ✓
2. Laser Engraving (1-2 business days)
3. Shipping (3-5 business days)

Questions? Contact us at ${supportEmail} or visit ${website}

© 2024 ${companyName}. All rights reserved.
`;

  return { html, text: textVersion };
};

module.exports = { generateOrderConfirmationEmail };
