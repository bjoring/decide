// Test server
var io = require('socket.io-client');
var socket = io.connect('http://localhost:8000');
var winston = require('winston');
var alsa = require("./alsa")

// set default number for command line argument variables
var block = 1;
var trials = 5;
var stim = {};
var stim_time = 2000;
var timer;
var waiting;
var correct
var response;
var rand;
var gng_logfile = "gng.log";

var go = {sound: "./musicbox.wav", go:1};
var nogo = {sound: "./musicbox_broken.wav", go: 0};
var device1 = "plughw:1,0";

// print process.argv
process.argv.forEach(function(val, index, array) {
    if (val == "-b") block = array[index+1];
    else if (val == "-t") trials = array[index+1];
    else if (val == "-l") gng_logfile = array[index+1];
});

// Logger setup
var logger = new(winston.Logger)({
	transports: [
	new(winston.transports.File)({
		filename: gng_logfile,
		json: true,
		timestamp: false
	}), // new
	new(winston.transports.Console)()]
}); // logger

logger.on("logging", function(transport, level, msg, meta) {
	if (transport.name == "console") socket.emit('shapeLog', msg, meta);
});


logger.info("Waiting for connection...",{timestamp: timeStamp()});
socket.on('connect', function(socket) {
	logger.info('Connected!',{timestamp: timeStamp()});
	trialPrep();
});

// Trial counters
var  trialcount = 0;


// hacks to make the inputs work
var leds = {};
leds.ccr = new LED("ccr");
leds.ccg = new LED("ccg");
leds.ccb = new LED("ccb");

leds.rcr = new LED("rcr");
leds.rcg = new LED("rcg");
leds.rcb = new LED("rcb");

leds.lcr = new LED("lcr");
leds.lcg = new LED("lcg");
leds.lcb = new LED("lcb");
hl = new houseLights("hl");

var feeders = {};
feeders.rf = new Feeder("rf");
feeders.lf = new Feeder("lf");

var targetpeck;

socket.on("simulatedPeck", function(peck) {
	if (peck.state == 0) {
		logger.info(peck.name, "detected",{timestamp: timeStamp()});
		if (waiting  == "to_begin" && targetpeck == peck.key) {
			waiting = null;
			trial();
		} else if (waiting == "for_response") {
			clearInterval(timer);
			response = peck.key;
		} // if
	} //  if
}); // socket.on

function stimSelect(rand) {
	return rand > 0.5 ? go : nogo;
}

function trialPrep(setstim) {
trialcount += 1;
	// decide which stimulus to play and the correct response
	rand = Math.random();
	if (!setstim) stim = stimSelect(rand);

	// wait for center peck
	logger.info('Stimulus selected. Wating for bird to begin trial ' + trialcount,{trial:trialcount, stimulus: stim, stimulustype: stim.type, timestamp: timeStamp()});
	
	waiting = "to_begin";
	targetpeck = "cp";
	response = "none";
} // trialPrep

function trial(){
	hl.on(205);
	logger.info('Beginning Trial ' + trialcount,{trial:trialcount, stimulus: stim, stimulustype: stim.type, timestamp: timeStamp()});
	alsa.play_sound(stim.sound, device1, function(err, data){
		if (data.playing == 0) {
			targetpeck = stim.go ? "cp" : "none";
			logger.info("Waiting for response", {trial:trialcount, stimulus: stim, stimulustype: stim.type, timestamp: timeStamp()});
			timer = setTimeout(responseCheck, 2000);
		} // if
	waiting = "for_response";
	}); // alsa.play
} // trial

function responseCheck() {
	if (response != targetpeck) {
		if (response == "none") {
			logger.info("Incorrect response: False negative"), {trial:trialcount, stimulus: stim, stimulustype: stim.type, timestamp: timeStamp()};
			trialPrep(stim);
		} // if
		else {
			logger.info("Incorrect response: False positive", {trial:trialcount, stimulus: stim, stimulustype: stim.type, timestamp: timeStamp()});
			hl.off();
			logger.info("Punishing with lights out for 5 secods.", {trial:trialcount, stimulus: stim, stimulustype: stim.type, timestamp: timeStamp()});
			setTimeout(function(){
				hl.on(205); 
				logger.info("Beginning correction trial", {trial:trialcount, stimulus: stim, stimulustype: stim.type, timestamp: timeStamp()}); 
				trialPrep(stim);
			} ,5000); // setTimeout
		} // else
		
	} else {
		if (targetpeck != "none") {
			logger.info("Correct response: True positive",{trial:trialcount, stimulus: stim, stimulustype: stim.type, timestamp: timeStamp()});
			feeders.lf.raise();
			setTimeout(feeders.lf.lower, 3000);
		} else(logger.info("Correct response: True negative"));
		trialPrep();
	} // if
} // responseCheck

function blinkLEDS(led, rate, duration) {
	socket.emit("ledRequest", led, "blink", [rate, duration]);
}

// led object
function LED(object) {
	return {
		on: function() {
			socket.emit("ledRequest", object, "on");
		}, // on
		off: function() {
			socket.emit("ledRequest", object, "off");
		}, // off
		toggle: function() {
			socket.emit("ledRequest", object, "blink");
		}, // toggle
		stopBlink: function() {
			socket.emit("ledRequest", object, "stopBlink");
		} // stopBlink
	}; // return
} // LED

// house lights object
function houseLights(object) {
  return {
    on: function(brightness) {
        socket.emit("houseRequest", object, "on", brightness);
    }, // on
    off: function() {
        socket.emit("houseRequest", object, "off");
    }, // off
  }; // return
} // houseLights

// feeder object
function Feeder(object) {
	return {
		raise: function() {
			socket.emit("feedRequest", object, "raise");
		}, // raise
		lower: function() {
			socket.emit("feedRequest", object, "lower");
		} // lower
	}; // return
} // Feeder

function startUp() {
	console.log("\u001B[2J\u001B[0;0f");
	logger.info("-----------------------Starport Go-NoGo Prototype-----------------------");
	blockSelect();
} // startUp

function blockSelect() {
		if (block) {
    		if (block < 1 || block > 4) {
    			console.log("Invalid response. There is no block " + answer + ".");
    		}
    		if (block == 1) {
    			return block1();
    		}
    		if (block == 2) {
    			return block2();
    		}
    		if (block == 3) {
    			return block3();
    		}
    		if (answer == 4) {
    			return block4();
    		}
		} // if(block)
} // blockSelect

// quick timestamp function
function timeStamp(time) {
	var unixstamp;

	if (time) unixstamp = time;
	else unixstamp = Date.now();

	var utcstamp = new Date(unixstamp);

	return utcstamp.toJSON();

} // timeStamp