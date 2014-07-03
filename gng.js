var t = require(./toolkit);
var winston = require(winston); // logger

function trial(set_stim) {
	var stim = set_stim ? set_stim :  select_stimuli();
	keys().wait_for("peck_center", false, function() {
		present_stimulus();
	}
	t.aplayer(stim.sound);

	function select_stimuli() {
		var length = Object.keys(stimulus_set).length - 1;
		var select = Math.round(rand*length);
		return stimset[select];
	}

	function present_stimulus {
		t.aplayer(stim.sound);
						
	} 
}
