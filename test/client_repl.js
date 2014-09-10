// a useful client for interacting with bbb-server as a client

var repl = require("repl");
var io = require("socket.io-client");
var args = require("yargs")
    .usage("$0 endpoint")
    .demand(1)
    .argv;
var logger = require("../lib/log");
var t = require("../lib/client");

var sock = io.connect(args._[0], {transports: ["websocket"]});

sock.on("state-changed", function(msg) { logger.info("state-changed", msg)});
sock.on("trial-data", function(msg) { logger.info("trial-data", msg)});

sock.once("disconnect", function() { logger.info("disconnected from", args._[0])})
sock.once("connect", function() {
    logger.info("connected to ", args._[0])
    repl.start({
        prompt: "node> ",
        input: process.stdin,
        output: process.stdout
    })
    .on("exit", function() { sock.disconnect();})
    .context.sock = sock;
})
