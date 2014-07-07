// Import required modules
var t = require("./toolkit");
var winston = require("winston"); // logger


// Parameters
var trial_count = 0;
var response_time = 2000;
var target_key = "peck_center";
var stim_set = {};
var correction_trial;
var correction_limit = 3;
var correction_count;
var stimuli_database = require("../stimuli/gngstimuli")
var default_feed = "left";
var feed_duration = 2000;
var punish_duration = 2000;

// Create the stimulus set
create_stim_set(stimuli_database);

trial();

t.lights().on();

// Set global variables
function trial() {
	
	var stim;
	prep_trial();
	

	function prep_trial(force_stim) {
		trial_count++;
		console.log("preparing trial",trial_count, correction_trial ? "correction " + correction_count : "");
		stim = force_stim ? force_stim : select_stimulus();
		console.log("waiting for peck");
		t.keys(target_key).wait_for(false, play_stimulus);
	}

	function select_stimulus() {
		console.log("selecting stimulus");
		var rand = Math.random();
		var length = Object.keys(stim_set).length - 1;
		var select = Math.round(rand*length);
		return stim_set[select];
	}

	function play_stimulus() {
		console.log("playing stimulus:",stim.sound);
		t.aplayer(stim.sound).play(response_check);
	}

	function response_check() {
		var correct_response = stim.type == 1 ? target_key : "none"; 
		console.log("checking response");
		t.keys(correct_response).response_window(response_time, response_reaction);
	}

	function response_reaction(result) {
		console.log(result);
		if (result.correct == true) {
			console.log("correct response");
			if (result.response != "none") t.feed(default_feed, feed_duration, trial);
			else trial();
		}
		else {
			console.log("incorrect response");
			if (result.response != "none") t.lights().off(punish_duration, run_correction_trial);
			else run_correction_trial();
		}
	}

	function run_correction_trial() {
		if (!correction_trial) correction_count = 0;
		correction_trial = true;
		correction_count++;
		if (correction_count <= correction_limit) {
			prep_trial(stim);
		}
		else {
			correction_trial = false;
			trial();
		}
	}
}

function create_stim_set(bank) {
        var i = 0;
        for (stimulus in bank) {
                var f = bank[stimulus].freq;
                for (var j = 0; j < f; j++) {
                        stim_set[i] = bank[stimulus];
                        i++;
                } 
        }
}

