/* play files to the sound card */
var b = require("./bonescript-lite");
var cp = require("child_process");
var events = require("events");
var util = require("./util");

function feeder(params) {

  var par = {
    device: "starboard:hopper:left",
    detector: "starboard::hopper-up"
  };
  util.update(par, params);

  var state = {
    feeding: false,
    interval: 4000,             // duration of feeding
    hopper_up: false
  };

  var emitter = new events.EventEmitter();

  function event(evt) {
    if (evt.id !== "modify-state") return;
    if (evt.interval) state.interval = evt.interval;
    if (state.feeding != evt.feeding) {
      b.led_write(par.device, evt.feeding, function(err, value) {
        if (err) {
          util.make_event(emitter, "error", par.device, {reason: err});
        }
        else {
          state.feeding = value.value;
          util.make_event(emitter, "state-changed", par.device, {feeding: state.feeding});
          // TODO: set timer to check hopper state
          // set timer to deactivate
          if (state.feeding) {
            setTimeout(function() {
            event({ id: "modify-state",
                    time: Date.now(),
                    source: "timer",
                    feeding: false
                  });
            }, state.interval);
          }
        }
      });
    }
  };

  this.event = event;

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

module.exports = feeder;
