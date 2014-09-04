/*
  shape.js

  Runs a shaping routine in an operant behavior box to train subject
  to use the keyed openings for access to a food hopper. Supports
  2AC and single-key GNG. Requires a running bbb-server.js.

  To run the script:
  node shape.js

  Procedure:

  Block 1:
  Hopper comes up. Center key flashes for 5 sec, prior to the
  hopper access. If the center key is pressed while flashing,
  then the hopper comes up and then the session jumps to block 2
  immediately.

  Block 2:
  The center key flashes until pecked.  When pecked the
  hopper comes up for 4 sec.

  2AC:
  Block 3:
  The center key flashes until pecked, then either the right
  or left (p = .5) key flashes until pecked, then the hopper
  comes up for 3 sec. Run 100 trials.

  Block 4:
  Wait for peck to non-flashing center key, then right or
  left key flashes until pecked, then food for 2.5 sec.

  GNG:
  Block 3:
  Wait for a peck to non-flashing center key, when you get
  it, the hopper comes up for 2.5 sec.

  Adapted from CDM's shape.cc used in Chicago lab
*/

var os = require("os");
var _ = require("underscore");
var winston = require("winston");
var t = require("./toolkit");           // bank of apparatus manipulation functions
var util = require("../lib/util");

var name = "shape";

var argv = require("yargs")
    .usage("Shape subject for GNG or 2AC task.\nUsage: $0 [options] subject_id user@host.com")
    .describe("F", "skip immediately to final block")
    .describe("P", "specify terminal procedure: gng (default) or 2ac")
    // .describe("trial-key", "specify trial initiation key (default
// center_green)")
    .default({P: "gng"})
    .demand(2)
    .argv;

/* Trial Data */
// This dictionary contains all values that will be logged as data at the end of each trial
var trial_data = {
    program: "shape",
    box: os.hostname(),         // box id
    subject: 0,                 // subject number
    trial: 0,                   // trial number
    block: 0,                   // shape paradigm block
    block_trial: 0,             // number of trials within block
    begin: 0,                   // when when trial began
    end: 0,                     // when trial ended
    fed: false,                 // whether the subect was fed
};

/* Parameters */
var priv = {
    hoppers: ["feeder_left", "feeder_right"],
    max_hopper_duty: 1,
    block_limit: 2,                     // number of times to run each block
    default_cue: "center_green",        // cue used when not specified
    alt_cue_color: "green",             // color of cues used on non default sides
    default_hopper: "left",             // hopper used when not specified
    feed_duration: 5000,                // how long to feed the bird (NOTE: overridden by each block)
};

var par = {
    subject: argv._[0],           // sets the subject number
    user: argv._[1],
};

var state = {
    paradigm: argv.P,           // ["2ac","gng"]: target operant paradigm
    trial: 0,                   // trial number
    block: 0,                   // shape paradigm block
    phase: null                 // trial phase
}

var meta = {
    type: "experiment",
    variables: {
        trial: "integer",
        block: [1, 2, 3, 4],
        phase: "string"
    }
}

var sock;
var update_state = t.state_changer(name, state);

t.connect(name, function(socket) {

    sock = socket;

    // these REQ messages require a response!
    sock.on("get-state", function(data, rep) {
        winston.debug("req to lights: get-state");
        if (rep) rep("ok", state);
    });
    sock.on("get-params", function(data, rep) {
        winston.debug("req to lights: get-params");
        if (rep) rep("ok", par);
    });
    sock.on("get-meta", function(data, rep) {
        winston.debug("req to lights: get-meta");
        if (rep) rep("ok", meta);
    });
    sock.on("change-state", function(data, rep) { rep("ok") }); // could throw an error
    sock.on("reset-state", function(data, rep) { rep("ok") });
    sock.on("state-changed", function(data) { winston.debug("pub to lights: state-changed", data)})

    // query hopper duty cycle - assume both hoppers the same
    t.req("get-params", {addr: "feeder_left"}, function(err, results) {
        priv.max_hopper_duty = results.duty;
    })

    // update user and subject information:
    t.req("change-state", {addr: "experiment", data: par});

    // start state machine for monitoring daytime
    t.ephemera(t.state_changer(name, state));
    block1_await();
});

function shutdown() {
    t.disconnect(process.exit);
}

// disconnect will reset apparatus to base state
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// state definitions

function intertrial(duration, next_state) {
    update_state({phase: "intertrial"});
    _.delay(next_state, duration);
}

function feed(hopper, duration, next_state) {
    update_state({phase: "feeding"})
    t.req("change-state", {addr: hopper, data: { feeding: true, interval: duration}});
    t.await(hopper, null, function(msg) { return msg.data.feeding == false }, next_state)
}

function sleeping(next_state) {
    update_state({phase: "sleeping"});
    t.await("house_lights", null, function(msg) { return msg.data.daytime }, next_state);
}

function block1_await() {

    // all units in ms
    var feed_duration = 5000;
    var blink_duration = 5000;
    var iti_var = 30000;
    var iti_min = 10000 / priv.max_hopper_duty;
    var pecked = false;

    // state setup
    var cue = t.cue("center_green");
    t.req("change-state", {addr: "cue_center_green", data: { trigger: "timer", period: 300}});
    update_state({block: 1, trial: state.trial + 1, phase: "awaiting-response"});

    t.await("keys", blink_duration, _test, _exit);

    function _test(msg) {
        if (!msg) return true;
        else if (msg && msg.data.peck_center)
            return pecked = true;
    }

    function _exit(next_state) {
        var hopper = random_hopper();
        t.req("change-state", {addr: "cue_center_green", data: { trigger: null, brightness: 0}});
        if (pecked) {
            next_state = block2_await;
        }
        else if (!state.daytime) {
            next_state = _.partial(sleeping, block2_await);
        }
        else {
            var iti = Math.random() * iti_var + iti_min;
            winston.debug("trial iti:", iti);
            next_state = _.partial(intertrial, iti, block1_await);
        }
        trial_data(name, {block: state.block, trial: state.trial, subject: par.subject})
        feed(hopper, feed_duration, next_state);
    }
}

function block2_await() {
    winston.info("got to block 2, exiting");
    t.disconnect(process.exit);
}

function random_hopper() {
    var i = Math.floor(Math.random() * priv.hoppers.length);
    return priv.hoppers[i];
}

// /* Setup */
// t.lights().on();                                     // make sure lights are on
// //t.lights().clock_set()                             // set house lights by sun altitude
// t.initialize("shape", par.subject, function() {             // create component in apparatus
//     trial_data.block = 1;                            // begin on block 1
//     t.mail_on_disaster(par.mail_list);               // mail someone when disaster strikes
//     //t.run_by_clock( function() {                          // run trials only during daytime
//     t.loop(trial);                                   // run trial() in a loop
//     //});
// });


// /* Trial Procedure*/
// function trial(next_trial) {
//     switch (trial_data.block) {
//     case 1:
//         block1();
//         break;
//     case 2:
//         block2();
//         break;
//     case 3:
//         if (par.paradigm == "2ac") block3_2ac();
//         else if (par.paradigm == "gng") block3_gng();
//         break;
//     case 4:
//         if (par.paradigm == "2ac") block4_2ac();
//         break;
//         //TODO: Add an "exit" case?
//     }

//     function block1() {
//         set_trial();
//         par.feed_duration = 5000;

//         // For 5 seconds, LED blinks and subject may repond with key press

//         t.state_update("phase", "waiting-for-response");
//         t.keys("peck_center").response_window(5000, check_response);

//         function check_response(response) {
//             t.cue(par.default_cue).off();

//             // Subject is fed either way
//             t.hopper(par.default_hopper).feed(par.feed_duration, function() {
//                 trial_data.fed = true;
//                 t.state_update("phase", "rewarding");
//                 // If subject responded, move on to next trial
//                 if (response.correct) {
//                     end_trial();
//                 }

//                 // Else, run block 1 again
//                 else {
//                     trial_data.end = Date.now();
//                     t.log_data(trial_data, function() {
//                         t.state_update("phase", "inter-trial");
//                         next_trial();
//                     });
//                 }
//             });
//         }
//     }

//     function block2() {
//         set_trial();
//         par.feed_duration = 4000;

//         // Blink LED until key press, then feed
//         t.state_update("phase", "waiting-for-response");
//         cue_until_key(par.default_cue, "peck_center", basic_reward);
//     }

//     function block3_2ac() {
//         set_trial();
//         par.feed_duration = 3000;

//         var rand = Math.random();
//         feed_select = rand > 0.5 ? "left" : "right";
//         t.state_update("phase", "waiting-for-response");
//         // Blink LED until press, then feed left or right randomly
//         cue_until_key(par.default_cue, "peck_center", function(data) {
//             basic_reward(data, feed_select)
//         });
//     }

//     function block3_gng() {
//         set_trial();
//         par.feed_duration = 2500;
//         // Wait for peck, then feed
//         t.state_update("phase", "waiting-for-response");
//         t.keys("peck_center").wait_for(false, basic_reward);
//     }

//     function block4_2ac() {
//         set_trial();
//         par.feed_duration = 2500;

//         // Wait for key press
//         t.state_update("phase", "waiting-for-response");
//         t.keys("peck_center").wait_for(false, block4_continue);

//         function block4_continue() {
//             var rand = Math.random();
//             var cue_select = feed_select = rand > 0.5 ? "left" : "right";
//             var cue_select = cue_select + "_" + par.alt_cue_color

//             // Randomly blink left or right LED, feed on corresponding side with corresponding peck
//             cue_until_key(cue_select, "peck_" + feed_select, function(data) {
//                 basic_reward(data, feed_select, cue_select)
//             });
//         }
//     }

//     function cue_until_key(cue, key, callback) { // blinks an LED until key press, then callback
//         t.cue(cue).blink();
//         t.keys(key).wait_for(false, callback);
//     }

//     function basic_reward(data, feeder, cue) { // feeds the subject, then signals end of trial
//         t.state_update("phase", "rewarding");
//         var cue_select = cue ? cue : par.default_cue;
//         var feed_select = feeder ? feeder : par.default_hopper;
//         t.cue(cue_select).off();
//         t.hopper(feed_select).feed(par.feed_duration, function() {
//             trial_data.fed = true;
//             t.state_update("phase", "inter-trial");
//             end_trial();
//         });
//     }

//     function set_trial() { // resets needed trial_data values for new trial
//         trial_data.begin = Date.now();
//         trial_data.trial++;
//         trial_data.block_trial++;
//         trial_data.fed = false;
//         trial_data.end = 0;
//         t.log_info("beginning trial " + trial_data.trial + " block" + trial_data.block + " ,block_trial " +
//                    trial_data.block_trial);
//         console.log("beginning trial " + trial_data.trial + " block" + trial_data.block + " ,block_trial " +
//                     trial_data.block_trial);
//     }

//     function finished() { // a place-holder function until I come up with something smarter
//         trial_data.block = null;
//         console.log('Shape Finished', Date.now());
//         console.log("[Press 'Ctrl+C' to exit]");
//     }

//     function end_trial() { // signals end of trial, adjusts variables to begin correct next trial
//         t.log_info("trial " + trial_data.trial + " finished")
//         trial_data.end = Date.now();

//         // make sure data is logged before proceeding to next trial
//         t.log_data(trial_data, function() {
//             if (trial_data.block == 1) {
//                 trial_data.block++;
//                 trial_data.block_trial = 0;
//             } else if (trial_data.block_trial >= par.block_limit) {
//                 if (trial_data.block == 4 || (par.paradigm == "gng" && trial_data.block == 3)) {
//                     //finished();
//                     next_trial();
//                     return
//                 } else {
//                     trial_data.block++;
//                 }
//                 trial_data.block_trial = 0;
//             }
//             next_trial();
//         });
//     }

// }
