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

    // ignore pub messages
    this.pub = function() {};

    this.req = function(msg, rep) {
        winston.debug("req to experiment: ", msg);
        if (msg.req == "change-state") {
            util.update(state, msg.data);
            rep();
            callback(null, state);
        }
        else if (msg.req == "get-state")
            rep(null, state);
        else if (msg.req == "get-meta")
            rep(null, meta);
        else if (msg.req == "get-params")
            rep(null, par);
        else
            rep("invalid REQ type");
    };

}

module.exports = experiment;
