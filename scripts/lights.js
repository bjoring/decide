#!/usr/bin/env node
var os = require("os");
var t = require("../lib/client");
var logger = require("../lib/log");
var util = require("../lib/util");

// Experiments need to manage their own state. They manipulate the state of the
// apparatus and pass messages to connected clients and the host server using the protocol
// defined in docs/spec.md. Implementing the protocol means the program needs to
// respond to certain types of messages requesting information about the state.

var name = "lights";

var argv = require("yargs")
    .usage("Set light level according to sun position.\nUsage: $0 subject_id user@host.com")
    .demand(2)
    .argv;

var par = {
    subject: argv._[0],
    user: argv._[1]
};

var state = {};

var meta = {
    type: "experiment",
    variables: {
        day: [true, false]
    }
};

var sock;

// connect to the controller and register callbacks
t.connect(name, function(socket) {
    sock = socket;

    // these REQ messages require a response!
    sock.on("get-state", function(data, rep) {
        logger.debug("req to lights: get-state");
        if (rep) rep("ok", state);
    });
    sock.on("get-params", function(data, rep) {
        logger.debug("req to lights: get-params");
        if (rep) rep("ok", par);
    });
    sock.on("get-meta", function(data, rep) {
        logger.debug("req to lights: get-meta");
        if (rep) rep("ok", meta);
    });
    sock.on("change-state", function(data, rep) { rep("ok") }); // could throw an error
    sock.on("reset-state", function(data, rep) { rep("ok") });
    sock.on("state-changed", function(data) { logger.debug("pub to lights: state-changed", data)})

    // update user and subject information:
    t.req("change-state", {addr: "experiment", data: par});
    // start first state
    t.ephemera(t.state_changer(name, state));
});


// disconnect will reset apparatus to base statet
process.on("SIGINT", t.disconnect);
process.on("SIGTERM", t.disconnect);