const express = require('express');
const app = express();
const cors = require('cors');
const router = express.Router();
const getLogger = require('./logs/assistLog');
const {json} = require("body-parser");
const {connectLocalPostgres, connectLocalDockerPostgres} = require('./documentdb/client');

let _logger = getLogger();
_logger.info("Logger Initialized")

router.use(json());
router.use(cors());
router.use(express.json());
router.use(express.urlencoded({extended: true}));

router.post("/login", async (req, res) => {
  const {email, password} = req.body;
  _logger.info('request body for laser tags: ', {credentials: req.body});
  try {
    const connection = await connectLocalPostgres();
    const query =
      `SELECT *
       FROM public."user"
       WHERE username = '${email}'
         AND password = '${password}'`;

    const user = await connection.query(query);
    if (user.rowCount > 0) {
      _logger.info("User found: ", {found: user.rows[0]});
      const data = {
        user: {...user.rows[0]},
        userid: user.rows[0].userid.toString(),
        exists: true
      }
      return res.status(200).send(data).end();
    }

    _logger.info('Saving new login record...');
    const sql =
      `INSERT INTO public."user"(username, password)
       VALUES ('${email}', '${password}') RETURNING userid`;
 b gvvvvvvvvvvvg
    console.log(sql);
    const loggedIn = await connection.query(sql);

    if (loggedIn.rowCount > 0) {
      _logger.info('User saved', {loggedIn});
      const data = {
        user: {...user.rows[0]},
        userid: user.rows[0].userid.toString(),
        exists: true
      }
      return res.status(200).send(data).end();
    }
  } catch (err) {
    console.log(err);
    return res.status(500).send(err.message).end();
  }
});

router.get("/getContact/:userid", async (req, res) => {
  const userid = req.params.userid;
  _logger.info('user id param', {userid});
  try {
    const userId = parseInt(userid);
    const sql = `SELECT *
                 FROM public."contact"
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
      }
      _logger.info('Contact found: ', {contact});
      return res.status(200).send({...contact, exists: true}).end();
    } else {
      return res.status(200).send({userid: userid, exists: false}).end();
    }
  } catch (error) {
    _logger.error('Error getting contact: ', {error});
    return res.status(500).send({error: error}).end();
  }
});

router.post("/saveContact", async (req, res) => {
  const {userid, firstname, lastname, petname, phone, address,} = req.body;
  _logger.info('request body for save contact: ', {request: req.body});

  try {
    const connection = await connectLocalPostgres();
    const query = `
        INSERT INTO public.contact(firstname, lastname, petname, phone, address, userid)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;
    `;

    const values = [
      firstname,
      lastname,
      petname,
      phone,
      address,
      parseInt(userid)
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

router.post("/updateContact", async (req, res) => {
  const {userid, firstname, lastname, petname, phone, address,} = req.body;
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
      parseInt(userid)
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


module.exports = router;
