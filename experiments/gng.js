// Import required modules
var t = require("./toolkit");
var winston = require("winston"); // logger

// Trial variables
var trial_count = 0;
var stim_set = {};
var correction_count;
var stim;
var correction_trial;

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

// Create the stimulus set
create_stim_set(par.stimuli_database);
t.lights().on();
t.initialize("gng");
t.trial_loop(trial);

// Set global variables
function trial(callback) {	
	prep_trial();
	

	function prep_trial(force_stim) {
		trial_count++;
		console.log("preparing trial",trial_count, correction_trial ? "correction " + correction_count : "");
		stim = force_stim ? force_stim : select_stimulus();
		console.log("waiting for peck");
		t.keys(par.target_key).wait_for(false, play_stimulus);
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
		var correct_response = stim.type == 1 ? par.target_key : "none"; 
		console.log("checking response");
		t.keys(correct_response).response_window(par.response_window_duration, response_reaction);
	}

	function response_reaction(result) {
		if (result.correct == true) {
			console.log("correct response");
			if (result.response != "none") t.feed(par.default_feed, par.feed_duration, callback);
			else callback()  //trial();
		}
		else {
			console.log("incorrect response");
			if (result.response != "none") t.lights().off(par.punish_duration, run_correction_trial);
			else run_correction_trial();
		}
	}

	function run_correction_trial() {
		if (!correction_trial) correction_count = 0;
		correction_trial = true;
		correction_count++;
		if (correction_count <= par.correction_limit) {
			prep_trial(stim);
		}
		else {
			correction_trial = false;
			callback(); //trial();
		}
	}
}

function create_stim_set(loc) {
        var bank = require(loc);
	var i = 0;
        for (stimulus in bank) {
                var f = bank[stimulus].freq;
                for (var j = 0; j < f; j++) {
                        stim_set[i] = bank[stimulus];
                        i++;
                } 
        }
}

