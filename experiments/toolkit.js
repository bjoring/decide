// toolkit.js
var io = require('socket.io-client');
var pub = io.connect("http://localhost:8000/PUB");
var req = io.connect("http://localhost:8000/REQ");
var async = require('async');

// TODO:
// 	1. State implimentation
//  2. Pub such
//  3. Better 

var state = {
	running: false,
	phase: null
}

var meta = {
	type: "experiment",
	dir: "input",
	variables: {
		running: [true,false],
		phase: null // depends upon experiment
	}
}

function initialize(name, object) {
	state.program = name;
	state.running = true;
	req.emit("route", "experiment", console.log);	
}

function trial_loop(something) {
	if (state.running == true) {
		something(function(){trial_loop(something);});
	}
	else {
		setTimeout(function(){trial_loop(something);}, 10000);		
	}
}
function aplayer(what) {
	return {
		play: function(callback) {
				req.emit("msg", {
					req: "change-state",
					addr: "aplayer",
					data: {
						stimulus: what,
						playing: true
					}
				});
				pub.on("msg",function (msg) {
						if (msg.event == "state-changed" && msg.data.playing == false) {
							pub.removeListener("msg");
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
			timer = setInterval(toggle, interval);
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

function feed(which, duration, callback) { gt// TODO: change feed() to follow closure format
	write_feed(which, true);
	setTimeout(function () {
		write_feed(which, false);
		if (callback) callback();
	}, duration);
}

function lights() {
	var which = "house_lights";
	return {
		man_set: function (brightness, callback) {
			write_led(which, brightness);	
			if (callback) callback();
		},
		clock_set: function (callback) {
			req.emit("msg", {
				req: "change-state",
				addr: "house_lights",
				data: {
					clock_on: true
				}
			});
			if (callback) callback();
		},
		clock_set_off: function (callback) {
			req.emit("msg", {
				req: "change-state",
				addr: "houselights",
				data: {
					clock_on: false
				}
			});
			if(callback) callback();		
		},
		on: function (duration, callback) {
			write_led(which, 255);
			if (duration) setTimeout(function () {
				lights().off();	
				if (callback) callback();
			}, duration);
		},
		off: function (duration, callback) {
			write_led(which, 0);
			if (duration) setTimeout(function () {
				lights().on();
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
			timer = setInterval(function(){pub.removeListener("msg");clearInterval(timer); report();}, duration);
			pub.on("msg", function (msg) {
				if (msg.event == "state-changed" && msg.addr == "keys") {
					pub.removeListener("msg");
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
			pub.on("msg", function (msg) {
				if (msg.event == "state-changed" && msg.data[target]) {
					if (repeat == false) pub.removeListener("msg");
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
	req.emit("msg", {
		req: "change-state",
		addr: which == "house_lights" ? which : "cue_" + which,
		data: {
			brightness: state
		}
	});
}

function write_feed(which, state) {
	req.emit("msg", {
		req: "change-state",
		addr: "feeder_" + which,
		data: {
			feeding: state
		}
	});
}

req.on("msg",function(msg, rep) {
	var ret;
	if (msg.req == "change-state") {
		for (key in msg.data) {
			state[key] = msg.data[key];
			}
		ret = msg.data
		}
	else if (msg.req == "get-state") ret = state;
	else if (msg.req == "get-meta") ret = meta;
	else if (msg.req == "get-params") ret = params;
	if (rep) rep(null, ret);
	// TODO: state changes broadcast on pub
});

module.exports = {
	initialize: initialize,
	trial_loop: trial_loop,
	aplayer: aplayer,
	cue: cue,
	feed: feed,
	lights: lights,
	keys: keys,
};