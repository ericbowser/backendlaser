const {Pool} = require("pg");
const {v4: uuidv4} = require("uuid");
const {connectLocalPostgres} = require("../documentdb/client");
const logger = require("../assistLog");

let _logger = logger();
let connection = null;

async function saveSession(userid) {
  const sessionStart = new Date().toLocaleString(); // or any specific timestamp
  const sessionDuration = '01:00:00'; // Example duration of 1 hour
  const uniqueIdentifier = uuidv4();
  try {
    const sessionSql =
      `INSERT INTO "public".session(sessionid, sessionstart, userid, sessionduration, sessionstate)
       VALUES ('${uniqueIdentifier}', '${sessionStart}', ${userid}, '${sessionDuration}', 'active') RETURNING *;`;
    /*
        ON CONFLICT (sessionid)
      DO
   UPDATE SET
       sessionstart = '${sessionStart}',
       sessionduration = '${sessionDuration}',
       sessionstate = 'active'
       userid = ${userid}
       RETURNING *;;*/
    _logger.info('Session SQL: ', {sql: sessionSql});

    const session = await connection.query(sessionSql);
    return session;
  } catch (e) {
    _logger.error('Error saving session: ', {error: e});
    return null;
  }
}

async function queryUser(email, password) {
  try {
    const query =
      `SELECT *
       FROM public."user"
       WHERE email = '${email}'
         AND password = '${password}'`;

    const user = await connection.query(query);
    return user ?? null;
  } catch (error) {
    _logger.error('Error querying user: ', {error: error});
    return null;
  }
}

async function insertUser(email, password) {
  try {
    const insertUser =
      `INSERT INTO "public"."user"(email, password, updateondate)
       VALUES ('${email}', '${password}', NOW()) RETURNING *;`;

    const newUser = await connection.query(insertUser);
    return newUser;

  } catch (error) {
    _logger.error('Error inserting user: ', {error: error});
    return null;
  }
}

async function createSession(session = -{}) {
  _logger.info('Session:  ', session);
  const {email, password} = session;

  try {
    if (connection === null) {
      connection = await connectLocalPostgres();
    }

    const user = await queryUser(email, password);

    if (user.rows.length > 0) {
      _logger.info("User found: ", {user});

      const userid = user.rows[0].userid;

      const session = await saveSession(userid);
      _logger.info('Session saved: ', {session: session.rows[0]});

      const data = {
        userid: userid,
        user: user.rows[0],
        exists: true,
        error: null,
        session: session.rows[0]
      };

      return data;
    } else {
      _logger.info("User not found, inserting new user: ", {user});

      const newUser = await insertUser(email, password);
      const newSession = await saveSession(newUser);

      _logger.info('Session saved: ', {session: newSession.rows[0]});

      const data = {
        userid: newUser.userid,
        user: newUser.rows[0],
        exists: false,
        error: null,
        session: newSession.rows[0]
      };

      return data;
    }
  } catch (error) {
    const data = {
      error: error,
      status: 500,
    }
    return data;
  }
}

module.exports = {createSession};
