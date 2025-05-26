const express = require('express');
const app = express();
const cors = require('cors');
const router = express.Router();
const logger = require('./logs/backendLaserLog');
const {json} = require('body-parser');
const {connectLocalPostgres} = require('./documentdb/client');
const {insertUser} = require('./auth/loginAuth');
const sendEmailWithAttachment = require('./api/gmailSender');

let _logger = logger();
_logger.info('Logger Initialized');

router.use(json());
router.use(cors());
router.use(express.json());
router.use(express.urlencoded({extended: true}));

router.post('/login', async (req, res) => {
  const {username, userid} = req.body;
  _logger.info('request body for laser tags: ', {credentials: req.body});

  try {
    const user = {username, userid};
    const response = await insertUser(user);

    const data = {
      error: null,
      userid,
    };
    if (!response.error) {
      return res.status(200).send(data).end();
    } else {
        _logger.error('Error logging in: ', {error: response.error});
      return res.status(500).send(response.error).end();
    }
  } catch
    (err) {
    console.log(err);
    return res.status(500).send(err.message).end();
  }
});

router.get('/getContact/:userid', async (req, res) => {
  const userid = req.params.userid;
  _logger.info('user id param', {userid});
  try {
    const userId = parseInt(userid);
    const sql = `SELECT *
                 FROM lasertg."contact"
                 WHERE userid = ${userId}`;
    const connection = await connectLocalPostgres();
    const response = await connection.query(sql);
    _logger.info('response', {response});
    let contact = null;
    if (response.rowCount > 0) {
      contact = {
        userid: response.rows[0].userid.toString(), //response.rows[0].userid,
        firstname: response.rows[0].firstname,
        lastname: response.rows[0].lastname,
        petname: response.rows[0].petname,
        phone: response.rows[0].phone,
        address: response.rows[0].address,
      };
      _logger.info('Contact found: ', {contact});
      const data = {
        contact,
        exists: true,
        status: 201,
      };
      return res.status(201).send(data).end();
    } else {
      const data = {
        contact: response.rows[0],
        userid: userId,
        exists: false,
        status: 204,
      };
      return res.status(204).send({...data}).end();
    }
  } catch (error) {
    console.log(error);
    _logger.error('Error getting contact: ', {error});
    return res.status(500).send(error).end();
  }
});

router.post('/stripePayment', async (req, res) => {
  try {

  } catch (err) {
    console.log(err);
    return res.status(500).send(err.message).end();
  }
});

router.post('/saveContact', async (req, res) => {
  const {userid, firstname, lastname, petname, phone, address} = req.body;
  _logger.info('request body for save contact: ', {request: req.body});

  try {
    const connection = await connectLocalPostgres();
    const query = `
        INSERT INTO lasertg."contact"(firstname, lastname, petname, phone, address, userid)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;
    `;

    const values = [
      firstname,
      lastname,
      petname,
      phone,
      address,
      parseInt(userid),
    ];

    const response = await connection.query(query, values);

    _logger.info('Contact saved: ', {response: response.rows[0]});

    return res.status(201).send(response.rows[0]).end();
  } catch (error) {
    console.error(error);
    _logger.error('Error saving contact: ', {error});

    return res.status(500).send(error).end();
  }
});

router.post('/updateContact', async (req, res) => {
  const {userid, firstname, lastname, petname, phone, address} = req.body;
  _logger.info('request body for update contact: ', {request: req.body});

  try {
    const connection = await connectLocalPostgres();
    const query = `UPDATE public.contact
                   SET firstname = $1,
                       lastname  = $2,
                       petname   = $3,
                       phone     = $4,
                       address   = $5
                   WHERE userid = $6;`;

    const values = [
      firstname,
      lastname,
      petname,
      phone,
      address,
      parseInt(userid),
    ];

    const response = await connection.query(query, values);
    _logger.info('Contact updated: ', {response});
    if (response.rowCount > 0) {
      _logger.info('Contact updated: ', {contactUpdated: response.rowCount});
      return res.status(200).send({contactUpdated: true}).end();
    } else {
      return res.status(200).send({contactUpdated: false}).end();
    }
  } catch (error) {
    console.error(error);
    _logger.error('Error saving contact: ', {error});

    return res.status(500).send(error).end();
  }
});

router.post('/sendEmail', async (req, res) => {
  const {from, recipient, subject, message} = req.body;

  try {
    _logger.info('Sending email: ', {from, recipient, subject, message});
    const messageId = await sendEmailWithAttachment(from, recipient, subject, message);
    _logger.info('Email sent with message id: ', {messageId});
    if (messageId) {
      res.status(200).send('Email Sent!').end();
    } else {
      res.status(500).send('Error').end();
    }
  } catch (error) {
    _logger.error('Error sending email: ', {error});
    res.status(500).json({message: 'Failed to send email.'});
  }
});

module.exports = router;
