/* 
gngclient.js 
	This script starts a "go-nogo" experiment. All interaction
	with Starboard is handled through apparatus.js.

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

/*
	TODO:
		Handle disconnects
		Add -h
		Error checkers
*/

// Import required packages
var io = require('socket.io-client');
var winston = require('winston'); // logger
var alsa = require("./alsa"); // sound driver

// Set default for variables that may be set with command line arguments
var response_time = 2000; // how long the bird is given to respond to simulus
var device = "plughw:1,0"; // the sound card
var stimuli_database = require("./gngstimuli"); // JSON containing simuli information
var port = 8000; // port through which to connect to apparatus.js
var simulatesun = 1; // flag for adjusting lights and running experiments according to sun's positon
var feed_duration = 3000; // how long to feed the bird (ms)
var activefeed = "lf"; // the feeder used to reward the birds
var activepeck = "cp"; // the beambreak expected to receive bird pecks
var lightsout_duration = 5000; // how long to punish the bird with ligths out (ms)
var ignore_early = 0; // flag for whether to ignore pecks before the stimulus has finished playing
var max_corrections = 5; // number of correction trials to run before moving on
var logname = "gnglog"; // name for the log file
var box = 0;
var subject = 0;

// Parse command line arguments
process.argv.forEach(function(val, index, array) {
	if (val == "-B") box = array[index + 1];
	else if (val == "-S") subject = array[index+1];
	else if (val == "-s") stimuli_database = require([index + 1]);
	else if (val == "-l") logname = array[index + 1];
	else if (val == "-d") device = array[index + 1];
	else if (val == "-r") response_time = array[index + 1];
	else if (val == "-p") port = array[index + 1];
	else if (val == "-t") targetpeck = array[index + 1];
	else if (val == "-S") simulatesun = array[index + 1];
	else if (val == "-f") feed_duration = array[index + 1];
	else if (val == "-F") activefeed = array[index + 1];
	else if (val == "-o") lightsout_duration = array[index + 1];
	else if (val == "-P") activepeck = array[index+1];
	else if (val == "-i") ignore_early = array[index+1];
	else if (val == "-m") max_corrections = array [index+1];
});

// Initialize global variables
var paradigm = "gng";
var suncheck = 60000; // how often to check the sun's position (ms)
var trialcount = 0; // counts the number of trials
var corrections = 0; // number of correction trials run
var pecked = 0; // flag for whether the bird pecked
var stimset = {}; // a dictionary of stimuli that will be used
var stim = {}; // the active stimulus
var leds = {};
var feeders = {};
var hl;

// Declare other global variables
var timer; // timeout for response
var waiting; // give what apparatus is waiting for
var rand; // random number that will be used to pick stimuli from stimset
var response; // the bird's actual respons
var targetpeck; // the peck gngclient is looking for
var daytime; // flag for whether it is day 

// Set the logger
var gng_logfile = logname+"_"+box+"_"+subject+".json";
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
var socket = io.connect('http://localhost:' + port);
logger.info("Waiting for connection...", {
	box: box,
	subject: subject,
	timestamp: timeStamp()
}); // logger.info

socket.on('connect', function(socket) {
	logger.info('Connected!', {
		box: box,
		subject: subject,
		timestamp: timeStamp()
	}); // logger.info
}); // socket.on

/* SETUP */
// Getting starbord and creating the appropiate objects for interaction
socket.emit("sendstarboard");
socket.on("receivestarboard", function(data) {
	setup(data);
	startUp();
}); // socket.on

function setup(board) { // creates objects for controlling starboard outputs 
	createStimSet(stimuli_database); // Creating the dictionary of stimuli
	for (var key in board) { // creating the starboard objects
		if (board[key].type == "led") leds[key] = new LED(key);
		if (board[key].type == "feed") feeders[key] = new Feeder(key);
		if (board[key].type == "houselights") hl = new houseLights(key);
	} // for
} // setup

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
	if (daytime) {
		// prepare global variables for new trial
		response = "none";
		pecked = 0;
		trialcount += 1;

		// decide which stimulus to play and the correct response
		rand = Math.random();
		if (!setstim) stim = stimSelect(rand);

		// wait for center peck
		targetpeck = activepeck;
		waiting = "to_begin";
		logger.info('Stimulus selected. Wating for bird to begin trial ' + trialcount, {
			box: box,
			subject: subject,
			paradigm: paradigm,
			trial: trialcount,
			stimulus: stim.sound,
			stimulustype: stim.type,
			timestamp: timeStamp()
		});
	} // if
	else {
		logger.info('gngclient is sleeping for the night...');
	} // else
} //trialPrep

// Randomly selecting which stimulus to play
function stimSelect() {
	var length = Object.keys(stimset).length - 1;
	select = Math.round(rand * length);
	return stimset[select];
} // stimSelect


// Running the actual trial
function trial() {
	logger.info('Beginning Trial ' + trialcount, {
		box: box,
		subject: subject,
		paradigm: paradigm,
		trial: trialcount,
		stimulus: stim.sound,
		stimulustype: stim.type,
		timestamp: timeStamp()
	}); // logger.info
	alsa.play_sound(stim.sound, device, function(err, data) {
		if (data.playing == 0) {
			waiting = "for_response";
			targetpeck = stim.type == "go" ? activepeck : "none";
			logger.info("Waiting for response", {
				box: box,
				subject: subject,
				paradigm: paradigm,
				trial: trialcount,
				stimulus: stim.sound,
				stimulustype: stim.type,
				timestamp: timeStamp()
			});
			if (pecked) responseCheck(); // if the bird pecked before the song finished, go ahead and check the response
			else timer = setTimeout(responseCheck, response_time); // else give the bird a set number of seconds to respond
		} // if
	}); // alsa.play
	if (ignore_early == 0) waiting = "for_response";
} // trial

// Checking to see if the bird responded correctly
function responseCheck() {
	if (response != targetpeck) {
		if (response == "none") {
			logger.info("Incorrect response: False negative"), {
				box: box,
				subject: subject,
				paradigm: paradigm,
				trial: trialcount,
				stimulus: stim.sound,
				stimulustype: stim.type,
				response: response,
				correct: 0,
				timestamp: timeStamp()
			}; // logger.info
			if (corrections < max_corrections - 1) {
					logger.info("Beginning correction trial" + corrections, {
					box: box,
					subject: subject,
					paradigm: paradigm,
					trial: trialcount,
					correctiontrial: corrections,
					stimulus: stim.sound,
					stimulustype: stim.type,
					response: response,
					correct: 0,
					timestamp: timeStamp()
				}); // logger.info
				corrections++;
				trialPrep(stim);
			} // if
			else {
				logger.info("Max correction trials reached (" + max_corrections+") moving on to next stimulus", {
					box: box,
					subject: subject,
					paradigm: paradigm,
					trial: trialcount,
					stimulus: stim.sound,
					stimulustype: stim.type,
					response: response,
					correct: 0,
					timestamp: timeStamp()
				}); // logger.info
				corrections = 0;
				trialPrep();
			}
		} // if
		else {
			logger.info("Incorrect response: False positive", {
				box: box,
				subject: subject,
				paradigm: paradigm,
				trial: trialcount,
				stimulus: stim.sound,
				stimulustype: stim.type,
				response: response,
				correct: 0,
				timestamp: timeStamp()
			}); // else
			hl.off();
			logger.info("Punishing with lights out for", lightsout_duration / 1000, "seconds.", {
				box: box,
				subject: subject,
				paradigm: paradigm,
				trial: trialcount,
				stimulus: stim.sound,
				stimulustype: stim.type,
				response: response,
				correct: 0,
				timestamp: timeStamp()
			}); // logger.info
			setTimeout(function() {
				sunSimulator();
				if (corrections < max_corrections - 1) {
					logger.info("Beginning correction trial" + corrections, {
						box: box,
						subject: subject,
						paradigm: paradigm,
						trial: trialcount,
						correctiontrial: corrections,
						stimulus: stim.sound,
						stimulustype: stim.type,
						response: response,
						correct: 0,
						timestamp: timeStamp()
					}); // logger.info
					corrections++;
					trialPrep(stim);
				} // if
				else {
					logger.info("Max correction trials reached (" + max_corrections+") moving on to next stimulus", {
					box: box,
					subject: subject,
					paradigm: paradigm,
					trial: trialcount,
					stimulus: stim.sound,
					stimulustype: stim.type,
					response: response,
					correct: 0,
					timestamp: timeStamp()
				}); // logger.info
				corrections = 0;
				trialPrep();
				} // else
			}, lightsout_duration); // setTimeout
		} // else
	} // if
	else {
		if (targetpeck != "none") {
			logger.info("Correct response: True positive", {
				box: box,
				subject: subject,
				paradigm: paradigm,
				trial: trialcount,
				stimulus: stim.sound,
				stimulustype: stim.type,
				response: response,
				correct: 1,
				timestamp: timeStamp()
			}); // logger.info
			logger.info("Feeding bird for", feed_duration / 1000, "seconds", {
				box: box,
				subject: subject,
				paradigm: paradigm,
				trial: trialcount,
				stimulus: stim.sound,
				stimulustype: stim.type,
				response: response,
				correct: 1,
				timestamp: timeStamp()
			}); // logger.info
			feeders[activefeed].raise();
			setTimeout(function() {
				feeders.lf.lower();
				trialPrep();
			}, feed_duration); // setTimeout
		} // if
		else {
			logger.info("Correct response: True negative", {
				box: box,
				subject: subject,
				paradigm: paradigm,
				trial: trialcount,
				stimulus: stim.sound,
				stimulustype: stim.type,
				response: response,
				correct: 1,
				timestamp: timeStamp()
			}); // logger.info
			trialPrep();
		} // else
	} // else
} // responseCheck

// Handling Starboard pecks
socket.on("simulatedPeck", function(peck) {
	if (peck.state == 0) { // if the IR beam was broken...
		logger.info(peck.name, "detected",ignore_early == 1 && !waiting ? "(ignored)":"", {
			paradigm: paradigm,
			trial: trialcount,
			stimulus: stim.sound,
			stimulustype: stim.type,
			timestamp: timeStamp()
		}); // if
		if (waiting == "to_begin" && targetpeck == peck.key) {
			waiting = null;
			trial();
		} // if
		else if (waiting == "for_response") {
			waiting = null;
			clearInterval(timer);
			response = peck.key;
			pecked = 1;
		} // else if
	} //  if
}); // socket.on

// Checking the sun's position
function sunSimulator() {
	socket.emit("simulatesun");
} // sunSimulator

// Checks the sun's position every suncheck miliseconds
function getSunLoop() {
	setTimeout(function() {
		sunSimulator();
		getSunLoop();
	}, suncheck); // setSunLoop
} // getSunLoop

// Handles information about the sun's positon
socket.on("sunstatus", function(brightness) {
	if (brightness <= 0) {
		daytime = 0;
		logger.info('Sun has set. Putting gngclient to sleep.', {
			box: box,
			subject: subject,
			paradigm: paradigm,
			trial: trialcount,
			timestamp: timeStamp()
		}); // logger.info
	} // if
	else if (brightness >= 0 && !daytime) {
		daytime = 1;
		logger.info('Sun has risen. Starting trials.', {
			box: box,
			subject: subject,
			paradigm: paradigm,
			trial: trialcount,
			timestamp: timeStamp()
		}); // else if
		trialPrep();
	} // else
}); // socket.on

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
	console.log("-----------------------Starport Go-NoGo Prototype-----------------------");
	if (simulatesun) {
		sunSimulator(); // turn on house lights
		getSunLoop(); // set hl brightness every suncheck miliseconds 
	} // if
	else {
		trialPrep()
	} // else
} // startUp

// quick timestamp function
function timeStamp(time) {
	var unixstamp;

	if (time) unixstamp = time;
	else unixstamp = Date.now();

	var utcstamp = new Date(unixstamp);

	return utcstamp.toJSON();

} // timeStamp