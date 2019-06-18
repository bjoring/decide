#!/usr/bin/env node
const os = require("os");
const _ = require("underscore");
const t = require("../lib/client");           // bank of apparatus manipulation functions
const logger = require("../lib/log");
const util = require("../lib/util");

const name = "shape";
const version = require('../package.json').version;

const argv = require("yargs")
    .usage("Shape subject for GNG or 2AC task.\nUsage: $0 [options] subject_id @slack-id")
    .describe("F", "skip immediately to holding pattern(block 4)")
    .describe("B", "skip immediately to specific block (1-4)")
    .describe("color", "set cue color: red, green, blue")
    .describe("no-notify", "if set, don't an email when the bird completes block 4")
    .describe("trials", "set the number of trials per block in blocks 2-3")
    .describe("feed-delay", "time (in ms) to wait between response and feeding")
    .default({color: "green", trials: 100, "feed-delay": 0, "B": 1})
    .boolean(['F'])
    .demand(2)
    .argv;

const par = {
    subject: util.check_subject(argv._[0]), // sets the subject number
    user: argv._[1],
    active: true,
    block_trials: argv.trials,  // number of trials in blocks 2+
    cue_color: argv.color,
    feed_delay: argv["feed-delay"],
    feeders: ["feeder_left", "feeder_right"],
    blink_period: 300,
};

const state = {
    trial: 0,                   // trial number
    block: 0,                   // shape paradigm block
    phase: null                 // trial phase
}

const meta = {
    type: "experiment",
    variables: {
        trial: "integer",
        block: [1, 2, 3, 4],
        phase: "string"
    }
}

let sock;
const update_state = t.state_changer(name, state);

let start;
if (argv.F || argv.B == 4)
    start = block4_peck1;
else if (argv.B == 1)
    start = block1_await;
else if (argv.B == 2)
    start = block2_await;
else if (argv.B == 3)
    start = block3_peck1;
else {
    logger.error("invalid starting block number (choose 1-4)");
    process.exit(-1);
}

t.connect(name, function(socket) {

    sock = socket;

    // these REQ messages require a response!
    sock.on("get-state", function(data, rep) {
        logger.debug("req to shape: get-state");
        if (rep) rep("ok", state);
    });
    sock.on("get-params", function(data, rep) {
        logger.debug("req to shape: get-params");
        if (rep) rep("ok", par);
    });
    sock.on("get-meta", function(data, rep) {
        logger.debug("req to shape: get-meta");
        if (rep) rep("ok", meta);
    });
    sock.on("change-state", function(data, rep) { rep("ok") }); // could throw an error
    sock.on("reset-state", function(data, rep) { rep("ok") });
    sock.on("state-changed", function(data) { logger.debug("pub to shape: state-changed", data)})

    // update user and subject information:
    t.change_state("experiment", par);

    // start state machine for monitoring daytime
    t.ephemera(t.state_changer(name, state));
    t.trial_data(name, {comment: "starting",
                        subject: par.subject,
                        version: version,
                        params: par});
    // hourly heartbeat messages for the activity monitor
    t.heartbeat(name, {subject: par.subject});

    // update feeder list
    t.get_feeders((err, feeders) => {
        if (!err) {
            logger.info("available feeders: ", feeders)
            par.feeders = feeders;
        }
    });

    start()
});

function shutdown() {
    t.trial_data(name, {comment: "stopping", subject: par.subject})
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

function feed(feeder, duration, next_state) {
    update_state({phase: "feeding"})
    _.delay(t.change_state, par.feed_delay,
            feeder, { feeding: true, interval: duration})
    t.await(feeder, null, function(msg) { return msg.feeding == false }, next_state)
}

function sleeping(next_state) {
    update_state({phase: "sleeping"});
    t.await("house_lights", null, function(msg) { return msg.daytime }, next_state);
}

function block1_await() {

    // all units in ms
    const feed_duration = 5000;
    const blink_duration = 5000;
    const iti_var = 30000;
    const iti_min = feed_duration;
    let pecked = "timeout";
    const cue = "cue_center_" + par.cue_color;
    const key = "peck_center"

    // state setup
    if (state.block < 1) {
        logger.info("entering block 1")
        t.trial_data(name, {comment: "new-block",
                            subject: par.subject,
                            experiment: "block-1"});
    }
    t.change_state(cue, { trigger: "timer", period: par.blink_period});
    update_state({block: 1, trial: state.trial + 1, phase: "awaiting-response"});

    t.await("keys", blink_duration, _test, _exit);

    function _test(msg) {
        if (!msg) return true;
        else if (msg[key]) {
            pecked = key;
        }
        return pecked;
    }

    function _exit() {
        let next_state;
        const feeder = random_feeder();
        t.change_state(cue, { trigger: null, brightness: 0})
        if (pecked != "timeout") {
            next_state = block2_await;
        }
        else if (!state.daytime) {
            next_state = _.partial(sleeping, block2_await);
        }
        else {
            const iti = Math.random() * iti_var + iti_min;
            logger.debug("trial iti:", iti);
            next_state = _.partial(intertrial, iti, block1_await);
        }
        t.trial_data(name, {subject: par.subject,
                            block: state.block,
                            trial: state.trial,
                            response: pecked,
                            result: "feed"
                           })
        feed(feeder, feed_duration, next_state);
    }
}

function block2_await() {
    const feed_duration = 4000;
    const iti = feed_duration * 0.5;
    const cue = "cue_center_" + par.cue_color;
    const key = "peck_center";

    if (state.block < 2) {
        logger.info("entering block 2")
        state.trial = 0;
        t.trial_data(name, {comment: "new-block",
                            subject: par.subject,
                            experiment: "block-2"});
    }
    t.change_state(cue, { trigger: "timer", period: par.blink_period});
    update_state({ block: 2, trial: state.trial + 1, phase: "awaiting-response"});

    // NB: end of day will not exit state, but this isn't a huge problem as the
    // shape will go out anyway
    t.await("keys", null, function(msg) { return msg.peck_center }, _exit);

    function _exit() {
        const feeder = random_feeder();
        t.change_state(cue, { trigger: null, brightness: 0})
        const next = (state.trial < par.block_trials) ? block2_await : block3_peck1;
        const delay_next = (state.daytime) ? _.partial(intertrial, iti, next) : _.partial(sleeping, next);
        t.trial_data(name, {program: name,
                            subject: par.subject,
                            block: state.block,
                            trial: state.trial,
                            response: key,
                            result: "feed"});
        feed(feeder, feed_duration, delay_next);
    }
}

function block3_peck1() {
    const side = ["left", "right"][Math.floor(Math.random() * 2)];
    const cue = "cue_center_" + par.cue_color;

    if (state.block < 3) {
        logger.info("entering block 3")
        state.trial = 0;
        t.trial_data(name, {comment: "new-block",
                            subject: par.subject,
                            experiment: "block-3"});
    }
    t.change_state(cue, { trigger: "timer", period: par.blink_period})
    update_state({ block: 3, trial: state.trial + 1, phase: "awaiting-response-1"});

    t.await("keys", null, function(msg) { return msg.peck_center}, function() {
        t.change_state(cue, { trigger: null, brightness: 0})
        block34_peck2(side);
    })
}

function block4_peck1() {
    const side = ["left", "right"][Math.floor(Math.random() * 2)];

    if (state.block < 4) {
        logger.info("entering block 4")
        state.trial = 0;
        t.trial_data(name, {comment: "new-block",
                            subject: par.subject,
                            experiment: "block-4"});
    }
    update_state({ block: 4, trial: state.trial + 1, phase: "awaiting-response-1"});

    t.await("keys", null, function(msg) { return msg.peck_center}, _.partial(block34_peck2, side));
}

function block34_peck2(side) {
    const feed_duration = (state.block == 3) ? 3000 : 2500;
    const iti = feed_duration * 0.5;
    const cue = "cue_" + side + "_" + par.cue_color;
    const key = "peck_" + side;

    t.change_state(cue, { trigger: "timer", period: par.blink_period})
    update_state({ phase: "awaiting-response-2"});
    t.await("keys", null, function(msg) { return msg[key]}, _exit);

    function _exit() {
        let next;
        const feeder = pick_feeder(side);
        t.change_state(cue, { trigger: null, brightness: 0})
        if (state.block == 3 && state.trial < par.block_trials)
            next = block3_peck1;
        else
            next = block4_peck1;

        if (state.block == 4 && state.trial == par.block_trials && !argv.F) {
            logger.info("shape completed!")
            if (!argv["no-notify"])
                util.slack(format("shape completed for %s on %s. Trials will continue to run",
                                  os.hostname(), par.subject),
                           par.user,
                           _.partial(logger.info, "sent message to", par.user))
        }

        next = (state.daytime) ? _.partial(intertrial, iti, next) : _.partial(sleeping, next);
        t.trial_data(name, {program: name,
                            subject: par.subject,
                            block: state.block,
                            trial: state.trial,
                            response: key,
                            result: "feed"});
        feed(feeder, feed_duration, next);
    }
}

function random_feeder() {
    const r = Math.random();
    const i = Math.floor(r * par.feeders.length);
    logger.debug("random feeder:", r, par.feeders[i]);
    return par.feeders[i];
}


function pick_feeder(side) {
    const name = "feeder_" + side;
    if (_.has(par.feeders, name))
        return name;
    else
        return random_feeder();
}
