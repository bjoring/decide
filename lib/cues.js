var b = require("./bonescript-lite");
var util = require("./util");
var logger = require("winston");

function cues(params, callback) {

  var meta = {
    type: "led",
    dir: "output",
    brightness: [0, 1],
    trigger: [null, "timer", "oneshot"]
  };

  var par = {
    device: "starboard:center:green"
  };
  util.update(par, params);

  var state = {
    brightness: 0,
    trigger: null
  };

  function set_state(data) {
    if (data.brightness == state.brightness)
      return;
    if (data.trigger == "timer")
      b.led_timer(par.device, data.period, callback);
    else if (data.trigger == "oneshot")
      b.led_oneshot(par.device, data.period, callback);
    else
      b.led_write(par.device, data.brightness, callback);
  };

  // ignore pub messages
  this.pub = function() {};

  this.req = function(msg) {
    if (msg.req == "change-state")
      set_state(msg.data);
    else if (msg.req == "get-state")
      return state;
    else if (msg.req == "get-meta")
      return meta;
    else if (msg.req == "get-params")
      return par;
  };
}

module.exports = cues;
