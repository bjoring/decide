// Import required modules
var t = require("./toolkit");
var winston = require("winston"); // logger

// Trial variables initialization
var trial_data {
	trial: 0,
	begin: 0,
	end: 0,
	stim: "",
	correct_response: "none",
	response: "none",
	correct: false,
	err: 0,
	rewarded: false,
	punished: false,
	correction: false,
	correction_count: 0,
}

// Default parameters
var par = {
	target_key: "peck_center",
	response_window_duration: 2000,
	correction_limit: 3,
	stimuli_database: "../stimuli/gngstimuli",
	default_feed: "left",
	feed_duration: 2000,
	punish_duration: 2000
}

// Setup
var stim_set = create_stim_set(par.stimuli_database); // Create stimulus set
t.lights().on(); // Make sure the lights are on
t.initialize("gng"); // Create a "gng" component in apparatus

// Run trial() in a loop
t.trial_loop(trial);

function trial(callback) {

	prep_trial();

	function prep_trial(force_stim) {
		trial_data.trial++;
		winston.log("preparing trial",trial_data.trial, trial_data.correction ? "correction " + correction_count : "");
		t.phase_update("preparing-stimulus");
		trial_data.stim = force_stim ? force_stim : select_stimulus();
		winston.log("waiting for peck");
		t.phase_update("inter-trial");
		t.keys(par.target_key).wait_for(false, play_stimulus);
	}

	function select_stimulus() {
		winston.log("selecting stimulus");
		var rand = Math.random();
		var length = Object.keys(stim_set).length - 1;
		var select = Math.round(rand*length);
		return stim_set[select];
	}

	function play_stimulus() {
		trial_data.begin = Date.now();
		t.phase_update("playing-sound");
		winston.log("playing stimulus:",trial_data.stim.sound);
		t.aplayer(trial_data.stim.sound).play(response_check);
	}

	function response_check() {
		trial_data.correct_response = trial_data.stim.type == 1 ? par.target_key : "none"; 
		winston.log("checking response");
		t.phase_update("evaluating-response");
		t.keys(trial_data.correct_response).response_window(par.response_window_duration, response_reaction);
	}

	function response_reaction(result) {
		trial_data.rewarded = trial_data.punished = false; // reset these values for now
		trial_data.response = result.response;
		trial_data.correct = result.correct;
		if (trial_data.correct == true) {
			winston.log("correct response");
			trial_data.err = 0;
			if (trial_data.response != "none") {
				t.phase_update("rewarding");
				trial_data.rewarded = true,
				t.feed(par.default_feed, par.feed_duration, next_trial);
			}
			else {
				next_trial();
			}
		}
		else {
			winston.log("incorrect response");
			if (result.response != "none") {
				trial_data.err = 1;
				trial_data.punished = true;
				t.lights().off(par.punish_duration, run_trial_data.correction);
				t.phase_update("punishing");	
			} 
			else  { 
				trial_data.err = 2;
				run_trial_data.correction();
		}
	}

	function run_trial_data.correction() {
		trial_data.correction = true;
		correction_count++;
		if (correction_count <= par.correction_limit) {
			log_data();
			prep_trial(trial_data.stim);
		}
		else {
			trial_data.correction = false;
			next_trial();
		}
	}

	function next_trial() {
		trial_data.correction = false;
		trial_data.correction_count = false;
		log_data();	
		callback();
	}

	function log_data() {
		trial_data.end = Date.now();
		winston.log(trial_data);
		for (key in trial_data) {
			if (key != trial && key != correction && key != correction_count) {
				trial_data[key] = "not-logged";
			}
		}
	}
}

function create_stim_set(loc) {
    var bank = require(loc);
	var i = 0;
	var stim_set = {};
    for (stimulus in bank) {
        var f = bank[stimulus].freq;
        for (var j = 0; j < f; j++) {
            stim_set[i] = bank[stimulus];
            i++;
        } 
    }
    return stim_set;
}