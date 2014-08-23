// state machine for feeder
var b = require("./starboard");
var _ = require("underscore");
var winston = require("winston");
var util = require("./util");

function feeder(params, addr, pub) {

    var meta = {
        type: "feeder",
        dir: "output",
        variables: {
            feeding: [true, false],
            interval: "float"
        }
    }

    var par = {
        device: "starboard:hopper:left",
    };
    util.update(par, params);

    var state = {
        feeding: false,
        interval: 4000,             // duration of feeding
    };
    var reset = _.clone(state);
    var led = new b.led(par.device);


    function set_state(data, rep) {
        if (data.interval)
            state.interval = data.interval;
        if (state.feeding == data.feeding) {
            rep();
        }
        else {
            led.write(par.device, data.feeding, "none", function(value) {
                state.feeding = (value.brightness > 0);
                if (state.feeding) {
                    setTimeout(function() {
                        set_state({ feeding: false }, function() {});
                    }, state.interval);

                }
                pub.emit("state-changed", addr, state);
                rep();
            });
        }
    }

    this.req = function(msg, data, rep) {
        winston.debug("req to feeder %s:", par.device, msg, data);
        if (msg == "change-state")
            set_state(data, rep);
        else if (msg == "reset-state")
            set_state(reset, rep);
        else if (msg == "get-state")
            rep(null, state);
        else if (msg == "get-meta")
            rep(null, meta);
        else if (msg == "get-params")
            rep(null, par);
        else
            rep("invalid or unsupported REQ type");
    }

    pub.emit("state-changed", addr, state);
}

module.exports = feeder;
