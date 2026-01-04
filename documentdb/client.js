const {Client, Pool} = require('pg');
const { DB_PORT, DB_SERVER, DB_USER, DB_PASSWORD, DB_DATABASE } = require("dotenv").config().parsed;
const getLogger = require("../logs/backendLaserLog.js");
let _logger = getLogger();

let client = null;

async function connectLocalPostgres() {
	try {
		if (!client) {
			_logger.info('Connecting to local postgres..', {
				host: process.env.DB_SERVER || DB_SERVER,
				port: process.env.DB_PORT || DB_PORT,
				user: process.env.DB_USER || DB_USER
			});
			client = new Client({
				user: process.env.DB_USER || DB_USER,
				password: process.env.DB_PASSWORD || DB_PASSWORD,
				port: parseInt(process.env.DB_PORT || DB_PORT),
				host: process.env.DB_SERVER || DB_SERVER,
				database: process.env.DB_DATABASE || DB_DATABASE,
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
				password: process.env.DB_PASSWORD || DB_PASSWORD,
				database: process.env.DB_DATABASE || 'ericbo',
				port: parseInt(DB_PORT)
			});

			client = new Client({
				user: DB_USER,
				host: DB_SERVER,
				password: process.env.DB_PASSWORD || DB_PASSWORD,
				database: process.env.DB_DATABASE || 'ericbo',
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