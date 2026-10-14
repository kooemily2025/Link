
import { initializeApp } from
  "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

import {
  getAnalytics,
  isSupported
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyDNl0hgy7PyHgYCSZgYv-j1V23rQ9wUTFY",
  authDomain: "linkup-b16f1.firebaseapp.com",
  projectId: "linkup-b16f1",
  storageBucket: "linkup-b16f1.firebasestorage.app",
  messagingSenderId: "822647919506",
  appId: "1:822647919506:web:5b9d1881ddaf00d692a74b",
  measurementId: "G-FCQ2QVRD54"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: "select_account"
});

isSupported()
  .then((supported) => {
    if (supported) {
      getAnalytics(app);
    }
  })
  .catch((error) => {
    console.warn("Analytics를 사용할 수 없습니다.", error);
  });
