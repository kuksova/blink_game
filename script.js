import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

import vision from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";
const { FaceLandmarker, FilesetResolver, DrawingUtils } = vision;

// ===== Firebase setup =====
const firebaseConfig = {
  apiKey: "AIzaSyDT_g_xHGVT7ihkERaS-T-ar1IGeHxmsiw",
  authDomain: "blink-game-8031f.firebaseapp.com",
  databaseURL: "https://blink-game-8031f-default-rtdb.firebaseio.com",
  projectId: "blink-game-8031f",
  storageBucket: "blink-game-8031f.firebasestorage.app",
  messagingSenderId: "597393788617",
  appId: "1:597393788617:web:8f19fe69181bf063c54718"
};

// Connect Firebase
//firebase.initializeApp(firebaseConfig);
//const database = firebase.database();
//const recordRef = database.ref("blinkRecord");
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ===== Elements =====
const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const blinkCounterElement = document.getElementById("blink-count");
const blinkRecordElement = document.getElementById("blink-record");
const timerElement = document.getElementById("timer");
const startGameButton = document.getElementById("start-game");
const enableWebcamButton = document.getElementById("webcamButton");

// ===== Initial button state =====
startGameButton.disabled = true;
enableWebcamButton.disabled = true;

// ===== Game variables =====
let blinkCount = 0;
let blinked = false;
let gameRunning = false;
let timeLeft = 15;
let blinkRecord = 0;
let timerInterval = null;

// ===== FaceLandmarker setup =====
let faceLandmarker;
let runningMode = "IMAGE";
let webcamRunning = false;
let lastVideoTime = -1;
let results;
const drawingUtils = new DrawingUtils(canvasCtx);

// ===== Load record from Firebase =====
//recordRef.get().then(snapshot => {
//  if (snapshot.exists()) {
//    record = snapshot.val();
//    blinkRecordElement.innerText = record;
//  } else {
//    record = 0;
//    blinkRecordElement.innerText = record;
//  }
//});


// ===== Load record from Firebase =====
async function loadBlinkRecord() {
  const snapshot = await get(ref(db, "highscore"));
  console.log(snapshot.val());
  if (snapshot.exists()) {
    blinkRecord = Number(snapshot.val()) || 0;
    blinkRecordElement.innerText = snapshot.val();
  }
}

loadBlinkRecord();

// ===== Save new record to Firebase =====
async function saveBlinkRecord(currentScore) {
  set(ref(db, "highscore"), blinkRecord);
  blinkRecordElement.innerText = blinkRecord;
  if (currentScore > blinkRecord) {
    blinkRecord = currentScore;
    await set(ref(db, "highscore"), blinkRecord);
    blinkRecordElement.innerText = blinkRecord;
  }
}

saveBlinkRecord(5); 

// ===== Create FaceLandmarker model =====
async function createFaceLandmarker() {
  const filesetResolver = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );

  faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate: "GPU"
    },
    outputFaceBlendshapes: true,
    runningMode,
    numFaces: 1
  });

  enableWebcamButton.disabled = false; 
}

createFaceLandmarker();

// ===== Check webcam support =====
function hasGetUserMedia() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

if (hasGetUserMedia()) {
  enableWebcamButton.addEventListener("click", enableCam);
} else {
  console.warn("getUserMedia() is not supported by your browser");
}

startGameButton.addEventListener("click", startGame);

// ===== Start game =====
function startGame() {
  blinkCount = 0;
  blinked = false;
  timeLeft = 15;
  gameRunning = true;
  blinkCounterElement.innerText = blinkCount;
  timerElement.innerText = timeLeft;

  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    timeLeft -= 1;
    timerElement.innerText = timeLeft;

    if (timeLeft <= 0) {
      gameRunning = false;
      clearInterval(timerInterval);

      saveBlinkRecord(blinkCount); // save to Firebase

      //if (blinkCount > blinkRecord) {
      //  blinkRecord = blinkCount;
      //  blinkRecordElement.innerText = blinkRecord;
        //recordRef.set(record); // сохраняем в Firebase
      //}

      alert(`Game over! You blinked ${blinkCount} times`);
    }
  }, 1000);
}

// ===== Enable webcam =====
function enableCam() {
  if (!faceLandmarker) {
    console.log("Wait! faceLandmarker not loaded yet.");
    return;
  }

  if (webcamRunning) return;
  webcamRunning = true;

  navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
    video.srcObject = stream;
    video.addEventListener("loadeddata", () => {
      predictWebcam();
      startGameButton.disabled = false; // включаем кнопку Start Game
    });
  });
}

// ===== Predict loop =====
async function predictWebcam() {
  if (!webcamRunning) return;

  canvasElement.width = video.videoWidth;
  canvasElement.height = video.videoHeight;

  if (runningMode === "IMAGE") {
    runningMode = "VIDEO";
    await faceLandmarker.setOptions({ runningMode });
  }

  const startTimeMs = performance.now();
  if (lastVideoTime !== video.currentTime) {
    lastVideoTime = video.currentTime;
    results = faceLandmarker.detectForVideo(video, startTimeMs);
  }

  if (results && results.faceLandmarks) {
    for (const landmarks of results.faceLandmarks) {
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_TESSELATION,
        { color: "#C0C0C070", lineWidth: 1 }
      );
    }
  }

  // Blink detection
  if (gameRunning && results && results.faceBlendshapes && results.faceBlendshapes.length > 0) {
    const blendshapes = results.faceBlendshapes[0].categories;
    let leftBlink = blendshapes.find(b => b.categoryName === "eyeBlinkLeft")?.score || 0;
    let rightBlink = blendshapes.find(b => b.categoryName === "eyeBlinkRight")?.score || 0;
    const avgBlink = (leftBlink + rightBlink) / 2;

    if (avgBlink > 0.5 && !blinked) {
      blinkCount += 1;
      blinked = true;
      blinkCounterElement.innerText = blinkCount;
    } else if (avgBlink <= 0.5 && blinked) {
      blinked = false;
    }
  }

  window.requestAnimationFrame(predictWebcam);
}
