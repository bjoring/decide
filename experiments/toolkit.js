// toolkit.js
var io = require('socket.io-client');
var pub = io.connect("http://localhost:8000/PUB");
var req = io.connect("http://localhost:8000/REQ");

sound("/root/LabFiles/decide/lib/musicbox.wav");

function play_sound(what) { //TODO: more sound functionality?
	req.emit("msg", {
		req: "change-state",
                addr: "aplayer",
                data: { stimulus: what,
			playing: true }
        });
}


function cue(which, callback) {
        var togglestate;
	var timer;
        return {
                on: function(duration, callback) {
                        write_led(which, true);
                        if (duration) setTimeout(function(){cue(which).off();}, duration);
                	callback();
		},
                off: function(duration, callback) {
                        write_led(which, false);
			clearInterval(timer);
                        if (duration) setTimeout(function(){cue(which).on();}, duration);
                	callback();
		},
                blink: function(duration, interval) {
                        var inter = interval ? interval : 100;
                        timer = setInterval(toggle, inter);
                        if (duration) setTimeout(function(){cue(which).off();}, duration);
                	callback();
		}               
        };
        function toggle() {
                togglestate = togglestate ? false : true;
                write_led(which, togglestate);
        }
}

function feed(which, duration, callback){
        write_feed(which, true);
        setTimeout(function(){write_feed(which, false);},duration);
	callback();
}
 
function lights(callback) {
        var which = "house_lights";
        return {
                man_set: function(brightness) {
                        write_led(which, brightness);
                	callback();
		},
                clock_set: function(){
                         req.emit("msg", {
                                req: "change-state",
                                addr: "house_lights",
                                data: { clock_on: true }
                         });
			if(callback) callback();
                },
		clock_set_off: function() {
			req.emit("msg", {
				req: "change-state",
				addr: "houselights",
				data: {clock_on: false}
			});
			callback();
		},
                on: function(duration) {
                        write_led(which, 255);
                        if (duration) setTimeout(function(){lights.off();}, duration);
                	callback();
		},
                off: function(duration) {
                        write_led(which, 0);
                        if (duration) setTimeout(function(){lights.on();}, duration);
                	callback();
		}
        };
}



function keys() {	
	var response;
	var correct;
	var timer;
	return {
		response_window:function (target, duration, callback) {
			timer = setInterval(report, duration);
			pub.on("msg", function(msg) {
				if (msg.event == "state-changed" && msg.addr == "keys") {
					pub.removeListener("msg");
					clearInterval(timer);
					var rep = Object.keys(msg.data);
					response = {time: msg.time, response: rep[0]};
 					if (target == "none" || target ==  null || !msg.data[target]) correct = false;
					else if (msg.data[target]) correct = true;
					report();
				}
			});	
			function report() {
				if (response) {
					if(target == "none" || target == null) correct = false;
				} else {
					if (target == "none" || target == null) correct = true;
					else { 
						correct = false;
						var now = Date.now();
						response ={time: now, response: null} 
					}
				} 
				response.correct = correct;
				return callback(response);
			}
		},
		wait_for: function(target, repeat, callback){
			pub.on("msg", function(msg) {
				if (msg.event == "state-changed" && msg.data[target]) {
					if (repeat == false) pub.removeListener("msg");
					var rep = Object.keys(msg.data);
					var data = {time: msg.time, response: rep[0], target: target};
					callback(data);
					}
				});
		}
	};
}
function write_led(which, state) {	
	req.emit("msg", {
               	req: "change-state",
               	addr: which == "house_lights" ? which : "cue_"+which,
               	data: { brightness: state }
	});
}

function write_feed(which, state) {
        req.emit("msg", {
                req: "change-state",
                addr: "feeder_"+which,
                data: { feeding: state}
        });
}
module.exports = {
	cue: cue,
	feed: feed,
	lights: lights,
	keys: keys	
};
