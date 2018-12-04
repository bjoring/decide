const logger = require("winston");

let level;

if (process.env.NODE_ENV == 'debug')
    level = "debug";
else if (process.env.NODE_ENV == 'production')
    level = "info";
else
    level = "verbose";

logger.setLevels({
    silly: 5,
    debug: 4,
    verbose: 3,
    pub: 3,
    req: 3,
    info: 2,
    warn: 1,
    error: 0
})

logger.addColors({
    debug: "green",
    info:  "cyan",
    verbose: "magenta",
    pub: "blue",
    req: "magenta",
    warn:  "yellow",
    error: "red"
});

logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, { level: level, prettyPrint: true, colorize:true });

module.exports = logger;
