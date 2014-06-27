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
      emitter.emit("warning", {
        id: "warning",
        time: Date.now(),
        source: "aplayer",
        reason: "event ignored: playback in progress"
      });
      return;
    }
    util.update(state, evt);

    if (evt.playing) {
      var msg = "";
      var aplay = cp.spawn("aplay", ["-D", par.device, state.stimulus]);
      aplay.stderr.on("data", function(data) {
        if (/^Playing/.test(data)) {
          state.playing = true;
          emitter.emit("state-changed", {
            id: "state-changed",
            time: Date.now(),   // this is probably not very accurate
            source: "aplayer",
            stimulus: state.stimulus,
            playing: state.playing
          });
        }
        else {
          msg = data.toString().trimRight();
        }
      });
      aplay.on("close", function (code) {
        state.playing = false;
        if (code == 0) {
          emitter.emit("state-changed", {
            id: "state-changed",
            time: Date.now(),
            source: "aplayer",
            playing: state.playing
          });
        }
        else {
          emitter.emit("error", {
            id: "error",
            time: Date.now(),
            source: "aplayer",
            reason: data.toString().trimRight()
          });
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
