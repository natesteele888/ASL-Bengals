// Gridiron Hub — Firebase project config + shared SDK handles.
// CDN module imports on purpose (not npm) -- this deploys as plain static
// files via GitHub Pages, same as /dev2/, no build step required.
// apiKey below is not a secret -- see chat. Firestore Rules are the real
// access boundary.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAIZ8IsO-oWiHF-g9GAMtoJ6zxE7rd8Mtk",
  authDomain: "my-gridiron-hub.firebaseapp.com",
  projectId: "my-gridiron-hub",
  storageBucket: "my-gridiron-hub.firebasestorage.app",
  messagingSenderId: "224277416374",
  appId: "1:224277416374:web:1b6d3c00fdc5806f795917"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
