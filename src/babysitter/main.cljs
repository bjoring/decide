(ns decide.babysitter
  "node script to monitor running experiments"
  (:use [decide.core :only [version config]])
  (:require [decide.json :as json]
            [cljs.nodejs :as node]))

;; things the babysitter monitors (for each connected controller)
;;
;; - hopper malfunctions (checks beam break events against hopper events)
;; - unexpected disconnections? (host needs to pub this info)
;; - number of trials and feed events over some window
;; - daily statistics for each subject - running avg and std dev

;; how to keep track of state in this paradigm?

(def console (js/require "../lib/log"))
(def sock-cli (js/require "socket.io-client"))

(defn- main [& args]
  (let [uri (str "http://" (:addr_ext config) ":" (:port_ext config) "/")
        socket (.connect sock-cli uri (clj->js {:transports ["websocket"]}))]
    (.once socket "connect"
           #(.info console "connected to decide-host at" (aget socket "io" "uri")))
    (.once socket "disconnect"
           (fn []
             (.error console "lost connection to decide-host")
             (.exit node/process -1)))))

(set! *main-cli-fn* main)
