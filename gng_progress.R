library(rjson)
library(jsonlite)
library(ggplot2)
library(anytime)
library(dplyr)
df = jsonlite::stream_in(file("O186_gng_trials.jsonl"))
df$cumul = as.numeric(df$correct)
#df$cumul[df$cumul == 0] = -1
df$cumul = cumsum(df$cumul)
df$cumul[df$cumul<0] = 0
df$date = anytime(df$time/1e6)
df$rtime = df$rtime/1e6
df$ind = seq(1,dim(df)[1],by=1)
df$response = as.factor(df$response)
df$outcome = with(df, interaction(response,correct))

p = ggplot(df,aes(x=date,y=cumul))+geom_line()+geom_point()+scale_x_datetime(date_labels="%D")
p

ip = ggplot(df,aes(x=ind,y=cumul))+geom_line()+geom_point()
ip

cortr = filter(df, outcome=="peck_left.TRUE")
rt = ggplot(cortr, aes(x=ind,y=rtime)) + geom_point() + geom_smooth(method='lm', se = TRUE)
rt

resp = ggplot(df, aes(date,fill=outcome)) + geom_histogram(bins = as.integer(diff(range(df$date)))+1)
resp

early = filter(df, outcome=="stimA.FALSE")
ert = ggplot(early, aes(x=ind,y=rtime)) + geom_point() + geom_smooth(method='lm', se = TRUE)
ert
