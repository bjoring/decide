(ns decide.host
  "Host server; brokers messages from controllers and logs data"
  (:use [decide.core :only [version config mail]])
  (:require [decide.json :as json]
            [decide.mongo :as mongo]
            [cljs.nodejs :as node]
            [clojure.string :as str]))

(def http (js/require "http"))
(def express (js/require "express"))
(def sock-io (js/require "socket.io"))
(def console (js/require "../lib/log"))

;; our connected clients
(def controllers (atom {}))
;; database collections for logging
(def events (atom nil))
(def trials (atom nil))

(defn- flatten-record [js & keys]
  (let [js (js->clj js :keywordize-keys true)]
    (merge (select-keys js keys) (:data js))))

(defn- error [& args]
  (let [msg (apply str args)]
    (.error console msg)
    (when (:send_email config)
      (mail "decide-host" (:admins config) "major error in decide" msg))))

(defn- log-event! [msg]
  (let [msg (flatten-record msg :time :addr)
        logfile (str "events_" (first (str/split (:addr msg) #"\.")) ".jsonl")]
    (json/write-record! logfile msg)
    (when @events (mongo/save! @events msg))))

(defn- log-trial! [msg]
  (let [msg (flatten-record msg :time)
        logfile (str (:subject msg) "_" (:program msg) ".jsonl")]
    (json/write-record! logfile msg)
    (when @trials (mongo/save! trials msg))))

(defn- route-req
  "generates function to route REQ messages to controller"
  [req]
  (fn [msg rep]
    (let [msg (js->clj msg)
          [addr-1 addr-2] (str/split (:addr msg) #"\.")]
      (if-let [ctrl (@controllers addr-1)]
        (.emit (:socket ctrl) req (clj->js (assoc msg :addr addr-2)) rep)
        (rep "err" (str "no such controller " addr-1 " registered"))))))

;;; HTTP/sockets servers
(defn server []
  (let [server-internal (.createServer http (express))
        io-internal (sock-io server-internal)
        app-external (express)
        server-external (.createServer http app-external)
        io-external (sock-io server-external)]
      (defn connect-internal
        "function to handle connections to internal socket"
        [socket]
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
                            (swap! controllers assoc from {:address address :socket socket})
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
                     (error "client " @key " disconnected unexpectedly")
                     (swap! controllers dissoc @key)
                     (reset! key nil))
                   (.info console "disconnection from internal port by" address))))
          (.on socket "state-changed"
               (fn [msg]
                 (.log console "pub" "state-changed" msg)
                 (.emit io-external "state-changed" msg)
                 (log-event! msg)))
          (.on socket "trial-data"
               (fn [msg]
                 (.log console "pub" "trial-data" msg)
                 (.emit io-external "trial-data" msg)
                 (log-trial! msg)))))
      (defn connect-external
        "Handles socket connections from external clients"
        [socket]
        (let [address (or (aget socket "handshake" "headers" "x-forwarded-for")
                          (aget socket "request" "connection" "remoteAddress"))]
          (.info console "connection on external port from" address)
          ;; all req messages get routed
          (map #(.on socket %1 (route-req [%1]))
               ["change-state" "reset-state" "get-state" "get-meta" "get-params"])
          ;; TODO route external clients? - do they need to be addressed?
          (.on socket "disconnect"
               #(.info console "disconnection from external port by" address))))

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
      ;; set up routes for external http requests
      (-> app-external
          (.get "/controllers" (fn [req res] (.send res (clj->js @controllers)))))
      (.on io-internal "connection" connect-internal)
      (.on io-external "connection" connect-external)
      (.listen server-external (:port_ext config) (:addr_ext config))
      (.listen server-internal (:port_int config) (:addr_int config))))

;;; TODO
;; 1. publish information about unexpected disconnects by internal clients to
;; external clients. Does this mean storing information from state-changed?
;; 2. provide HTTP API for getting trial data - used to generate online plots

(defn- main [& args]
  (.info console "this is decide-host, version" version)
  (mongo/connect "decide"
                 (fn [err db]
                   (if err
                     (.warn console "unable to connect to log database")
                     (do
                       (.info console "connected to mongodb for logging")
                       (reset! events (mongo/collection db "events"))
                       (reset! trials (mongo/collection db "trials"))))
                   (server))))
(set! *main-cli-fn* main)
