const Path = require('path');
const dotenv = require("dotenv");
const config = dotenv.config({path: Path.resolve(__dirname, '.env')});
const server = require('./server');
const http = require("node:http");
const cors = require('cors');
const logger = require('./logs/backendLaserLog');
const _logger = logger();
_logger.info('Starting LaserTags API');

const swaggerJsdoc = require('swagger-jsdoc');
const express = require("express");
const {serve, setup} = require("swagger-ui-express");

const httpPort = process.env.PORT || 3003;
console.log('passed port to use for http', httpPort);

const app = express();
app.use(server);
app.use(express.json());
app.use(express.urlencoded({extended: true}));

const swaggerOptions = {
    definition: {
        schemes: ['http'],
        openapi: "3.0.0",
        info: {
            title: 'LaserTags API',
            version: '0.0.1',
            description: 'API for LaserTags',
        },
        contact:{
            name: 'API Support',
            url: '',
            email: 'erbows@collar-culture.com'
        },
        servers: [
            {
                url: `http://localhost:${httpPort}`,
                definition: 'Local API'
            }
        ]
    },
    apis: ['./docs/LaserTagsApi.yaml']
}

const httpServer = http.createServer(app);
const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', serve, setup(swaggerDocs))

httpServer.listen(httpPort, () => {
    console.log(`Server listening on http://localhost:${httpPort}`);
});

