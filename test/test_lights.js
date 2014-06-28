
var lights = new (require("../lib/lights"))({clock_interval: 5000}, console.log);

lights.set_state({brightness: 0});
lights.set_state({clock_on: true});

setTimeout(function() { lights.set_state({brightness: 2, clock_on: false});}, 15000);
