const server = require('./server');
const http = require("node:http");
const cors = require('cors');
const logger = require('./logs/backendLaserLog');
const _logger = logger();
_logger.info('Starting LaserTags API');

const swaggerJsdoc = require('swagger-jsdoc');
const express = require("express");
const swaggerUi = require("swagger-ui-express");
const {PORT} = require('./env.json');

const httpPort = PORT || 32638;
console.log('passed port to use for http', httpPort);

const app = express();
app.use(cors());

// Apply JSON body parser to all routes EXCEPT /stripeWebhook (which needs raw body)
app.use((req, res, next) => {
  if (req.path === '/stripeWebhook' || req.originalUrl === '/stripeWebhook') {
    return next();
  }
  express.json()(req, res, next);
});

// Apply URL encoded parser to all routes EXCEPT /stripeWebhook
app.use((req, res, next) => {
  if (req.path === '/stripeWebhook' || req.originalUrl === '/stripeWebhook') {
    return next();
  }
  express.urlencoded({extended: true})(req, res, next);
});

app.use(server);

// Serve static files from public directory
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

const swaggerOptions = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: 'LaserTags API',
            version: '1.0.0',
            description: 'API for LaserTags - Pet ID tags with QR code laser engraving. Customers can optionally store their contact information for QR code generation.',
        },
        contact: {
            name: 'API Support',
            email: 'erbows@collar-culture.com'
        },
        servers: [
            {
                url: `http://localhost:${httpPort}/api-docs`,
                description: 'Local Development Server'
            }
        ]
    },
    apis: ['./docs/LaserTagsApi.yaml']
}

const httpServer = http.createServer(app);
const swaggerDocs = swaggerJsdoc(swaggerOptions);
const fs = require('fs');

// Read custom CSS for dark mode contrast improvements
let customCss = '';
try {
  const cssPath = path.join(__dirname, 'public', 'swagger-dark-mode.css');
  if (fs.existsSync(cssPath)) {
    customCss = fs.readFileSync(cssPath, 'utf8');
  }
} catch (error) {
  _logger.warn('Could not load custom CSS file', { error: error.message });
}

// Swagger UI setup with custom CSS for better dark mode contrast
const swaggerUiOptions = {
  customCss: customCss + `
    .swagger-ui .topbar { display: none; }
  `,
  customSiteTitle: 'LaserTags API Documentation'
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs, swaggerUiOptions));

httpServer.listen(httpPort, () => {
    console.log(`API documentation available at http://localhost:${httpPort}/api-docs`);
    console.log(`Stripe webhook endpoint: http://localhost:${httpPort}/stripeWebhook`);
    _logger.info(`Server listening on port ${httpPort}`);
});

