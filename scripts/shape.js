#!/usr/bin/env node
var os = require("os");
var _ = require("underscore");
var t = require("../lib/client");           // bank of apparatus manipulation functions
var logger = require("../lib/log");
var util = require("../lib/util");

var name = "shape";
var version = "1.0a1";

var argv = require("yargs")
    .usage("Shape subject for GNG or 2AC task.\nUsage: $0 [options] subject_id user@host.com")
    .describe("F", "skip immediately to final block")
    .describe("color", "set cue color: red, green, blue")
    .describe("notify", "if set, sends an email when the bird completes block 4")
    .describe("trials", "set the number of trials per block in blocks 2-3")
    .default({color: "green", trials: 100})
    .demand(2)
    .argv;

var par = {
    subject: argv._[0],         // sets the subject number
    user: argv._[1],
    block_trials: argv.trials,  // number of trials in blocks 2+
    cue_color: argv.color,
    hoppers: ["feeder_left", "feeder_right"],
    max_hopper_duty: 1,
    blink_period: 300,
};

var state = {
    trial: 0,                   // trial number
    block: 0,                   // shape paradigm block
    phase: null                 // trial phase
}

var meta = {
    type: "experiment",
    variables: {
        trial: "integer",
        block: [1, 2, 3, 4],
        phase: "string"
    }
}

var sock;
var update_state = t.state_changer(name, state);

t.connect(name, function(socket) {

    sock = socket;

    // these REQ messages require a response!
    sock.on("get-state", function(data, rep) {
        logger.debug("req to shape: get-state");
        if (rep) rep("ok", state);
    });
    sock.on("get-params", function(data, rep) {
        logger.debug("req to shape: get-params");
        if (rep) rep("ok", par);
    });
    sock.on("get-meta", function(data, rep) {
        logger.debug("req to shape: get-meta");
        if (rep) rep("ok", meta);
    });
    sock.on("change-state", function(data, rep) { rep("ok") }); // could throw an error
    sock.on("reset-state", function(data, rep) { rep("ok") });
    sock.on("state-changed", function(data) { logger.debug("pub to shape: state-changed", data)})

    // query hopper duty cycle - assume both hoppers the same
    t.req("get-params", {addr: "feeder_left"}, function(err, results) {
        par.max_hopper_duty = results.duty;
    })

    // update user and subject information:
    t.req("change-state", {addr: "experiment", data: par});

    t.trial_data(name, {subject: par.subject, comment: true, version: version, params: par});

    // start state machine for monitoring daytime
    t.ephemera(t.state_changer(name, state));
    if (argv.F)
        block4_peck1();
    else
        block1_await();
});

function shutdown() {
    t.disconnect(process.exit);
}

// disconnect will reset apparatus to base state
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// state definitions

function intertrial(duration, next_state) {
    update_state({phase: "intertrial"});
    _.delay(next_state, duration);
}

function feed(hopper, duration, next_state) {
    update_state({phase: "feeding"})
    t.req("change-state", {addr: hopper, data: { feeding: true, interval: duration}});
    t.await(hopper, null, function(msg) { return msg.data.feeding == false }, next_state)
}

function sleeping(next_state) {
    update_state({phase: "sleeping"});
    t.await("house_lights", null, function(msg) { return msg.data.daytime }, next_state);
}

function block1_await() {

    // all units in ms
    var feed_duration = 5000;
    var blink_duration = 5000;
    var iti_var = 30000;
    var iti_min = feed_duration * (1/par.max_hopper_duty - 1);
    var pecked = false;
    var cue = "cue_center_" + par.cue_color;

    // state setup
    if (state.block < 1) {
        logger.info("entering block 1")
    }
    t.req("change-state", {addr: cue, data: { trigger: "timer", period: par.blink_period}});
    update_state({block: 1, trial: state.trial + 1, phase: "awaiting-response"});

    t.await("keys", blink_duration, _test, _exit);

    function _test(msg) {
        if (!msg) return true;
        else if (msg.data.peck_center)
            return pecked = true;
    }

    function _exit() {
        var next_state;
        var hopper = random_hopper();
        t.req("change-state", {addr: cue, data: { trigger: null, brightness: 0}});
        if (pecked) {
            next_state = block2_await;
        }
        else if (!state.daytime) {
            next_state = _.partial(sleeping, block2_await);
        }
        else {
            var iti = Math.random() * iti_var + iti_min;
            logger.debug("trial iti:", iti);
            next_state = _.partial(intertrial, iti, block1_await);
        }
        t.trial_data(name, {block: state.block, trial: state.trial, subject: par.subject})
        feed(hopper, feed_duration, next_state);
    }
}

function block2_await() {
    var feed_duration = 4000;
    var iti = feed_duration * (1 / par.max_hopper_duty - 1);
    var cue = "cue_center_" + par.cue_color;

    if (state.block < 2) {
        logger.info("entering block 2")
        state.trial = 0;
    }
    t.req("change-state", {addr: cue, data: { trigger: "timer", period: par.blink_period}});
    update_state({ block: 2, trial: state.trial + 1, phase: "awaiting-response"});

    // NB: end of day will not exit state, but this isn't a huge problem as the
    // shape will go out anyway
    t.await("keys", null, function(msg) { return msg.data.peck_center }, _exit);

    function _exit() {
        var hopper = random_hopper();
        t.req("change-state", {addr: cue, data: { trigger: null, brightness: 0}});
        var next = (state.trial < par.block_trials) ? block2_await : block3_peck1;
        next = (state.daytime) ? _.partial(intertrial, iti, next) : _.partial(sleeping, next);
        t.trial_data(name, {block: state.block, trial: state.trial, subject: par.subject});
        feed(hopper, feed_duration, next);
    }
}

function block3_peck1() {
    var side = ["left", "right"][Math.floor(Math.random() * 2)];
    var cue = "cue_center_" + par.cue_color;

    if (state.block < 3) {
        logger.info("entering block 3")
        state.trial = 0;
    }
    t.req("change-state", {addr: cue, data: { trigger: "timer", period: par.blink_period}});
    update_state({ block: 3, trial: state.trial + 1, phase: "awaiting-response-1"});

    t.await("keys", null, function(msg) { return msg.data.peck_center}, function() {
        t.req("change-state", {addr: cue, data: { trigger: null, brightness: 0}});
        block34_peck2(side);
    })
}

function block4_peck1() {
    var side = ["left", "right"][Math.floor(Math.random() * 2)];

    if (state.block < 4) {
        logger.info("entering block 4")
        state.trial = 0;
    }
    update_state({ block: 4, trial: state.trial + 1, phase: "awaiting-response-1"});

    t.await("keys", null, function(msg) { return msg.data.peck_center}, _.partial(block34_peck2, side));
}

function block34_peck2(side) {
    var feed_duration = (state.block == 3) ? 3000 : 2500;
    var iti = feed_duration * (1 / par.max_hopper_duty - 1);
    var cue = "cue_" + side + "_" + par.cue_color;
    var key = "peck_" + side;

    t.req("change-state", {addr: cue, data: { trigger: "timer", period: par.blink_period}});
    update_state({ phase: "awaiting-response-2"});
    t.await("keys", null, function(msg) { return msg.data[key]}, _exit);

    function _exit() {
        var next;
        var hopper = "feeder_" + side;
        t.req("change-state", {addr: cue, data: { trigger: null, brightness: 0}});
        if (state.block == 3 && state.trial < par.block_trials)
            next = block3_peck1;
        else
            next = block4_peck1;

        if (state.block == 4 && state.trial == par.block_trials && !argv.F) {
            logger.info("shape completed!")
            if (argv.notify)
                util.mail(name, par.user, "shape completed for " + par.subject,
                          "Subject " + par.subject + " completed shaping. Trials will continue to run.",
                         _.partial(logger.info, "sent email to", par.user))
        }

        next = (state.daytime) ? _.partial(intertrial, iti, next) : _.partial(sleeping, next);
        t.trial_data(name, {block: state.block, trial: state.trial, subject: par.subject, peck: side});
        feed(hopper, feed_duration, next);
    }
}


function random_hopper() {
    var r = Math.random();
    var i = Math.floor(r * par.hoppers.length);
    logger.debug("random hopper:", r, par.hoppers[i]);
    return par.hoppers[i];
}
