const {Client, Pool} = require('pg');
const { DB_PORT, DB_SERVER, DB_USER, DB_PASSWORD } = require("dotenv").config().parsed;
const getLogger = require("../logs/backendLaserLog.js");
let _logger = getLogger();

let client = null;

async function connectLocalPostgres() {
	try {
		if (!client) {
			_logger.info('Connecting to local postgres..', {
				host: config.DB_SERVER,
				port: config.DB_PORT,
				user: config.DB_USER
			});
			client = new Client({
				user: config.DB_USER,
				password: process.env.DB_PASSWORD || config.DB_PASSWORD,
				port: parseInt(config.DB_PORT),
				host: config.DB_SERVER,
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