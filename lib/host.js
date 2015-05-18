// library for communicating with a host computer. This implementation uses
// an asynchronous zeromq socket.
var os = require("os");
var z = require("zmq");
var winston = require("winston");
var digest = require("MD5");
var _ = require("underscore");
var events = require("events");
var util = require("./util");

// turn these values up for production environment
if (process.env.NODE_ENV == 'debug') {
    var RETRY_INTERVAL = 1000,
        MAX_RETRIES = 5,
        MAX_MESSAGES = 20;
}
else {
    var RETRY_INTERVAL = 5000,
        MAX_RETRIES = 5,
        MAX_MESSAGES = 10000;
}

// the connection uses zeromq, so the socket will accept data even when the
// connection is not established.
function connect() {

    var socket;
    var queue = {};
    var emitter = new events.EventEmitter();
    var name = os.hostname();
    var receiving = false;

    function check_queue() {
        if (!receiving) return;
        winston.silly("checking zmq send queue (n=%d)", _.keys(queue).length);
        _.find(queue, function(val, key) {
            if (val.count > MAX_RETRIES) {
                receiving = false;
                emitter.emit("disconnect");
                return true;    // exit loop
            }
            else if (util.now() - val.time > RETRY_INTERVAL) {
                winston.debug("resending message (hash=%s, n=%d)", key, val.count)
                _.extend(queue[key], {count: val.count + 1, time: util.now()})
                socket.send(["PUB", val.msg_t, val.msg]);
            }
        })
    }

    var timer = setInterval(check_queue, RETRY_INTERVAL);

    socket = z.socket('dealer');
    socket.identity = name + "-ctrl";
    // dealer socket blocks when it hits the high water mark, so let's set this
    // very high. Messages are generally not large.
    // socket.setsockopt(z.ZMQ_SNDHWM, 10000);
    socket.on("message", function(msg, payload) {
        if (msg == "OHAI-OK") {
            receiving = true;
            emitter.emit("connect");
        }
        else if (msg == "WTF") {
            emitter.emit("error", "address " + name + " taken")
            clearInterval(timer);
            socket.close();
        }
        else {
            if (!receiving) {
                receiving = true;
                emitter.emit("connect");
                emitter.emit("reconnect");
            }
            if (msg == "HUGZ") {
                winston.silly("zmq received HUGZ");
                socket.send("HUGZ-OK");
            }
            else if (msg == "ACK") {
                var digest = String(payload);
                winston.silly("ACK: %s", digest);
                delete queue[digest];
            }
        }
    })

    emitter.connect = function(addr) {
        winston.debug("connecting to decide-host at %s", addr)
        socket.connect(addr);
        socket.send(["OHAI", os.hostname()]);
    };

    emitter.send = function(msg_t, data) {
        if (!receiving && _.keys(queue).length > MAX_MESSAGES) {
            winston.debug("dropping message");
            emitter.emit("dropped", msg_t, data);
        }
        else {
            var msg = JSON.stringify(data);
            //var key = data.name + data.time;
            var key = digest(msg)
            queue[key] = {count: 1,
                          time: util.now(),
                          msg_t: msg_t,
                          msg: msg};
            socket.send(["PUB", msg_t, msg]);
        }
    };

    emitter.close = function() {
        socket.send("BYE");
        socket.close();
        receiving = false;
        clearInterval(timer);
        emitter.emit("closed");
    };

    emitter.receiving = function() { return receiving; };

    return emitter;
}

module.exports = connect;
