// provides current contents of eeprom

var b = require("./starboard");
var util = require("./util");
var winston = require("winston");

function eeprom(params, callback) {

    var meta = {
        type: "eeprom",
        dir: "input"
    }

    var par = {
        bus_addr: "1-0054"
    }
    util.update(par, params);

    var state = {};

    b.read_eeprom(par.bus_addr, function(err, data) {
        if (!err)
            state = data;
        callback(err, data);
    });

    this.req = function(msg, rep) {
        if (msg.req == "reset-state")
            rep();
        else if (msg.req == "get-state")
            rep(null, state);
        else if (msg.req == "get-meta")
            ret = meta;
        else if (msg.req == "get-params")
            ret = par;
        if (rep) rep(null, ret);
    };

    this.pub = function() {};
}

module.exports = eeprom;
