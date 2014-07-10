/* 
shapeclient.js 
	This script starts a "shape" operant conditioning
	paradigm with the goal of conditioning a bird to
	peck the center key when it wants food. All 
	interaction with Starboard is handled through 
	apparatus.js.

	To run the script:
		node shapeclient.js
	
	Procedure:
		...
		Session ends when the lights go out for the day.
*/

// Import required packages
var io = require('socket.io-client');
var winston = require('winston'); // logger

// Set default for variables that may be set with command line arguments
var port = 8000; // port through which to connect to apparatus.js
var block = 1; // the block to start on
var trials = 5; // number of trials for blocks 2, 3, and 4
var simulatesun = 1; // flag for adjusting lights and running experiments according to the sun's position
var shape_logfile = "shape.log";

// Parse command line arguments
process.argv.forEach(function(val, index, array) {
	if (val == "-b") block = array[index+1];
	else if (val == "-t") trials = array[index+1];
	else if (val == "-l") shape_logfile = array[index+1];
});

// Initialize global variables
var suncheck = 120000; // how often to check the sun's position
var isdaytime; // flag for whether it is day 
var block2Trials = block3Trials = block4Trials = trials; // number of trials for each block
var block1Count = block2Count = block3Count = block4Count = 0; // counting the number of trials run
var targetpeck;

// Initialize the omni-device objects
var leds = {};
var feeders = {};
var hl;

// Set the logger
var logger = new(winston.Logger)({
	transports: [
	new(winston.transports.File)({
		filename: shape_logfile,
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

/* SETUP */
// Getting starbord and creating the appropiate objects for interaction
socket.emit("sendstarboard");
socket.on("receivestarboard", function(data) {
	setup(data);
});

function setup(board) { // creates objects for controlling starboard outputs 
	for (var key in board) { // creating the starboard objects
		if (board[key].type == "led") leds[key] = new LED(key);
		if (board[key].type == "feed") feeders[key] = new Feeder(key);
		if (board[key].type == "houselights") hl = new houseLights(key);
	} // for
	startUp();
} // setup

/* BLOCK 1 */
// Runs block 1
function block1() {
	if(isdaytime){ 
		if (block == 1) {
			setTimeout(block1, 10500); // run block 1 in 10.5 seconds (how long it takes for the block to complete).
			block1Count += 1;
	
			logger.info('Beginning Block 1, Trial ' + block1Count, {block:block, trial:block1Count, timestamp: timeStamp()});
	
			// Look for center peck
			logger.info('Waiting for center peck', {block:block, trial:block1Count, timestamp: timeStamp()});
			targetpeck = "cp";
	
			// Blink Center LEDS
			leds.ccg.stopBlink();
			blinkLEDS("ccg", 100, 5000);
	
			// Raise Hopper if LEDS finishes blinking without center peck
			var feedLogDelay = setTimeout(function() {
				logger.info('Feeding bird', {block:block, trial:block1Count, timestamp: timeStamp()});
			}, 5000);
			var feedDelay = setTimeout(feeders.lf.raise, 5000);
			var lowerDelay = setTimeout(feeders.lf.lower, 10000);
		} else return block2();
	} //if
} // block1

function block1Exit(x) {
	if (x.value == 1 || x == 1) {
		logger.info('Feeding Bird' + timeStamp());
		clearTimeout(block1.feedLogDelay);
		clearTimeout(block1.feedDelay);
		feeders.lf.raise();
		var lowerDelay = setTimeout(feeders.lf.lower, 5000);
		setTimeout(logger.info('Ending Block 1', {block:block, trial:block1Count, timestamp: timeStamp()}));
		leds.ccg.stopBlink();
		block = 2;
	} // if
} // block1Exit

/* BLOCK 2 */
// Runs block 2
function block2() {
	if (isdaytime) {
		block2Count += 1;
		logger.info('Beginning Block 2, Trial ' + block2Count + ' of ' + block2Trials, {block:block, trial:block2Count, timestamp: timeStamp()});
	
		//Blink center LEDS until center peck
		logger.info('Waiting for center peck...',{block:block, trial:block2Count, timestamp: timeStamp()});
		leds.ccg.stopBlink();
		blinkLEDS("ccg", 100);
	
		//Feed bird when center peck detected
		targetpeck = "cp";
	} // if
} // block2

function block2Feed(x) {
	if (x.value == 1 || x == 1) {
		leds.ccg.stopBlink();
		logger.info('Feeding bird', {block:block, trial:block2Count, timestamp: timeStamp()});
		feeders.lf.raise();
		setTimeout(feeders.lf.lower, 4000);
		setTimeout(checkB2Trials, 4500);
	} // if

//Exit block when desired number of trials is reached
	function checkB2Trials() {
		if (block2Count >= block2Trials) {
			block2Exit();
		} else block2();
	} // checkB2Trials
} // block2Feed

function block2Exit() {
	logger.info('Reached  max number of trials for Block 2 (' + block2Trials + ')',{block:block, trial:block2Count, timestamp: timeStamp()});
	logger.info('Ending Block 2',{block:block, trial:block2Count, timestamp: timeStamp()});
	block = 3;
	leds.ccg.stopBlink();
	return block3();
} // block2Exit

/* BLOCK 3 */
// Runs block3
function block3() {
	if (isdaytime) {
		block3Count += 1;
		logger.info('Beginning Block 3, Trial ' + block3Count + ' of ' + block3Trials,{block:block, trial:block3Count, timestamp: timeStamp()});
	
		//Blink center LEDS until center peck
		blinkLEDS("ccg", 100);
		targetpeck = "cp";
		logger.info('Waiting for center peck...',{block:block, trial:block3Count, timestamp: timeStamp()});
	} //if
} // block3


//When pecked, raise either the left or right feeder
function block3Feed(x) {
	if (x.value == 1 || x == 1) {
		var rand = Math.random();
		leds.ccg.stopBlink();
		if (rand < 0.5) {
			logger.info('Feeding left',{block:block, trial:block3Count, timestamp: timeStamp()});
			feeders.lf.raise();
			setTimeout(feeders.lf.lower, 3000);
		} else {
			logger.info('Feeding right',{block:block, trial:block3Count, timestamp: timeStamp()});
			feeders.rf.raise();
			setTimeout(feeders.rf.lower, 3000);
		} // else
		setTimeout(checkB3Trials, 3500);
	} // if
} // block3feed

//Exit block when desired number of trials is reached
function checkB3Trials() {
	if (block3Count >= block3Trials) {
		block3Exit();
	} else block3();
} // checkB3Trials


function block3Exit() {
	logger.info('Reached  max number of trials for Block 3 (' + block3Trials + ')',{block:block, trial:block3Count, timestamp: timeStamp()});
	logger.info('Ending Block 3' + timeStamp() + '');
	block = 4;
	return block4();
} // block3Exit


/* BLOCK 4*/
// Run block 4
function block4() {
	if(isdaytime) {
		block4Count += 1;
		logger.info('Beginning Block 4, Trial ' + block4Count + ' of ' + block4Trials,{block:block, trial:block4Count, timestamp: timeStamp()});
	
		//Wait for center peck
		logger.info('Waiting for center peck...',{block:block, trial:block4Count, timestamp: timeStamp()});
		targetpeck = "cp";
	} //if
} // block 4

//When pecked, flash either left or right LEDS
//Then, wait for peck on corresponding side
function block4Flash(x) {
	if (x.value == 1 || x == 1) {
		var rand = Math.random();
		//logger.info("Randomly generated number: " + rand);
		if (rand < 0.5) {
			blinkLEDS("lcr", 100);
			targetpeck = "lp";
			logger.info('Waiting for left peck...',{block:block, trial:block4Count, timestamp: timeStamp()});
		} else {
			blinkLEDS("rcb", 100);
			targetpeck = "rp";
			logger.info('Waiting for right peck...',{block:block, trial:block4Count, timestamp: timeStamp()});
		} // else
	} // if
} // block4Flash

function blo:gitck4FeedRight(x) {
	if (x.value == 1 || x == 1) {
		leds.rcb.stopBlink();
		feeders.rf.raise();
		logger.info('Feeding bird',{block:block, trial:block4Count, timestamp: timeStamp()});
		setTimeout(feeders.rf.lower, 2500);
		setTimeout(checkB4Trials, 3000);
	} // if
} // block4FeedRight

function block4FeedLeft(x) {
	if (x.value == 1 || x == 1) {
		leds.lcr.stopBlink();
		feeders.lf.raise();
		logger.info('Feeding bird',{block:block, trial:block4Count, timestamp: timeStamp()});
		setTimeout(feeders.lf.lower, 2500);
		setTimeout(checkB4Trials, 3000);
	} // if
} // block4FeedLeft

//Exit block when desired number of trials is reached
function checkB4Trials() {
	if (block4Count >= block4Trials) {
		block4Exit();
	} else block4();
} // checkB4trials

function block4Exit() {
	logger.info('Reached  max number of trials for Block 4 (' + block4Trials + ')',{block:block, trial:block4Count, timestamp: timeStamp()});
	logger.info('Ending Block 4',{block:block, trial:block4Count, timestamp: timeStamp()});
	block = 0;
	logger.info('Shape Finished',{block:block, trial:block4Count, timestamp: timeStamp()});
	console.log("[Press 'Ctrl+C' to exit]");
	hl.off();
} //block4 exit

/* APPARATUS REQUESTS */
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
}

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

// Checks the sun's position
function sunSimulator(){
	socket.emit("simulatesun");
} // sunSimulator

// Checks the sun's position every suncheck miliseconds
function getSunLoop(){
	setTimeout(function(){
		sunSimulator();
		getSunLoop();
	}, suncheck); // setTimeout
} // getSunLoop

// Handles information about the sun's positon
socket.on("sunstatus", function(brightness) {
	if (brightness <= 0) {
		isdaytime = 0;
		logger.info('Sun has set. Putting shapeclient to sleep.', {timestamp: timeStamp()});
	} else if (brightness >= 0 && !isdaytime) {
		isdaytime = 1;
		logger.info('Sun has risen. Starting shape.', {timestamp: timeStamp()});
		blockSelect();
	} // else if
}); // socket.on


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

// Handling Starboard pecks
socket.on("simulatedPeck", function(peck) {
	if (peck.state === 0) {
		logger.info(peck.name, "detected",{timestamp: timeStamp()});
		if (peck.key == targetpeck && targetpeck == "cp") {
			if (block == 1) return block1Exit(1);
			if (block == 2) return block2Feed(1);
			if (block == 3) return block3Feed(1);
			if (block == 4) return block4Flash(1);
		} else {
			if (block == 4) {
				if (peck.key == targetpeck && targetpeck == "rp") return block4FeedRight(1);
				if (peck.key == targetpeck && targetpeck == "lp") return block4FeedLeft(1);
			} // if
		} // else
	} // if
}); // socket.on

function startUp() {
	console.log("\u001B[2J\u001B[0;0f");
	logger.info("-----------------------Starport Shape prototype-----------------------");
	if (simulatesun) {
		sunSimulator(); // turn on house lights
		getSunLoop(); // set hl brightness every suncheck miliseconds 
	} else blockSelect();
} // startUp

function blockSelect() {
		if (block) {
			if (block < 1 || block > 4) {
				console.log("Invalid response. There is no block",block);
			} else if (block == 1) {
				return block1();
			} else if (block == 2) {
				return block2();
			} else if (block == 3) {
				return block3();
			} else if (block == 4) {
				return block4();
			} // else if
		} // if
} // blockSelect

// quick timestamp function
function timeStamp(time) {
	var unixstamp;

	if (time) unixstamp = time;
	else unixstamp = Date.now();

	var utcstamp = new Date(unixstamp);

	return utcstamp.toJSON();
} // timestamp