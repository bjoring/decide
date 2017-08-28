var os = require("os");
var util = require("../lib/util");

var argv = require("yargs")
    .usage("Test mail delivery.\nUsage: $0 recipient")
    .demand(1)
    .argv;

util.mail(os.hostname(), argv._[0], "test message from decide", "hello world!", console.log)
