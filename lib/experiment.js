var _ = require("underscore");
var winston = require("winston");
var util = require("./util");

function experiment(params, callback) {

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
        subject: {}
    };
    var reset = _.clone(state);

    function set_state(data, rep) {
        util.update(state, data);
        rep();
        callback(null, state);
    }

    // ignore pub messages
    this.pub = function() {};

    this.req = function(msg, rep) {
        winston.debug("req to experiment: ", msg);
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
    };

}

module.exports = experiment;
