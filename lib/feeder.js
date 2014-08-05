// state machine for feeder
var b = require("./starboard");
var _ = require("underscore");
var winston = require("winston");
var util = require("./util");

function feeder(params, callback) {

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

    function set_state(data, rep) {
        if (data.interval)
            state.interval = data.interval;
        if (state.feeding == data.feeding) {
            rep();
        }
        else {
            b.led_write(par.device, data.feeding, function(err, value) {
                rep(err);
                if (!err) {
                    state.feeding = (value.brightness > 0);
                    // set timer to deactivate - rep is now noop
                    if (state.feeding) {
                        setTimeout(function() {
                            set_state({ feeding: false }, function() {});
                        }, state.interval);
                    }
                }
                callback(err, state);
            });
        }
    }

    this.pub = function() {};

    this.req = function(msg, rep) {
        winston.debug("req to feeder %s:", par.device, msg);
        if (msg.req == "change-state")
            set_state(msg.data, rep);
        else if (msg.req == "reset-state")
            set_state(reset, rep);
        else if (msg.req == "get-state")
            rep(null, state);
        else if (msg.req == "get-meta")
            rep(null, meta);
        else if (msg.req == "get-params")
            rep(null, par);
        else
            rep("invalid or unsupported REQ type");
    }
}

module.exports = feeder;
