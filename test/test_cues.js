var _ = require("underscore");
var winston = require("winston");
var cues = require("../lib/cues");
var events = require("events");

winston.levels.pub = 3;
winston.levels.req = 3;

var pub = new events.EventEmitter();
pub.on("state-changed", _.partial(winston.log, "pub"))

var rep = _.partial(winston.log, "rep");

var cue = new cues({device: "starboard:left:red"}, pub);

cue.req("change-state", { trigger: "timer", period: 500}, rep);

setTimeout(function() {
    cue.req("reset-state", null, rep);
}, 5000);
