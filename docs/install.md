
# Networking

You can manage multiple Beaglebone Black devices running `decide` directly, or by connecting them to a private Ethernet subnet with a host computer acting as a gateway. The host computer can log trial data, monitor behavior, and provide an overview of all the running experiments on a single page. These instructions assume the following configuration:

1. The host computer has two Ethernet interfaces: `eth0` is connected to the outside world, and `eth1` is connected to the private network, which is on the subnet `192.168.10/24`. All the BBBs are also connected to this network.
2. Each BBB has been configured with a unique hostname.

## Host

### Firewall

Add an entry to iptables for the interface of the private network:

```bash
/sbin/iptables -A INPUT -i eth1 -j ACCEPT
```

If you want devices on the private network to be able to access the Internet, you also need to add these entries:

```bash
-t nat -A POSTROUTING -o eth0 -j MASQUERADE
-A FORWARD -i eth0 -o eth1 -m state --state RELATED,ESTABLISHED -j ACCEPT
-A FORWARD -i eth1 -o eth0 -j ACCEPT
```

### DHCP

`dnsmasq` is a simple DHCP and DNS server that will assign IP addresses to devices and allow the host computer to look up the IP addresses by name. This latter feature is necessary for the host web server to proxy connections to the BBBs.  After installing `dnsmasq`, copy `dnsmasq.conf` in this directory to `/etc/dnsmasq.conf` and restart `dnsmasq`. The BBBs should now be able to obtain IP addresses in the range `192.168.10.101` to `192.168.10.220`. The leases should be listed on the host computer in `/var/lib/misc/dnsmasq.leases`, and you should be able to retrieve the IP address of any connected BBB as follows: `dig <bbb-name> @localhost`

### Web proxy

For deployment, the node.js process on the host needs to run behind a dedicated web server. This configuration is necessary to restrict access to authenticated users (and to encrypt the authentication protocol so passwords aren't sent in the clear).  The web server also acts as a proxy for individual BBBs running on a private network.

This section details instructions for using [nginx](http://nginx.org/) as the web server. Apache may also work, but does not support proxy operations for websockets as well as nginx at this date.

After installing nginx, copy `decide-server.conf` to `/etc/nginx/sites-available` and create a soft link to the file in `/etc/nginx/sites-enabled`. You will need to generate an SSL/TLS key and certificate and place them in the locations specified in the configuration file. These instructions should work if you have gnutls:

```bash
certtool --generate-privkey --outfile server-key.pem
certtool --generate-self-signed --load-privkey server-key.pem --outfile server-cert.pem
```

Place `server-key.pem` in `/etc/ssl/private`, set ownership to `root.ssl-cert` and permissions to `640`. Place `server-cert.pem` in `/etc/ssl/certs` and set permissions to `644`. Note that browsers should complain about the certificate, because it's not signed by a recognized Certificate Authority. You can add an exception.

You will also need to create the password file `/etc/nginx/passwords`, which is
used for authentication. Add users and passwords as needed, or use a more
sophisticated authentication system.

Copy the `static` directory to `/srv/www` on the host computer. These files will be served by the web server.

Start the host node.js process. In final deployment, it should run as a daemon and only accept connections from localhost. You will be able to access the host interface at https://hostname/controller. Similarly, the BBB node.js processes should run as daemons, but they will need to accept connections from external programs. Each BBB can be accessed at https://hostname/device/device-name, where `device-name` is the hostname of the BBB.
