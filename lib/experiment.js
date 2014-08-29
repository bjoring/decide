var _ = require("underscore");
var winston = require("winston");
var util = require("./util");

function experiment(params, addr, pub) {

    var par = {
    };
    util.update(par, params);

    var meta = {
        type: "experiment",
        dir: "input",
        variables: {
            procedure: [null, ""],
            subject: {}
        }
    };

    var state = {
        procedure: null,
        pid: null,
        subject: null,
        user: null,
    };
    var reset = _.clone(state);

    function set_state(data, rep) {
        state = _.extend(state, data);
        rep();
        pub.emit("state-changed", addr, state);
    }

    // ignore pub messages
    this.pub = function() {};

    this.req = function(msg, data, rep) {
        winston.debug("req to experiment:", msg, data);
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
    };

    pub.emit("state-changed", addr, state);
}

module.exports = experiment;
