/*
template.js
	TODO: WRITE THIS!
*/


// Import required modules
var t = require("./toolkit");			// bank of apparatus manipulation functions
var winston = require("winston");		// logger

/* Trial Data */
// This dictionary contains all values that will be logged as data at the end of each trial
var trial_data = {
	program: "shape",
	box: require('os').hostname(),		// box id
	subject: 0,							// subject number
	trial: 0,							// trial number
	begin: 0,							// when when trial began
	end: 0,								// when trial ended
	fed: false,							// whether the subect was fed
};

/* Parameters */
var par = {
	subject: 0,							// sets the subject number
	default_cue: "center_green",		// cue used when not specified
	feed_duration: 5000,				// how long to feed the bird (NOTE: overridden by each block)
	mail_list: ""						// who to email upon disaster (string or string array)
	trial_limit: ""						// end after this many trials
};

var params = {};

process.argv.forEach(function(val, index, array) {
	if (val == "-c") params = require(array[index+1]);
});

require("../lib/util").update(par, params);
trial_data.subject = par.subject;					// set the subject number

/* Setup */
t.lights().on();						            // make sure lights are on
t.lights().clock_set()				            	// set house lights by sun altitude
t.initialize("shape", par.subject, function(){		// create component in apparatus
	t.mail_on_disaster(par.mail_list);              // mail someone when disaster strikes
	t.run_by_clock( function() {		            // run trials only during daytime
		t.loop(trial);				        		// run trial() in a loop
	});
});


/* Trial Procedure*/
function trial(next_trial) {
	set_trial();

	function basic_reward(data, feeder, cue) {		// feeds the subject, then signals end of trial
		t.state_update("phase","rewarding");
		var cue_select = cue ? cue : par.default_cue;
		var feed_select = feeder ? feeder : par.default_hopper;
		t.cue(cue_select).off();
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

	function finished() {				// a place-holder function until I come up with something smarter
		trial_data.block = null;
		console.log('Experiment Finished',Date.now());
		console.log("[Press 'Ctrl+C' to exit]");
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
