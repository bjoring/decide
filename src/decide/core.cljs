(ns decide.core
  (:require [decide.json :as json]))

(def os (js/require "os"))
(def path (js/require "path"))
(def mailer (.createTransport (js/require "nodemailer")))

(def version "1.0a3")                   ; TODO get this from project.clj
(defn config-path [name] (.resolve path js/__dirname ".." "config" name))

(def config (json/read-json (config-path "host-config.json")))

(defn mail [from to subject message]
  (.sendMail mailer (js-obj "from" (str from "@" (.hostname os))
                            "to" to
                            "subject" subject
                            "text" message)
             (fn [])))
