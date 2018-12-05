// provides current contents of eeprom

const fs = require("fs");
const glob = require("glob");
const queue = require("queue-async");
const util = require("./util");
const winston = require("winston");

function read_eeprom(bus_addr, callback) {
    if (util.is_a_dummy()) {
        callback(null, {board: "Beaglebone Starboard Cape", part: "(software dummy)"});
        return;
    }
    const path = "/sys/bus/i2c/devices/" + bus_addr + "/eeprom";
    fs.open(path, "r", function(err, fd) {
        if (err) {
            callback(err);
            return;
        }
        const buf = new Buffer(244);
        fs.read(fd, buf, 0, 244, 0, function (err, bytes, buffer) {
            if (err)
                callback(err);
            else if (callback) callback(null, {
                    "board": buf.toString("ascii", 6, 6 + 32).replace(/\u0000/g, ""),
                    "part": buf.toString("ascii", 58, 58 + 16).replace(/\u0000/g, ""),
                    "revision": buf.toString("ascii", 38, 38 + 4),
                    "serial": buf.toString("ascii", 76, 76 + 12)
            });
        });
    });
};


function eeprom(params, name, pub) {

    const meta = {
        type: "eeprom",
        dir: "input"
    }

    const par = {
        bus_addr: "1-0054"
    }
    util.update(par, params);

    const state = {"board": null, "part": null, "revision": null, "serial": null};

    read_eeprom(par.bus_addr, function(err, data) {
        if (err) {
            winston.info("error accessing cape: %s", err);
            data = {"board": "unable to read EEPROM"};
        }
        util.update(state, data);
        pub.emit("state-changed", name, data);
    });

    const me = {
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
