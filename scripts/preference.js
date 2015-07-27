var os = require("os");
var _ = require("underscore");
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
    subject: argv._[0],         // sets the subject number
    user: argv._[1], // these come from commandline, correct?
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
	//after _.extend, paramaters in the json are added here
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

// Parse stimset
var stimset = new util.StimSetPref(argv._[2]); 

// update parameters with stimset values 
_.extend(par, stimset.config.parameters); 


t.connect(name, function(socket) {

    sock = socket;

    // these REQ messages require a response!
    sock.on("get-state", function(data, rep) {
        logger.debug("req to preference: get-state"); //this used to be "req to gng: get-state"
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
    sock.on("change-state", function(data, rep) { rep("ok") }); // could throw an error
    sock.on("reset-state", function(data, rep) { rep("ok") });
    sock.on("state-changed", function(data) { logger.debug("pub to preference: state-changed", data)})

    // update user and subject information:
    t.change_state("experiment", par);

    // start state machine for monitoring daytime
    t.ephemera(t.state_changer(name, state));
    t.trial_data(name, {comment: "starting", subject: par.subject,
                        experiment: stimset.config.experiment,
                        version: version, params: par, stimset: stimset.stimuli});
    // hourly heartbeat messages for the activity monitor
    t.heartbeat(name, {subject: par.subject});
    // initial state;
    await_init();
})

function shutdown() {
    t.trial_data(name, {comment: "stopping", 
						subject: par.subject,
						experiment: stimset.config.experiment})
    t.disconnect(process.exit);
}

// disconnect will reset apparatus to base state
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
    set_cues(stimset.config.cue_options, 1); //change this turn on all possible responses
    t.await("keys", par.response_window, _test, _exit);
	
    function _test(msg) { //see which key was pecked
        if (!msg)
			return true;
        // test against each defined response - only set pecked if true, because
        // we'll get a false event on the key off
        _.find(stimset.config.choices, function(val, key) {
            if (msg[key] == true) { 
                pecked = key;
                return true;
            }
        });
	
        return false;
    }
	
	function _exit(time) {
		if (pecked === "timeout") {
			set_cues(stimset.config.cue_options, 0);
			intertrial(par.min_iti);
		} else {
			var stim = stimset.next(par.rand_replace, pecked); //stim is A 4th			
			logger.debug("next stim:", stim)
			update_state({
				phase: "presenting-stimulus",
				stimulus: stim
			})

			//var resp = stim.responses[pecked];
			logger.debug("response:", pecked); //, resp);
			var rtime = time - resp_start;

			//turn cues off
			set_cues(stimset.config.cue_options, 0);

			t.trial_data(name, {
				program: name,
				subject: par.subject,
				trial: state.trial,
				result: "feed",
				experiment: stimset.config.experiment,
				stimulus: stim.name,
				category: stimset.config.choices[pecked].category, //or should i move category into the stimuli?
				response: pecked,
				rtime: rtime,
			});
			present_stim(pecked);
		}
	}
}


function present_stim(pecked) {
	
	var stim = state.stimulus; //still A 4th

    // if the stimulus is an array, play the sounds in sequence
    var playlist = (typeof stim.name === "object") ? stim.name : [stim.name];
	
    function play_stims(stim, rest) {
        t.change_state("aplayer", {playing: true,
                                   stimulus: stim + ".wav",
									root: stimset.config.root}); //could also be stimulus_root
        t.await("aplayer", null, function(msg) { return msg && !msg.playing }, function() {
            if (rest.length > 0)
                _.delay(play_stims, par.inter_stimulus_interval, _.first(rest), _.rest(rest));
            else
				feed();
        })
    }
    play_stims(_.first(playlist), _.rest(playlist));
	
	
} 

function feed() {
    var hopper = random_hopper()
    update_state({phase: "feeding", "last-feed": util.now()})
    _.delay(t.change_state, par.feed_delay,
            hopper, { feeding: true, interval: par.feed_duration})
		console.log("i fed")
    t.await(hopper, null, function(msg) { return msg.feeding == false },
            _.partial(intertrial, par.min_iti));
}

function sleeping() {
    update_state({phase: "sleeping", "last-feed": util.now()});
    t.await("house_lights", null, function(msg) { return msg.daytime }, await_init);
}

// this is a utility function for setting a bunch of cues either on or off
function set_cues(cuelist, value) {
    _.map(cuelist || [], function(cue) {
        t.change_state("cue_" + cue, {brightness: value})
    });
}
function random_hopper() {
    var i = Math.floor(Math.random() * par.hoppers.length);
    return par.hoppers[i];
}
