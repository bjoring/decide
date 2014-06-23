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
var pecked = 0;
var rand;
var gng_logfile = "gng.log";

var device = "plughw:1,0";
var stimuli_database = require("./gngstimuli");
var stimset = {};

// print process.argv
process.argv.forEach(function(val, index, array) {
    if (val == "-b") block = array[index+1];
    else if (val == "-t") trials = array[index+1];
    else if (val == "-l") gng_logfile = array[index+1];
    else if (val == "-d") device = array[index+1];
});

createStimSet(stimuli_database);

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
		logger.info(peck.name, "detected",{trial:trialcount, stimulus: stim.sound, stimulustype: stim.type, timestamp: timeStamp()});
		if (waiting  == "to_begin" && targetpeck == peck.key) {
			waiting = null;
			trial();
		} else if (waiting == "for_response") {
			clearInterval(timer);
			response = peck.key;
			pecked = 1;
		} // if
	} //  if
}); // socket.on

function createStimSet(bank) {
	var i = 0;
	for (stimulus in bank) {
		var f = bank[stimulus].freq;
		for (var j = 0; j < f; j++) {
			stimset[i] = bank[stimulus];
			i++;
		}
	}
	console.log(stimset);
}

function stimSelect() {
	var length = Object.keys(stimset).length-1;
	select = Math.round(rand*length);
	console.log(select);
	console.log(stimset[select]);
	return stimset[select];
}

function trialPrep(setstim) {
trialcount += 1;
	// decide which stimulus to play and the correct response
	rand = Math.random();
	if (!setstim) stim = stimSelect(rand);

	// wait for center peck
	logger.info('Stimulus selected. Wating for bird to begin trial ' + trialcount,{trial:trialcount, stimulus: stim.sound, stimulustype: stim.type, timestamp: timeStamp()});
	
	waiting = "to_begin";
	targetpeck = "cp";
	response = "none";
	pecked = 0;
} // trialPrep

function trial(){
	hl.on(205);
	logger.info('Beginning Trial ' + trialcount,{trial:trialcount, stimulus: stim.sound, stimulustype: stim.type, timestamp: timeStamp()});
	alsa.play_sound(stim.sound, device, function(err, data){
		if (data.playing == 0) {
			targetpeck = stim.type == "go" ? "cp" : "none";
			logger.info("Waiting for response", {trial:trialcount, stimulus: stim.sound, stimulustype: stim.type, timestamp: timeStamp()});
			if (pecked) responseCheck();
			else timer = setTimeout(responseCheck, 2000);
		} // if
	}); // alsa.play
	waiting = "for_response";
} // trial

function responseCheck() {
	if (response != targetpeck) {
		if (response == "none") {
			logger.info("Incorrect response: False negative"), {trial:trialcount, stimulus: stim.sound, stimulustype: stim.type, timestamp: timeStamp()};
			trialPrep(stim);
		} // if
		else {
			logger.info("Incorrect response: False positive", {trial:trialcount, stimulus: stim.sound, stimulustype: stim.type, timestamp: timeStamp()});
			hl.off();
			logger.info("Punishing with lights out for 5 secods.", {trial:trialcount, stimulus: stim.sound, stimulustype: stim.type, timestamp: timeStamp()});
			setTimeout(function(){
				hl.on(205); 
				logger.info("Beginning correction trial", {trial:trialcount, stimulus: stim.sound, stimulustype: stim.type, timestamp: timeStamp()}); 
				trialPrep(stim);
			} ,5000); // setTimeout
		} // else
		
	} else {
		if (targetpeck != "none") {
			logger.info("Correct response: True positive",{trial:trialcount, stimulus: stim.sound, stimulustype: stim.type, timestamp: timeStamp()});
			logger.info("Feeding bird for 3 seconds",{trial:trialcount, stimulus: stim.sound, stimulustype: stim.type, timestamp: timeStamp()});
			feeders.lf.raise();
			setTimeout(function(){
				feeders.lf.lower();
				trialPrep();
				}, 3000); // setTimeout
		} else {
			logger.info("Correct response: True negative",{trial:trialcount, stimulus: stim.sound, stimulustype: stim.type, timestamp: timeStamp()});
			trialPrep();
		} // else
	} // else
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