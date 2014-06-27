
var cues = new (require("../lib/cues"))();

cues.subscribe("state-changed", console.log);
cues.subscribe("error", console.log);

cues.event({id: "modify-state", time: Date.now(), trigger: "timer", period: 500});

setTimeout(function() {
  cues.event({id: "modify-state", time: Date.now(), brightness: 0});
}, 15000);
