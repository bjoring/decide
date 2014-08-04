// state machine for feeder
var b = require("./starboard");
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

    function set_state(data, rep) {
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
            if (rep) rep(callback(err, state, null, true));
            else callback(err, state);
        });
    }

    this.pub = function() {};

    this.req = function(msg, rep) {
        var ret;
        if (msg.req == "change-state")
            ret = set_state(msg.data, rep);
        else {
            if (msg.req == "get-state")
                ret = state;
            else if (msg.req == "get-meta")
                ret = meta;
            else if (msg.req == "get-params")
                ret = par;
            if (rep) rep(null, ret);
        }
    }
}

module.exports = feeder;
