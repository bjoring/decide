#!/usr/bin/env node

const os = require("os");
const _ = require("underscore");
const pp = require("path")
const fs = require("fs");
const t = require("../lib/client");           // bank of apparatus manipulation functions
const logger = require("../lib/log");
const util = require("../lib/util");

const name = "gng";
const version = require('../package.json').version;

const argv = require("yargs")
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
const par = {
    subject: util.check_subject(argv._[0]), // sets the subject number
    user: argv._[1],
    active: true,
    response_window: argv["response-window"],
    feed_duration: argv["feed-duration"],
    punish_duration: argv["lightsout-duration"],
    max_corrections: argv["max-corrections"],
    rand_replace: argv["replace"],
    correct_timeout: argv["correct-timeout"],
    feed_delay: argv["feed-delay"],
    init_key: "peck_center",
    hoppers: ["feeder_left", "feeder_right"],
    min_iti: 100
};

const state = {
    trial: 0,
    phase: null,
    correction: 0,
    stimulus: null,
    "last-feed": null,
    "last-trial": null,
};

const meta = {
    type: "experiment",
    variables: {
        trial: "integer",
        phase: "string",
        correction: [true, false]
    }
};

let sock;
const update_state = t.state_changer(name, state);

// a class for parsing stimset file and providing random picks
function StimSet(path) {
    this.config = util.load_json(path);
    this.root = this.config.stimulus_root;
    this.experiment = this.config.experiment || pp.basename(path, ".json");

    function check_probs(stim) {
        // return false if consequence probabilities don't add up to 1 or less
        return _.every(stim.responses, function(resp, key) {
            const tot = (resp.p_punish || 0) + (resp.p_reward || 0);
            if (tot > 1.0)
                logger.error("%s: consequence probabilities sum to > 1.0", stim.name);
            return (tot <= 1.0)
        });
    }

    let root = this.root;
    function check_files(stim) {
        var stimnames = (typeof stim.name === "object") ? stim.name : [stim.name];
        return _.every(stimnames, function(name) {
            var loc = pp.join(root, name + ".wav");
            logger.debug("checking for %s", loc);
            if (fs.existsSync(loc))
                return true;
            logger.error("%s does not exist in %s", stim.name, root);
            return false;
        });
    }

    this.is_valid = function() {
        logger.info("validating config file '%s' ", path);
        return (_.every(this.config.stimuli, check_files) &&
                _.every(this.config.stimuli, check_probs))
    }

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
const stimset = new StimSet(argv._[2]);
if (!stimset.is_valid()) {
    process.exit(-1);
}
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

    // update user and subject information:
    t.change_state("experiment", par);

    // start state machine for monitoring daytime
    t.ephemera(t.state_changer(name, state));
    t.trial_data(name, {comment: "starting", subject: par.subject,
                        experiment: stimset.experiment,
                        version: version, params: par, stimset: stimset.config.stimuli});
    // hourly heartbeat messages for the activity monitor
    t.heartbeat(name, {subject: par.subject});

    // update feeder list
    t.get_feeders((err, feeders) => {
        if (!err) {
            logger.info("available feeders: ", feeders)
            par.hoppers = feeders;
        }
    });

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

function await_init() {
    update_state({trial: state.trial + 1,
                  phase: "awaiting-trial-init"});
    t.await("keys", null, function(msg) { return msg && msg[par.init_key]}, present_stim);
}

function intertrial(duration) {
    logger.debug("ITI: %d ms", duration)
    update_state({phase: "intertrial"})
    _.delay(await_init, duration);
}

function present_stim() {
    const stim = (state.correction) ? state.stimulus : stimset.next(par.rand_replace);

    logger.debug("next stim:", stim)
    update_state({phase: "presenting-stimulus", stimulus: stim })
    t.set_cues(stim.cue_stim, 1);
    t.play_stims(stim.name, par.inter_stimulus_interval, stimset.root, await_response);
}

function await_response() {
    let pecked = "timeout";
    const stim = state.stimulus;
    update_state({phase: "awaiting-response", "last-trial": util.now()});

    const resp_start = util.now();
    // turn off all cues not in cue_resp
    t.set_cues(_.difference(stim.cue_stim, stim.cue_resp), 0);
    // turn on all cues not in cue_stim
    t.set_cues(_.difference(stim.cue_resp, stim.cue_stim), 1);
    t.await("keys", par.response_window, _test, _exit);
    function _test(msg) {
        if (!msg) return true;
        // test against each defined response - only set pecked if true, because
        // we'll get a false event on the key off
        return _.find(stim.responses, function(val, key) {
            if (msg[key]) {
                pecked = key;
                return true;
            }
        });
    }

    function _exit(time) {
        let conseq = "none";
        const resp = stim.responses[pecked];
        logger.debug("response:", pecked, resp);
        const rtime = (pecked == "timeout") ? null : time - resp_start;
        const rand = Math.random();
        const p_feed = 0 + (resp.p_reward || 0);
        const p_punish = p_feed + (resp.p_punish || 0);
        if (rand < p_feed)
            conseq = "feed";
        else if (rand < p_punish)
            conseq = "punish";
        logger.debug("(p_feed, p_punish, x, result):", p_feed, p_punish, rand, conseq);
        t.trial_data(name, {subject: par.subject,
                            experiment: stimset.experiment,
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
            t.change_state("cue_" + cue, {brightness: 0})
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
    const hopper = util.random_item(par.hoppers);
    update_state({phase: "feeding", "last-feed": util.now()})
    _.delay(t.change_state, par.feed_delay,
            hopper, { feeding: true, interval: par.feed_duration})
    t.await(hopper, null, function(msg) { return msg.feeding == false },
            _.partial(intertrial, par.min_iti));
}

function lightsout() {
    const obj = "house_lights";
    update_state({phase: "lights-out"});
    t.change_state(obj, {clock_on: false, brightness: 0});
    t.await(null, par.punish_duration, null, function() {
        t.change_state(obj, {clock_on: true});
        await_init();
    });
}

function sleeping() {
    update_state({phase: "sleeping", "last-feed": util.now()});
    t.await("house_lights", null, function(msg) { return msg.daytime }, await_init);
}
