const log4js = require('log4js');
const jsonLayout = require('log4js-json-layout').layout;

let _logger = null;

function initialize() {
    log4js.addLayout('json', jsonLayout);
    log4js.configure({
        appenders: {
            backendlaser: {
                type: "fileSync",
                filename: "backend_laser.log",
                maxLogSize: 10458760,
                backups: 3,
                layout: {
                    type: 'pattern',
                    pattern: '%d{yyyy-MM-dd hh:mm:ss} [%p] %c - (%f{2}:%l) %m %n',
                }
            },
            out: {
                type: "stdout"
            },
            layout: {
                type: 'json'
            }
        },
        assist_console: {
            type: "out"
        },
        categories: {
            default: {
                appenders: ['backend_laser', 'out'],
                level: 'debug'
            }
        },
    }); 
    _logger = log4js;
}

function logger() {
    if (!_logger) {
        initialize();
        return _logger.getLogger();
    }
    
    return _logger;
}

module.exports = logger;
