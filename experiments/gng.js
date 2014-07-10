/* 
gngclient.js 
	This script starts a "go-nogo" experiment. 

	To run the script:
		node gngclient.js
	
	Procedure:
	 1. wait for center key peck, 
	 2. play random stimulus,
	 3. wait for center key peck.  
	 4. reward/punish accordingly: 
		 	only GO responses are consequated:
		 	correct hits are rewarded with food access; 
		 	false positives are punished with lights out.  
	 5. if response was correct, a new stimulus is presented. 
	 
	 Session ends when the lights go out for the day.
*/

/*
	TODO:
		Actual logging!
*/

// Import required modules
var t = require("./toolkit");
var winston = require("winston"); // logger

// Trial variables
var trial_data = {
	trial: 0,
	begin: 0,
	end: 0,
	stim: "/path/to/stim.wav",
	correct_response: "none",
	response: "none",
	correct: false,
	err: 0,
	rewarded: false,
	punished: false,
	correction: false,
	correction_count: 0,
};

// Default parameters
var par = {
	target_key: "peck_center",
	response_window_duration: 2000,
	correction_limit: 3,
	stimuli_database: "../stimuli/gngstimuli",
	default_feed: "left",
	feed_duration: 2000,
	punish_duration: 2000
};

// Setup
var stim_set = create_stim_set(par.stimuli_database); // Create stimulus set
t.lights().clock_set(); // make sure lights are on
t.initialize("gng", function(){ // create gng component in apparatus
	t.run_by_clock( function() {// run trials only during daytime
		t.trial_loop(trial); // run trial() in a loop
	});
});



function trial(next_trial) {
	prep_trial();
	function prep_trial(force_stim) {
		trial_data.trial++;
		console.log("preparing trial",trial_data.trial, trial_data.correction ? "correction " + trial_data.correction_count : "");
		t.state_update("phase","preparing-stimulus");
		trial_data.stim = force_stim ? force_stim : select_stimulus();
		console.log("waiting for peck");
		t.state_update("phase","inter-trial");
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
		trial_data.begin = Date.now();
		t.state_update("phase","playing-sound");
		console.log("playing stimulus:",trial_data.stim.sound);
		t.aplayer(trial_data.stim.sound).play(response_check);
	}

	function response_check() {
		trial_data.correct_response = trial_data.stim.type == 1 ? par.target_key : "none"; 
		console.log("checking response");
		t.state_update("phase","evaluating-response");
		t.keys(trial_data.correct_response).response_window(par.response_window_duration, response_reaction);
	}

	function response_reaction(result) {
		trial_data.rewarded = trial_data.punished = false; // reset these values for now
		trial_data.response = result.response;
		trial_data.correct = result.correct;
		if (trial_data.correct == true) {
			console.log("correct response");
			trial_data.err = 0;
			if (trial_data.response != "none") {
				t.state_update("phase","rewarding");
				trial_data.rewarded = true;
				t.hopper(par.default_feed).feed(par.feed_duration, end_trial);
			}
			else {
				end_trial();
			}
		}
		else {
			console.log("incorrect response");
			if (trial_data.response != "none") {
				trial_data.err = 1;
				trial_data.punished = true;
				t.lights().off(par.punish_duration, run_correction);
				t.state_update("phase","punishing");	
			} 
			else  { 
				trial_data.err = 2;
				run_correction();
			}
		}
	}	

	function run_correction() {
		trial_data.correction = true;
		trial_data.correction_count++;
		if (trial_data.correction_count <= par.correction_limit) {
			log_data();
			prep_trial(trial_data.stim);
		}
		else {
			trial_data.correction = false;
			end_trial();
		}
	}

	function end_trial() {
		trial_data.correction = false;
		trial_data.correction_count = 0;
		log_data();	
	next_trial();
	}

	function log_data() {
		trial_data.end = Date.now();
		console.log(trial_data);
		for (var key in trial_data) {
			if (key != "trial" && key != "stim" && key != "correction" && key != "correction_count") {
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
