

// var sound = new (require("../lib/alsa"))();

// sound.subscribe("state-changed", console.log);
// sound.subscribe("warning", console.log);
// sound.subscribe("error", console.log);

// sound.event({id: "modify-state", stimulus: "musicbox2.wav", playing: true});

// import { PassThrough } from 'stream'
// const merge = (...streams) => {
//     let pass = new PassThrough()
//     let waiting = streams.length
//     for (let stream of streams) {
//         pass = stream.pipe(pass, {end: false})
//         stream.once('end', () => --waiting === 0 && pass.emit('end'))
//     }
//     return pass
// }

const fs = require("fs");
const wav = require("wav");
const Speaker = require("speaker");
let reader1 = new wav.Reader();
let reader2 = new wav.Reader();
let file1 = fs.createReadStream("stimuli/st15_ac3.wav");
let file2 = fs.createReadStream("stimuli/st15_aq3.wav");


reader1.on('format', function(format) {
    console.log(format);
    let speaker = new Speaker(format);
    speaker.once("flush", function() {
        console.log("playing sound 2");
        reader2.pipe(speaker);
    })
    reader1.pipe(speaker);
    // reader2.on('format', function(format) {
    //     reader1.pipe(speaker);
    //     reader2.pipe(speaker);
    // });
});

// reader1.on("close", function() {
//     reader2.pipe(speaker);
// })

reader1.on("error", function(err) {
    throw err;
});

file1.pipe(reader1);
file2.pipe(reader2);
