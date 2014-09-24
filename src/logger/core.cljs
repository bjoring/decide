(ns decide.logger
  "Standalone logging program; runs on host"
  (:require [cljs.nodejs :as node]))

(def version "1.0a2")

(def sock-cli (js/require "socket.io-client"))
(def logger (js/require "../lib/log"))

(defn log [& args] (apply (.-log js/console) (map str args)))

(def host (.connect sock-cli "http://localhost:8020" (clj->js {:transports ["websocket"]})))

(.on host "connect" (fn [] (.info logger "connected to host")))
(.on host "disconnect" (fn []
                         (.error logger "lost connection to host")
                         (.exit node/process -1)))
(.on host "state-changed"
     (fn [msg]
       (.log logger "pub" "state-changed:" msg)))
(.on host "trial-data"
     (fn [msg]
       (.log logger "pub" "trial-data:" msg)))

(defn- main [& args]
  (.info logger "this is decide logger, version" version))
(set! *main-cli-fn* main)
