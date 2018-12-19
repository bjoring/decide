// library for communicating with a host computer. This implementation uses
// an asynchronous zeromq socket.
const os = require("os");
const z = require("zeromq");
const winston = require("winston");
const digest = require("bson-objectid");
const _ = require("underscore");
const events = require("events");
const util = require("./util");

// turn these values up for production environment
if (process.env.NODE_ENV == 'debug') {
    const RETRY_INTERVAL = 1000,
        MAX_RETRIES = 5,
        MAX_MESSAGES = 20;
}
else {
    const RETRY_INTERVAL = 5000,
        MAX_RETRIES = 20,
        MAX_MESSAGES = 10000;
}

// the connection uses zeromq, so the socket will accept data even when the
// connection is not established.
function connect(name) {

    let socket;
    let queue = {};
    const emitter = new events.EventEmitter();
    name = name || os.hostname();
    let receiving = false;
    let retries = 0;

    function check_queue() {
        if (!receiving) return;
        winston.silly("checking zmq send queue (n=%d)", _.keys(queue).length);
        _.find(queue, function(val, key) {
            if (val && (util.now() - val.time > RETRY_INTERVAL)) {
                winston.debug("resending message (hash=%s, n=%d)", key, retries)
                _.extend(queue[key], {time: util.now()})
                retries += 1;
                socket.send(["PUB", val.msg_t, key, val.msg]);
            }
        })
        // allow time for ACKs before checking whether the messages failed
        _.delay(function() {
            if (retries > MAX_RETRIES) {
                receiving = false;
                emitter.emit("disconnect", "lost connection");
            }
        }, 100)
    }

    let timer = setInterval(check_queue, RETRY_INTERVAL);

    socket = z.socket('dealer');
    socket.identity = name + "-ctrl";
    // socket.setsockopt(z.ZMQ_SNDHWM, 10000);
    socket.on("message", function(msg, payload) {
        if (msg == "OHAI-OK") {
            receiving = true;
            emitter.emit("connect");
        }
        else if (msg == "WTF" || msg == "RTFM") {
            emitter.emit("error", String(payload));
            clearInterval(timer);
            socket.close();
        }
        else if (msg == "KTHXBAI") {
            emitter.emit("disconnect", "server closed connection");
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
                let key = String(payload);
                winston.silly("ACK: %s", key);
                delete queue[key];
                retries = 0;
            }
            else if (msg == "DUP") {
                let key = String(payload);
                if (_.has(queue, key)) {
                    winston.error("server thinks %s is a duplicate", key);
                    delete queue[key];
                }
            }
            else if (msg == "WHO?") {
                winston.info("renegotiating with server");
                socket.send(["OHAI", "decide-host@1", name]);
            }
        }
    })

    emitter.connect = function(addr) {
        winston.debug("connecting to decide-host at %s", addr)
        socket.connect(addr);
        socket.send(["OHAI", "decide-host@1", name,
                     JSON.stringify({"time": Date.now()})]);
    };

    emitter.send = function(msg_t, data) {
        if (!receiving && _.keys(queue).length > MAX_MESSAGES) {
            winston.debug("dropping message");
            emitter.emit("dropped", msg_t, data);
        }
        else {
            let msg = JSON.stringify(data);
            //let key = data.name + data.time;
            //let key = digest(msg)
            let key = digest.generate();
            queue[key] = {time: util.now(),
                          msg_t: msg_t,
                          msg: msg};
            socket.send(["PUB", msg_t, key, msg]);
        }
    };

    emitter.close = function() {
        socket.send("KTHXBAI");
        socket.close();
        receiving = false;
        clearInterval(timer);
        emitter.emit("closed");
    };

    emitter.receiving = function() { return receiving; };

    return emitter;
}

module.exports = connect;
