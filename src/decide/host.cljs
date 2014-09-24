(ns decide.host
  "Host server; brokers messages from controllers and logs data"
  (:use [decide.core :only [version config]])
  (:require [decide.json :as json]
            [cljs.nodejs :as node]
            [clojure.string :as str]))

(def http (js/require "http"))
(def express (js/require "express"))
(def sock-io (js/require "socket.io"))
(def sock-cli (js/require "socket.io-client"))
(def console (js/require "../lib/log"))

;; our connected clients
(def controllers (atom {}))

;;; HTTP/sockets servers
(defn connect-internal [socket]
  (let [address (or (aget socket "handshake" "headers" "x-forwarded-for")
                    (aget socket "request" "connection" "remoteAddress"))
        key (atom nil)]
    (.info console "connection on internal port from" address)
    (.on socket "route"
         (fn [msg rep]
           (let [msg (js->clj msg :keywordize-keys true)
                 from (msg :ret_addr)]
             (cond
              @key (rep "err" (str "connection from " address " already registered as " @key))
              (get @controllers from) (rep "err" (str "address " from " already taken"))
              :else (do
                      (reset! key from)
                      (swap! controllers assoc from {:address address})
                      (.info console "%s registered as" address from)
                      (rep "ok"))))))
    (.on socket "unroute"
         (fn [msg rep]
           (when @key
             (.info console "%s unregistered as" address @key)
             (swap! controllers dissoc @key)
             (reset! key nil))
           (rep "ok")))
    (.on socket "disconnect"
         (fn []
           (if @key
             (do
               (.error console "client" @key "disconnected unexpectedly")
               (swap! controllers dissoc @key)
               (reset! key nil))
             (.info console "disconnection from internal port by" address))))
    ))

(defn server []
    (let [server-internal (.createServer http (express))
          io-internal (sock-io server-internal)
          app-external (express)
          server-external (.createServer http app-external)
          io-external (sock-io server-external)]
      (.enable app-external "trust proxy")
      (.on server-external "listening"
           (fn []
             (let [address (.address server-external)]
               (.info console "external endpoint is http://%s:%s" (.-address address)
                      (.-port address)))))
      (.on server-internal "listening"
           (fn []
             (let [address (.address server-internal)]
               (.info console "internal endpoint is http://%s:%s" (.-address address)
                      (.-port address)))))
      (-> app-external
          (.get "/controllers" (fn [req res] (.send res (clj->js @controllers)))))
      (.on io-internal "connection" connect-internal)
      (.listen server-external (:port_ext config) (:addr_ext config))
      (.listen server-internal (:port_int config) (:addr_int config))))

;; (def host (.connect sock-cli "http://localhost:8020" (clj->js {:transports ["websocket"]})))
;; (.on host "connect" (fn [] (.info console "connected to host")))
;; (.on host "disconnect" (fn []
;;                          (.error console "lost connection to host")
;;                          (.exit node/process -1)))
;; (.on host "state-changed"
;;      (fn [msg]
;;        (let [msg (flatten-record msg :time :addr)
;;              logfile (str "events_" (first (str/split (:addr msg) #"\.")) ".jsonl")]
;;          (json/write-record! logfile msg))))
;; (.on host "trial-data"
;;      (fn [msg]
;;        (let [msg (flatten-record msg :time)
;;              logfile (str (:subject msg) "_" (:program msg) ".jsonl")]
;;          (json/write-record! logfile msg))))

;; logging
(defn- flatten-record [js & keys]
  (let [js (js->clj js :keywordize-keys true)]
    (merge (select-keys js keys) (:data js))))


(defn- main [& args]
  (.info console "this is decide host, version" version)
  (server))
(set! *main-cli-fn* main)
