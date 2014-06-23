/* 
gngclient.js 
	This script starts a "go-nogo" operant conditioning
	paradigm. All interaction with Starboard is handled
	through apparatus.js.

	To run the script:
		node gngclient.js
	
	Procedure:
	 1. wait for center key peck, 
	 2. play random stimulus,
	 3. wait for center key peck.  
	 4. reward/punish accordingly: 
		 	only GO responses are consequated:
		 	correct hits are rewarded with food access; 
		 	false positives are punished with lights out.  
	 5. if response was correct, a new stimulus is presented. 
	 
	 Session ends when the lights go out for the day.
*/

// Import required packages
var io = require('socket.io-client');
var winston = require('winston'); // logger
var alsa = require("./alsa"); // sound driver

// Set default for variables that may be set with command line arguments
var response_time = 2000; // how long the bird is given to respond to simulus
var device = "plughw:1,0"; // the sound card
var stimuli_database = require("./gngstimuli"); // JSON containing simuli information
var port = 8000; // port through which o connect to apparatus.js
var gng_logfile = "gng.log";

// Parse command line arguments
process.argv.forEach(function(val, index, array) {
    if (val == "-b") block = array[index+1];
    else if (val == "-s") stimuli_database = require([index+1]);
    else if (val == "-l") gng_logfile = array[index+1];
    else if (val == "-d") device = array[index+1];
    else if (val == "-r") response_time = array[index+1];
    else if (val == "-p") port = array[index+1];
    else if (val == "-t") targetpeck == array[index+1];
});

// Initialize global variables
var trialcount = 0; // counts the number of trials
var pecked = 0; // flag for whether the bird peck
var stimset = {}; // a dictionary of stimuli that will be used
var stim = {}; // the active stimulus
var timer; // timeout for response
var waiting; // give what apparatus is waiting for
var rand; // random number that will be used to pick stimuli from stimset
var response; // the bird's actual respons
var targetpeck; // the peck gngclient is looking for

// Creating the dictionary of stimuli
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

// Connecting to apparatus.js
var socket = io.connect('http://localhost:'+port);

logger.info("Waiting for connection...",{timestamp: timeStamp()});
socket.on('connect', function(socket) {
	logger.info('Connected!',{timestamp: timeStamp()});
	startUp();
});

// hacks to make the outputs work
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


// Handling Starboard pecks
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

// Creates the stimuli set according to the frequency of each stimulus
function createStimSet(bank) {
	var i = 0;
	for (stimulus in bank) {
		var f = bank[stimulus].freq;
		for (var j = 0; j < f; j++) {
			stimset[i] = bank[stimulus];
			i++;
		} // for
	} // for
} // createStimSet

// Prepare to run trial and then wait on bird to begin
function trialPrep(setstim) {
	
	// prepare global variables for new trial
	response = "none";
	pecked = 0;
	trialcount += 1;

	// decide which stimulus to play and the correct response
	rand = Math.random();
	if (!setstim) stim = stimSelect(rand);

	// wait for center peck
	targetpeck = "cp";
	waiting = "to_begin";
	logger.info('Stimulus selected. Wating for bird to begin trial ' + trialcount,{trial:trialcount, stimulus: stim.sound, stimulustype: stim.type, timestamp: timeStamp()});
} // trialPrep

// Randomly selecting which stimulus to play
function stimSelect() {
	var length = Object.keys(stimset).length-1;
	select = Math.round(rand*length);
	return stimset[select];
} // stimSelect


// Running the actual trial
function trial(){
	hl.on(205);
	logger.info('Beginning Trial ' + trialcount,{trial:trialcount, stimulus: stim.sound, stimulustype: stim.type, timestamp: timeStamp()});
	alsa.play_sound(stim.sound, device, function(err, data){
		if (data.playing == 0) {
			targetpeck = stim.type == "go" ? "cp" : "none";
			logger.info("Waiting for response", {trial:trialcount, stimulus: stim.sound, stimulustype: stim.type, timestamp: timeStamp()});
			if (pecked) responseCheck(); // if the bird pecked before the song finished, go ahead and check the response
			else timer = setTimeout(responseCheck, response_time); // else give the bird a set number of seconds to respond
		} // if
	}); // alsa.play
	waiting = "for_response";
} // trial

// Checking to see if the bird responded correctly
function responseCheck() {
	if (response != targetpeck) {
		if (response == "none") {
			logger.info("Incorrect response: False negative"), {trial:trialcount, stimulus: stim.sound, stimulustype: stim.type, timestamp: timeStamp()};
			logger.info("Beginning correction trial", {trial:trialcount, stimulus: stim.sound, stimulustype: stim.type, timestamp: timeStamp()});
			trialPrep(stim);
		} else {
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

/* APPARATUS REQUESTS*/
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

function blinkLEDS(led, rate, duration) {
	socket.emit("ledRequest", led, "blink", [rate, duration]);
} // blink LEDS

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
	trialPrep()
} // startUp

// quick timestamp function
function timeStamp(time) {
	var unixstamp;

	if (time) unixstamp = time;
	else unixstamp = Date.now();

	var utcstamp = new Date(unixstamp);

	return utcstamp.toJSON();

} // timeStamp