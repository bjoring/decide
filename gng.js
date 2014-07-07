// Import required modules
var t = require("./toolkit");
var winston = require(winston); // logger


// Parameters
var trial_count = 0;
var stim_set = {};
var correction_count
var correction_trial;

// Set global variables
function trial() {

	prep_trial();

	function prep_trial(force_stim) {
		trial_count++;
		var stim = force_stim ? force_stim : select_stimulus();
		keys().wait_for(target_key, false, play_stimulus);
	}

	function select_stimulus() {
		var length = Object.keys(stimulus_set).length - 1;
		var select = Math.round(rand*length);
		return stim_set[select];
	}

	function play_stimulus() {
		t.aplayer(stim.sound, response_check);
	}

	function response_check() {
		keys(target_key).response_window(response_time, response_reaction);
	}

	function response_reaction(result) {
		if (result.correct) {
			feed(default_feed, feed_time);
			return;
		}
		else {
			if (result.response) lights().off(punish_time, run_correction_trial);
			else run_correction_trial();
		}
	}

	function run_correction_trial() {
		if (!correction_trial) correction_count = 0;
		correction_trial = true;
		correction_count++;
		if (corrections <= correction_limit) {
			prep_trial(stim);
		}
		else return;
	}
}