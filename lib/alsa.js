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
        callback("event ignored: playback in progress");
      }
      util.update(state, msg.data);

      if (msg.data.playing) {
        var aplay = cp.spawn("aplay", ["-D", par.device, state.stimulus]);
        aplay.stderr.on("data", function(data) {
	if (/^Playing/.test(data) || /Rate/.test(data.toString())) {
            ret = function(){state.playing = true;}; // TODO: figure this out
          }
          else {
            callback(data.toString().trimRight());
          }
        });
        aplay.on("close", function (code) {
          state.playing = false;
          if (code == 0) {
            ret = function(){state.playing = false;};
	    callback(null, state); 
	  }
          else {
            callback(code.toString().trimRight());
          }
        });
    }
   }
      if (msg.req == "get-state") ret = state;
      if (msg.req == "get-meta") ret = meta; 
      // TODO: add more functionality?
      if (rep) rep(null, ret);
  };
}

module.exports = aplayer;
