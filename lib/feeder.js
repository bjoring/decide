// state machine for feeder
var b = require("./bonescript-lite");
var util = require("./util");

function feeder(params, callback) {

  var meta = {
    type: "feeder",
    dir: "output",
    feeding: [true, false],
    interval: "float"
  }

  var par = {
    device: "starboard:hopper:left",
  };
  util.update(par, params);

  var state = {
    feeding: false,
    interval: 4000,             // duration of feeding
  };

  function set_state(data) {
    if (data.interval) state.interval = data.interval;
    if (state.feeding == data.feeding) return;
    b.led_write(par.device, data.feeding, function(err, value) {
      if (!err) {
        state.feeding = (value.brightness > 0);
        // set timer to deactivate
        if (state.feeding) {
          setTimeout(function() {
            set_state({ feeding: false });
          }, state.interval);
        }
      }
      callback(err, value);
    });
  }

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

module.exports = feeder;
