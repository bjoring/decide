// provides current contents of eeprom

var fs = require("fs");
var util = require("./util");

function eeprom(params, callback) {

  var meta = {
    type: "eeprom",
    dir: "input"
  }

  var par = {
    bus_addr: "0-0054"
  }
  util.update(par, params);

  var state = {};

  var path = "/sys/bus/i2c/devices/" + par.bus_addr + "/eeprom";
  fs.open(path, "r", function(err, fd) {
    if (err)
      callback(err);
    else {
      var buf = new Buffer(244);
      fs.readSync(fd, buf, 0, 244, 0);
      state = {
        "board": buf.toString("ascii", 6, 6 + 32).replace(/\u0000/g, ""),
        "part": buf.toString("ascii", 58, 58 + 16).replace(/\u0000/g, ""),
        "revision": buf.toString("ascii", 38, 38 + 4),
        "serial": buf.toString("ascii", 76, 76 + 12)
      };
      callback(err, state);
    }
  });

  this.req = function(msg) {
    if (msg.req == "get-state")
      return state;
    else if (msg.req == "get-meta")
      return meta;
    else if (msg.req == "get-params")
      return par;
  };

  this.pub = function() {};

}

module.exports = eeprom;
