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

let stim_prop;

const argv = require("yargs")
    .usage("Run an auditory restoration GNG task.\nUsage: $0 [options] subject_id user@host.com stims.json")
.describe("response-window", "response window duration (in ms)")
    .describe("feed-duration", "default feeding duration for correct responses (in ms)")
    .describe("replace", "randomize trials with replacement")
    .default({"response-window": 1000, "feed-duration": 500,
              replace: false, "correct-timeout": false})
    .demand(3)
    .argv;

/* Parameters */
const par = {
    subject: util.check_subject(argv._[0]), // sets the subject number
    user: util.check_email(argv._[1]),
    block: 0,
    active: true,
    response_window: argv["response-window"],
    feed_duration: argv["feed-duration"],
    rand_replace: argv["replace"],
    init_key: "peck_left",
    resp_key: "peck_left",
    feeders: ["feeder_motor"],
    min_iti: 100
};

const state = {
	block: 1,
    trial: 0,
    phase: null,
    stimulus: null,
    "last-feed": null,
    "last-trial": null,
};

const meta = {
    type: "experiment",
    variables: {
    	block: "integer",
        trial: "integer",
        phase: "string",
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
                        block: par.block,
                        version: version, params: par, stimset: stimset.config.stimuli});
    // hourly heartbeat messages for the activity monitor
    t.heartbeat(name, {subject: par.subject});

    // update feeder list
    t.get_feeders((err, feeders) => {
        if (!err) {
            logger.info("available feeders: ", feeders)
            par.feeders = feeders;
        }
    });

    //get stimulus metadata
    t.req("get-meta", {name: "aplayer"}, function(data, rep) {
        stim_prop = rep.stimuli.properties;
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
    t.await("keys", null, function(msg) { return msg && msg[par.init_key]}, intertrial);
}

function intertrial() {
    const duration = 50;
    logger.debug("ITI: %d ms", duration)
    update_state({phase: "intertrial"})
    _.delay(await_present, duration);
}

function await_present() {
	const delay_start = util.now();
	const iti = Math.random() * 500 + 1000;
	let pecked = null;
	update_state({phase: "awaiting-stimulus"});
	t.await("keys", iti, _test, _exit);

	function _test(msg) {
        if (!msg) return true;
        if (msg[par.resp_key] == true) {
                pecked = "early";
                return true;
        }
    }

	function _exit(time) {
		const rtime = (pecked == "timeout") ? null : time - delay_start;
		if (pecked == "early") {
			t.trial_data(name, {subject: par.subject,
                    experiment: stimset.experiment,
                    block: par.block,
                    trial: state.trial,
                    stimulus: "pre-stimulus",
                    position: 0,
                    oddball: null,
                    response: pecked,
                    correct: false,
                    result: "trial-restart",
                    rtime: rtime
                   });
			await_init();
		} else {
			present_stim();
		}
	}
}

function present_stim() {

    const stim = (state.correction) ? state.stimulus : stimset.next(par.rand_replace);
    const isi = 150;

    let pecked = "timeout";
    let oddball = false;
    let position = 1;
    let a_stim;
    let b_stim;
    let a_stim_dur;
    let b_stim_dur;
    let bpos;
    let b_start;
    const resp_start = util.now();

    if (par.block <= 1) {
    	logger.debug("next stim:", stim.name);
    	const stim_dur = stim_prop[stim.name].duration;
		update_state({phase: "presenting-stimulus", stimulus: stim.name });
	    t.change_state("aplayer", {playing: true, stimulus: stim.name, root: stimset.root});
	    t.await("keys", (stim_dur*1000)+par.response_window, _test, _exit);
    } else {
    	logger.debug("next stim:", stim.name);
    	a_stim = _.first(stim.name);
    	b_stim = _.last(stim.name);
    	a_stim_dur = stim_prop[a_stim].duration;
    	b_stim_dur = stim_prop[b_stim].duration;
        bpos = (par.block == 2) ? 2 : Math.floor((Math.random()*(par.block))+2);
        update_state({phase: "presenting-stimulus-a", stimulus: a_stim });
        t.change_state("aplayer", {playing: true, stimulus: a_stim, root: stimset.root});
        t.await("keys", (a_stim_dur*1000)+isi, _test, _next_stim);
    }

    function _play_noise(time) {

    }

    function _next_stim(time) {
	    if (pecked == par.resp_key && (position < bpos || position > bpos+1)) {
            pecked = "stimA";
            _exit(time);
	    } else if (pecked == par.resp_key && (position == bpos || position == bpos+1)) {
            _exit(time);
	    } else {
            position += 1;
            if (position == bpos) {
                oddball = true;
                b_start = util.now();
                update_state({phase: "presenting-stimulus-b", stimulus: b_stim });
                t.change_state("aplayer", {playing: true, stimulus: b_stim, root: stimset.root});
                if (position == par.block) t.await("keys", (b_stim_dur*1000)+par.response_window, _test, _exit);
                else t.await("keys", (b_stim_dur*1000)+isi, _test, _next_stim);
            } else {
                update_state({phase: "presenting-stimulus-a", stimulus: a_stim });
                t.change_state("aplayer", {playing: true, stimulus: a_stim, root: stimset.root});
                if (position == par.block) t.await("keys", (a_stim_dur*1000)+par.response_window, _test, _exit);
                else t.await("keys", (a_stim_dur*1000)+isi, _test, _next_stim);
            }
        }
	}

    function _test(msg) {
    	if (!msg) return true;
    	if (msg[par.resp_key] == true) {
    		pecked = par.resp_key;
    		return true;
    	}
    }

    function _exit(time) {
        update_state({phase: "post-stimulus", stimulus: null});
	    t.change_state("aplayer", {playing: false});
        const rtime = (pecked == par.resp_key && oddball == true) ? time - b_start : time - resp_start;
        let correct = false;
        if (par.block > 1) {
            pecked = (oddball == false && pecked == par.resp_key) ? "stimA" : pecked;
            correct = (oddball == false && pecked == "timeout") ? true : correct;
        	position = (pecked == "timeout") ? 0 : position;
        };
        correct = (pecked == par.resp_key) ? true : correct;
        let result = (correct == true) ? "feed" : "trial-restart";
    	t.trial_data(name, {subject: par.subject,
                    experiment: stimset.experiment,
                    block: par.block,
                    trial: state.trial,
                    stimulus: stim.name,
                    position: position,
                    oddball: oddball,
                    response: pecked,
                    correct: correct,
                    result: result,
                    rtime: rtime
        });
    	if (result == "feed") {
    		const feeder = random_feeder();
    		feed(feeder, par.feed_duration, await_init);
    	} else {
    		await_init();
    	}
    	
    }   
}

function feed(feeder, duration, next_state) {
    update_state({phase: "feeding", "last-feed": util.now()})
    _.delay(t.change_state, par.feed_delay,
            feeder, { feeding: true, interval: duration})
    t.await(feeder, null, function(msg) { return msg.feeding == false }, next_state);
}

function random_feeder() {
    const r = Math.random();
    const i = Math.floor(r * par.feeders.length);
    logger.debug("random feeder:", r, par.feeders[i]);
    return par.feeders[i];
}

function pick_feeder(side) {
    const name = "feeder_" + side;
    if (_.has(par.feeders, name))
        return name;
    else
        return random_feeder();
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
