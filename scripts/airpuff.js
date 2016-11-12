#!/usr/bin/env node

var os = require("os");
var _ = require("underscore");
var pp = require("path")
var t = require("../lib/client");           // bank of apparatus manipulation functions
var logger = require("../lib/log");
var util = require("../lib/util");

var name = "airpuff";
var version = require('../package.json').version;

var argv = require("yargs")
    .usage("Run an air-puff style gng task.\nUsage: $0 [options] subject_id user@host.com stims.json")
.describe("escape-window", "escape window before puff duration (in ms)")
    .describe("puff-duration", "default puff duration for incorrect responses (in ms)")
    .describe("lightsout-duration", "default lights out duration for incorrect responses (in ms)")
    .describe("max-corrections", "maximum number of correction trials (0 = no corrections)")
    .describe("replace", "randomize trials with replacement")
    .describe("correct-timeout", "correction trials for incorrect failure to respond ")
    .describe("perch-delay", "time (in ms) to wait between perch and stimulus")
    .default({"escape-window": 2000, "puff-duration": 500,
              "lightsout-duration": 5000, "max-corrections": 0,
              "perch-delay": 1000,
              replace: false, "correct-timeout": false})
    .demand(3)
    .argv;

/* Parameters */
var par = {
    subject: util.check_subject(argv._[0]), // sets the subject number
    user: util.check_email(argv._[1]),
    active: true,
    escape_window: argv["escape-window"],
    puff_duration: argv["puff-duration"],
    punish_duration: argv["lightsout-duration"],
    max_corrections: argv["max-corrections"],
    rand_replace: argv["replace"],
    correct_timeout: argv["correct-timeout"],
    perch_delay: argv["perch-delay"],
    init_key: "peck_center",
    hoppers: ["feeder_left"],
    min_iti: 45000
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
var perch_occupied = false;
var update_state = t.state_changer(name, state);

// a class for parsing stimset file and providing random picks
function StimSet(path) {
    this.config = util.load_json(path);
    this.root = this.config.stimulus_root;
    this.experiment = this.config.experiment || pp.basename(path, ".json");

    function check_probs(resp, key) {
        var tot = (resp.p_punish || 0) + (resp.p_reward || 0);
        //console.log(key + ": p(tot)=" + tot)
        if (tot > 1.0)
            throw "stimset response consequence probabilities must sum to <= 1.0";
    }

    // validate the probabilities in the stimset
    _.each(this.config.stimuli, function(stim) {
        _.each(stim.responses, check_probs)
    });

    var index;
    this.generate = function() {
        this.stimuli = _.chain(this.config.stimuli)
            .map(function(stim) { return _.times(stim.frequency, _.constant(stim))})
            .flatten()
            .shuffle()
            .value();
        index = 0;
    }

    this.next = function(replace) {
        var n = _.keys(this.stimuli).length;
        if (replace) {
            return this.stimuli[Math.floor(Math.random() * n)];
        }
        else if (index >= n){
            this.stimuli = _.shuffle(this.stimuli);
            index = 0;
        }
        return this.stimuli[index++]
    }

    this.generate();

}

// Parse stimset
var stimset = new StimSet(argv._[2]);
// update parameters with stimset values
_.extend(par, stimset.config.parameters);

t.connect(name, function(socket) {

    sock = socket;

    // these REQ messages require a response!
    sock.on("get-state", function(data, rep) {
        logger.debug("req to airpuff: get-state");
        if (rep) rep("ok", state);
    });
    sock.on("get-params", function(data, rep) {
        logger.debug("req to airpuff: get-params");
        if (rep) rep("ok", par);
    });
    sock.on("get-meta", function(data, rep) {
        logger.debug("req to airpuff: get-meta");
        if (rep) rep("ok", meta);
    });
    sock.on("change-state", function(data, rep) { rep("ok") }); // could throw an error
    sock.on("reset-state", function(data, rep) { rep("ok") });
    sock.on("state-changed", function(data) { logger.debug("pub to airpuff: state-changed", data)});
    sock.on("state-changed", function(data) {
            if (data.name == "keys" && _.has(data, "peck_center")) {
                perch_occupied = data.peck_center
                    logger.debug("perch occupied is", perch_occupied)
                    }
        })
        // update user and subject information:
        t.change_state("experiment", par);

    // start state machine for monitoring daytime
    t.ephemera(t.state_changer(name, state));
    t.trial_data(name, {comment: "starting", subject: par.subject,
                experiment: stimset.experiment,
                version: version, params: par, stimset: stimset.config.stimuli});
    // hourly heartbeat messages for the activity monitor
    t.heartbeat(name, {subject: par.subject});
    // initial state;
    await_init();
})


function shutdown() {
    t.trial_data(name, {comment: "stopping",
                        subject: par.subject,
                        experiment: stimset.experiment})
    t.disconnect(process.exit);
}

// disconnect will reset apparatus to base state
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function await_init() { //perched) {
    update_state({phase: "awaiting-trial-init"});
    //if (!perch_occupied) {
        logger.debug("not occupied, awaiting occupation");
        t.await("keys", null, function(msg) {
                logger.debug("in await waiting occupate");
                return msg && msg[par.init_key]}, await_occupy);
    // }
    // else {
    //  logger.debug("occupied, starting trial...");
    // await_occupy();
    // }
}

function await_occupy() {
    var waited_long_enough = false;
    update_state({trial: state.trial, phase: "awaiting-occupancy"});
    t.await("keys", par.perch_delay, _test, _exit);

    function _test(msg) {
        if (msg && !msg[par.init_key]) //if there's a message and center_peck is false
            waited_long_enough = false; //the bird left
        else if (msg == null) {//if there's no message, it timed out
            waited_long_enough = true; //good, bird is still there
            logger.debug("waited_long_enough is", waited_long_enough);
        }
        else
            logger.debug("logic error on message:", msg);
        return true;
    }


    function _exit() {
        if (waited_long_enough) {//if waited_long_enough is true, then go to present stim
            update_state({trial: state.trial + 1,});
            present_stim();
        }
        else
            await_init();
    }
}


function intertrial(duration) {
    logger.debug("ITI: %d ms", duration);
    update_state({phase: "intertrial"});
    next_state = (state.daytime) ? await_init : sleeping;
    _.delay(next_state, duration);
}

function present_stim() {
    var stim = (state.correction) ? state.stimulus : stimset.next(par.rand_replace);

    logger.debug("next stim:", stim)
    update_state({phase: "presenting-stimulus", stimulus: stim })
    t.set_cues(stim.cue_stim, 1);
    t.play_stims(stim.name, par.inter_stimulus_interval, stimset.root, await_response);
}

function await_response() {
    var decision = "timeout"
    var stim = state.stimulus;
    update_state({phase: "awaiting-response", "last-trial": util.now()});

    if (!perch_occupied) {
        logger.debug("bird left during stimulus");
        decision = "escaped";
        _exit();
    }
    else {
        logger.debug("bird still on perch after stimulus");
        t.await("keys", par.escape_window, _test, _exit);
    }

    function _test(msg) {
        if (msg && !msg[par.init_key]) { //center peck becomes false
            decision = "escaped";
        }
        //else timeout occurred
        return true;
    }

    function _exit(time) {
        var conseq = "none";
        var resp = stim.responses[decision];
        logger.debug("response:", decision, resp);
        // need to calculate reaction time relative to start of stimulus - TODO
        //var rtime = (decision == "timeout") ? null : time - resp_start;
        var rand = Math.random();
        var p_punish = 0 + (resp.p_punish || 0);
        if (rand < p_punish)
            conseq = "punish";
        logger.debug("(p_punish, x, result):", p_punish, rand, conseq);
        t.trial_data(name, {subject: par.subject,
                            experiment: stimset.experiment,
                            trial: state.trial,
                            correction: state.correction,
                            stimulus: stim.name,
                            category: stim.category,
                            response: decision,
                            correct: resp.correct,
                            result: conseq
                    //rtime: rtime
                    });
        if (resp.correct ||
            (decision == "timeout" && !par.correct_timeout) ||
            (state.correction >= par.max_corrections))
            update_state({correction: 0});
        else
            update_state({correction: state.correction + 1});

        if (conseq == "punish" && decision == "escaped")
            //lightsout();
                intertrial(par.min_iti);
        else if (conseq == "punish" && decision == "timeout")
            puff();
        else {
            logger.debug("no consequences happened", conseq);
            intertrial(par.min_iti);
        }
    }
}

function puff() {
    update_state({phase: "puffing"});///, "last-puff": util.now()})
    _.delay(t.change_state, par.feed_delay,
            "feeder_left", { feeding: true, interval: par.puff_duration});
    t.await("feeder_left", null, function(msg) { return msg.feeding == false },
            _.partial(intertrial, par.min_iti));
}

function lightsout() {
    var obj = "house_lights";
    update_state({phase: "lights-out"});
    t.change_state(obj, {clock_on: false, brightness: 0});
    _.delay(_exit, par.punish_duration);
    function _exit() {
        t.change_state(obj, {clock_on: true});
        intertrial(par.min_iti);
    }
}

function sleeping() {
    update_state({phase: "sleeping"});//, "last-feed": util.now()});
    //    var perched = t.req(get_state,par.init_key
    t.await("house_lights", null, function(msg) { return msg.daytime }, await_init);
}
