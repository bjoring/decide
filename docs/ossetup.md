# Beaglebone OS Setup Procedure

This document will walk you through the process of setting up a new 
Beaglebone Black with the correct OS image to use Starboard.

## Requirements and Brief Overview

Here is what you will need:
1. A Beaglebone Black (naturally)
2. A Linux computer with a SD card reader
3. A micoSD card with SD adapter
4. A working OS image or somewhere to copy one (e.g the microSD from 
another, already setup Beaglebone)
5. Some patience

Once you have gathered all of that, the process basically comes down to 
four steps:
1. Procuring a disk image.
2. Writing the disk image to a mircoSD card
3. Making the Beaglebone boot form the card
4. Giving the Beaglebone a unique host name

### Procuring a Disk Image

If you already have and OS image, skip ahead to *Writing the Image to a 
microSD*. If you do not have one, you will need to create your own image 
by cloning the microSD from an alrady setup Beaglebone 

First, make a raw copy of the working microSD using `dd`:
````bash
	dd if=/dev/sdx of=beagle_image.img
````

If the lack of a progress bar with `dd` is disconcerting, you can 
alternatively run `dd` through `pv`, which will make one for you:
````bash
	dd if=/dev/sdx | pv | dd of=beagle_image.img
````

Once the cloning has finished, compare the size of the img file you 
just created with the destination microSD. If the img file is smaller, 
proceed to the next step. Otherwise, you will unfortunately need 
you will need to shrink it first. [Look here](http://softwarebakery.com/shrinking-images-on-linux) 
for an excellent tutorial on how.
 
### Writing the Image to a microSD

Now that the image is ready, prepare the destination microSD card by making
sure it it is blank. If it is not, you can clear it with `fdisk`:
````bash
fdisk beagle_image.img
o	# Creates an empty partition table
w	# Writes changes to disk
````

Once the microSD card is ready, write the image to it using `dd`.
````bash
	dd if=beagle_image.img of=/dev/sdx
````

Now, run `gparted` and make sure that the filesystems cover the whole
partitions on the microSD card. If they do not, you can use `gparted` to 
expand the file system.

### Making the Beaglebone Boot from the Card

Insert the card into the Beaglebone. Apply power with the boot button 
pressed down and release when the when the four LEDs start flashing.

The Beaglebone should have booted from the microSD card and should do so from
now on. The quickest way to check is to `ssh` to the Beaglebone. If the
prompt is boring and white, it has not booted off the microSD card. If it is
welcoming and colorful, it has!

### Giving the Beaglebone a Unique Host Name

If you have not already, `ssh` to your Beaglebone. Then, run the following 
command, substituting *currentname* and *newname* as appropiate.
(Note: Beaglebones have followed the naming scheme *beagle-n*, with *n* 
being its number, thus far.)

On the Beaglebone:
````bash
sed -i "s/currentname/newname/" /etc/hostname /etc/hosts
````
Reboot and your Beaglebone should now have a unique identity. After you 
confirm this, you should add an `ssh` alias for the new Beaglebone on 
its host server.

On the host server, add the following lines to `~/.ssh/config`, 
replacing *alias* and *hostname* as appropiate:
````
Host alias
    HostName hostname.local
    User root
````
