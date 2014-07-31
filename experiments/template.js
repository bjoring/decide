/* template.js
	
	This file provides a quick starting point for creating operant training paradigms with
	Toolkit. It demos a simple paradigm that blinks an LED until a center key press then 
	rewards the subject with food. The general process, all functions, and all variables
	will be explained. For more complex examples, look at 'shape.js' or 'gng.js' in this
	folder. 

	To create a new paradigm from this template, replace the example functions in 'trial()', 
	add features as needed, and then save to a new .js file. 

*/
// Import required node modules
var t = require("./toolkit");	// bank of apparatus manipulation functions
var winston = require("winston"); // logger

/* Specify Trial Data */
// 'trial_data' contains all values that will be logged as data at the end of each trial.
// The variables below are required for the interface and logging to work properly. They 
// should not be removed or modified. Additional variables may be added, however.
var trial_data = {
	program: "template",			// the name of the paradigm
	box: require('os').hostname(),	// box id
	subject: 0,						// subject number
	trial: 0,						// trial number
	begin: 0,						// when when trial began
	end: 0,							// when trial ended
	fed: false,						// whether subect was fed
};

/* Parameters */
// 'par' contains the default parameters for the program. Later, each instance of 
// the program may set its own values for these parameters by loading a JSON config file.
// Of those provided, 'mail_list' and 'subject' are requried parameters. They should not 
// be removed. The othersare just examples of parameters a program may have.
// Modify/remove them and add parameters as needed. 
var par = {
	mail_list: "",					// who to email upon disaster (takes string or string array)
	subject: 0,						// sets the subject number
	default_cue: "center_green",	// cue to use in examples
	default_feeder: "left",			// feeder to use in examples
	default_key: "peck_cener",		// key to use in examples
	feed_duration: 5000,			// how long to feed the subject
	trial_limit: 10					// end training after this many trials
};

// 'params' is the dictionary into which the JSON config file may be loaded. It should not be modified. 
var params = {};

// The below function allows for JSON config files to be specified when the progam is run. To specify a
// config file, the program must be run the flag '-c' and passed a string giving the path to the desired
// json config file. Additional command line flags and arguments may be added. 
process.argv.forEach(function(val, index, array) {
	if (val == "-c") params = require(array[index + 1]); // allows config files to be specified with the '-c' flag
});

// This function updates the values in 'par' if a config file was specified.
require("../lib/util").update(par, params);
trial_data.subject = par.subject; 			// makes sure the subject numbers are consistent 

/* Setup */
// The following lines dictate how trials will be run. This section may be modified, but it is not recommended
// to do so without a careful review of the toolkit API. 
t.lights().clock_set(); // set house lights by sun altitude
t.initialize(trial_data.program, par.subject, function() {	// create component in apparatus
	t.mail_on_disaster(par.mail_list);						// mail someone when disaster strikes
	t.run_by_clock(function() {								// run trials only during daytime
		t.loop(trial);										// run trial() in a loop
	});
});


/* Trial Procedure*/
// 'trial()' contains the program's actual training procedure. Every possible step of the 
// procedure, including all independent phases/blocks/etc of the procedure. The simple
// procedure below simply blinks an LED until a center key press then feeds the subject.
// NOTE: When creating a new procedure, make sure not to forget that node.js works
// asynchronously
function trial(next_trial) {
	// When used in 't.loop()', as above, 'trial()' is recursive. Its only argument, 'next_trial()',
	// is really just another 'trial()' function. Call 'next_trial()' whenever the procedure has 
	// finished and it is time to begin the next trial.

	// It is recommend to break the procedure down into a set of functions. While allowing for 
	// greater readibility, doing so also allows the procedure to take advantage of toolkit's
	// extensive use of callbacks.
	set_trial();
	example_cue();

	// Before continuing onto the actual training portion of 'trial()', the 'trial_data; object
	// needs to be prepared. The example function below 'set_trial()' shows how this might be done.
	function set_trial() { // sets trial_data values for new trial
		trial_data.trial++; // increments trial number
		trial_data.begin = Date.now();						// records trial's begin time
		trial_data.end = 0;									// zeros out end time (because trial hasn't ended yet)
		trial_data.fed = false;								// resets fed to default value
		t.log_info("beginning trial " + trial_data.trial);	// inform others that trial is beginning
	}

	// 'example_cue()' and 'example_reward' a simple demonstrations of how to use toolkit to
	// create a training procedure.
	function example_cue() { // blinks led until keypress
		t.state_update("phase", "waiting-for-response");			// let apparatus know the current state of the program
		t.cue(par.default_cue).blink();								// blink the default led
		t.keys(par.default_key).wait_for(false, example_reward);	// run 'example_reward()' on default_key press
	}

	function example_reward() {												// feeds the subject, then signals end of trial
		t.state_update("phase", "rewarding"); 								// let apparatus know the current state
		t.cue(par.default_cue).off();										// stop blinking led
		t.hopper(par.default_feeder).feed(par.feed_duration, function() {	// feed the subject, then, once finished...
			trial_data.fed = true;											// mark subject as having been fed this trial
			end_trial();													// end the current trial
		});
	}

	// Once a trial is finished, the data needs to be logged and then next trial run.  
	function end_trial() {										// signals end of trial
		t.state_update("phase", "inter-trial");					// update state in apparatus
		t.log_info("trial " + trial_data.trial + " finished");	// let others know trial has finished
		trial_data.end = Date.now();							// record trial's end time
		t.log_data(trial_data, function() {						// log the data, then...
			if (trial_data.trial >= par.trial_limit) {			// if trial limit has been reached...
				finished();										// run 'finished()'
			} else {											// else, if trial limit has not been reached
				next_trial();									// run the next trial
			}
		});
	}

	// Once the entire training procedure is finsihed, exiting is simple. Toolkit will
	// handle all the clean up.
	function finished() { // sinals end of training
		winston.info('Experiment Finished', Date.now());	// let user know training has finished
		winston.info("[Press 'Ctrl+C' to exit]");			// and how to take a graceful exit
	}


