#!/usr/bin/env node
// designed to stress test decide-host by sending lots of messages

var _ = require("underscore");
var os = require("os");
var digest = require("bson-objectid");
var logger = require("../lib/log");
var host_zmq = require("../lib/host");
var version = require('../package.json').version;
var util = require("../lib/util");
var host_params = util.load_config("host-config.json");

var argv = require("yargs")
    .usage("Stress test connection to decide-host")
    .describe("rate", "average message delay (in ms)")
    .describe("no-notify", "if set, don't an email when the bird completes block 4")
    .describe("trials", "set the number of trials per block in blocks 2-3")
    .describe("feed-delay", "time (in ms) to wait between response and feeding")
    .default({rate: 500})
    .argv;

var addr = os.hostname() + digest().str;
var dropped = 0;

logger.info("this is decide stress tester, version", version);
logger.info("address: %s", addr)

var host_addr = "tcp://" + host_params.addr + ":" + host_params.port;
var conn;

function connect() {
    conn = host_zmq(addr);
    conn.on("connect", function() {
        logger.info("connected to decide-host at %s", host_addr);
    })

    conn.on("error", function(err) {
        logger.error("error registering with host: %s", err);
        process.exit(-1);
    })

    conn.on("disconnect", function() {
        logger.warn("lost connection to decide-host at %s", host_addr)
    })

    conn.on("dropped", function() {
        dropped += 1;
        logger.warn("dropped messages: %d", dropped);
    })

    conn.on("closed", function() {
        logger.info("closed connection to decide-host");
    })

    logger.info("connecting to %s", host_addr);
    conn.connect(host_addr);
}


// sends messages at random intervals. Occasionally disconnects and reconnects
function send_message() {
    var p = Math.random();
    if (p < 0.6) {
        var msg = {addr: addr,
                   name: "stressor",
                   time: Date.now(),
                   species: "pony",
                   color: "pink",
                   weight: 12.13912375123,
                   cute: false};
        conn.send("state-changed", msg);
    }
    else if (p < 0.99) {
        var msg = {addr: addr,
                   name: "stressmaker",
                   program: "stressmaker",
                   experiment: "stress-test",
                   time: Date.now(),
                   subject: "bef9a524-10cf-4cb2-8f6d-d1eeed3d3725",
                   trial: 0,
                   correction: 0,
                   stimulus: ['A', 'B'],
                   category: 'S+',
                   response: 'peck_left',
                   correct: true,
                   result: 'none',
                   rtime: null};
        conn.send("trial-data", msg);
    }
    else {
        // disconnect and reconnect
    }
    var wait = Math.random() * argv.rate / 2;
    _.delay(send_message, wait);
}

function shutdown() {
    conn.close();
    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

connect();
send_message();
