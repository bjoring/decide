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
	fed: false,

};

// Default parameters
var par = {
	block_limit: 10,  	// number of times to run each block TODO: Specify separate limit for each block?
	default_cue: "center_green",
	alt_cue_color: "green",
	default_hopper: "left",
	feed_duration: 5000,
};

// Setup
t.lights().clock_set(); // make sure lights are on

// create component in apparatus
t.initialize("<program-name>", function(){ 
	// run trials only during daytime
	t.run_by_clock( function() {
	// run trial() in a loop
	t.trial_loop(trial); 
	});
});



function trial(next_trial) {

	switch(trial_data.block) {
		case 1:
			block1();
			break;
		case 2: 
			block2();
			break;
		case 3:
			block3();
			break;
		case 4:
			block4();
			break;
	}

	function block1() {
		set_trial();
		t.cue(par.default_cue).blink();
		t.keys("peck_center").response_window(5000, check_response);

		function check_response(response) {
		t.cue(par.default_cue).off()
			if (response.correct) {
				t.hopper(par.default_hopper).feed(par.feed_duration, function() {
					trial_data.fed = true;
					end_trial();
				});
			}
			else end_trial;
		}
	}

	function block2() {
		set_trial();
		cue_until_key(par.default_cue, "peck_center", basic_reward);
	}

	function block3() {
		set_trial();
		var rand = Math.random();
		feed_select = rand > 0.5 ? "left" : "right";
		cue_until_key(par.default_cue,"peck_center", function() {basic_reward(feed_select)});
	}

	function block4() {
		set_trial();
		t.keys("peck_center").wait_for(false, block4_continue);

		function block4_continue(){
			var rand = Math.random();
			var cue_select = feed_select = rand > 0.5 ? "left" : "right"; 
			var cue_select = cue_select+"_"+par.alt_cue_color
			cue_until_key(cue_select,"peck_"+feed_select, function(){basic_reward(feed_select,cue_select)});
		}
	}

	function cue_until_key(cue, key, callback) {
		t.cue(cue).blink();
		t.keys(key).wait_for(false, callback);
	}

	function basic_reward(feeder, cue) {
		var cue_select = cue ? cue : par.default_cue;
		var feed_select = feeder ? feeder : par.default_hopper;
		t.cue(par.default_cue).off();
		t.hopper(feeder).feed(par.feed_duration, function() {
			trial_data.fed = true;
			end_trial();
		});
	}

	function set_trial() {
		trial_data.begin = Date.now();
		trial_data.trial++;
		trial_data.block_trial++;
		trial_data.fed = false;
		trial_data.end = 0;
		console.log("Beginning trial",trial_data.trial, ",block",trial_data.block,",block_trial",trial_data.block_trial);
	}

	function finished() {
		console.log('Shape Finished',Date.now());
		console.log("[Press 'Ctrl+C' to exit]");
	}

	function end_trial() {
		trial_data.end() = Date.now();

		// make sure data is logged before proceeding to next trial
		log_data(function() {
			if (trial_data.block == 1) {
				trial_data.block++;
				trial_data.block_trial = 0;
			}
			else if (trial_data.block_trial >= par.block_limit) {
				if (trial_data.block == 4) {
					finished();
				}
				else {
					trial_data.block++;
				}
				trial_data.block_trial = 0;
			}
			next_trial();
		});
	}


	function log_data(callback) {
		winston.log(trial_data);
		callback();
	}

}
