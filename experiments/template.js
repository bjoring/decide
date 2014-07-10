// Import required modules
var t = require("./toolkit");
var winston = require("winston"); // logger

// Trial variables
var trial_data = {
	trial: 0,	 		// trial number
	block: 0,  		    // shape paradigm block
	block_trial: 0,		// number of trials within block
	begin: 0,			// when when trial began
	end: 0,     		// when trial ended

};

// Default parameters
var par = {
	block_limit  		// number of times to run each block TODO: Specify separate limit for each block?

};

// Setup
t.initialize("<program-name>", function(){ // create component in apparatus
	t.run_by_clock( function() {// run trials only during daytime
		t.trial_loop(trial); // run trial() in a loop
	});
});



function trial(callback) { // If running in loop, callback should indicate when to start the next trial

	switch(trial_data.block) {
		case 1:
			run_block1();
			break;
		case 2: 
			run_block2();
			break;
		case 3:
			run_block3();
			break;
		case 4:
			run_block4();
			break;
	}

	function block1() {
		console.log("Beginning trial",trial_data.trial, ",block",trial_data.block,",block_trial",trial_data.block_trial);
		
		//
		cue("center_green").blink();
		keys("center_peck").response_window(5000, check_response);

	}

	function log_data() {
		trial_data.end = Date.now();
		winston.log(trial_data);
	}

}
