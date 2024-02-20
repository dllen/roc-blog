#!/bin/bash

pkill zola

nohup zola serve --interface 0.0.0.0 --base-url / > startup.log &

