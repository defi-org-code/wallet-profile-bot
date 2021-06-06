#!/bin/bash
# graphite django https://github.com/graphite-project/docker-graphite-statsd

#@ DONT USE DOCKER RUN
# USE MAKE UP inside container

data=/var/log/kamon-grafana;
docker run \
  --detach \
   --publish=8080:80 \
   --publish=8081:81 \
   --publish=2003:2003 \
   --publish=8125:8125/udp \
   --publish=8126:8126 \
   --name kamon-grafana-dashboard \
   -v /opt/graphite:/opt/graphite \
   -v /etc/graphite-statsd:/etc/graphite-statsd \
   kamon/grafana_graphite

  #  --volume=$data/data/whisper:/opt/graphite/storage/whisper \
  #  --volume=$data/data/elasticsearch:/var/lib/elasticsearch \
  #  --volume=$data/data/grafana:/opt/grafana/data \
  #  --volume=$data/log/graphite:/opt/graphite/storage/log \
  #  --volume=$data/log/elasticsearch:/var/log/elasticsearch \

  #groupByNode(v2.*.inVolUsd,1,"avg")
  #aliasByNode(summarize($version.$token.swapCount, '5m', 'sum', false), 1)
  # summarize($version.*.swapCount, '5m', 'avg', false)

  # filterSeries(summarize($version.*.swapCount, '5m', 'avg', false), 'min', '<', 1)