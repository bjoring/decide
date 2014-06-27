
var keys = new (require("../lib/keys"))();

keys.subscribe("state-changed", console.log);
keys.subscribe("error", console.log);
keys.subscribe("stopped", console.log);

keys.event({
  id: "modify-state",
  time: Date.now(),
  peck_right: 1
});

//setTimeout(function() { keys.close();}, 6000);


