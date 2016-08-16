#!/usr/bin/env node

var os = require("os");
var _ = require("underscore");
var pp = require("path")
var t = require("../lib/client");           // bank of apparatus manipulation functions
var logger = require("../lib/log");
var util = require("../lib/util");

var name = "preference";
var version = require('../package.json').version;

var argv = require("yargs")
    .usage("Run a preference experiment.\nUsage: $0 [options] subject_id user@host.com stims.json")
    .describe("response-window", "response window duration (in ms)")
    .describe("feed-duration", "default feeding duration(in ms)")
    .describe("replace", "randomize trials with replacement")
    .describe("feed-delay", "time (in ms) to wait between choice and feeding")
    .default({"response-window": 2000, "feed-duration": 4000, replace: false, "feed-delay": 0})
    .demand(3) //demands 3 args: subject_id, user@host, and stims.json
    .argv;

//parameters
var par = {
    subject: argv._[0],
    user: argv._[1],
    active: true,
    response_window: argv["response-window"],
    feed_duration: argv["feed-duration"],
    rand_replace: argv["replace"],
    feed_delay: argv["feed-delay"],
    init_key: "peck_center",
    hoppers: ["feeder_left", "feeder_right"],
    min_iti: 100
};

var state = {
    trial: 0,
    phase: null,
    stimulus: null,
    "last-feed": null,
    "last-trial": null,
};

var meta = {
    type: "experiment",
    variables: {
        trial: "integer",
        phase: "string",
    }
};

var sock;
var update_state = t.state_changer(name, state);

// a class for parsing stimset file and providing random picks. The format of
// the stimset file is specialized for preference tasks; there are lists of
// stimuli nested under "choices"
function StimSetPref(path) {
    var config = this.config = util.load_json(path);
    this.root = config.stimulus_root;
    this.experiment = config.experiment || pp.basename(path, ".json");
    this.resp_cues = config.resp_cues;

    function stimlist(val) {
        // creates frequency copies of each stimulus.
        return _.chain(val.stimuli)
            .map(function(stim) {
                var x = _.extend(stim, {category: val.category})
                return _.times(stim.frequency, _.constant(x))})
            .flatten()
            .shuffle()
            .value();
    }

    this.generate = function() {
        this.stimuli = _.mapObject(config.choices, stimlist);
        this.index = _.mapObject(config.choices, function(x) { return 0 });
    }

    this.next = function(replace, pecked) {
        var n = _.keys(this.stimuli[pecked]).length;
        if (replace) {
            return this.stimuli[pecked][Math.floor(Math.random() * n)];
        }
        else if (this.index[pecked] >= n){
            this.stimuli[pecked] = _.shuffle(this.stimuli[pecked]);
            this.index[pecked] = 0;
        }
        return this.stimuli[pecked][this.index[pecked]++]
    }

    this.generate();
}


// Parse stimset
var stimset = new StimSetPref(argv._[2]);
// update parameters with stimset values
_.extend(par, stimset.config.parameters);

t.connect(name, function(socket) {

    sock = socket;

    // these REQ messages require a response!
    sock.on("get-state", function(data, rep) {
        logger.debug("req to preference: get-state");
        if (rep) rep("ok", state);
    });
    sock.on("get-params", function(data, rep) {
        logger.debug("req to preference: get-params");
        if (rep) rep("ok", par);
    });
    sock.on("get-meta", function(data, rep) {
        logger.debug("req to preference: get-meta");
        if (rep) rep("ok", meta);
    });
    sock.on("change-state", function(data, rep) { rep("ok") });
    sock.on("reset-state", function(data, rep) { rep("ok") });
    sock.on("state-changed", function(data) { logger.debug("pub to preference: state-changed", data)})

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
    // disconnect will reset apparatus to base state
    t.disconnect(process.exit);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function await_init() {
    update_state({trial: state.trial + 1,
                  phase: "awaiting-trial-init"});
    t.await("keys", null, function(msg) { return msg && msg[par.init_key]}, await_choice);
}

function intertrial(duration) {
    logger.debug("ITI: %d ms", duration) //this line does not exist in shape
    update_state({phase: "intertrial"})
    _.delay(await_init, duration); //is _.delay(next_state, duration); in shape
}

function await_choice() {
    var pecked = "timeout";
    update_state({phase: "awaiting-choice", "last-trial": util.now()});
    var resp_start = util.now();

    // turn on all response cues
    t.set_cues(stimset.resp_cues, 1); //change this turn on all possible responses
    t.await("keys", par.response_window, _test, _exit);

    function _test(msg) { //see which key was pecked
        if (!msg)
            return true;
        // test against each defined response - only set pecked if true, because
        // we'll get a false event on the key off
        return _.find(stimset.config.choices, function(val, key) {
            if (msg[key] == true) {
                pecked = key;
                return true;
            }
        });
    }

    function _exit(time) {
        logger.debug("response:", pecked);
        //turn cues off
        t.set_cues(stimset.resp_cues, 0);
        if (pecked === "timeout") {
            t.trial_data(name, {  subject: par.subject,
                                  experiment: stimset.experiment,
                                  trial: state.trial,
                                  result: "none",
                                  response: pecked,
                                  })
            intertrial(par.min_iti);
        }
        else {
            var stim = stimset.next(par.rand_replace, pecked);
            logger.debug("next stim:", stim)
            var rtime = time - resp_start;
            t.trial_data(name, {  subject: par.subject,
                                  experiment: stimset.experiment,
                                  trial: state.trial,
                                  result: "feed",
                                  stimulus: stim.name,
                                  category: stim.category,
                                  response: pecked,
                                  rtime: rtime,
                                  });
            present_stim(stim);
        }
    }
}


function present_stim(stim) {
    update_state({ phase: "presenting-stimulus", stimulus: stim });
    t.play_stims(stim.name, par.inter_stimulus_interval, stimset.root, feed);
}

function feed() {
    var hopper = util.random_item(par.hoppers);
    update_state({phase: "feeding", "last-feed": util.now()});
    _.delay(t.change_state, par.feed_delay,
            hopper, { feeding: true, interval: par.feed_duration})
    t.await(hopper, null, function(msg) { return msg.feeding == false },
            _.partial(intertrial, par.min_iti));
}

function sleeping() {
    update_state({phase: "sleeping", "last-feed": util.now()});
    t.await("house_lights", null, function(msg) { return msg.daytime }, await_init);
}
