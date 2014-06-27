var b = require("./bonescript-lite");
var util = require("./util");
var events = require("events");

function cues(params) {

  var par = {
    device: "starboard:center:green"
  };
  util.update(par, params);

  var state = {
    brightness: 0
  };

  var emitter = new events.EventEmitter();

  function cb(err, data) {
    if (err)
      util.make_event(emitter, "error", par.device, {reason: err});
    else {
      state = data;
      util.make_event(emitter, "state-changed", par.device, state);
    }
  }

  this.event = function(evt) {
    if (evt.id !== "modify-state") return;
    if (evt.brightness == state.brightness) return;

    if (evt.trigger == "timer")
      b.led_timer(par.device, evt.period, cb);
    else if (evt.trigger == "oneshot")
      b.led_oneshot(par.device, evt.period, cb);
    else
      b.led_write(par.device, evt.brightness, cb);
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

module.exports = cues;
