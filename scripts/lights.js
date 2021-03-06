#!/usr/bin/env node
const os = require("os");
const t = require("../lib/client");
const logger = require("../lib/log");
const util = require("../lib/util");

// Experiments need to manage their own state. They manipulate the state of the
// apparatus and pass messages to connected clients and the host server using the protocol
// defined in docs/spec.md. Implementing the protocol means the program needs to
// respond to certain types of messages requesting information about the state.

const name = "lights";
const version = require('../package.json').version;

const argv = require("yargs")
    .usage("Set light level according to sun position.\nUsage: $0 subject_id @slack-id")
    .demand(2)
    .argv;

const par = {
    subject: util.check_subject(argv._[0]), // sets the subject number
    user: argv._[1],
    active: false
};

const state = {};

const meta = {
    type: "experiment",
    variables: {
        day: [true, false]
    }
};

let sock;

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
    t.change_state("experiment", par);
    // start first state
    t.ephemera(t.state_changer(name, state));
    t.trial_data(name, {comment: "starting", subject: par.subject,
                        version: version, params: par});
});

function shutdown() {
    t.trial_data(name, {comment: "stopping", subject: par.subject})
    t.disconnect(process.exit);
}

// disconnect will reset apparatus to base statet
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
