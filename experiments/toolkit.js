// toolkit.js
var io = require('socket.io-client');
var pubc = io.connect("http://localhost:8000/PUB");
var reqc = io.connect("http://localhost:8000/REQ");

/* TODO:
 		Add an exit()/disconnect funciton
        More user friendly looping/clock running
		Initialize allows custom state spaces
		On connect
*/

/* Toolkit Variables */
var active_program;				// name of program using toolkit
var use_clock;					// flag for whether lights are set by clock
var blink_timers = {};			// array of timers, allowing more than one blinking LED

/* State Machine Setup*/
var state = {
	running: false,				// flag for whether the program is running trials
	phase: "idle"				// present phase of the program, state-space defined by meta.variables.phase

	// More complex state machine may be implemented later
}


var meta = {
	type: "experiment",
	dir: "input",
	variables: {
		running: [true,false],
		phase: ["rewarding","punishing","wating-for-response", "evaluating-response","presenting-stimulus","inter-trial"]
	}
}

/* Trial Management Functions */
function initialize(name, callback) {	// routes program <name> to apparatus and registers it in experiment
	setTimeout(function() {
		active_program = name;
		if (!use_clock) state.running = true;
		reqc.emit("route", active_program, function(x) {
			console.log(x);
			reqc.emit("msg", {
				req: "change-state",
				addr: "experiment",
				data: {
					program: active_program
				}
			});
			callback();
		});
	}, 1000); //one second delay magically avoids issues with interface updating
}

function trial_loop(trial) {		// runs trial in a loop	if state.running is true, otherwise checks state.running every 65 seconds
	if (state.running == true) {
		trial( function() {
			setTimeout(function() {trial_loop(trial);},2000);
		    });
	}
	else {
		setTimeout(function() {
			trial_loop(trial);
		}, 65000);
	}
}

function run_by_clock(callback) {	// sets state.running according to sun's altitude every minute
	var initial = true;
	request_lights_state();
	setInterval(request_lights_state, 61000);
	function request_lights_state() {
		reqc.emit("msg", {req: "get-state", addr: "house_lights"}, check_state);
	}
	function check_state(result, data) {
		if (result != "req-ok") console.log(result);
		if (data.sun_altitude > Math.PI || data.sun_altitude < 0.1) {
			state_update("running", false);
			pubc.emit("msg", {addr: active_program, event: "log", level:"info", reason: "night time, "+active_program+" sleeping"});
		}
		else {
			if (state.running == false) {
				state_update("running", true);
				pubc.emit("msg", {addr: active_program, event: "log", level:"info", reason:"day time, "+active_program+"running trials"});
			}
			if (initial) {
				initial = false;
				callback();
			}
		}
	}
}

/* Apparatus Manipulation Functions */
// These functions send REQ msgs to apparatus to manipulate component states.
// All follow this format: component("specific_component").action(args),
// with all "args" optional

function cue(which) { 				// manipulates cues (LEDS) of the apparatus
	var togglestate;
	return {
		on: function (duration, callback) {
			write_led(which, true);
			if (duration) setTimeout(function () {
				cue(which).off();
				if (callback) callback();
			}, duration);
		},
		off: function (duration, callback) {
			clearInterval(blink_timers[which]);
			if (duration) setTimeout(function () {
				cue(which).on();
				if (callback) callback();
			}, duration);
			write_led(which, false, null, null);
		},
		blink: function (duration, interval, callback) {
		 	var inter = interval ? interval : 300;
			write_led(which, true, "timer", inter);
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

function hopper(which) { 			// manipulates hoppers (feeders)
	return {
		feed: function(duration, callback) {
			write_feed(which, true, duration);
			var next = duration + 1000;
			setTimeout(function () {
				if (callback) callback();
			}, next);
		}
	}
}

function lights() {					// manipulates house lights, supports setting brightness both manually and by clock
	var which = "house_lights";
	return {
		man_set: function (brightness, callback) {
			if (use_clock) {
				pubc.emit("msg", {addr: active_program, event: "log", level:"error", reason:"clock mode must be off to set brightness manually"});
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
				pubc.emit("msg", {addr: active_program, event: "log", level:"error", reason:"Error: clock mode must be off to set brightness manually"});
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

function keys(target) {				// checks for responses from apparatus keys
	var response = {response: "none"};
	var correct;
	var timer;
	return {
		response_window: function (duration, callback) {
			timer = setInterval(function(){
				pubc.removeListener("msg");
				clearInterval(timer);
				report();
			}, duration);
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

function aplayer(what) {			// play sounds using alsa
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

function state_update(key, new_state) {	// updates states of <active_program>
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

function log_data(indata, callback) {
	pubc.emit("msg", {
		addr: active_program,
		event: "trial-data",
		time: Date.now(),
		data: indata
	});
	callback();
}

function log_info(indata, callback) {
	pubc.emit("msg", {
		addr: active_program,
		event: "log",
		level:"info",
		reason: indata
	});
	if (callback) callback();
}
/* Not-Exported Functions */
function write_led(which, state, trigger, period) {
	reqc.emit("msg", {
		req: "change-state",
		addr: which == "house_lights" ? which : "cue_" + which,
		data: {
			brightness: state,
			trigger: trigger ? trigger : null,
			period: period ? period : null
		}
	});
}

function write_feed(which, state, duration) {
	reqc.emit("msg", {
		req: "change-state",
		addr: "feeder_" + which,
		data: {
			feeding: state,
			interval: duration
		}
});
}

function pub(msg) {
	pubc.emit("msg", msg);
}

/* Handling REQ Such */
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

reqc.on("disconnect", function(){
	state.running = false;
})


/* Module-izing */
module.exports = {
	initialize: initialize,
	trial_loop: trial_loop,
	run_by_clock: run_by_clock,
	cue: cue,
	lights: lights,
	hopper: hopper,
	keys: keys,
	aplayer: aplayer,
	state_update: state_update,
	log_data: log_data,
	log_info: log_info
};
