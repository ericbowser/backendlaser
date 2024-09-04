const {Client} = require('pg');
const config = require("dotenv").config();
const path = require('path');

// Change .env based on local dev or prod
const env = path.resolve(__dirname, '.env');

const connectionString =
	`postgres://${config.parsed.DB_USER}:${config.parsed.DB_PASSWORD}@${config.parsed.DB_SERVER}:${config.parsed.DB_PORT}/postgres`;

async function connectLocalPostgres() {
	let client = null;
	try {
		client = new Client({
			connectionString: connectionString,
			ssl: false
		});

		await client.connect();
		return client;
	} catch (e) {
		console.log(e);
	}

	return client;
}

module.exports = {connectLocalPostgres};