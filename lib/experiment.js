var b = require("./bonescript-lite");
var util = require("./util");
var winston = require("winston");

function experiment(params, callback) {

  var par = {
  };
  
  util.update(par, params);

  var meta = {
    type: "experiment",
    dir: "input",
    variables: {
    	program: "none",  // Not quite finite 
      subject: ""       // Definietly not finite  
    }
  };

  var state = {
    subject: "none",
    program: "none"
  };

  function cb(err, data) {
    if (!err)
      state = data;
    callback(err, data);
  }

  function set_state(data) {
    if (data.program == state.program || !data.program)
      return;
    else {
    	state.program = data.program;
    	cb(null, data);
    }
  };

  // ignore pub messages
  this.pub = function() {};

  this.req = function(msg, rep) {
    var ret;
    if (msg.req == "change-state")
      ret = set_state(msg.data);
    else if (msg.req == "get-state")
      ret = state
    else if (msg.req == "get-meta")
      ret = meta;
    else if (msg.req == "get-params")
      ret = par;
    if (rep) rep(null, ret);
  };
}

module.exports = experiment;
