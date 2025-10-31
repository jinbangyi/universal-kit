# Production Overview

this repo will use monorepo to organize diff purpose lib which is common used

## Stories

- user can meature external api usage
  - the logger should add proper metadata so that user can easy find the logs produced by which lib or function
  - user can use a http client wrapper to wrap a client, compatibility with original one so that user can easy replace old one
    - all the request from this client will be auto meatured
    - user can config the wrapper to change the behavious
    - should support http client:
      - axios
      - node-fetch
      - nodejs build fetch
  - user can add an decorator/annotation to method/function which include api usage
  - support otel protocol
  - metrics:
    - meature the latency of the api provider
    - meature the usage of a apikey
      - which provider, apikey, path, status code
    - meature the provider success rate
  - trace, logs: 
    - user can see each request event
    - user can see the request detail of each failed request
