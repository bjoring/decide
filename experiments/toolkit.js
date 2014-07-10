// toolkit.js
var io = require('socket.io-client');
var pubc = io.connect("http://localhost:8000/PUB");
var reqc = io.connect("http://localhost:8000/REQ");

// TODO:
//  	More elaborate state machine
//	Add an exit() funciton
//      More user friendly looping/clock running

var state = {
	running: false,
	phase: "idle"
}

var meta = {
	type: "experiment",
	dir: "input",
	variables: {
		running: [true,false],
		phase: ["rewarding","punishing","wating-for-response","evaluating-response","playing-sound","inter-trial", "preparing-stimulus"] 
		// Simplified now for convenience. May implement more complex state machine in the future
	}
}

var active_program;

function initialize(name, callback) {	
	setTimeout(function() {
		active_program = name;
		reqc.emit("route", "gng",function(x) {
			console.log(x);
			reqc.emit("msg", {
				req: "change-state",
				addr: "experiment",
				data: {
					program: name
				}
			});
			callback();
		});
	}, 1000); // one second delay magically avoids issues with interface updating 
		
}

function run_by_clock(callback) {
	var initial = true;
	request_lights_state();
	setInterval(request_lights_state, 55000);
	function request_lights_state() {
		reqc.emit("msg", {req: "get-state", addr: "house_lights"}, check_state);
	}
	function check_state(result, data) {
		if (result != "req-ok") console.log(result);
		if (data.sun_altitude > Math.PI || data.sun_altitude < 0.1) { 
			state_update("running", false);
			console.log("night time,",active_program,"sleeping");
		}
		else { 
			if (state.running == false) {
				state_update("running", true);
				console.log("day time",active_program,"running trials");
			}
			if (initial) {
				initial = false;
				callback();	
			}
		}
	}
}

function trial_loop(something) {
	if (state.running == true) {
		something(function(){trial_loop(something);});
	}
	else {
		setTimeout(function(){trial_loop(something);}, 60000);		
	}
}
function aplayer(what) {
	return {
		play: function(callback) {
				reqc.emit("msg", {
					req: "change-state",
					addr: "aplayer",
					data: {
						stimulus: what,
						playing: true
					}
				});
				pubc.on("msg",function (msg) {
						if (msg.event == "state-changed" && msg.data.playing == false) {
							pubc.removeListener("msg");
							if(callback) callback();
						}
					});
				}
		// TODO: more functions?
	}
}

function cue(which) {
	var togglestate;
	var timer;
	return {
		on: function (duration, callback) {
			write_led(which, true);
			if (duration) setTimeout(function () {
				cue(which).off();
				if (callback) callback();
			}, duration); // if
		}, // return
		off: function (duration, callback) {
			write_led(which, false);
			clearInterval(timer);
			if (duration) setTimeout(function () {
				cue(which).on();
				if (callback) callback();
			}, duration);
		},
		blink: function (duration, interval, callback) {
			var inter = interval ? interval : 100;
			timer = setInterval(toggle, inter);
			if (duration) setTimeout(function () {
				cue(which).off();
				if (callback) callback();
			}, duration);
		}
	};
	function toggle() {
		togglestate = togglestate ? false: true;
		write_led(which, togglestate);
	}
}

function hopper(which) { // TODO: change feed() to follow closure format
	return {
		feed: function(duration, callback) {
			write_feed(which, true);
			setTimeout(function () {
				write_feed(which, false);
				if (callback) callback();
			}, duration);
		}
	}
}

var use_clock;
function lights() {
	var which = "house_lights";
	return {
		man_set: function (brightness, callback) {
			if (use_clock) {
				console.log("Error: clock mode must be off to set brightness manually");
				return;
			}
			write_led(which, brightness);
			if (callback) callback();
		},
		clock_set: function (callback) {
			reqc.emit("msg", {
				req: "change-state",
				addr: "house_lights",
				data: {
					clock_on: true
				}
			});
			use_clock = true;
			if (callback) callback();
		},
		clock_set_off: function (callback) {
			reqc.emit("msg", {
				req: "change-state",
				addr: "house_lights",
				data: {
					clock_on: false
				}
			});
			if(callback) callback();		
		},
		on: function (duration, callback) {
			if (use_clock) {
				console.log("Error: clock mode must be off to set brightness manually");
				return;
			}
			write_led(which, 255);
			if (duration) setTimeout(function () {
				lights().off();	
				if (callback) callback();
			}, duration);
		},
		off: function (duration, callback) {
			lights().clock_set_off(function() {
				write_led(which, 0);
			});	
			if (duration) setTimeout(function () {
				if (use_clock) lights().clock_set();
				else lights().on()
				if (callback) callback();
			}, duration);
		}
	};
}

function keys(target) {
	var response = {response: "none"};
	var correct;
	var timer;
	return {
		response_window: function (duration, callback) {
			timer = setInterval(function(){pubc.removeListener("msg");clearInterval(timer); report();}, duration);
			pubc.on("msg", function (msg) {
				if (msg.event == "state-changed" && msg.addr == "keys") {
					pubc.removeListener("msg");
					clearInterval(timer);
					var rep = Object.keys(msg.data);
					response = {
						time: msg.time, response: rep[0]
					};
					if (target == "none" || !msg.data[target]) correct = false;
					else if (msg.data[target]) correct = true;
					report();
				}
			});
			function report() {
				if (response.response != "none") {
					if (target == "none") correct = false;
				} else {
					if (target == "none") correct = true;
					else correct = false;
					var now = Date.now();
					response = {
						time: now, response: "none"
					}
				}
				response.correct = correct;
				if (callback) callback(response);
			}
		},
		wait_for: function (repeat, callback) {
			pubc.on("msg", function (msg) {
				if (msg.event == "state-changed" && msg.data[target]) {
					if (repeat == false) pubc.removeListener("msg");
					var rep = Object.keys(msg.data);
					var data = {
						time: msg.time, response: rep[0], target: target
					};
					if (callback) callback(data);
				}
			});
		}
	};
}
function write_led(which, state) {
	reqc.emit("msg", {
		req: "change-state",
		addr: which == "house_lights" ? which : "cue_" + which,
		data: {
			brightness: state
		}
	});
}

function write_feed(which, state) {
	reqc.emit("msg", {
		req: "change-state",
		addr: "feeder_" + which,
		data: {
			feeding: state
		}
	});
}

function state_update(key, new_state) {
	state[key] = new_state;
	var msg = {
		event: "state-changed",
		addr: active_program,
		time: Date.now(),
		data: {}
	}
	msg.data[key] = new_state;
	pub(msg);
}

function pub(msg) {
	pubc.emit("msg", msg);
}

reqc.on("msg",function(msg, rep) {
	var ret;
	if (msg.req == "change-state") {
		for (key in msg.data) {
			state[key] = msg.data[key];
			}
			ret = msg.data;
			state_update(key, msg.data[key]);
		}
	else if (msg.req == "get-state") ret = state;
	else if (msg.req == "get-meta") ret = meta;
	else if (msg.req == "get-params") ret = params;
	if (rep) rep(ret);
});

module.exports = {
	initialize: initialize,
	trial_loop: trial_loop,
	aplayer: aplayer,
	cue: cue,
	hopper: hopper,
	lights: lights,
	keys: keys,
	state_update: state_update,
	run_by_clock: run_by_clock,
};
