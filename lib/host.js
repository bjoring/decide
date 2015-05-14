// library for communicating with a host computer. This implementation uses
// an asynchronous zeromq socket.
var os = require("os");
var z = require("zmq");
// switch to winston
var winston = require("./log");

function connect(addr, callback) {

    var socket = z.socket('dealer');
    socket.identity = os.hostname() + "-ctrl";
    // dealer socket blocks when it hits the high water mark, so let's set this
    // very high. Messages are generally not large.
    socket.setsockopt(z.ZMQ_SNDHWM, 10000);
    winston.debug("connecting to decide-host at %s", addr)
    socket.connect(addr);
    socket.send(["OHAI", os.hostname()]);

    socket.on("message", function(msg) {
        winston.debug("zmq received: " + msg)
        if (msg == "OHAI-OK") {
            winston.info("connected to decide-host at %s", addr);
            callback();
        }
        else if (msg == "WTF") {
            winston.error("error connecting to decide-host at %s: address taken", addr);
            callback("address taken");
            socket.close();
        }
        else if (msg == "HUGZ") {
            socket.send("HUGZ-OK");
        }
    })

    function send(msg_t, data) {
        socket.send(["PUB", msg_t, JSON.stringify(data)]);
    }

    send.close = function() {
        socket.send("BYE");
        socket.close();
    }

    return send;
}

module.exports = connect;
