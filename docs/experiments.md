
# Experiment programs

This document gives basic usage information for the experiment programs. You will need to ssh to the BBB and run the programs using shell commands.

## Lights

The simplest experiment program sets the house lights to follow solar ephemera. Lights turn on when the sun rises, increase and decrease in intensity through the day, and turn off when the sun sets. The solar position is calculated based on the latitude and longitude defined in the bbb-config.json file.

## Shape

The `shape` program trains a naive starling to interact with the operant apparatus to obtain food. Training occurs in four blocks:

1. The center cue is flashed for 5 seconds. At the end of this interval, one of
   the two hoppers is raised for 5 seconds, followed by a random intertrial
   interval. The minimum intertrial interval is determined by the maximum duty
   cycle of the solenoid. If the bird pecks the key while the cue is blinking,
   the hopper is raised immediately, and the experiment proceeds to the next
   block. If the day ends, the experiment will proceed to the next block on the
   next day.
2. The center cue is flashed for an indefinite period. When the bird pecks the
   key, one of the hoppers is raised for 4 seconds. After 100 trials, the
   experiment proceeds to block 3.
3. The center cue is flashed for an indefinite period. When the bird pecks the
   center key, one of the two side keys (p = 0.5) is flashed indefinitely. When
   the bird pecks the key with the flashing cue, the hopper on that side of the
   experiment is raise for 3 seconds. After 100 trials, the experiment proceeds
   to block 4.
4. This block is identical to block 3, except that the center key is not
   flashed, and the block does not terminate.

This shaping procedure will work for both 2AC and GNG paradigms; the only
difference is that in the GNG experiment only one of the side keys is used for
responses.

The behavior of the program can be set with several options, which are
documented in the help message from the program. Run `shape` without any
arguments to see this help message.