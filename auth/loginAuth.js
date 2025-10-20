const {connectLocalPostgres} = require("../documentdb/client");
const logger = require("../logs/backendLaserLog");

let _logger = logger();
let _connection = null;

async function queryUser(auth0id) {
  try {
    if (!_connection) {
      _connection = await connectLocalPostgres();
    }
    const query =
      `SELECT *
       FROM lasertg."user"
       WHERE auth0id = '${auth0id}'`;

    const user = await _connection.query(query);
    return user ?? null;
  } catch (error) {
    _logger.error('Error querying user: ', {error: error});
    return null;
  }
}

async function insertUser(auth0id, username, pictureurl = null) {
  try {
    if (!_connection) {
      _connection = await connectLocalPostgres();
    }
    
    const insertSql =
      `INSERT INTO lasertg."user"(auth0id, username, pictureurl)
       VALUES ('${auth0id}', '${username}', '${pictureurl}') RETURNING *;`;

    const user = await _connection.query(insertSql);
    if (user.rowCount === 1) {
      _logger.info("Inserted user: ", {username});
      return user;
    } else {
      return null;
    }
  } catch (error) {
    _logger.error('Error inserting user: ', {error: error});
    return null;
  }
}

module.exports = {insertUser, queryUser};
