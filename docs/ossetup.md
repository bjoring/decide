# Beaglebone OS Setup Procedure

This document will walk you through the process of setting up a new
Beaglebone Black with the correct OS image to use Starboard.

## Requirements and Brief Overview

Here is what you will need:
1. A Beaglebone Black (BBB)
2. A Linux or OS X computer with a SD card reader
3. A microSD card with SD adapter
4. A working OS image or somewhere to copy one (e.g the microSD from
another, already setup Beaglebone)
5. Some patience

Once you have gathered all of that, the process basically comes down to
four steps:
1. Procuring a disk image.
2. Writing the disk image to a microSD card
3. Making the Beaglebone boot form the card
4. Giving the Beaglebone a unique host name

### Procuring a Disk Image

If you already have an OS image, skip ahead to the next section. If you do not
have one, you will need to create your own image by cloning the microSD from another BBB.

First, make a raw copy of the working microSD using `dd`:
````bash
    dd if=/dev/sdx of=beagle_image.img bs=1M
````

On OS X, you'll need to use `/dev/rdiskX` as your input.

If the lack of a progress bar with `dd` is disconcerting, you can alternatively
run `dd` through `pv`, which will make one for you:

````bash
    dd if=/dev/sdx bs=1M | pv | dd of=beagle_image.img bs=1M
````

Once the cloning has finished, compare the size of the img file you just created
with the destination microSD. If the img file is the same size or smaller,
proceed to the next step. Otherwise, you will need you will need to shrink it
first. [Look here](http://softwarebakery.com/shrinking-images-on-linux) for an
excellent tutorial on how. You may also want to shrink the image if you're
distributing it over the web.

### Writing an image to a microSD

````bash
    dd if=beagle_image.img of=/dev/sdx bs=1M
````

Run `gparted` and make sure that the partitions cover the whole microSD card. If
they do not, you can use `gparted` to expand the file system.

### Making the BBB boot from the card

Insert the card into the Beaglebone. Apply power with the boot button pressed
down and release when the when the four LEDs start flashing.

The Beaglebone should have booted from the microSD card and should do so from
now on. The quickest way to check is to see whether the heartbeat LED is
flashing. This is on by default but is turned off in the starboard images.

### Giving the BBB a unique host name

This step is optional unless you have multiple devices on a network, in which case each needs to have a unique hostname. To change the hostname, run the following command on the BBB, substituting *currentname* and *newname* as appropriate.

````bash
sed -i "s/currentname/newname/" /etc/hostname /etc/hosts
````

Reboot and the BBB should now have the name you specified.
