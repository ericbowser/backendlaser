const express = require("express");
const app = express();
const cors = require("cors");
const router = express.Router();
const RateLimit = require("express-rate-limit");
const logger = require("./logs/backendLaserLog");
const { json } = require("body-parser");
const { connectLocalPostgres } = require("./documentdb/client");
// const {insertUser, queryUser} = require('./auth/loginAuth'); // TODO: Uncomment when login is implemented
const sendEmailWithAttachment = require("./api/gmailSender");
const {
  createPaymentIntent,
  retrievePaymentIntent,
  confirmPaymentIntent,
  createCheckoutSession,
  retrieveCheckoutSession,
  verifyWebhookSignature,
} = require("./api/stripe");
const {
  STRIPE_TEST_PUBLISHABLE_API_KEY,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_TEST_SECRET_API_KEY
} = require("dotenv").config().parsed;
let _logger = logger();
_logger.info("Logger Initialized");

// Apply rate limiting: max 10 requests per minute for updateContact
const updateContactLimiter = RateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per windowMs
  message:
    "Too many update contact requests from this IP, please try again later.",
});

// Stripe webhook endpoint - must be defined BEFORE body parsers to get raw body
// Stripe webhook endpoint - must be defined BEFORE body parsers to get raw body
router.post(
  "/stripeWebhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];

    _logger.info("POST /stripeWebhook - Webhook received", {
      signature: signature ? "present" : "missing",
      contentType: req.headers["content-type"],
      bodyLength: req.body?.length || 0,
      bodyType: typeof req.body,
    });

    try {
      if (!STRIPE_WEBHOOK_SECRET) {
        _logger.error("STRIPE_WEBHOOK_SECRET is not configured in env variables");
        return res
          .status(500)
          .send({
            error: "Webhook secret not configured",
          })
          .end();
      }

      if (!signature) {
        _logger.warn("Missing Stripe signature header");
        return res
          .status(400)
          .send({
            error: "Missing stripe-signature header",
          })
          .end();
      }

      // Verify webhook signature - req.body should be a Buffer
      const event = verifyWebhookSignature(
        req.body,
        signature,
        STRIPE_WEBHOOK_SECRET
      );

      _logger.info("Stripe webhook event received", {
        eventType: event.type,
        eventId: event.id,
        objectType: event.data?.object?.object,
        paymentIntentId: event.data?.object?.id,
      });

      // Handle different event types
      switch (event.type) {
        case "payment_intent.succeeded":
          _logger.info("Payment succeeded", {
            paymentIntentId: event.data.object.id,
            amount: event.data.object.amount,
            currency: event.data.object.currency,
            metadata: event.data.object.metadata,
          });

          // Update order status if orderid is in metadata
          if (event.data.object.metadata?.orderid) {
            try {
              const orderid = parseInt(event.data.object.metadata.orderid);
              if (isNaN(orderid)) {
                _logger.warn("Invalid orderid in metadata", {
                  orderid: event.data.object.metadata.orderid,
                  paymentIntentId: event.data.object.id,
                });
              } else {
                const connection = await connectLocalPostgres();
                // FIXED: Using orderid column name (not id)
                const updateQuery = `UPDATE lasertg.orders
                                   SET stripe_payment_intent_id = $1,
                                       status = 'paid',
                                       updated_at = CURRENT_TIMESTAMP
                                   WHERE id = $2
                                       RETURNING *;`;
                const updateResult = await connection.query(updateQuery, [
                  event.data.object.id,
                  orderid,
                ]);

                if (updateResult.rowCount > 0) {
                  const updatedOrder = updateResult.rows[0];
                  _logger.info("Order updated after payment success", {
                    orderid: orderid,
                    paymentIntentId: event.data.object.id,
                    updatedOrder: updatedOrder,
                  });

                  // Send email notification for new order
                  try {
                    // Query contact using id column (primary key)
                    const contactQuery = `SELECT * FROM lasertg."contact" WHERE id = $1`;
                    const contactResult = await connection.query(contactQuery, [
                      updatedOrder.contactid,
                    ]);

                    // Fetch tag information from tag table
                    const tagQuery = `SELECT * FROM lasertg.tag WHERE orderid = $1 LIMIT 1`;
                    const tagResult = await connection.query(tagQuery, [
                      orderid,
                    ]);
                    const tag =
                      tagResult.rowCount > 0 ? tagResult.rows[0] : null;

                    if (contactResult.rowCount > 0) {
                      const contact = contactResult.rows[0];
                      const orderAmount = (updatedOrder.amount / 100).toFixed(
                        2
                      );

                      const emailSubject = "New order received";
                      const emailBody = `New Order #${
                        updatedOrder.orderid || updatedOrder.id
                      }

Order Details:
- Order ID: ${updatedOrder.orderid || updatedOrder.id}
- Amount: $${orderAmount} ${updatedOrder.currency.toUpperCase()}
- Status: ${updatedOrder.status}
- Payment Intent ID: ${updatedOrder.stripe_payment_intent_id || "Pending"}

Tag Information:
- Side 1 Line 1: ${tag?.side_1_text_line_1 || "N/A"}
- Side 1 Line 2: ${tag?.side_1_text_line_2 || "N/A"}
- Side 1 Line 3: ${tag?.side_1_text_line_3 || "N/A"}
- Side 2 Line 1: ${tag?.side_2_text_line_1 || "N/A"}
- Side 2 Line 2: ${tag?.side_2_text_line_2 || "N/A"}
- Side 2 Line 3: ${tag?.side_2_text_line_3 || "N/A"}
- Has QR Code: ${tag?.is_qr_code ? "Yes" : (updatedOrder.has_qr_code ? "Yes" : "No")}

Customer Information:
- Name: ${contact.firstname || ""} ${contact.lastname || ""}
- Pet Name: ${contact.petname || "N/A"}
- Phone: ${contact.phone || "N/A"}
- Address Line 1: ${contact.address_line_1 || "N/A"}
- Address Line 2: ${contact.address_line_2 || "N/A"}

Please process this order and begin crafting the laser tag.`;

                      await sendEmailWithAttachment(
                        "ericryanbowser@gmail.com",
                        null,
                        emailSubject,
                        emailBody
                      );

                      _logger.info("Order notification email sent", {
                        orderid: orderid,
                        emailSent: true,
                      });
                    }
                  } catch (emailError) {
                    _logger.error("Error sending order notification email", {
                      error: emailError.message,
                      orderid: orderid,
                      stack: emailError.stack,
                    });
                  }
                } else {
                  _logger.warn("Order not found for payment success", {
                    orderid: orderid,
                    paymentIntentId: event.data.object.id,
                    metadata: event.data.object.metadata,
                  });
                }
              }
            } catch (dbError) {
              _logger.error("Error updating order after payment success", {
                error: dbError.message,
                stack: dbError.stack,
                orderid: event.data.object.metadata.orderid,
                paymentIntentId: event.data.object.id,
              });
            }
          } else {
            _logger.warn("No orderid in payment intent metadata", {
              paymentIntentId: event.data.object.id,
              metadata: event.data.object.metadata,
            });
          }
          break;

        case "payment_intent.payment_failed":
          _logger.warn("Payment failed", {
            paymentIntentId: event.data.object.id,
            error: event.data.object.last_payment_error,
            metadata: event.data.object.metadata,
          });

          if (event.data.object.metadata?.orderid) {
            try {
              const orderid = parseInt(event.data.object.metadata.orderid);
              if (!isNaN(orderid)) {
                const connection = await connectLocalPostgres();
                // FIXED: Using orderid column name
                const updateQuery = `UPDATE lasertg.orders
                                   SET stripe_payment_intent_id = $1,
                                       status = 'failed',
                                       updated_at = CURRENT_TIMESTAMP
                                   WHERE id = $2
                                       RETURNING *;`;
                const updateResult = await connection.query(updateQuery, [
                  event.data.object.id,
                  orderid,
                ]);

                if (updateResult.rowCount > 0) {
                  _logger.info("Order updated after payment failure", {
                    orderid: orderid,
                    paymentIntentId: event.data.object.id,
                    updatedOrder: updateResult.rows[0],
                  });
                }
              }
            } catch (dbError) {
              _logger.error("Error updating order after payment failure", {
                error: dbError.message,
                stack: dbError.stack,
                orderid: event.data.object.metadata.orderid,
                paymentIntentId: event.data.object.id,
              });
            }
          }
          break;

        case "payment_intent.created":
          _logger.info("Payment intent created", {
            paymentIntentId: event.data.object.id,
            amount: event.data.object.amount,
            currency: event.data.object.currency,
            status: event.data.object.status,
            metadata: event.data.object.metadata,
          });

          if (event.data.object.metadata?.orderid) {
            try {
              const orderid = parseInt(event.data.object.metadata.orderid);
              if (!isNaN(orderid)) {
                const connection = await connectLocalPostgres();
                // FIXED: Using orderid column name
                const updateQuery = `UPDATE lasertg.orders
                                   SET stripe_payment_intent_id = $1,
                                       updated_at = CURRENT_TIMESTAMP
                                   WHERE id = $2 AND stripe_payment_intent_id IS NULL
                                       RETURNING *;`;
                const updateResult = await connection.query(updateQuery, [
                  event.data.object.id,
                  orderid,
                ]);

                if (updateResult.rowCount > 0) {
                  _logger.info("Order updated with payment intent ID", {
                    orderid: orderid,
                    paymentIntentId: event.data.object.id,
                    updatedOrder: updateResult.rows[0],
                  });
                } else {
                  _logger.warn("Order not found for payment intent created", {
                    orderid: orderid,
                    paymentIntentId: event.data.object.id,
                  });
                }
              }
            } catch (dbError) {
              _logger.error("Error updating order with payment intent ID", {
                error: dbError.message,
                stack: dbError.stack,
                orderid: event.data.object.metadata.orderid,
                paymentIntentId: event.data.object.id,
              });
            }
          }
          break;

        case "payment_intent.canceled":
          _logger.info("Payment canceled", {
            paymentIntentId: event.data.object.id,
            metadata: event.data.object.metadata,
          });
          break;

        case "payment_intent.requires_action":
          _logger.info("Payment intent requires action", {
            paymentIntentId: event.data.object.id,
            status: event.data.object.status,
            nextAction: event.data.object.next_action,
            metadata: event.data.object.metadata,
          });

          if (event.data.object.metadata?.orderid) {
            try {
              const orderid = parseInt(event.data.object.metadata.orderid);
              if (!isNaN(orderid)) {
                const connection = await connectLocalPostgres();
                // FIXED: Using orderid column name
                const updateQuery = `UPDATE lasertg.orders
                                   SET stripe_payment_intent_id = $1,
                                       status = 'processing',
                                       updated_at = CURRENT_TIMESTAMP
                                   WHERE id = $2
                                       RETURNING *;`;
                const updateResult = await connection.query(updateQuery, [
                  event.data.object.id,
                  orderid,
                ]);

                if (updateResult.rowCount > 0) {
                  _logger.info(
                    "Order updated with payment intent requires_action",
                    {
                      orderid: orderid,
                      paymentIntentId: event.data.object.id,
                      updatedOrder: updateResult.rows[0],
                    }
                  );
                }
              }
            } catch (dbError) {
              _logger.error(
                "Error updating order for payment intent requires_action",
                {
                  error: dbError.message,
                  stack: dbError.stack,
                }
              );
            }
          }
          break;

        case "payment_intent.processing":
          _logger.info("Payment intent processing", {
            paymentIntentId: event.data.object.id,
            status: event.data.object.status,
            metadata: event.data.object.metadata,
          });

          if (event.data.object.metadata?.orderid) {
            try {
              const orderid = parseInt(event.data.object.metadata.orderid);
              if (!isNaN(orderid)) {
                const connection = await connectLocalPostgres();
                // Query using id column (primary key)
                const updateQuery = `UPDATE lasertg.orders
                                   SET stripe_payment_intent_id = $1,
                                       status = 'processing',
                                       updated_at = CURRENT_TIMESTAMP
                                   WHERE id = $2
                                       RETURNING *;`;
                const updateResult = await connection.query(updateQuery, [
                  event.data.object.id,
                  orderid,
                ]);

                if (updateResult.rowCount > 0) {
                  _logger.info("Order updated with payment intent processing", {
                    orderid: orderid,
                    paymentIntentId: event.data.object.id,
                  });
                }
              }
            } catch (dbError) {
              _logger.error(
                "Error updating order for payment intent processing",
                {
                  error: dbError.message,
                  stack: dbError.stack,
                }
              );
            }
          }
          break;

        case "checkout.session.completed":
          _logger.info("Checkout session completed", {
            sessionId: event.data.object.id,
            paymentStatus: event.data.object.payment_status,
            paymentIntentId: event.data.object.payment_intent,
            metadata: event.data.object.metadata,
          });

          if (
            event.data.object.metadata?.orderid &&
            event.data.object.payment_intent
          ) {
            try {
              const orderid = parseInt(event.data.object.metadata.orderid);
              if (!isNaN(orderid)) {
                const connection = await connectLocalPostgres();
                // FIXED: Using orderid column name
                const updateQuery = `UPDATE lasertg.orders
                                   SET stripe_payment_intent_id = $1,
                                       status = $2,
                                       updated_at = CURRENT_TIMESTAMP
                                   WHERE id = $3
                                       RETURNING *;`;
                const paymentStatus =
                  event.data.object.payment_status === "paid"
                    ? "paid"
                    : "processing";
                const updateResult = await connection.query(updateQuery, [
                  event.data.object.payment_intent,
                  paymentStatus,
                  orderid,
                ]);

                if (updateResult.rowCount > 0) {
                  const updatedOrder = updateResult.rows[0];
                  _logger.info(
                    "Order updated after checkout session completion",
                    {
                      orderid: orderid,
                      paymentIntentId: event.data.object.payment_intent,
                      paymentStatus: event.data.object.payment_status,
                    }
                  );

                  // Send email notification
                  try {
                    // Query contact using id column (primary key)
                    const contactQuery = `SELECT * FROM lasertg."contact" WHERE id = $1`;
                    const contactResult = await connection.query(contactQuery, [
                      updatedOrder.contactid,
                    ]);

                    // Fetch tag information from tag table
                    const tagQuery = `SELECT * FROM lasertg.tag WHERE orderid = $1 LIMIT 1`;
                    const tagResult = await connection.query(tagQuery, [
                      orderid,
                    ]);
                    const tag =
                      tagResult.rowCount > 0 ? tagResult.rows[0] : null;

                    if (contactResult.rowCount > 0) {
                      const contact = contactResult.rows[0];
                      const orderAmount = (updatedOrder.amount / 100).toFixed(
                        2
                      );

                      const emailSubject = "New order received";
                      const emailBody = `New Order #${
                        updatedOrder.orderid || updatedOrder.id
                      }

Order Details:
- Order ID: ${updatedOrder.orderid || updatedOrder.id}
- Amount: $${orderAmount} ${updatedOrder.currency.toUpperCase()}
- Status: ${updatedOrder.status}
- Payment Intent ID: ${updatedOrder.stripe_payment_intent_id || "Pending"}

Tag Information:
- Side 1 Line 1: ${tag?.side_1_text_line_1 || "N/A"}
- Side 1 Line 2: ${tag?.side_1_text_line_2 || "N/A"}
- Side 1 Line 3: ${tag?.side_1_text_line_3 || "N/A"}
- Side 2 Line 1: ${tag?.side_2_text_line_1 || "N/A"}
- Side 2 Line 2: ${tag?.side_2_text_line_2 || "N/A"}
- Side 2 Line 3: ${tag?.side_2_text_line_3 || "N/A"}
- Has QR Code: ${tag?.is_qr_code ? "Yes" : (updatedOrder.has_qr_code ? "Yes" : "No")}

Customer Information:
- Name: ${contact.firstname || ""} ${contact.lastname || ""}
- Pet Name: ${contact.petname || "N/A"}
- Phone: ${contact.phone || "N/A"}
- Address Line 1: ${contact.address_line_1 || "N/A"}
- Address Line 2: ${contact.address_line_2 || "N/A"}

Please process this order and begin crafting the laser tag.`;

                      await sendEmailWithAttachment(
                        "ericryanbowser@gmail.com",
                        null,
                        emailSubject,
                        emailBody
                      );

                      _logger.info("Order notification email sent", {
                        orderid: orderid,
                        emailSent: true,
                      });
                    }
                  } catch (emailError) {
                    _logger.error("Error sending order notification email", {
                      error: emailError.message,
                      orderid: orderid,
                      stack: emailError.stack,
                    });
                  }
                }
              }
            } catch (dbError) {
              _logger.error(
                "Error updating order after checkout session completion",
                {
                  error: dbError.message,
                  stack: dbError.stack,
                }
              );
            }
          }
          break;

        case "charge.updated":
          _logger.info("Charge updated", {
            chargeId: event.data.object.id,
            status: event.data.object.status,
            paymentIntentId: event.data.object.payment_intent,
            metadata: event.data.object.metadata,
          });

          // Try to update order status based on charge status
          // First check if orderid is in charge metadata, otherwise use payment intent ID
          const orderid = event.data.object.metadata?.orderid
            ? parseInt(event.data.object.metadata.orderid)
            : null;
          const paymentIntentId = event.data.object.payment_intent;

          if (orderid || paymentIntentId) {
            try {
              const connection = await connectLocalPostgres();
              
              // Update order status based on charge status
              const chargeStatus = event.data.object.status;
              let orderStatus = "processing";
              
              if (chargeStatus === "succeeded") {
                orderStatus = "paid";
              } else if (chargeStatus === "failed" || chargeStatus === "canceled") {
                orderStatus = "failed";
              } else if (chargeStatus === "pending") {
                orderStatus = "processing";
              }

              let updateQuery;
              let updateValues;

              // Prefer orderid if available, otherwise use payment intent ID
              if (orderid && !isNaN(orderid)) {
                updateQuery = `UPDATE lasertg.orders
                               SET status = $1,
                                   updated_at = CURRENT_TIMESTAMP
                               WHERE id = $2
                                   RETURNING *;`;
                updateValues = [orderStatus, orderid];
              } else if (paymentIntentId) {
                updateQuery = `UPDATE lasertg.orders
                               SET status = $1,
                                   updated_at = CURRENT_TIMESTAMP
                               WHERE stripe_payment_intent_id = $2
                                   RETURNING *;`;
                updateValues = [orderStatus, paymentIntentId];
              }

              if (updateQuery) {
                const updateResult = await connection.query(updateQuery, updateValues);

                if (updateResult.rowCount > 0) {
                  _logger.info("Order updated after charge update", {
                    chargeId: event.data.object.id,
                    paymentIntentId: paymentIntentId,
                    orderid: orderid,
                    orderStatus: orderStatus,
                    updatedOrders: updateResult.rowCount,
                  });
                } else {
                  _logger.warn("No orders found for charge update", {
                    chargeId: event.data.object.id,
                    paymentIntentId: paymentIntentId,
                    orderid: orderid,
                  });
                }
              }
            } catch (dbError) {
              _logger.error("Error updating order after charge update", {
                error: dbError.message,
                stack: dbError.stack,
                chargeId: event.data.object.id,
                paymentIntentId: paymentIntentId,
                orderid: orderid,
              });
            }
          } else {
            _logger.warn("Charge update has no orderid or payment intent", {
              chargeId: event.data.object.id,
              status: event.data.object.status,
              metadata: event.data.object.metadata,
            });
          }
          break;

        default:
          _logger.info("Unhandled webhook event type", {
            eventType: event.type,
            eventId: event.id,
          });
      }

      return res.status(200).send({ received: true }).end();
    } catch (error) {
      _logger.error("Error processing Stripe webhook", {
        error: error.message,
        stack: error.stack,
        signature: signature ? "present" : "missing",
        bodyType: typeof req.body,
        isBuffer: Buffer.isBuffer(req.body),
      });
      return res
        .status(400)
        .send({
          error: "Webhook processing failed",
          message: error.message,
        })
        .end();
    }
  }
);

// Apply body parsers conditionally - skip /stripeWebhook (needs raw body)
router.use((req, res, next) => {
  if (
    req.path === "/stripeWebhook" ||
    req.originalUrl === "/stripeWebhook" ||
    req.originalUrl.includes("/stripeWebhook")
  ) {
    return next();
  }
  json()(req, res, next);
});
router.use(cors());
router.use((req, res, next) => {
  if (
    req.path === "/stripeWebhook" ||
    req.originalUrl === "/stripeWebhook" ||
    req.originalUrl.includes("/stripeWebhook")
  ) {
    return next();
  }
  express.json()(req, res, next);
});
router.use((req, res, next) => {
  if (
    req.path === "/stripeWebhook" ||
    req.originalUrl === "/stripeWebhook" ||
    req.originalUrl.includes("/stripeWebhook")
  ) {
    return next();
  }
  express.urlencoded({ extended: true })(req, res, next);
});

// TODO: Implement login functionality when authentication is added
// router.post('/login', async (req, res) => {
//   const {username, userid, pictureurl, auth0id} = req.body;
//   _logger.info('request body for laser tags: ', {credentials: req.body});

//   try {
//     const query = await queryUser(auth0id);
//     _logger.info('Exists: ', query);
//     if(query) {
//       _logger.info('User already exists');
//       const data = {
//         userid: auth0id,
//         username,
//         pictureurl,
//         exists: true
//       }
//       return res.status(200).send({...data}).end();
//     }
//     const response = await insertUser(auth0id, username, pictureurl);

//     if (response !== null) {
//       const data = {
//         'ok': true,
//         userid: auth0id,
//         username,
//         pictureurl
//       };
//       return res.status(200).send({...data}).end();
//     } else {
//        _logger.error('Error logging in: ', {error: response.error});
//       return res.status(500).send(response.error).end();
//     }
//   } catch (err) {
//     console.log(err);
//     return res.status(500).send(err.message).end();
//   }
// });

router.get("/getContact/:contactid", async (req, res) => {
  const contactid = req.params.contactid;
  _logger.info("contact id param", { contactid });
  try {
    const sql = `SELECT *
                 FROM lasertg."contact"
                 WHERE id = $1`;
    const connection = await connectLocalPostgres();
    const response = await connection.query(sql, [contactid]);
    _logger.info("response", { response });
    let contact = null;
    if (response.rowCount > 0) {
      contact = {
        contactid: response.rows[0].id.toString(),
        firstname: response.rows[0].firstname,
        lastname: response.rows[0].lastname,
        fullname: response.rows[0].fullname,
        petname: response.rows[0].petname,
        phone: response.rows[0].phone,
        address_line_1: response.rows[0].address_line_1,
        address_line_2: response.rows[0].address_line_2,
        address_line_3: response.rows[0].address_line_3,
      };
      _logger.info("Contact found: ", { contact });
      const data = {
        contact,
        exists: true,
        status: 201,
      };
      return res.status(201).send(data).end();
    } else {
      const data = {
        contact: null,
        contactid: contactid,
        exists: false,
        status: 204,
      };
      return res
        .status(204)
        .send({ ...data })
        .end();
    }
  } catch (error) {
    console.log(error);
    _logger.error("Error getting contact: ", { error });
    return res.status(500).send(error).end();
  }
});

// Endpoint to get Stripe publishable key for frontend
router.get("/stripeConfig", async (req, res) => {
  _logger.info("GET /stripeConfig - Request received");

  try {
    if (!STRIPE_TEST_PUBLISHABLE_API_KEY) {
      _logger.error("STRIPE_TEST_PUBLISHABLE_API_KEY is not configured");
      return res
        .status(500)
        .send({
          error: "Stripe publishable key not configured",
        })
        .end();
    }

    return res
      .status(200)
      .send({
        publishableKey: STRIPE_TEST_PUBLISHABLE_API_KEY,
        keyType: STRIPE_TEST_PUBLISHABLE_API_KEY.startsWith("pk_test_")
          ? "test"
          : "live",
      })
      .end();
  } catch (error) {
    _logger.error("Error in GET /stripeConfig", {
      error: error.message,
    });
    return res
      .status(500)
      .send({
        error: error.message,
      })
      .end();
  }
});

router.post("/stripePayment", async (req, res) => {
  const { amount, currency, contactid, orderid } = req.body;
  _logger.info("POST /stripePayment - Request received", {
    amount,
    currency,
    contactid,
    orderid,
    requestBody: req.body,
  });

  try {
    // amount should be in cents
    const amountInCents = parseInt(amount);
    if (isNaN(amountInCents) || amountInCents <= 0) {
      _logger.warn("Invalid amount provided", { amount, amountInCents });
      return res
        .status(400)
        .send({
          error: "Invalid amount",
          message: "Amount must be a positive number in cents",
        })
        .end();
    }

    const metadata = {
      contactid: contactid || "",
      orderid: orderid || "",
    };

    _logger.info("Creating payment intent with validated parameters", {
      amountInCents,
      currency: currency || "usd",
      metadata,
    });

    const paymentIntent = await createPaymentIntent(
      amountInCents,
      currency || "usd",
      metadata
    );

    _logger.info("Payment intent created successfully - sending response", {
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
    });

    return res
      .status(200)
      .send({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
      })
      .end();
  } catch (error) {
    _logger.error("Error in POST /stripePayment", {
      error: error.message,
      type: error.type,
      code: error.code,
      stack: error.stack,
      requestBody: req.body,
    });
    return res
      .status(500)
      .send({
        error: error.message,
        type: error.type || "StripeError",
        code: error.code || "unknown_error",
      })
      .end();
  }
});

router.get("/stripePayment/:paymentIntentId", async (req, res) => {
  const { paymentIntentId } = req.params;
  _logger.info("GET /stripePayment/:paymentIntentId - Request received", {
    paymentIntentId,
    params: req.params,
  });

  try {
    if (!paymentIntentId || !paymentIntentId.startsWith("pi_")) {
      _logger.warn("Invalid payment intent ID format", { paymentIntentId });
      return res
        .status(400)
        .send({
          error: "Invalid payment intent ID",
          message: 'Payment intent ID must start with "pi_"',
        })
        .end();
    }

    const paymentIntent = await retrievePaymentIntent(paymentIntentId);

    _logger.info("Payment intent retrieved successfully - sending response", {
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
    });

    return res
      .status(200)
      .send({
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        clientSecret: paymentIntent.client_secret,
        metadata: paymentIntent.metadata,
        lastPaymentError: paymentIntent.last_payment_error,
      })
      .end();
  } catch (error) {
    _logger.error("Error in GET /stripePayment/:paymentIntentId", {
      error: error.message,
      type: error.type,
      code: error.code,
      statusCode: error.statusCode,
      paymentIntentId,
    });
    return res
      .status(error.statusCode || 500)
      .send({
        error: error.message,
        type: error.type || "StripeError",
        code: error.code || "unknown_error",
      })
      .end();
  }
});

// Checkout Session endpoints (simpler hosted payment solution)
router.post("/stripeCheckout", async (req, res) => {
  const {
    amount,
    currency,
    contactid,
    orderid,
    successUrl,
    cancelUrl,
    lineItems,
  } = req.body;
  _logger.info("POST /stripeCheckout - Request received", {
    amount,
    currency,
    contactid,
    orderid,
    successUrl,
    cancelUrl,
    hasLineItems: !!lineItems,
    requestBody: req.body,
  });

  try {
    // Validate required fields
    if (!successUrl || !cancelUrl) {
      _logger.warn("Missing required URLs", { successUrl, cancelUrl });
      return res
        .status(400)
        .send({
          error: "Missing required fields",
          message: "successUrl and cancelUrl are required",
        })
        .end();
    }

    // If lineItems not provided, amount is required
    if (!lineItems && (!amount || amount <= 0)) {
      _logger.warn("Invalid or missing amount", { amount });
      return res
        .status(400)
        .send({
          error: "Invalid amount",
          message:
            "amount must be a positive number in cents, or provide lineItems",
        })
        .end();
    }

    const metadata = {
      contactid: contactid || "",
      orderid: orderid || "",
    };

    const session = await createCheckoutSession(
      amount,
      currency || "usd",
      metadata,
      successUrl,
      cancelUrl,
      lineItems || null
    );

    _logger.info("Checkout session created successfully - sending response", {
      sessionId: session.id,
      url: session.url,
    });

    return res
      .status(200)
      .send({
        sessionId: session.id,
        url: session.url,
        amount: session.amount_total,
        currency: session.currency,
      })
      .end();
  } catch (error) {
    _logger.error("Error in POST /stripeCheckout", {
      error: error.message,
      type: error.type,
      code: error.code,
      stack: error.stack,
      requestBody: req.body,
    });
    return res
      .status(500)
      .send({
        error: error.message,
        type: error.type || "StripeError",
        code: error.code || "unknown_error",
      })
      .end();
  }
});

router.get("/stripeCheckout/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  _logger.info("GET /stripeCheckout/:sessionId - Request received", {
    sessionId,
    params: req.params,
  });

  try {
    if (!sessionId || !sessionId.startsWith("cs_")) {
      _logger.warn("Invalid checkout session ID format", { sessionId });
      return res
        .status(400)
        .send({
          error: "Invalid checkout session ID",
          message: 'Checkout session ID must start with "cs_"',
        })
        .end();
    }

    const session = await retrieveCheckoutSession(sessionId);

    _logger.info("Checkout session retrieved successfully - sending response", {
      sessionId: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
    });

    return res
      .status(200)
      .send({
        sessionId: session.id,
        status: session.status,
        paymentStatus: session.payment_status,
        amountTotal: session.amount_total,
        currency: session.currency,
        paymentIntentId: session.payment_intent,
        customerId: session.customer,
        metadata: session.metadata,
      })
      .end();
  } catch (error) {
    _logger.error("Error in GET /stripeCheckout/:sessionId", {
      error: error.message,
      type: error.type,
      code: error.code,
      statusCode: error.statusCode,
      sessionId,
    });
    return res
      .status(error.statusCode || 500)
      .send({
        error: error.message,
        type: error.type || "StripeError",
        code: error.code || "unknown_error",
      })
      .end();
  }
});

router.post("/stripePayment/confirm", async (req, res) => {
  const { paymentIntentId, paymentMethod } = req.body;
  _logger.info("POST /stripePayment/confirm - Request received", {
    paymentIntentId,
    paymentMethodId: paymentMethod?.id || paymentMethod,
    paymentMethodType: typeof paymentMethod,
    requestBody: req.body,
  });

  try {
    if (!paymentIntentId) {
      _logger.warn("Missing paymentIntentId in request", {
        requestBody: req.body,
      });
      return res
        .status(400)
        .send({
          error: "Missing paymentIntentId",
          message: "paymentIntentId is required",
        })
        .end();
    }

    if (!paymentMethod) {
      _logger.warn("Missing paymentMethod in request", {
        requestBody: req.body,
      });
      return res
        .status(400)
        .send({
          error: "Missing paymentMethod",
          message: "paymentMethod is required",
        })
        .end();
    }

    const paymentIntent = await confirmPaymentIntent(
      paymentIntentId,
      paymentMethod
    );

    _logger.info("Payment intent confirmed successfully - sending response", {
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      requiresAction: paymentIntent.status === "requires_action",
    });

    // Return response with all relevant information
    const response = {
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      metadata: paymentIntent.metadata,
      lastPaymentError: paymentIntent.last_payment_error,
    };

    // Include next_action if payment requires additional action (e.g., 3D Secure)
    if (paymentIntent.next_action) {
      response.nextAction = paymentIntent.next_action;
      response.requiresAction = true;
    }

    return res.status(200).send(response).end();
  } catch (error) {
    _logger.error("Error in POST /stripePayment/confirm", {
      error: error.message,
      type: error.type,
      code: error.code,
      statusCode: error.statusCode,
      paymentIntentId,
      paymentMethodId: paymentMethod?.id || paymentMethod,
      stack: error.stack,
    });

    // Return more detailed error information
    return res
      .status(error.statusCode || 500)
      .send({
        error: error.message,
        type: error.type || "StripeError",
        code: error.code || "unknown_error",
        paymentIntentId: paymentIntentId || null,
      })
      .end();
  }
});

router.post("/createOrder", async (req, res) => {
  const {
    id,
    has_qr_code,
    amount,
    currency,
    stripe_payment_intent_id,
    status,
    tracking_number,
    font_family
  } = req.body;
  _logger.info("POST /createOrder - Request received", { request: req.body });

  const contactid = id;
  const created_at = new Date();
  const updated_at = new Date();

  try {
    // Validate required fields
    if (!contactid) {
      _logger.warn("Missing required field: contactid", { request: req.body });
      return res
        .status(400)
        .send({
          error: "Missing required field",
          message: "contactid is required",
        })
        .end();
    }

    if (!amount || amount <= 0) {
      _logger.warn("Invalid or missing amount", { amount, request: req.body });
      return res
        .status(400)
        .send({
          error: "Invalid amount",
          message: "amount must be a positive number",
        })
        .end();
    }

    const connection = await connectLocalPostgres();

    // Start transaction: Insert order first, then tag
    // Insert into orders table (without tag columns - they're now in separate tag table)
    const orderQuery = `
        INSERT INTO lasertg.orders(
          stripe_payment_intent_id,
          amount, 
          currency, 
          status, 
          has_qr_code,
          created_at, 
          updated_at, 
          contactid, 
          tracking_number, 
          font_family
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id;
    `;

    const orderValues = [
      stripe_payment_intent_id || null,
      amount,
      currency || "usd",
      status || "pending",
      has_qr_code !== undefined ? has_qr_code : false,
      created_at,
      updated_at,
      contactid,
      tracking_number || null,
      font_family || null
    ];

    _logger.info("Creating order with values", {
      contactid,
      amount,
      currency: currency || "usd",
      status: status || "pending",
      hasStripePaymentIntent: !!stripe_payment_intent_id,
      hasQrCode: has_qr_code !== undefined ? has_qr_code : false,
    });

    const orderResponse = await connection.query(orderQuery, orderValues);
    const orderId = orderResponse.rows[0].id;

    // Insert tag data into tag table
      // const tagQuery = `
      //     INSERT INTO lasertg.tag(tagside, tag_line_1, tag_line_2, tag_line_3, tag_line_4, tag_line_5, tag_line_6, notes, orderid)
      //     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING orderid;
      // `;

      // const tagValues = [
      //   tagside || "back", // Default tagside - can be made configurable if needed
      //   tag_line_1 || null,
      //   tag_line_2 || null,
      //   tag_line_3 || null,
      //   tag_line_4 || null,
      //   tag_line_5 || null,
      //   tag_line_6 || null,
      //   notes || null,
      //   orderId
      // ];

      // await connection.query(tagQuery, tagValues);
      // _logger.info("Tag created for order", { orderId });
    

    // Fetch the complete order with all details
    const fetchOrderQuery = `SELECT * FROM lasertg.orders WHERE id = $1`;
    const completeOrder = await connection.query(fetchOrderQuery, [orderId]);

    _logger.info("Order created successfully", {
      orderid: completeOrder.rows[0].orderid,
      contactid: completeOrder.rows[0].contactid,
      status: completeOrder.rows[0].status,
    });

    return res.status(201).send(completeOrder.rows[0]).end();
  } catch (error) {
    _logger.error("Error creating order", {
      error: error.message,
      stack: error.stack,
      request: req.body,
    });
    return res
      .status(500)
      .send({
        error: error.message,
        message: "Failed to create order",
      })
      .end();
  }
});

router.post("/saveTag", async (req, res) => {
  const { tag } = req.body;
  _logger.info("POST /saveTag - Request received", { request: req.body });

  try {
    // Extract fields from the new nested structure
    const orderid = tag?.orderid;
    const is_qr_code = tag?.is_qr_code !== undefined ? tag.is_qr_code : false;
    const qr_code_svg = tag?.qr_code_svg || null;
    const notes = tag?.notes || null;
    
    // Extract text lines from nested side1 and side2 objects
    const side_1_text_line_1 = tag?.side1?.text_line_1 || null;
    const side_1_text_line_2 = tag?.side1?.text_line_2 || null;
    const side_1_text_line_3 = tag?.side1?.text_line_3 || null;
    const side_2_text_line_1 = tag?.side2?.text_line_1 || null;
    const side_2_text_line_2 = tag?.side2?.text_line_2 || null;
    const side_2_text_line_3 = tag?.side2?.text_line_3 || null;

    _logger.info("Extracted tag fields from request", {
      orderid,
      hasQrCode: is_qr_code,
      hasQrCodeSvg: !!qr_code_svg,
      hasNotes: !!notes,
      side1_line1: side_1_text_line_1 ? "present" : "null",
      side1_line2: side_1_text_line_2 ? "present" : "null",
      side1_line3: side_1_text_line_3 ? "present" : "null",
      side2_line1: side_2_text_line_1 ? "present" : "null",
      side2_line2: side_2_text_line_2 ? "present" : "null",
      side2_line3: side_2_text_line_3 ? "present" : "null",
    });

    // Validate required fields
    if (!orderid) {
      _logger.warn("Missing required field: orderid", { request: req.body });
      return res
        .status(400)
        .send({
          error: "Missing required field",
          message: "orderid is required",
        })
        .end();
    }

    _logger.info("Validation passed for /saveTag", { orderid });

    const connection = await connectLocalPostgres();

    // Check if tag already exists for this order
    _logger.info("Checking if tag exists for order", { orderid });
    const checkQuery = `SELECT id FROM lasertg.tag WHERE orderid = $1 LIMIT 1`;
    const existingTag = await connection.query(checkQuery, [orderid]);
    _logger.info("Tag existence check completed", {
      orderid,
      tagExists: existingTag.rowCount > 0,
      tagId: existingTag.rowCount > 0 ? existingTag.rows[0].id : null,
    });

    // Trim and clean string fields
    const side1TextLine1 = side_1_text_line_1 && String(side_1_text_line_1).trim() ? String(side_1_text_line_1).trim() : null;
    const side1TextLine2 = side_1_text_line_2 && String(side_1_text_line_2).trim() ? String(side_1_text_line_2).trim() : null;
    const side1TextLine3 = side_1_text_line_3 && String(side_1_text_line_3).trim() ? String(side_1_text_line_3).trim() : null;
    const side2TextLine1 = side_2_text_line_1 && String(side_2_text_line_1).trim() ? String(side_2_text_line_1).trim() : null;
    const side2TextLine2 = side_2_text_line_2 && String(side_2_text_line_2).trim() ? String(side_2_text_line_2).trim() : null;
    const side2TextLine3 = side_2_text_line_3 && String(side_2_text_line_3).trim() ? String(side_2_text_line_3).trim() : null;
    const notesValue = notes && String(notes).trim() ? String(notes).trim() : null;
    const qrCodeSvgValue = qr_code_svg && String(qr_code_svg).trim() ? String(qr_code_svg).trim() : null;

    _logger.info("Tag fields trimmed and cleaned", {
      orderid,
      side1_line1: side1TextLine1 ? `"${side1TextLine1.substring(0, 50)}${side1TextLine1.length > 50 ? '...' : ''}"` : "null",
      side1_line2: side1TextLine2 ? `"${side1TextLine2.substring(0, 50)}${side1TextLine2.length > 50 ? '...' : ''}"` : "null",
      side1_line3: side1TextLine3 ? `"${side1TextLine3.substring(0, 50)}${side1TextLine3.length > 50 ? '...' : ''}"` : "null",
      side2_line1: side2TextLine1 ? `"${side2TextLine1.substring(0, 50)}${side2TextLine1.length > 50 ? '...' : ''}"` : "null",
      side2_line2: side2TextLine2 ? `"${side2TextLine2.substring(0, 50)}${side2TextLine2.length > 50 ? '...' : ''}"` : "null",
      side2_line3: side2TextLine3 ? `"${side2TextLine3.substring(0, 50)}${side2TextLine3.length > 50 ? '...' : ''}"` : "null",
      hasNotes: !!notesValue,
      hasQrCodeSvg: !!qrCodeSvgValue,
    });

    const tagValues = [
      side1TextLine1,
      side1TextLine2,
      side1TextLine3,
      side2TextLine1,
      side2TextLine2,
      side2TextLine3,
      is_qr_code,
      qrCodeSvgValue,
      notesValue,
      orderid,
    ];

    let response;

    if (existingTag.rowCount > 0) {
      // Update existing tag
      const tagId = existingTag.rows[0].id;
      const updateQuery = `
          UPDATE lasertg.tag
          SET side_1_text_line_1 = $1,
              side_1_text_line_2 = $2,
              side_1_text_line_3 = $3,
              side_2_text_line_1 = $4,
              side_2_text_line_2 = $5,
              side_2_text_line_3 = $6,
              is_qr_code = $7,
              qr_code_svg = $8,
              notes = $9
          WHERE orderid = $10
          RETURNING *;
      `;

      _logger.info("Updating existing tag", {
        tagId,
        orderid,
        hasQrCode: is_qr_code,
        hasQrCodeSvg: !!qrCodeSvgValue,
        side1Lines: [side1TextLine1, side1TextLine2, side1TextLine3].filter(Boolean).length,
        side2Lines: [side2TextLine1, side2TextLine2, side2TextLine3].filter(Boolean).length,
      });

      response = await connection.query(updateQuery, tagValues);
      _logger.info("Tag update query executed successfully", {
        tagId,
        orderid,
        rowsAffected: response.rowCount,
      });
    } else {
      // Insert new tag
      const insertQuery = `
          INSERT INTO lasertg.tag(
            side_1_text_line_1,
            side_1_text_line_2,
            side_1_text_line_3,
            side_2_text_line_1,
            side_2_text_line_2,
            side_2_text_line_3,
            is_qr_code,
            qr_code_svg,
            notes,
            orderid
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *;
      `;

      _logger.info("Creating new tag", {
        orderid,
        hasQrCode: is_qr_code,
        hasQrCodeSvg: !!qrCodeSvgValue,
        side1Lines: [side1TextLine1, side1TextLine2, side1TextLine3].filter(Boolean).length,
        side2Lines: [side2TextLine1, side2TextLine2, side2TextLine3].filter(Boolean).length,
      });

      response = await connection.query(insertQuery, tagValues);
      _logger.info("Tag insert query executed successfully", {
        orderid,
        rowsAffected: response.rowCount,
      });
    }

    _logger.info("Tag saved successfully", {
      tagId: response.rows[0].id,
      orderid: response.rows[0].orderid,
      savedTag: {
        id: response.rows[0].id,
        orderid: response.rows[0].orderid,
        side1_line1: response.rows[0].side_1_text_line_1 ? "present" : "null",
        side1_line2: response.rows[0].side_1_text_line_2 ? "present" : "null",
        side1_line3: response.rows[0].side_1_text_line_3 ? "present" : "null",
        side2_line1: response.rows[0].side_2_text_line_1 ? "present" : "null",
        side2_line2: response.rows[0].side_2_text_line_2 ? "present" : "null",
        side2_line3: response.rows[0].side_2_text_line_3 ? "present" : "null",
        is_qr_code: response.rows[0].is_qr_code,
        hasQrCodeSvg: !!response.rows[0].qr_code_svg,
        hasNotes: !!response.rows[0].notes,
      },
    });

    return res.status(201).send(response.rows[0]).end();
  } catch (error) {
    _logger.error("Error saving tag", {
      error: error.message,
      stack: error.stack,
      request: req.body,
    });
    return res
      .status(500)
      .send({
        error: error.message,
        message: "Failed to save tag",
      })
      .end();
  }
});

router.post("/saveShipping", async (req, res) => {
  const { orderid, address_line_1, address_line_2, address_line_3, status } = req.body;
  _logger.info("POST /saveShipping - Request received", { request: req.body });

  try {
    _logger.info("Extracted shipping fields from request", {
      orderid,
      hasAddressLine1: !!address_line_1,
      hasAddressLine2: !!address_line_2,
      hasAddressLine3: !!address_line_3,
      status: status || "pending (default)",
      addressLine1Preview: address_line_1 ? `"${address_line_1.substring(0, 50)}${address_line_1.length > 50 ? '...' : ''}"` : "null",
    });

    // Validate required fields
    if (!orderid || !address_line_1) {
      _logger.warn("Missing required fields: orderid and address_line_1", {
        request: req.body,
        hasOrderid: !!orderid,
        hasAddressLine1: !!address_line_1,
      });
      return res
        .status(400)
        .send({
          error: "Missing required fields",
          message: "orderid and address_line_1 are required"
        })
        .end();
    }

    _logger.info("Validation passed for /saveShipping", { orderid });

    const connection = await connectLocalPostgres();

    // Check if shipping record already exists for this order
    _logger.info("Checking if shipping record exists for order", { orderid });
    const checkQuery = `SELECT id FROM lasertg.shipping WHERE orderid = $1 LIMIT 1`;
    const existingShipping = await connection.query(checkQuery, [orderid]);
    _logger.info("Shipping record existence check completed", {
      orderid,
      shippingExists: existingShipping.rowCount > 0,
      shippingId: existingShipping.rowCount > 0 ? existingShipping.rows[0].id : null,
    });

    const shippingValues = [
      address_line_1 || null,
      address_line_2 || null,
      address_line_3 || null,
      status || 'pending',
      orderid
    ];

    let response;

    if (existingShipping.rowCount > 0) {
      // Update existing shipping record
      const shippingId = existingShipping.rows[0].id;
      const updateQuery = `
        UPDATE lasertg.shipping
        SET address_line_1 = $1,
            address_line_2 = $2,
            address_line_3 = $3,
            status = $4,
            updated_at = CURRENT_TIMESTAMP
        WHERE orderid = $5
        RETURNING *;
      `;

      _logger.info("Updating existing shipping record", {
        shippingId,
        orderid,
        addressLine1: address_line_1 ? `"${address_line_1.substring(0, 50)}${address_line_1.length > 50 ? '...' : ''}"` : "null",
        hasAddressLine2: !!address_line_2,
        hasAddressLine3: !!address_line_3,
        status: status || "pending",
      });

      response = await connection.query(updateQuery, shippingValues);
      _logger.info("Shipping update query executed successfully", {
        shippingId,
        orderid,
        rowsAffected: response.rowCount,
      });
    } else {
      // Insert new shipping record
      const insertQuery = `
        INSERT INTO lasertg.shipping(
          address_line_1,
          address_line_2,
          address_line_3,
          status,
          orderid
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
      `;

      _logger.info("Creating new shipping record", {
        orderid,
        addressLine1: address_line_1 ? `"${address_line_1.substring(0, 50)}${address_line_1.length > 50 ? '...' : ''}"` : "null",
        hasAddressLine2: !!address_line_2,
        hasAddressLine3: !!address_line_3,
        status: status || "pending",
      });

      response = await connection.query(insertQuery, shippingValues);
      _logger.info("Shipping insert query executed successfully", {
        orderid,
        rowsAffected: response.rowCount,
      });
    }

    _logger.info("Shipping record saved successfully", {
      shippingId: response.rows[0].id,
      orderid: response.rows[0].orderid,
      savedShipping: {
        id: response.rows[0].id,
        orderid: response.rows[0].orderid,
        address_line_1: response.rows[0].address_line_1 ? `"${response.rows[0].address_line_1.substring(0, 50)}${response.rows[0].address_line_1.length > 50 ? '...' : ''}"` : "null",
        hasAddressLine2: !!response.rows[0].address_line_2,
        hasAddressLine3: !!response.rows[0].address_line_3,
        status: response.rows[0].status,
      },
    });

    return res.status(201).send(response.rows[0]).end();
  } catch (error) {
    _logger.error("Error saving shipping", {
      error: error.message,
      stack: error.stack,
      request: req.body
    });
    return res
      .status(500)
      .send({
        error: error.message,
        message: "Failed to save shipping information"
      })
      .end();
  }
});

router.post("/updateOrderPayment", async (req, res) => {
  const { orderid, stripe_payment_intent_id, status } = req.body;
  _logger.info("request body for update order payment: ", {
    request: req.body,
  });

  try {
    const connection = await connectLocalPostgres();
    const query = `UPDATE lasertg.orders
                   SET stripe_payment_intent_id = $1,
                       status = $2,
                       updated_at = CURRENT_TIMESTAMP
                   WHERE id = $3
                   RETURNING *;`;

    const values = [
      stripe_payment_intent_id || null,
      status || "processing",
      orderid,
    ];

    const response = await connection.query(query, values);

    if (response.rowCount > 0) {
      _logger.info("Order payment updated: ", { orderid });
      return res.status(200).send(response.rows[0]).end();
    } else {
      return res.status(404).send({ error: "Order not found" }).end();
    }
  } catch (error) {
    console.error(error);
    _logger.error("Error updating order payment: ", { error });

    return res.status(500).send(error).end();
  }
});

router.post("/saveContact", async (req, res) => {
  // FIXED: Handle address fields correctly - now includes all fields
  const { firstname, lastname, fullname, petname, phone, email, address_line_1, address_line_2, address_line_3 } = req.body;
  _logger.info("request body for save contact: ", { request: req.body });

  try {
    const connection = await connectLocalPostgres();
    const query = `
        INSERT INTO lasertg.contact(
          firstname, 
          lastname, 
          petname, 
          phone, 
          fullname, 
          email, 
          address_line_1, 
          address_line_2, 
          address_line_3
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
        RETURNING id;
    `;

    // Build fullname from firstname + lastname if not provided
    const computedFullname = fullname || [firstname, lastname].filter(Boolean).join(" ") || null;

    const values = [
      firstname || null,
      lastname || null,
      petname || null,
      phone || null,
      fullname,
      email || null,
      address_line_1 || null,
      address_line_2 || null,
      address_line_3 || null,
    ];

    _logger.info("Saving contact with values: ", {
      firstname,
      lastname,
      petname,
      phone,
      fullname: computedFullname,
      email,
      address_line_1,
      address_line_2,
      address_line_3,
    });

    const response = await connection.query(query, values);

    _logger.info("Contact saved successfully: ", {
      contactid: response.rows[0].id,
    });

    return res.status(201).send(response.rows[0]).end();
  } catch (error) {
    console.error(error);
    _logger.error("Error saving contact: ", { error: error.message, stack: error.stack });

    return res.status(500).send({ error: error.message, message: "Failed to save contact" }).end();
  }
});

router.post("/updateContact", updateContactLimiter, async (req, res) => {
  const { contactid, firstname, lastname, fullname, petname, phone, email, address_line_1, address_line_2, address_line_3 } = req.body;
  _logger.info("request body for update contact: ", { request: req.body });

  // Validate contactid is provided
  if (!contactid) {
    _logger.warn("Missing contactid in update request");
    return res.status(400).send({ error: "contactid is required" }).end();
  }

  try {
    const connection = await connectLocalPostgres();
    
    // Build fullname from firstname + lastname if not provided
    const computedFullname = fullname || [firstname, lastname].filter(Boolean).join(" ") || null;
    
    const query = `UPDATE lasertg."contact"
                   SET firstname = $1,
                       lastname = $2,
                       fullname = $3,
                       petname = $4,
                       phone = $5,
                       email = $6,
                       address_line_1 = $7,
                       address_line_2 = $8,
                       address_line_3 = $9
                   WHERE id = $10
                   RETURNING *;`;

    const values = [
      firstname || null,
      lastname || null,
      computedFullname,
      petname || null,
      phone || null,
      email || null,
      address_line_1 || null,
      address_line_2 || null,
      address_line_3 || null,
      contactid,
    ];

    _logger.info("Updating contact with values: ", {
      contactid,
      firstname,
      lastname,
      fullname: computedFullname,
      petname,
      phone,
      email,
      address_line_1,
      address_line_2,
      address_line_3,
    });

    const response = await connection.query(query, values);

    if (response.rowCount > 0) {
      _logger.info("Contact updated successfully: ", { 
        contactid,
        contactUpdated: response.rowCount 
      });
      return res.status(200).send({ 
        contactUpdated: true, 
        contact: response.rows[0] 
      }).end();
    } else {
      _logger.warn("Contact not found for update: ", { contactid });
      return res.status(404).send({ 
        contactUpdated: false, 
        error: "Contact not found" 
      }).end();
    }
  } catch (error) {
    console.error(error);
    _logger.error("Error updating contact: ", { error: error.message, stack: error.stack });

    return res.status(500).send({ error: error.message, message: "Failed to update contact" }).end();
  }
});

router.post("/sendEmail", async (req, res) => {
  // Check if request body exists
  if (!req.body || Object.keys(req.body).length === 0) {
    _logger.warn("Empty request body received for /sendEmail", {
      contentType: req.headers["content-type"],
      method: req.method,
      url: req.originalUrl,
    });
    return res
      .status(400)
      .json({
        message:
          "Request body is required. Please provide: subject and message (from and to are optional)",
      })
      .end();
  }

  const { from, to, subject, message } = req.body;

  // Validate required fields
  if (!subject || !message) {
    _logger.warn("Missing required email fields", {
      from,
      to,
      subject,
      message,
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
    });
    return res
      .status(400)
      .json({
        message: "Missing required fields: subject and message are required",
      })
      .end();
  }

  try {
    _logger.info("Sending email: ", { from, to, subject, message });
    const messageId = await sendEmailWithAttachment(from, to, subject, message);
    _logger.info("Email sent with message id: ", { messageId });
    if (messageId) {
      res.status(200).send("Email Sent!").end();
    } else {
      res.status(500).send("Error").end();
    }
  } catch (error) {
    _logger.error("Error sending email: ", { error });
    res.status(500).json({ message: "Failed to send email." });
  }
});

module.exports = router;
