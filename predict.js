let global = {};

import fetch from 'node-fetch';
import * as tf from '@tensorflow/tfjs-node';
import { publishPrediction } from './publish.js';

import {
    updateStatus,
    formatDate,
    cleanDate
} from './functions.js';

import {
    MOBILE_NET_INPUT_SIZE,
    CLASS_NAMES,
    WEB_SERVER_ROOT,
    COMPOSITE_IMAGES_PATH
} from './variables.js'

export async function loadMobileNetFeatureModel() {
    const URL = 'https://tfhub.dev/google/tfjs-model/imagenet/mobilenet_v3_small_100_224/feature_vector/5/default/1';

    global.mobilenet = await tf.loadGraphModel(URL, { fromTFHub: true });
    updateStatus('Sucessfully loaded MobileNet v3!');

    tf.tidy(function () {
        let answer = global.mobilenet.predict(tf.zeros([1, MOBILE_NET_INPUT_SIZE, MOBILE_NET_INPUT_SIZE, 3]));
    });
}

export async function makePrediction(dateInput) {
    let date;

    if (dateInput === 'today') {
        let today = new Date();

        date = formatDate(today);
    } else {
        date = dateInput;
    }

    updateStatus(`Checking for composite image for ${date}...`);

    fetch(`${WEB_SERVER_ROOT}/${COMPOSITE_IMAGES_PATH}/${date}.jpg`)
        .then(compositeImageResponse => {
            if (compositeImageResponse.status === 200) {
                updateStatus(`Found existing composite image for ${date}...`);
                getPredictionFromModel(date);
            } else {
                updateStatus(`Generating composite image for ${date}...`);

                fetch(`${WEB_SERVER_ROOT}/generateAndSaveCompositeImageBeforeSunset.php?date=${date}`)
                    .then(generateCompositeImageResponse => {
                        return generateCompositeImageResponse.json();
                    })
                    .then(generateCompositeImageData => {
                        if (generateCompositeImageData.success) {
                            updateStatus(`Successfully generated composite image for ${date}...`);
                            
                            getPredictionFromModel(date);
                        }
                    })
            }
        });
}

export async function getPredictionFromModel(date) {
    const SAVED_MODELS_URL = `${WEB_SERVER_ROOT}/model/savedModels/`;
    const LATEST_MODEL = 'sunsetQualityPreidctorModel-2022-06-03T00-08-43-013Z.json';

    try {
        updateStatus('Loading model...');
        global.model = await tf.loadLayersModel(`${SAVED_MODELS_URL}/${LATEST_MODEL}`);
    } finally {
        tf.tidy(function() {
            updateStatus(`Making prediction for ${date}...`);

            let compositeImageURL = `${WEB_SERVER_ROOT}/${COMPOSITE_IMAGES_PATH}/${date}.jpg`;

            fetch(compositeImageURL)
                .then(compositeImageResponse => {
                    return compositeImageResponse.arrayBuffer();
                })
                .then(compositeImageData => {
                    let imageBuffer = Buffer.from(compositeImageData);
                    let imageAsTensor = tf.node.decodeImage(imageBuffer).div(255);

                    let resizedTensorFrame = tf.image.resizeBilinear(
                        imageAsTensor,
                        [MOBILE_NET_INPUT_SIZE, MOBILE_NET_INPUT_SIZE],
                        true
                    );

                    let imageFeatures = global.mobilenet.predict(
                        resizedTensorFrame.expandDims()
                    );

                    let prediction = global.model.predict(imageFeatures).squeeze();
                    let highestIndex = prediction.argMax().arraySync();
                    let predictionArray = prediction.arraySync();

                    let predictionResult = {
                        date,
                        rating: parseInt(CLASS_NAMES[highestIndex]),
                        confidence: Math.floor(predictionArray[highestIndex] * 100)
                    };

                    updateStatus(`Sunset on ${date} predicted to be ${predictionResult.rating} stars at a ${predictionResult.confidence}% confidence!`);

                    publishPrediction({
                        date,
                        rating: parseInt(CLASS_NAMES[highestIndex]),
                        confidence: Math.floor(predictionArray[highestIndex] * 100),
                        compositeImageURL
                    });

                    updateStatus(`http://skyline.noshado.ws/view-sunset/viewer.html#${date}`)
                });
        });
    }
}