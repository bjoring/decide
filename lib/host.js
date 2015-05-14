// library for communicating with a host computer. This implementation uses
// an asynchronous zeromq socket.
var os = require("os");
var z = require("zmq");
// switch to winston
var winston = require("./log");

function connect(addr, callback) {

    // heartbeating variables
    var HB_LIVENESS = 5,
        HB_INTERVAL = 1000, // ms
        INTERVAL_INIT = 1000,
        INTERVAL_MAX = 32000;
    var liveness = 0;
    var last_message_t;

    var socket = z.socket('dealer');
    socket.identity = os.hostname() + "-controller";
    // dealer socket blocks when it hits the high water mark, so let's set this
    // very high. Messages are generally not large.
    socket.setsockopt(z.ZMQ_SNDHWM, 10000);
    socket.connect(addr);
    socket.send(["OHAI", os.hostname()]);

    socket.on("message", function(msg) {
        winston.debug("zmq received: " + msg)
        liveness = HB_LIVENESS;
        last_message_t = Date.now();
        if (msg == "OHAI-OK") {
            winston.info("connected to decide-host at %s", addr);
            callback();
        }
        else if (msg == "WTF") {
            winston.error("error connecting to decide-host at %s: address taken", addr);
            callback("address taken");
            socket.disconnect();
        }
        else if (msg == "HUGZ") {
            socket.send("HUGZ-OK");
        }
    })

    // there's no polling in node, so heartbeats are sent by running this
    // function at intervals, which checks to see how long it's been since we
    // heard from the server and sends a heartbeat if it's over HB_INTERVAL.
    function heartbeat() {
        if (liveness <= 0 || Date.now() - last_message_t < HB_INTERVAL)
            return;
        liveness -= 1;
        winston.debug("heartbeat: liveness=%d", liveness)
        if (liveness > 0) {
            socket.send("HUGZ")
        }
        else {
            winston.info("server timed out")
        }
    }
    var timer = setInterval(heartbeat, HB_INTERVAL)

    function send(data) {}

    send.close = function() {
        clearInterval(timer);
        socket.send("BYE");
        socket.close();
    }

    return send;
}

module.exports = connect;
