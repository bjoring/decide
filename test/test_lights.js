
var lights = new (require("../lib/lights"))( {clock_interval: 5000});

lights.subscribe("state-changed", console.log);
lights.subscribe("error", console.log);

lights.event({id: "modify-state", time: Date.now(), brightness: 0});
lights.event({id: "modify-state", time: Date.now(), clock_on: true});

setTimeout(function() {
  lights.event({id: "modify-state", time: Date.now(), brightness: 2, clock_on: false});
}, 15000);
