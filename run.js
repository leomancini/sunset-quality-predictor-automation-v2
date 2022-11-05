let global = {};

import fetch from 'node-fetch';
import * as tf from '@tensorflow/tfjs-node';

import { loadMobileNetFeatureModel, makePrediction } from './predict.js';

import {
    subtractHours,
    compareTimes,
} from './functions.js';

import {
    CLASS_NAMES,
    WEB_SERVER_ROOT
} from './variables.js'

import { SECRETS } from './config.js';

async function checkIfPredictionAlreadyPublished(date) {
  let request = await fetch(`${WEB_SERVER_ROOT}/data/compositeImagesBeforeSunset/forPrediction/${date}.jpg`);

  return request.ok;
}

async function checkEligibility() {
  let now = new Date();
  let todayYYYYMMDD = `${now.toLocaleDateString('en-US', { year: 'numeric' })}-${now.toLocaleDateString('en-US', { month: '2-digit' })}-${now.toLocaleDateString('en-US', { day: '2-digit' })}`;

  let sunsetTimeRequest = await fetch(`${SECRETS.SUNSET_API_PROXY_URL}?date=${todayYYYYMMDD}&timezone=ET`);
  let sunsetTimeResponse = await sunsetTimeRequest.json();

  let sunsetTime = new Date(sunsetTimeResponse.timestamp * 1000);
  let oneHourBeforeSunsetTime = subtractHours(1, sunsetTime);

  // DEBUG
  // console.log(`Now: ${now}`);
  // console.log(`Sunset Time: ${sunsetTime}`);
  // console.log(`1 Hour Before Sunset Time: ${oneHourBeforeSunsetTime}`);
  // console.log(`Difference Between Now and Sunset Time in Minutes: ${compareTimes(now, oneHourBeforeSunsetTime)}`);

  const predictionAlreadyPublished = await checkIfPredictionAlreadyPublished(todayYYYYMMDD);

  if (!predictionAlreadyPublished && compareTimes(now, oneHourBeforeSunsetTime) <= 10) {
    await loadMobileNetFeatureModel();

    global.model = tf.sequential();
    global.model.add(tf.layers.dense({ inputShape: [1024], units: 128, activation: 'relu' }));
    global.model.add(tf.layers.dense({ units: CLASS_NAMES.length, activation: 'softmax' }));
    global.model.summary();
    global.model.compile({
        optimizer: 'adam',
        loss: 'categoricalCrossentropy',
        metrics: [ 'accuracy' ],
    });

    makePrediction('today');
  }
}

checkEligibility();
