var logger = require("winston");

var level;

if (process.env.NODE_ENV == 'debug')
    level = "debug";
else if (process.env.NODE_ENV == 'production')
    level = "info";
else
    level = "verbose";

logger.setLevels({
    silly: 0,
    debug: 1,
    verbose: 2,
    pub: 2,
    req: 2,
    info: 3,
    warn: 4,
    error: 5
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
logger.add(logger.transports.Console, { level: level, colorize:true });

module.exports = logger;
