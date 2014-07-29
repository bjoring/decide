/* template.js
	
	This file provides a quick starting point for creating operant training paradigms with
	Toolkit. It demos a simple paradigm that blinks an LED until a center key press then 
	rewards the subject with food. The general process, all functions, and all variables
	will be explained. For 

	To create a new paradigm from this template, just the demo functions, add features as 
	needed, and then save to a new .js file. 
*/

// Import required node modules
var t = require("./toolkit");			// bank of apparatus manipulation functions
var winston = require("winston");		// logger

/* Specify Trial Data */
// `trial_data` contains all values that will be logged as data at the end of each trial.
// The variables below are required for the interface and logging to work properly. They 
// should not be removed or modified. Additional variables may be added, however.
var trial_data = {
	program: "template",				// the name of the paradigm
	box: require('os').hostname(),		// box id
	subject: 0,							// subject number
	trial: 0,							// trial number
	begin: 0,							// when when trial began
	end: 0,								// when trial ended
	fed: false,							// whether subect was fed
};

/* Parameters */
// `par` contains the default parameters for the program. Later, each instance of 
// the program may set its own values for these parameters by loading a JSON config file.
// Of those provided, `mail_list` and `subject` are requried parameters. They should not 
// be removed. The others -- `default_cue`, `feed_duration`, and `trial_limit` -- are just 
// examples of parameters a program may have. Modify/remove them and add parameters 
// as needed. 
var par = {
	mail_list: ""						// who to email upon disaster (takes string or string array)
	subject: 0,							// sets the subject number
	default_cue: "center_green",		// cue used when not specified
	feed_duration: 5000,				// how long to feed the subject
	trial_limit: 10						// end training after this many trials
}; // par

// `params` is the dictionary into which the JSON config file may be loaded. It should not be modified. 
var params = {}; 

// The below function allows for JSON config files to be specified when the progam is run. To specify a
// config file, the program must be run the flag '-c' and passed a string giving the path to the desired
// json config file. Additional command line flags and arguments may be added. 
process.argv.forEach(function(val, index, array) {
	if (val == "-c") params = require(array[index+1]); // allows config files to be specified with the '-c' flag
});

// This function updates the values in `par` if a config file was specified.
require("../lib/util").update(par, params);
trial_data.subject = par.subject;								// makes sure the subject numbers are consistent 

/* Setup */
// The following lines dictate how trials will be run. This section may be modified, but it is not recommended
// to do so without a careful review of the toolkit API. 
t.lights().clock_set()				            				// set house lights by sun altitude
t.initialize(trial_data.program, par.subject, function(){		// create component in apparatus
	t.mail_on_disaster(par.mail_list);              			// mail someone when disaster strikes
	t.run_by_clock( function() {		            			// run trials only during daytime
		t.loop(trial);				        					// run trial() in a loop
	});
});


/* Trial Procedure*/
function trial(next_trial) {
	set_trial();
	example_cue();

	function example_cue() {

		// Blink LED until key press, then feed
		t.state_update("phase","waiting-for-response");
		cue_until_key(par.default_cue, "peck_center", example_reward);
	}

	function exaple_reward(data, feeder, cue) {		// feeds the subject, then signals end of trial
		t.state_update("phase","rewarding");
		t.hopper(feed_select).feed(par.feed_duration, function() {
			trial_data.fed = true;
			t.state_update("phase","inter-trial");
			end_trial();
		});
	}

	function set_trial() {				// resets needed trial_data values for new trial
		trial_data.begin = Date.now();
		trial_data.trial++;
		trial_data.fed = false;
		trial_data.end = 0;
		t.log_info("beginning trial " + trial_data.trial);
	}

	function finished() {
		trial_data.block = null;
		winston.info('Experiment Finished',Date.now());
		winston.info("[Press 'Ctrl+C' to exit]");
	}

	function end_trial() {				 // signals end of trial, adjusts variables to begin correct next trial
		t.log_info("trial " +trial_data.trial+" finished")
		trial_data.end = Date.now();
		t.log_data(trial_data, function() {			 // make sure data is logged before proceeding to next trial
			if (trial_data.trial >= par.trial_limit) {
				finished();
			} else {
				next_trial();
			}
		});
	}

}
