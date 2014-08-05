var _ = require("underscore");
var winston = require("winston");
var cues = require("../lib/cues");

winston.levels.pub = 3;
winston.levels.req = 3;

var cue = new cues({device: "starboard:left:red"}, _.partial(winston.log, "pub"));

cue.req({req: "change-state", addr:"",
         data: { trigger: "timer", period: 500}},
        _.partial(winston.log, "req"));

setTimeout(function() {
    cue.req({req: "reset-state", addr:""},
        _.partial(winston.log, "req"));
}, 5000)
