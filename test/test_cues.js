var winston = require("winston");
var cues = require("../lib/cues");

winston.levels.pub = 3;
winston.levels.req = 3;

var cue = cues({device: "starboard:left:red"}, winston.pub);

cue.req({req: "change-state", addr:"", data: { brightness: 255}}, winston.req);


// cues.subscribe("state-changed", console.log);
// cues.subscribe("error", console.log);

// cues.event({id: "modify-state", time: Date.now(), trigger: "timer", period: 500});

// setTimeout(function() {
//   cues.event({id: "modify-state", time: Date.now(), brightness: 0});
// }, 15000);
