var b = require("./bonescript-lite");
var util = require("./util");
var winston = require("winston");

function cues(params, callback) {

  var par = {
    device: "starboard:center:green"
  };
  util.update(par, params);

  var meta = {
    type: "led",
    dir: "output",
    color: par.device.split(":")[2],
    variables: {
      brightness: [0, 1],
      trigger: [null, "timer", "oneshot"]
    }
  };


  var state = {
    brightness: 0,
    trigger: null
  };

  function cb(err, data) {
    if (!err)
      state = data;
    callback(err, data);
  }

  function set_state(data) {
    if (data.brightness == state.brightness)
      return;
    if (data.trigger == "timer")
      b.led_timer(par.device, data.period, cb);
    else if (data.trigger == "oneshot")
      b.led_oneshot(par.device, data.period, cb);
    else
      b.led_write(par.device, data.brightness, cb);
  };

  // ignore pub messages
  this.pub = function() {};

  this.req = function(msg, rep) {
    var ret;
    if (msg.req == "change-state")
      ret = set_state(msg.data);
    else if (msg.req == "get-state")
      ret = state
    else if (msg.req == "get-meta")
      ret = meta;
    else if (msg.req == "get-params")
      ret = par;
    if (rep) rep(null, ret);
  };
}

module.exports = cues;
