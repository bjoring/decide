#!/usr/bin/env node

var os = require("os");
var _ = require("underscore");
var path = require("path")
var t = require("../lib/client");           // bank of apparatus manipulation functions
var logger = require("../lib/log");
var util = require("../lib/util");

var name = "gng";
var version = require('../package.json').version;

var argv = require("yargs")
    .usage("Run a GNG or 2AC task.\nUsage: $0 [options] subject_id user@host.com stims.json")
.describe("response-window", "response window duration (in ms)")
    .describe("feed-duration", "default feeding duration for correct responses (in ms)")
    .describe("lightsout-duration", "default lights out duration for incorrect responses (in ms)")
    .describe("max-corrections", "maximum number of correction trials (0 = no corrections)")
    .describe("replace", "randomize trials with replacement")
    .describe("correct-timeout", "correction trials for incorrect failure to respond ")
    .describe("feed-delay", "time (in ms) to wait between response and feeding")
    .default({"response-window": 2000, "feed-duration": 4000,
              "lightsout-duration": 10000, "max-corrections": 10,
              "feed-delay": 0,
              replace: false, "correct-timeout": false})
    .demand(3)
    .argv;

/* Parameters */
var par = {
    subject: argv._[0],         // sets the subject number
    user: argv._[1],
    response_window: argv["response-window"],
    feed_duration: argv["feed-duration"],
    punish_duration: argv["lightsout-duration"],
    max_corrections: argv["max-corrections"],
    rand_replace: argv["replace"],
    correct_timeout: argv["correct-timeout"],
    feed_delay: argv["feed-delay"],
    init_key: "peck_center",
    hoppers: ["feeder_left", "feeder_right"],
    max_hopper_duty: 1
};

var state = {
    trial: 0,
    phase: null,
    correction: 0,
    stimulus: null,
    "last-feed": null,
    "last-trial": null,
};

var meta = {
    type: "experiment",
    variables: {
        trial: "integer",
        phase: "string",
        correction: [true, false]
    }
};

var sock;
var update_state = t.state_changer(name, state);

// Parse stimset
var stimset = new util.StimSet(argv._[2]);
// update parameters with stimset values
_.extend(par, stimset.config.parameters);

t.connect(name, function(socket) {

    sock = socket;

    // these REQ messages require a response!
    sock.on("get-state", function(data, rep) {
        logger.debug("req to gng: get-state");
        if (rep) rep("ok", state);
    });
    sock.on("get-params", function(data, rep) {
        logger.debug("req to gng: get-params");
        if (rep) rep("ok", par);
    });
    sock.on("get-meta", function(data, rep) {
        logger.debug("req to gng: get-meta");
        if (rep) rep("ok", meta);
    });
    sock.on("change-state", function(data, rep) { rep("ok") }); // could throw an error
    sock.on("reset-state", function(data, rep) { rep("ok") });
    sock.on("state-changed", function(data) { logger.debug("pub to gng: state-changed", data)})

    // query hopper duty cycle - assume both hoppers the same
    t.req("get-params", {addr: "feeder_left"}, function(err, results) {
        par.max_hopper_duty = results.duty;
    })

    // update user and subject information:
    t.req("change-state", {addr: "experiment", data: par});

    // start state machine for monitoring daytime
    t.ephemera(t.state_changer(name, state));
    t.trial_data(name, {comment: "starting", subject: par.subject, program: name,
                        version: version, params: par, stimset: stimset.config.stimuli});
    // initial state;
    await_init();
})

function shutdown() {
    t.trial_data(name, {comment: "stopping", subject: par.subject, program: name})
    t.disconnect(process.exit);
}

// disconnect will reset apparatus to base state
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function await_init() {
    update_state({trial: state.trial + 1,
                  phase: "awaiting-trial-init"});
    t.await("keys", null, function(msg) { return msg && msg.data[par.init_key]}, present_stim);
}

function intertrial(duration) {
    update_state({phase: "intertrial"})
    _.delay(await_init, duration);
}

function present_stim() {
    var stim = (state.correction) ? state.stimulus : stimset.next(par.rand_replace);

    logger.debug("next stim:", stim)
    update_state({phase: "presenting-stimulus", stimulus: stim })
    // TODO cue lights during stimulus presentation
    t.req("change-state", {addr: "aplayer", data: {playing: true,
                                                   stimulus: stim.name + ".wav",
                                                   root: stimset.root}});
    t.await("aplayer", null, function(msg) { return msg && !msg.data.playing }, await_response)
}

function await_response() {
    var pecked = "timeout";
    var stim = state.stimulus;
    update_state({phase: "awaiting-response", "last-trial": Date.now()});

    var resp_start = Date.now();
    _.map(stim.cue_resp || [], function(cue) {
        t.req("change-state", {addr: "cue_" + cue, data: {brightness: 1}})
    });
    t.await("keys", par.response_window, _test, _exit);
    function _test(msg) {
        if (!msg) return true;
        // test against each defined response - only set pecked if true, because
        // we'll get a false event on the key off
        _.find(stim.responses, function(val, key) {
            if (msg.data[key]) {
                pecked = key;
                return true;
            }
        });
        return pecked;
    }

    function _exit(time) {
        var conseq = "none";
        var resp = stim.responses[pecked];
        logger.debug("response:", pecked, resp);
        var rtime = (pecked == "timeout") ? null : time - resp_start;
        var rand = Math.random();
        var p_feed = 0 + (resp.p_reward || 0);
        var p_punish = p_feed + (resp.p_punish || 0);
        if (rand < p_feed)
            conseq = "feed";
        else if (rand < p_punish)
            conseq = "punish";
        logger.debug("(p_feed, p_punish, x, result):", p_feed, p_punish, rand, conseq);
        t.trial_data(name, {program: name,
                            subject: par.subject,
                            trial: state.trial,
                            correction: state.correction,
                            stimulus: stim.name,
                            category: stim.category,
                            response: pecked,
                            correct: resp.correct,
                            result: conseq,
                            rtime: rtime
                           });
        _.map(stim.cue_resp || [], function(cue) {
            t.req("change-state", {addr: "cue_" + cue, data: {brightness: 0}})
        });
        if (resp.correct ||
            (pecked == "timeout" && !par.correct_timeout) ||
            (state.correction >= par.max_corrections))
            update_state({correction: 0});
        else
            update_state({correction: state.correction + 1});
        if (conseq == "feed") {
            feed();
        }
        else if (conseq == "punish")
            lightsout();
        else
            await_init();
    }
}

function feed() {
    var hopper = random_hopper();
    update_state({phase: "feeding", "last-feed": Date.now()})
    _.delay(t.req, par.feed_delay,
            "change-state", {addr: hopper, data: { feeding: true, interval: par.feed_duration}})
    t.await(hopper, null, function(msg) { return msg.data.feeding == false },
            _.partial(intertrial, par.feed_duration * (1/par.max_hopper_duty - 1)));
}

function lightsout() {
    var obj = "house_lights";
    update_state({phase: "lights-out"});
    t.req("change-state", {addr: obj, data: {clock_on: false, brightness: 0}});
    t.await(null, par.punish_duration, null, function() {
        t.req("change-state", {addr: obj, data: {clock_on: true}});
        await_init();
    });
}

function sleeping() {
    update_state({phase: "sleeping", "last-feed": Date.now()});
    t.await("house_lights", null, function(msg) { return msg.data.daytime }, await_init);
}

function random_hopper() {
    var i = Math.floor(Math.random() * par.hoppers.length);
    return par.hoppers[i];
}
