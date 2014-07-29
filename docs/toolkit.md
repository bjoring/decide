# Toolkit

*Toolkit* provides a set of basic building blocks with which to build operant training paradigms. It handles all interaction with the `bbb-server` and `apparatus`, allowing the user to create training paradigms with minimal programming.

Overall, *toolkit* includes two types of functions: those that manipulate the apparatus' components and those that manage the program and its trials. This document details those functions. For examples on how to use *toolkit* in a program, look at `template.js`.

## Manipulating Apparatus Components

These functions send REQ msgs to `apparatus` to manipulate component states. They all follow the same basic format:
````javascript
toolkit.component(which).action(arguments)
````
The *which* argument selects which component of a category to manipulate. For example, to turn on the center blue cue:
````javascript
toolkit.cue("center_blue").on()
````
All *arguments* to component actions are optional. In the above example, the cue would stay on until it is manually turned off since it was given no *duration* argument. If the cue needs to be on for exactly 5 seconds, however, this command should be used instead:

````javascript
toolkit.cue("center_blue").on(5000)
````
### Using Cues

#### Turning a cue on

````javascript
toolkit.cue(which).on(duration, callback)
````
* *duration:* How long cue should stay on in miliseconds, `cue(which).off()` called afterwards.
* *callback:* Function to run after *duration* has finished.

#### Turning a cue off
````javascript
toolkit.cue(which).off(duration, callback)
````
* *duration:* How long cue should stay off in miliseconds, `cue(which).on` called afterwards.
* *callback:* Function to run after *duration* has finished.

This function can also stop a blinking cue.
#### Blinking a cue
````javascript
toolkit.cue(which).blink(interval, duration, callback)
````
* *interval:* Interval at which the cue should turn the cue on and off. (Default: 300 miliseconds)
* *duration:* How long in miliseconds to blink the cue, `cue(which).on` called afterwards.
* *callback:* Function to run after *duration*

Setting the *interval* is not required to set *duration* for the blinking cue.

### Using Hoppers (Feeders)

#### Feeding with a hopper
````javascript
toolkit.hopper(which).feed(duration, callback)
````
* *duration:* How long in miliseconds to feed with the hopper
* *callback:* Function to run after *duration* has finished

### Using House Lights
Note that `toolkit.lights()` takes no *which* argument, unlinke the other functions. This is because, presumably, there is only one set of house lights per `apparatus`.
#### Turning the lights on
````javascript
toolkit.lights().on(duration, callback)
````
* *duration:* How long the lights should stay on in miliseconds, `lights().off` called afterwards.
* *callback:* Function to run after *duration* has finished.

This function turns the lights on at full brightness. See `lights().man_set` for setting the lights to a specific brightness.

#### Turning the lights off
````javascript
toolkit.lights().off(duration, callback)
````
* *duration:* How long the lights should stay off in miliseconds, `lights().on()` or `lights().clock_set()` called afterwards.
* *callback:* Function to run after *duration* has finished.

#### Setting the lights' brightness manually
````javascript
toolkit.lights().man_set(brightness, callback)
````
* *brightness:* How bright the lights should be. (Takes a value between 0 and 255.)
* *callback:* Function to run after lights have been set

#### Setting the lights' brightness by clock/sun position
````javascript
toolkit.lights().clock_set(callback)
````
* *callback:* Function to run after lights have been set to clock

If the lights are set by clock, using `lights().man_set()` and `lights().on()` will produce an error because they conflict with `lights().clock_set()`. (Note that `lights().off()` will still work, however.) In order to use those functions, setting the lights by clock must be turned off with `lights().clock_set_off()`.

#### Turning off brightness set by clock
````javascript
toolkit.lights().clock_set_off(callback)
````
* *callback:* Function to run after clock has been turned off

### Using Keys
#### Wait for key press
````javascript
toolkit.keys(which).wait_for(repeat, callback)
````
* *repeat:* Whether to wait for response again after first response.
* *callback:* Function to run after response.

#### Give response window for key press
````javascript
toolkit.keys(which).response_window(duration, callback)
````
* *duration:* Length of response window in miliseconds
* *callback* Function to run **after response has been evaluated**. The function is called as `callback(result)`, with *result* being the result dictonary detailed below.

Any key press, correct or incorrect, will end the response window. If the duration passes without a key press, the subject's response will be labeled "none".

This function returns a JSON object giving information about the subject's response:
````javascript
result = {
    response: "",       // The subject's response (string)
    correct: "",        // Whether response matched 'which' (boolean)
    time: Date.now()    // When response was recorded (Date object)
    }
````
### Using Aplayer
#### Playing sounds
````javascript
toolkit.aplayer(what).play(callback)
````
* *what:* The WAV sound file to play
* *callback:* Function to run after sound has finished playing

## Managing the Program and its Trials
### Making Apparatus Aware of the Program
````javascript
toolkit.initialize(name, subject, callback)
````
* *name:* How program will be identified in `apparatus`
* *subject:* Subject number for current set of trials
* *callback:* Function to run after registering the program in `apparatus`

This function essentially makes the program a component of `apparatus` and updates the state of `experiment` to let clients know which program is running and with which subject.

As a component in `apparatus`, the program will have the following state dictionary:
````javascript
state = {
	running: false,     // flag for whether the program is running trials
	phase: "idle"       // present phase of the program
}
````

### Running Trials in a Loop
````javascript
toolkit.loop(trial)
````
* *trial:* The `trial()` function of the program

This function runs `trial()` in a loop by making it recursive. If `state.running` is true, `loop()` will run the trial. Otherwise, it will do nothing and check the status of `state.running` every 65 seconds.

### Running Trials Only During Daytime
````javascript
toolkit.run_by_clock(callback)
````
* *callback:* Function to run after this option is set

This function sets `state.running` according to the sun's altitude. That is, if it is day time, `state.running` will be set to `true`, and, if it is night time, `state.running` will be set to `false`. It checks the sun's altitude every 60 seconds.

### Sending Emails When Something Goes Wrong
````javascript
toolkit.mail_on_disaster(list)
````
* *list:* Address(es) to mail when Bad Things happen. (Takes string or array of strings.)

This function tells *toolkit* to send emails upon unhandled exceptions. Emails will have a sender address of "*program name*@*host name*" and the subject line will be the error message.

### Logging from the Program
All logging by the following functions is ultimately handled by `host-server`, which logs the information to file using [winston](https://github.com/flatiron/winston). Rather than actually write the information to file themselves, these functions send it through the appropiate channels. Any logging by the program not meant to go into a logging file should not be logged inside the program itself and not with these functions.
#### Logging data
````javascript
toolkit.log_data(data, callback)
````
* *data:* The data to log
* *callback:* Function to run after data has been logged

#### Logging general trial information
````javascript
toolkit.log_info(data, callback)
````
* *data:* The data to log
* *callback:* Function to run after data has been logged
