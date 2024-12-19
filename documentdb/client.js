const {Client, Pool} = require('pg');
const config = require("dotenv").config();
const path = require('path');

// Change .env based on local dev or prod
const env = path.resolve(__dirname, '.env');
const options = {
	path: env
};

let client = null;

const connectionString =
	`postgres://${config.parsed.DB_USER}:${config.parsed.DB_PASSWORD}@${config.parsed.DB_SERVER}:${config.parsed.DB_PORT}/postgres`;

async function connectLocalPostgres() {
	try {
		if (!client) {
			client = new Client({
				connectionString: connectionString,
				ssl: false
			});
			await client.connect();
		}

		return client;
	} catch (e) {
		console.log(e);
	}

	return client;
}
async function connectLocalDockerPostgres() {
	try {
		if (!client) {
			client = new Client({
				connectionString: connectionString,
				ssl: false
			});
		}

		const pool = new Pool({
			user: 'postgres',
			host: '127.0.0.1',
			password: '1006',
			database: 'postgres',
			port: 5432
		});
		client.pool = pool;
		console.log('pool: ', pool);

		return client;
	} catch (e) {
		console.log(e);
	}
}

module.exports = {connectLocalPostgres, connectLocalDockerPostgres};