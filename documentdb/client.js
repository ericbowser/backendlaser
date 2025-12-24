const {Client, Pool} = require('pg');
const {DB_PORT, DB_SERVER, DB_USER, DB_PASSWORD} = require("../env.json");
const getLogger = require("../logs/backendLaserLog.js");
let _logger = getLogger();

let client = null;

async function connectLocalPostgres() {
	try {
		if (!client) {
			_logger.info('Connecting to local postgres..', {
				host: DB_SERVER,
				port: DB_PORT,
				user: DB_USER
			});
			client = new Client({
				user: DB_USER,
				password: DB_PASSWORD,
				port: parseInt(DB_PORT),
				host: DB_SERVER,
				ssl: false
			});
			await client.connect();
			_logger.info('Successfully connected to local postgres');
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
				password: DB_PASSWORD,
				database: 'postgres',
				port: parseInt(DB_PORT)
			});

			client = new Client({
				user: DB_USER,
				host: DB_SERVER,
				password: DB_PASSWORD,
				database: 'postgres',
				port: parseInt(DB_PORT),
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