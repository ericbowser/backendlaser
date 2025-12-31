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
- Line 1: ${tag?.text_line_1 || "N/A"}
- Line 2: ${tag?.text_line_2 || "N/A"}
- Line 3: ${tag?.text_line_3 || "N/A"}
- Has QR Code: ${updatedOrder.has_qr_code ? "Yes" : "No"}

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
- Line 1: ${tag?.text_line_1 || "N/A"}
- Line 2: ${tag?.text_line_2 || "N/A"}
- Line 3: ${tag?.text_line_3 || "N/A"}
- Has QR Code: ${updatedOrder.has_qr_code ? "Yes" : "No"}

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
  const {
    tagside,
    text_line_1,
    text_line_2,
    text_line_3,
    text_line_4,
    text_line_5,
    text_line_6,
    notes,
    orderid,
  } = req.body;
  _logger.info("POST /saveTag - Request received", { request: req.body });

  try {
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

    const connection = await connectLocalPostgres();

    // Check if tag already exists for this order
    const checkQuery = `SELECT id FROM lasertg.tag WHERE orderid = $1 LIMIT 1`;
    const existingTag = await connection.query(checkQuery, [orderid]);

    // Handle array fields - convert to array if not already, and trim/clean values
    const tagsideArray = Array.isArray(tagside) 
      ? tagside.map(v => String(v || '').trim()).filter(v => v.length > 0)
      : tagside && String(tagside).trim() 
        ? [String(tagside).trim()] 
        : null;
    
    const textLine1Array = Array.isArray(text_line_1)
      ? text_line_1.map(v => String(v || '').trim()).filter(v => v.length > 0)
      : text_line_1 && String(text_line_1).trim()
        ? [String(text_line_1).trim()]
        : null;
    
    const textLine4Array = Array.isArray(text_line_4)
      ? text_line_4.map(v => String(v || '').trim()).filter(v => v.length > 0)
      : text_line_4 && String(text_line_4).trim()
        ? [String(text_line_4).trim()]
        : null;

    // Trim string fields
    const textLine2 = text_line_2 && String(text_line_2).trim() ? String(text_line_2).trim() : null;
    const textLine3 = text_line_3 && String(text_line_3).trim() ? String(text_line_3).trim() : null;
    const textLine5 = text_line_5 && String(text_line_5).trim() ? String(text_line_5).trim() : null;
    const textLine6 = text_line_6 && String(text_line_6).trim() ? String(text_line_6).trim() : null;
    const notesValue = notes && String(notes).trim() ? String(notes).trim() : null;

    const tagValues = [
      tagsideArray,
      textLine1Array,
      textLine2,
      textLine3,
      textLine4Array,
      textLine5,
      textLine6,
      notesValue,
      orderid,
    ];

    let response;

    if (existingTag.rowCount > 0) {
      // Update existing tag
      const tagId = existingTag.rows[0].id;
      const updateQuery = `
          UPDATE lasertg.tag
          SET tagside = $1,
              text_line_1 = $2,
              text_line_2 = $3,
              text_line_3 = $4,
              text_line_4 = $5,
              text_line_5 = $6,
              text_line_6 = $7,
              notes = $8
          WHERE orderid = $9
          RETURNING *;
      `;

      _logger.info("Updating existing tag", {
        tagId,
        orderid,
        hasTagside: !!tagsideArray,
        hasTextLine1: !!textLine1Array,
        hasTextLine4: !!textLine4Array,
      });

      response = await connection.query(updateQuery, tagValues);
    } else {
      // Insert new tag
      const insertQuery = `
          INSERT INTO lasertg.tag(
            tagside,
            text_line_1,
            text_line_2,
            text_line_3,
            text_line_4,
            text_line_5,
            text_line_6,
            notes,
            orderid
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *;
      `;

      _logger.info("Creating new tag", {
        orderid,
        hasTagside: !!tagsideArray,
        hasTextLine1: !!textLine1Array,
        hasTextLine4: !!textLine4Array,
      });

      response = await connection.query(insertQuery, tagValues);
    }

    _logger.info("Tag created successfully", {
      tagId: response.rows[0].id,
      orderid: response.rows[0].orderid,
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
  // FIXED: Handle address fields correctly
  const { firstname, lastname, fullname, petname, phone, email, address_line_1, address_line_2, address_line_3 } = req.body;
  _logger.info("request body for save contact: ", { request: req.body });

  try {
    const connection = await connectLocalPostgres();
    const query = `
        INSERT INTO lasertg.contact(firstname, lastname, petname, phone, fullname)
        VALUES ($1, $2, $3, $4, $5) RETURNING id;
    `;

    _logger.info;
    const values = [
      firstname || null,
      lastname || null,
      petname || null,
      phone || null,
      fullname || firstname + " " + lastname,
    ];

    const response = await connection.query(query, values);

    _logger.info("Contact saved for QR code engraving: ", {
      contactid: response.rows[0].id,
    });

    return res.status(201).send(response.rows[0]).end();
  } catch (error) {
    console.error(error);
    _logger.error("Error saving contact: ", { error });

    return res.status(500).send(error).end();
  }
});

router.post("/updateContact", updateContactLimiter, async (req, res) => {
  const { contactid, firstname, lastname, petname, phone, address } = req.body;
  _logger.info("request body for update contact: ", { request: req.body });

  try {
    const connection = await connectLocalPostgres();
    const query = `UPDATE lasertg."contact"
                   SET firstname = $1,
                       lastname  = $2,
                       petname   = $4,
                       phone     = $5,
                       fullname  = $3
                   WHERE id = $9;`;

    const values = [
      firstname || null,
      lastname || null,
      petname || null,
      phone || null,
      fullname || null,
    ];

    const response = await connection.query(query, values);
    _logger.info("Contact updated: ", { response });

    if (response.rowCount > 0) {
      _logger.info("Contact updated: ", { contactUpdated: response.rowCount });
      return res.status(200).send({ contactUpdated: true }).end();
    } else {
      return res.status(200).send({ contactUpdated: false }).end();
    }
  } catch (error) {
    console.error(error);
    _logger.error("Error updating contact: ", { error });

    return res.status(500).send(error).end();
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
