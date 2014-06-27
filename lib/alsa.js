/* play files to the sound card */
var cp = require("child_process");
var events = require("events");
var util = require("./util");

function aplayer(params) {

  var par = {
    device: "default"
  };

  var state = {
    stimulus: null,             // path of stimulus file
    playing: false              // set to true to start playback
    // TODO: report sample position?
  };

  var emitter = new events.EventEmitter();

  this.event = function(evt) {
    if (evt.id !== "modify-state") return;
    if (state.playing) {
      util.make_event(emitter, "warning", "aplayer",
                      {reason: "event ignored: playback in progress" });
      return;
    }
    util.update(state, evt);

    if (evt.playing) {
      var msg = "";
      var aplay = cp.spawn("aplay", ["-D", par.device, state.stimulus]);
      aplay.stderr.on("data", function(data) {
        if (/^Playing/.test(data)) {
          state.playing = true;
          util.make_event(emitter, "state-changed", "aplayer",
                         { stimulus: state.stimulus, playing: state.playing});
        }
        else {
          msg = data.toString().trimRight();
        }
      });
      aplay.on("close", function (code) {
        state.playing = false;
        if (code == 0) {
          util.make_event(emitter, "state-changed", "aplayer",
                         { playing: state.playing});
        }
        else {
          util.make_event(emitter, "error", "aplayer",
                          {reason: data.toString().trimRight()});
        }
      });
    }
  };

  this.state = function() {
      return state;
  };

  this.subscribe = function(name, listener) {
    emitter.on(name, listener);
  };

  this.unsubscribe = function(name, listener) {
    emitter.removeListener(name, listener);
  };

}

module.exports = aplayer;
