
var feeder = new (require("../lib/feeder"))();

feeder.subscribe("state-changed", console.log);
feeder.subscribe("error", console.log);

feeder.event({id: "modify-state", time: Date.now(), interval: 2000, feeding: true});

