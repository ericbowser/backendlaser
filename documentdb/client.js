const {Client, Pool} = require('pg');
const {DB_PORT, DB_SERVER} = require("../env.json");
const getLogger = require("../logs/backendLaserLog.js");
let _logger = getLogger();

let client = null;

async function connectLocalPostgres() {
	try {
		if (!client) {
			_logger.info('Connecting to local postgres..');
			client = new Client({
				user: process.env.DB_USER,
				password: process.env.DB_PASSWORD,
				port: DB_PORT,
				host: DB_SERVER,
				ssl: false
			});
			await client.connect();
		}

		return client;
	} catch (error) {
		_logger.error('Error connecting to local postgres: ', {error});
		throw error;
	}
}

async function connectLocalDockerPostgres() {
	try {
		if (!client) {
			const pool = new Pool({
				user: DB_USER,
				host: DB_SERVER,
				password: process.env.DB_PASSWORD,
				database: 'postgres',
				port: DB_PORT
			});

			client = new Client({
				user: DB_USER,
				host: DB_SERVER,
				password: process.env.DB_PASSWORD,
				database: 'postgres',
				port: DB_PORT,
				ssl: false
			});

			await client.connect();
			client.pool = pool;
			_logger.info('Connected to local docker postgres with pool');
		}

		return client;
	} catch (error) {
		_logger.error('Error connecting to local docker postgres: ', {error});
		throw error;
	}
}

module.exports = {connectLocalPostgres, connectLocalDockerPostgres};