// provides current contents of eeprom

var b = require("./starboard");
var util = require("./util");
var winston = require("winston");

function eeprom(params, name, pub) {

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
        if (err) {
            winston.info("error accessing cape: %s", err);
            data = {"board": "unable to read EEPROM", "part": null, "revision": null, "serial": null};
        }
        state = data;
        pub.emit("state-changed", name, data);
    });

    var me = {
        req: function(msg, data, rep) {
            winston.debug("req to eeprom %s:", par.bus_addr, msg, data);
            if (msg == "reset-state")
                rep();
            else if (msg == "get-state")
                rep(null, state);
            else if (msg == "get-meta")
                rep(null, meta);
            else if (msg == "get-params")
                rep(null, par);
        }
    };

    return me;
}

module.exports = eeprom;
