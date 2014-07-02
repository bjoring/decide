// toolkit.js
nterval ? interval : 100;
var io = require('socke        ent');

var pub = io.connect("http://localhost:8000/PUB");
var req = io.connect("http://localhost:8000/REQ");

// playground
        lights().clock_set_off();
//

function cue(which) {
        var togglestate;
        return {
                on: function(duration) {
                        write_led(which, true);
                        if (duration) setTimeout(function(){cue(which).off();}, duration);
                },
                off: function(duration) {
                        write_led(which, false);
                        if (duration) setTimeout(function(){cue(which).on();}, duration);
                },
                blink: function(duration, interval) {
                        var inter = interval ? interval : 100;
                        var timer = setInterval(toggle, inter);
                        if (duration) setTimeout(function(){cue(which).off(); clearInterval(timer);}, duration);
                }               
        };
        function toggle() {
                togglestate = togglestate ? false : true;
                write_led(which, togglestate);
        }
}

function feed(which, duration){
        write_feed(which, true);
        setTimeout(function(){write_feed(which, false);},duration);
}
 
function lights() {
        var which = "house_lights";
        return {
                        var inter = interval ? interval : 100;
                man_set: function(brightness) {
                        write_led(which, brightness);
                },
                clock_set: function(){
                         req.emit("msg", {
                                req: "change-state",
                                addr: "house_lights",
                                data: { clock_on: true }
                         });
                },
		clock_set_off: function() {
			req.emit("msg", {
				req: "change-state",
				addr: "houselights",
				data: {clock_on: false}
			});
		},
                on: function(duration) {
                        write_led(which, 255);
                        if (duration) setTimeout(function(){lights.off();}, duration);
                },
                off: function(duration) {
                        write_led(which, 0);
                        if (duration) setTimeout(function(){lights.off();}, duration);
                }
        };
}
function wait_for_peck(callback){}
function peck_respnsewindow() {} // again, maybe just use a closure?


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
