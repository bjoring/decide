// lights is the simplest protocol. When running, it sets the lights to follow
// the clock.
var os = require("os");
var winston = require("winston");
var t = require("./toolkit");
var util = require("../lib/util");

// Experiments need to manage their own state. They manipulate the state of the
// apparatus and pass messages to connected clients and the host server using the protocol
// defined in docs/spec.md. Implementing the protocol means the program needs to
// respond to certain types of messages requesting information about the state.

var name = "lights";

var par = {};

var state = {
    day: null
};

var meta = {
    type: "experiment",
    variables: {
        day: [true, false]
    }
};

// connect to the controller and register callbacks
t.connect(name, function(sock) {

    // these REQ messages require a response!
    sock.on("get-state", function(data, rep) {
        winston.debug("req to lights: get-state");
        if (rep) rep("ok", state);
    });
    sock.on("get-params", function(data, rep) {
        winston.debug("req to lights: get-params");
        if (rep) rep("ok", par);
    });
    sock.on("get-meta", function(data, rep) {
        winston.debug("req to lights: get-meta");
        if (rep) rep("ok", meta);
    });
    sock.on("change-state", function(data, rep) { rep("ok") }); // could throw an error
    sock.on("reset-state", function(data, rep) { rep("ok") });

    // update day variable using light brightness
    sock.on("state-changed", function(msg) {
        if (msg.addr == "house_lights") {
            var day = (msg.data.brightness > 0);
            if (state.day != day) {
                state.day = day;
                sock.emit("state-changed", {addr: name, data: state});
            }
        }
    });

    sock.emit("change-state", {addr: "house_lights", data: { clock_on: true }});
});

process.on("SIGINT", t.disconnect);
process.on("SIGTERM", t.disconnect);
