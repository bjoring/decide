#!/usr/bin/env node
/*
  gng.js
  This script starts a "go-nogo" experiment. Subject learns
  to associate various stimuli a peck or no peck Requires
  a running bbb-server.js.

  To run the script:
  node gng.js

  Procedure:
  1. Wait for center key peck,
  2. Play random stimulus,
  3. Wait for center key peck.
  4. Reward/punish accordingly:
  only GO responses are consequated:
  correct hits are rewarded with food access;
  false positives are punished with gng out.
  5. If response was correct, a new stimulus is presented.

  Session ends when the gng go out for the day.

  Adapted from CDM's gng.cc used in Chicago lab
*/

var os = require("os");
var _ = require("underscore");
var path = require("path")
var t = require("../lib/client");           // bank of apparatus manipulation functions
var logger = require("../lib/log");
var util = require("../lib/util");

var name = "gng";
var version = "1.0a1";

var argv = require("yargs")
    .usage("Run a GNG or 2AC task.\nUsage: $0 [options] subject_id user@host.com stims.json")
.describe("response-window", "response window duration (in ms)")
    .describe("feed-duration", "default feeding duration for correct responses (in ms)")
    .describe("lightsout-duration", "default lights out duration for incorrect responses (in ms)")
    .describe("max-corrections", "maximum number of correction trials")
    .describe("replace", "randomize trials with replacement")
    .default({"response-window": 2000, "feed-duration": 4000,
              "timeout-duration": 10000, "max-corrections": 10,
              replace: false})
    .demand(3)
    .argv;

/* TRIAL DATA */
// This dictionary contains all values that will be logged as data at the end of each trial
var trial_data = {
    program: "gng",
    box: require('os').hostname(),  // box id
    subject: 0,                                             // subject id
    trial: 0,                                               // trial numner
    begin: 0,                                               // when the trial began
    end: 0,                                                 // when the trial ended
    stim: "/path/to/stim.wav",              // stimulus played during trial
    correct_response: "none",               // the correct response for trial
    response: "none",                               // subject's actual response
    correct: false,                                 // whether subject responded correctly
    err: 0,                                                 // [0,1,2]: type of error (Type I = false positive, Type II false negative)
    rewarded: false,                                // whether subject was rewarded for response
    punished: false,                                // whether subject was punished for response
    correction: 0,                              // whether the trial is a correction trial
    correction_count: 0,                    // number of subsequent correction trials
};

/* Parameters */
var par = {
    subject: argv._[0],         // sets the subject number
    user: argv._[1],
    response_window: argv["response-window"],
    feed_duration: argv["feed-duration"],
    punish_duration: argv["lightsout-duration"],
    max_corrections: argv["max-corrections"],
    rand_replace: argv["replace"],
    init_key: "peck_center",
    hoppers: ["feeder_left", "feeder_right"],
};

var state = {
    trial: 0,
    phase: null,
    correction: 0,
    stimulus: null,

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

    t.trial_data(name, {comment: true, subject: par.subject,
                        version: t.version, params: par, stimset: stimset.stimset});
    // start state machine for monitoring daytime
    t.ephemera(t.state_changer(name, state));
    // initial state;
    await_init();
})

function shutdown() {
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

function present_stim() {
    var stim = (state.correction) ? state.stimulus : stimset.next(par.rand_replace);

    logger.debug("next stim:", stim)
    update_state({phase: "presenting-stimulus", stimulus: stim })
    t.req("change-state", {addr: "aplayer", data: {playing: true,
                                                   stimulus: stim.name + ".wav",
                                                   root: stimset.root}});
    t.await("aplayer", null, function(msg) { return msg && !msg.data.playing }, await_response)

}

function await_response() {
    var pecked = "timeout";
    var stim = state.stimulus;
    update_state({phase: "awaiting-response"});

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

    function _exit() {
        var conseq = "none";
        var resp = stim.responses[pecked];
        logger.debug("response:", pecked, resp);
        if (pecked) {
            var rand = Math.random();
            var p_feed = 0 + (resp.p_reward || 0);
            var p_punish = p_feed + (resp.p_punish || 0);
            if (rand < p_feed)
                conseq = "feed";
            else if (rand < p_punish)
                conseq = "punish";
            logger.debug("(p_feed, p_punish, x, result):", p_feed, p_punish, rand, conseq);
        }
        t.trial_data(name, {subject: par.subject,
                            trial: state.trial,
                            correction: state.correction,
                            stimulus: stim.name,
                            category: stim.category,
                            response: pecked,
                            correct: resp.correct,
                            result: conseq
                           });
        if (resp.correct || state.correction >= par.max_corrections)
            state.correction = 0;
        else
            state.correction += 1;
        if (conseq == "feed")
            feed()
        await_init();
    }
}

function feed() {
    var hopper = random_hopper();
    update_state({phase: "feeding"})
    t.req("change-state", {addr: hopper, data: { feeding: true, interval: par.feed_duration}});
    t.await(hopper, null, function(msg) { return msg.data.feeding == false }, await_init)
}

function lightsout() {
    var obj = "lights";
    update_state({phase: "lights-out"});
    t.req("change-state", {addr: obj, data: {clock_on: false, brightness: 0}});
    t.await(null, par.lightsout_duration, null, function() {
        t.req("change-state", {addr: obj, data: {clock_on: true}});
        await_init();
    });
}

function sleeping() {
    update_state({phase: "sleeping"});
    t.await("house_lights", null, function(msg) { return msg.data.daytime }, await_init);
}

function random_hopper() {
    var i = Math.floor(Math.random() * par.hoppers.length);
    return par.hoppers[i];
}


function trial(next_trial) {

    prep_trial();

    function prep_trial(force_stim) {
        trial_data.trial++;
        t.state_update("phase", "inter-trial");
        t.log_info("waiting to begin trial " + trial_data.trial);
        trial_data.stim = force_stim ? force_stim : select_stimulus();
        console.log("waiting for peck");
        t.keys(par.target_key).wait_for(false, play_stimulus);
    }



    function play_stimulus() {
        t.log_info("beginning trial " + trial_data.trial);
        trial_data.begin = Date.now();
        t.state_update("phase", "presenting-stimulus");
        console.log("playing stimulus:", trial_data.stim.sound);
        t.aplayer(trial_data.stim.sound).play(response_check);
    }

    function response_check() {
        trial_data.correct_response = trial_data.stim.type == 1 ? par.target_key : "none";
        console.log("checking response");
        t.state_update("phase", "evaluating-response");
        t.keys(trial_data.correct_response).response_window(par.response_window_duration, response_reaction);
    }

    function response_reaction(result) {
        trial_data.rewarded = trial_data.punished = false;
        trial_data.response = result.response;
        trial_data.correct = result.correct;
        if (trial_data.correct === true) {
            console.log("correct response");
            trial_data.err = 0;
            if (trial_data.response != "none") {
                t.state_update("phase", "rewarding");
                trial_data.rewarded = true;
                t.hopper(par.default_feed).feed(par.feed_duration, end_trial);
            } else {
                end_trial();
            }
        } else {
            console.log("incorrect response");
            if (trial_data.response != "none") {
                trial_data.err = 1;
                trial_data.punished = true;
                t.gng().off(par.punish_duration, run_correction);
                t.state_update("phase", "punishing");
            } else {
                trial_data.err = 2;
                run_correction();
            }
        }
    }

    function run_correction() {
        t.log_info("trial " + trial_data.trial + " finished");
        trial_data.correction = true;
        trial_data.correction_count++;
        if (trial_data.correction_count <= par.correction_limit) {
            t.log_info("running correction " + trial_data.correction_count);
            log_data();
            prep_trial(trial_data.stim);
        } else {
            t.log_info("correcton limit reached (" + trial_data.correction_limit + "), continuing");
            trial_data.correction = false;
            end_trial();
        }
    }

    function end_trial() {
        t.log_info("trial " + trial_data.trial + " finished");
        trial_data.correction = false;
        trial_data.correction_count = 0;
        log_data();
        next_trial();
    }

    function log_data() {
        trial_data.end = Date.now();
        t.log_data(trial_data);
        for (var key in trial_data) {
            if (key != "program" && key != "trial" && key != "stim" && key != "correction" && key != "correction_count" && key != "subject" && key != "box") {
                trial_data[key] = "not-logged";
            }
        }
    }
}
