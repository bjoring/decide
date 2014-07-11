/* play files to the sound card */
var cp = require("child_process");
var util = require("./util");

function aplayer(params, callback) {

	var par = {
		device: "default"
	};

	var meta = {
	 type: "sound",
	 dir: "output",
	 variables: {
		playing: [false, true],
		stimulus: [null, ".wav"]
	}
};

var state = {
		stimulus: null,             // path of stimulus file
		playing: false              // set to true to start playback
		// TODO: report sample position?
	};

	util.update(par, params);

	this.pub = function(){};
	this.req = function(msg, rep) {
		var ret;
		if (msg.req == "change-state") {
			if (state.playing) {
				if (rep) rep(callback("event ignored: playback in progress", null, null, true));
				else callback("event ignored: playback in progress");
			}
			util.update(state, msg.data);

			if (msg.data.playing) {
				var aplay = cp.spawn("aplay", ["-D", par.device, state.stimulus]);
				aplay.stderr.on("data", function(data) {
				 if (/^Playing/.test(data) || /Rate/.test(data.toString())) {
						state.playing = true; 
					}
					else {
						if (rep) rep(callback(code.toString().trimRight(), null, null, true));
						else callback(code.toString().trimRight());i
					}
				});
				aplay.on("close", function (code) {
					state.playing = false;
					if (code == 0) {
						state.playing = false;
						callback(null, state); 
					}
					else {
						if (rep) rep(callback(code.toString().trimRight(), null, null,true));
						else callback(code.toString().trimRight());
					}
				});
			}
		} 
		else {
			if (msg.req == "get-state") ret = state;
			if (msg.req == "get-meta") ret = meta; 

			if (rep) rep(null, ret);
			};
		}
	}

	module.exports = aplayer;
