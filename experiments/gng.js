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
			false positives are punished with lights out.
		5. If response was correct, a new stimulus is presented.

	Session ends when the lights go out for the day.

	Adapted from CDM's gng.cc used in Chicago lab
*/
/*
	TODO:
		Configuration file support
*/
// Import required modules
var t = require("./toolkit");		// bank of apparatus manipulation functions
var winston = require("winston");	// logger

/* TRIAL DATA */
// This dictionary contains all values that will be logged as data at the end of each trial
var trial_data = {
	program: "gng",
	box: require('os').hostname(),	// box id
	subject: 0,						// subject id
	trial: 0,						// trial numner
	begin: 0,						// when the trial began
	end: 0,							// when the trial ended
	stim: "/path/to/stim.wav",		// stimulus played during trial
	correct_response: "none",		// the correct response for trial
	response: "none",				// subject's actual response
	correct: false,					// whether subject responded correctly
	err: 0,							// [0,1,2]: type of error (Type I = false positive, Type II false negative)
	rewarded: false,				// whether subject was rewarded for response
	punished: false,				// whether subject was punished for response
	correction: false,				// whether the trial is a correction trial
	correction_count: 0,			// number of subsequent correction trials
};

/* Parameters */
var par = {
	subject: 0,
	target_key: "peck_center",					// key used to intiate trials and register responses
	response_window_duration: 2000,				// how long subject has to respond after stimulus played
	correction_limit: 3,						// limit to number of subsequent correction trials
	stimuli_database: "../stimuli/gngstimuli",	// database of stimuli to use in trials
	default_feed: "left",						// hopper with which to feed/reward subject
	feed_duration: 2000,						// how long to feed/reward subject
	punish_duration: 2000,						// how long to punish subject
	mail_list: "" 								// who to email upon disaster (string or string array)
};

var params = {};
process.argv.forEach(function(val, index, array) {
	if (val == "-c") params = require(array[index + 1]);
});

require("../lib/util").update(par, params);
trial_data.subject = par.subject; // set the subject number in data

/* Setup */
var stim_set = create_stim_set(par.stimuli_database);		// Create stimulus set
t.lights().on();
//t.lights().clock_set();									// make sure lights are on and set by sun altitude

t.initialize("gng", par.subject, function() {				// create gng component in apparatus					// set the subject number
	t.mail_on_disaster(par.mail_list); 						// email someone when something bad happens
	//	t.run_by_clock( function() {						// run trials only during daytime
	t.loop(trial); // run trial() in a loop
	//});
});



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

	function select_stimulus() {
		//console.log("selecting stimulus");
		var rand = Math.random();
		var length = Object.keys(stim_set).length - 1;
		var select = Math.round(rand * length);
		return stim_set[select];
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
				t.lights().off(par.punish_duration, run_correction);
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

function create_stim_set(loc) {
	var bank = require(loc);
	var i = 0;
	var stim_set = {};
	for (var stimulus in bank) {
		var f = bank[stimulus].freq;
		for (var j = 0; j < f; j++) {
			stim_set[i] = bank[stimulus];
			i++;
		}
	}
	return stim_set;
}